// tests/docmodel/docxZip.test.ts
//
// The hand-rolled ZIP layer. This is the riskiest code in the Word path — a
// subtly malformed archive is still "a file", and Word reports it as corrupt
// with no clue which of 40 parts is wrong.
//
// So every assertion here is verified with adm-zip, an INDEPENDENT reader,
// rather than by round-tripping through readZip(). A parser and a writer that
// share a bug agree with each other perfectly; a third-party reader is the only
// thing that can catch that.

import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import { Document, Packer, Paragraph } from 'docx';
import { readZip, readEntry, replaceEntry, writeZip, editPart } from '../../src/docmodel/docxZip.js';

/** A real .docx, produced by the same library that produces our output. */
async function aDocx(text = 'Hello'): Promise<Buffer> {
  return await Packer.toBuffer(new Document({
    sections: [{ children: [new Paragraph(text)] }],
  }));
}

describe('docxZip — reading', () => {
  it('finds every part a real .docx contains', async () => {
    const buf = await aDocx();
    const mine = readZip(buf).map(e => e.name).sort();
    const theirs = new AdmZip(buf).getEntries().map(e => e.entryName).sort();
    expect(mine).toEqual(theirs);
  });

  it('decompresses a part to the same bytes adm-zip reads', async () => {
    const buf = await aDocx('Round trip');
    const entry = readZip(buf).find(e => e.name === 'word/document.xml')!;
    expect(readEntry(entry).toString('utf8'))
      .toBe(new AdmZip(buf).readAsText('word/document.xml'));
  });

  it('rejects a file that is not a zip, rather than reading garbage', () => {
    expect(() => readZip(Buffer.from('this is not a docx')))
      .toThrow(/no ZIP end-of-central-directory/);
  });
});

describe('docxZip — writing', () => {
  it('produces an archive a third-party reader opens with all parts intact', async () => {
    const buf = await aDocx();
    const rebuilt = writeZip(readZip(buf));
    const before = new AdmZip(buf).getEntries().map(e => e.entryName).sort();
    const after = new AdmZip(rebuilt).getEntries().map(e => e.entryName).sort();
    expect(after).toEqual(before);
  });

  it('leaves untouched entries byte-identical through a round trip', async () => {
    // The property the whole module rests on: entries nobody edited are copied
    // through as their original compressed bytes, never re-deflated. This is
    // what keeps embedded PNGs and the template's own parts exactly as their
    // producer wrote them.
    const buf = await aDocx();
    const rebuilt = writeZip(readZip(buf));
    for (const e of readZip(buf)) {
      const mine = readZip(rebuilt).find(x => x.name === e.name)!;
      expect(mine.payload.equals(e.payload)).toBe(true);
      expect(mine.crc).toBe(e.crc);
    }
  });

  it('writes a correct CRC for a replaced part, so Word does not see corruption', async () => {
    // A wrong CRC is the classic hand-rolled-zip bug: every byte is right and
    // the file still refuses to open.
    const buf = await aDocx();
    const entries = replaceEntry(readZip(buf), 'word/document.xml', Buffer.from('<xml/>', 'utf8'));
    const out = writeZip(entries);
    // adm-zip validates the CRC on read and throws if it disagrees.
    expect(new AdmZip(out).readAsText('word/document.xml')).toBe('<xml/>');
  });

  it('refuses to replace a part that does not exist', async () => {
    const entries = readZip(await aDocx());
    expect(() => replaceEntry(entries, 'word/nope.xml', Buffer.from('x')))
      .toThrow(/no "word\/nope.xml" part found/);
  });
});

describe('docxZip — editPart', () => {
  it('edits one part and leaves the rest of the document readable', async () => {
    const buf = await aDocx('Original');
    const out = editPart(buf, 'word/document.xml', xml => xml.replace('Original', 'Edited'));
    const zip = new AdmZip(out);
    expect(zip.readAsText('word/document.xml')).toContain('Edited');
    expect(zip.readAsText('word/document.xml')).not.toContain('Original');
    // Parts nobody asked about must still be there and still parse.
    expect(zip.readAsText('[Content_Types].xml')).toContain('<Types');
  });

  it('survives repeated edits, so a second pass cannot corrupt the first', async () => {
    // updateFields and the placeholder substitution both edit the same file in
    // sequence, so the output of one is the input of the next.
    const buf = await aDocx('One');
    const once = editPart(buf, 'word/document.xml', x => x.replace('One', 'Two'));
    const twice = editPart(once, 'word/settings.xml', x => x);
    expect(new AdmZip(twice).readAsText('word/document.xml')).toContain('Two');
    expect(new AdmZip(twice).getEntries().length).toBe(new AdmZip(buf).getEntries().length);
  });
});
