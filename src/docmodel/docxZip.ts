// src/docmodel/docxZip.ts
//
// Minimal ZIP read/write, enough to change one part inside a .docx.
//
// WHY THIS EXISTS RATHER THAN A DEPENDENCY. Two things need to edit a part of
// a .docx that the docx library will not edit for us: setting w:updateFields in
// settings.xml (so Word populates the table of contents on open), and
// substituting a {{content}} placeholder into an unprepared template's body.
// Both are single-part edits on a file we already hold in memory. The obvious
// answers are both closed: jszip is only a *transitive* dep of docx, and
// importing an undeclared transitive is the exact trap constraints.md names;
// adm-zip is a devDependency and never reaches a client's agent. Adding a
// dependency is a 🔴 that every client pays on every ephemeral ADO run,
// forever — for what is, at this size, a few hundred lines of well-specified
// format.
//
// WHAT IT DELIBERATELY DOES NOT DO. No Zip64, no encryption, no multi-disk, no
// data descriptors on write. A .docx is a handful of small parts well under the
// 4GB Zip64 threshold, so none of that is reachable here. Reading tolerates a
// data-descriptor flag on input (Word does not write one, but other producers
// might); writing never emits one.
//
// THE PROPERTY THAT MAKES THIS SAFE. Entries nobody touched are copied through
// as their original *compressed* bytes, with their original CRC and sizes — not
// decompressed and re-deflated. So for a 2.4MB document with 28 embedded PNGs,
// every image is byte-identical to what the docx library produced, and the only
// bytes this module generates are for the one or two XML parts actually edited.
// A round-trip that changes nothing is a byte-for-byte copy of the payloads.

import { deflateRawSync, inflateRawSync } from 'zlib';

const LOCAL_SIG   = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG    = 0x06054b50;

const METHOD_STORE   = 0;
const METHOD_DEFLATE = 8;

export interface ZipEntry {
  name: string;
  /** Compression method of `payload` — 0 stored, 8 deflated. */
  method: number;
  crc: number;
  uncompressedSize: number;
  /** Entry bytes exactly as stored in the archive, still compressed. */
  payload: Buffer;
}

// -----------------------------------------------
// CRC-32
// -----------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// -----------------------------------------------
// Read
// -----------------------------------------------

/**
 * Locates the end-of-central-directory record.
 *
 * Scanned backwards because the record is last and carries a variable-length
 * trailing comment, so its position cannot be computed. The 22-byte floor is
 * the record's own fixed size.
 */
function findEocd(buf: Buffer): number {
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new Error('Not a valid .docx: no ZIP end-of-central-directory record found.');
}

export function readZip(buf: Buffer): ZipEntry[] {
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);

  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(offset) !== CENTRAL_SIG) {
      throw new Error(`Corrupt .docx: expected a central directory entry at byte ${offset}.`);
    }
    const method     = buf.readUInt16LE(offset + 10);
    const crc        = buf.readUInt32LE(offset + 16);
    const compSize   = buf.readUInt32LE(offset + 20);
    const uncompSize = buf.readUInt32LE(offset + 24);
    const nameLen    = buf.readUInt16LE(offset + 28);
    const extraLen   = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localAt    = buf.readUInt32LE(offset + 42);
    const name       = buf.toString('utf8', offset + 46, offset + 46 + nameLen);

    if (buf.readUInt32LE(localAt) !== LOCAL_SIG) {
      throw new Error(`Corrupt .docx: no local header for "${name}".`);
    }
    // The local header's own name/extra lengths are read here rather than
    // reused from the central directory: the spec allows them to differ, and
    // the data begins after the *local* ones.
    const localNameLen  = buf.readUInt16LE(localAt + 26);
    const localExtraLen = buf.readUInt16LE(localAt + 28);
    const dataAt = localAt + 30 + localNameLen + localExtraLen;

    entries.push({
      name,
      method,
      crc,
      uncompressedSize: uncompSize,
      payload: buf.subarray(dataAt, dataAt + compSize),
    });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Decompresses one entry. */
export function readEntry(entry: ZipEntry): Buffer {
  if (entry.method === METHOD_STORE) return Buffer.from(entry.payload);
  if (entry.method === METHOD_DEFLATE) return inflateRawSync(entry.payload);
  throw new Error(`Unsupported compression method ${entry.method} for "${entry.name}".`);
}

/** Replaces one entry's content, re-deflating it. Others are untouched. */
export function replaceEntry(entries: ZipEntry[], name: string, content: Buffer): ZipEntry[] {
  const index = entries.findIndex(e => e.name === name);
  if (index === -1) throw new Error(`Corrupt .docx: no "${name}" part found.`);
  const next = entries.slice();
  next[index] = {
    name,
    method: METHOD_DEFLATE,
    crc: crc32(content),
    uncompressedSize: content.length,
    payload: deflateRawSync(content),
  };
  return next;
}

// -----------------------------------------------
// Write
// -----------------------------------------------

export function writeZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_SIG, 0);
    local.writeUInt16LE(20, 4);                      // version needed: 2.0, deflate
    local.writeUInt16LE(0, 6);                       // flags — never a data descriptor
    local.writeUInt16LE(entry.method, 8);
    local.writeUInt16LE(0, 10);                      // mod time
    local.writeUInt16LE(0, 12);                      // mod date
    local.writeUInt32LE(entry.crc, 14);
    local.writeUInt32LE(entry.payload.length, 18);
    local.writeUInt32LE(entry.uncompressedSize, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);                      // extra length
    locals.push(local, name, entry.payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_SIG, 0);
    central.writeUInt16LE(20, 4);                    // version made by
    central.writeUInt16LE(20, 6);                    // version needed
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(entry.method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(entry.crc, 16);
    central.writeUInt32LE(entry.payload.length, 20);
    central.writeUInt32LE(entry.uncompressedSize, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);                    // extra
    central.writeUInt16LE(0, 32);                    // comment
    central.writeUInt16LE(0, 34);                    // disk number
    central.writeUInt16LE(0, 36);                    // internal attrs
    central.writeUInt32LE(0, 38);                    // external attrs
    central.writeUInt32LE(offset, 42);               // local header offset
    centrals.push(central, name);

    offset += local.length + name.length + entry.payload.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(0, 4);                          // this disk
  eocd.writeUInt16LE(0, 6);                          // disk with central dir
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);                    // central dir offset
  eocd.writeUInt16LE(0, 20);                         // comment length

  return Buffer.concat([...locals, centralBuf, eocd]);
}

/** Read → edit one part → write, leaving every other entry's bytes untouched. */
export function editPart(docx: Buffer, part: string, edit: (xml: string) => string): Buffer {
  const entries = readZip(docx);
  const entry = entries.find(e => e.name === part);
  if (!entry) throw new Error(`Corrupt .docx: no "${part}" part found.`);
  const updated = edit(readEntry(entry).toString('utf8'));
  return writeZip(replaceEntry(entries, part, Buffer.from(updated, 'utf8')));
}
