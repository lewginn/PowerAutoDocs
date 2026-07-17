// src/enrichment/mermaidRenderer.ts
//
// Renders Mermaid DSL to PNG for embedding in the Word doc — Word has no
// native Mermaid support, so the diagram has to become an image.
//
// Uses @mermaid-js/mermaid-cli's renderMermaid() against a real browser
// instance. We deliberately don't let Puppeteer download its own bundled
// Chromium (see .puppeteerrc.cjs) — ADO pipeline agents are fresh VMs on
// every run, so that ~250MB download would be paid every single run. We
// point at the agent's preinstalled Chrome/Edge instead.
//
// Renders are cached to disk by content hash (same "unchanged input, skip
// the work" pattern as the AI enrichment cache) so unchanged diagrams never
// re-render, and the browser is launched at most once per process.

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import puppeteer, { type Browser } from 'puppeteer';
import { renderMermaid } from '@mermaid-js/mermaid-cli';

export type RenderedDiagram = {
  data: Buffer;
  width: number;
  height: number;
};

// Puppeteer's default screenshot is 1 CSS pixel = 1 raster pixel, which looks
// visibly soft once Word displays it at a real page width. Rendering at a
// higher deviceScaleFactor supersamples — same physical size on the page,
// SCALE_FACTOR× the pixel data. RenderedDiagram.width/height stay in nominal
// (1x/CSS) units so callers size the image the same as before; only the PNG
// bytes get sharper.
const SCALE_FACTOR = 3;

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/microsoft-edge',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

/**
 * Cheap up-front check (no browser launch) for whether diagram rendering is
 * even possible on this machine/agent. Lets callers decide once, before
 * doing any work, whether to wire up renderDiagramPng at all — mirrors how
 * AI enrichment config is fail-fast validated before parsing starts, rather
 * than failing midway through a run.
 */
export function resolveChromeExecutable(): string {
  const override = process.env.POWERAUTODOCS_CHROME_PATH;
  if (override) {
    if (!fs.existsSync(override)) {
      throw new Error(`POWERAUTODOCS_CHROME_PATH is set to '${override}', but nothing exists there.`);
    }
    return override;
  }

  const found = CHROME_CANDIDATES.find(candidate => fs.existsSync(candidate));
  if (found) return found;

  throw new Error(
    'Mermaid diagram rendering needs a local Chrome or Edge install — none found in the usual locations. ' +
    'Set POWERAUTODOCS_CHROME_PATH to a browser executable, or install Chrome/Edge on this machine/agent.'
  );
}

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      executablePath: resolveChromeExecutable(),
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browserPromise;
}

/** Close the shared browser instance. Call once after all diagrams for a run are rendered. */
export async function closeMermaidBrowser(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise;
  browserPromise = null;
  await browser.close();
}

function hashOf(code: string): string {
  return createHash('sha256').update(code).digest('hex').slice(0, 16);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Cheap validity check for a cached PNG — the real 8-byte signature plus
 * enough length for the IHDR width/height fields pngDimensions() reads. This
 * is what stands between a truncated or corrupt cache entry and silently
 * wrong 0×0 dimensions reaching a client's Word document: fs.existsSync
 * alone used to gate the cache-hit path, so a run killed mid-write (an ADO
 * agent cancel or timeout) left a truncated file that every subsequent run
 * trusted at face value — a RangeError if short enough to throw on read, or
 * worse, silently-valid 0×0 dimensions if merely zeroed but long enough.
 * Either way the failure was permanent: the cache path is a pure function of
 * the diagram code, so every run hit the identical corrupt entry with no way
 * to self-heal short of someone manually deleting the cache directory.
 */
function isValidPng(buffer: Buffer): boolean {
  return buffer.length >= 24 && buffer.subarray(0, 8).equals(PNG_SIGNATURE);
}

// Minimal PNG IHDR read — avoids pulling in an image-dimensions dependency
// for what's an 8-byte signature + a 4-byte width/height read. Returns the
// raw raster size (i.e. already SCALE_FACTOR×) — callers scale it back down.
// Only ever called after isValidPng, so the bytes it reads are guaranteed present.
function pngDimensions(buffer: Buffer): { width: number; height: number } {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function toNominal(raw: { width: number; height: number }): { width: number; height: number } {
  return { width: raw.width / SCALE_FACTOR, height: raw.height / SCALE_FACTOR };
}

/**
 * Renders a Mermaid diagram to PNG, cached on disk by content hash. Cache
 * hits never touch the browser — most runs across most diagrams should be
 * cache hits, since diagram content only changes when the underlying
 * flow/table/relationship data does.
 */
export async function renderDiagramPng(code: string, cacheDir: string): Promise<RenderedDiagram> {
  fs.mkdirSync(cacheDir, { recursive: true });
  const cachePath = path.join(cacheDir, `${hashOf(code)}.png`);

  if (fs.existsSync(cachePath)) {
    const data = fs.readFileSync(cachePath);
    if (isValidPng(data)) {
      return { data, ...toNominal(pngDimensions(data)) };
    }
    // Corrupt or truncated — treated as a miss, not trusted. Re-rendering
    // below and overwriting it (atomically, see the write below) is what
    // makes this self-healing rather than a permanent failure.
    console.warn(`  ⚠ Corrupt diagram cache entry, re-rendering: ${cachePath}`);
  }

  const browser = await getBrowser();
  const { data } = await renderMermaid(browser, code, 'png', {
    backgroundColor: 'white',
    viewport: { width: 800, height: 600, deviceScaleFactor: SCALE_FACTOR },
  });
  const buffer = Buffer.from(data);

  // Atomic write: a temp file in the SAME directory (so the rename stays on
  // one filesystem, which is what makes it atomic on both POSIX and NTFS)
  // then rename() into place. Without this, a run killed mid-write could
  // leave a truncated file sitting at the real, content-addressed cache
  // path — exactly the corrupt-entry scenario isValidPng exists to detect on
  // the read side. Writing atomically prevents it at the source instead.
  const tmpPath = `${cachePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, cachePath);

  return { data: buffer, ...toNominal(pngDimensions(buffer)) };
}
