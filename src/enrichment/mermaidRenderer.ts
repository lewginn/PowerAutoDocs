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

// Minimal PNG IHDR read — avoids pulling in an image-dimensions dependency
// for what's an 8-byte signature + a 4-byte width/height read. Returns the
// raw raster size (i.e. already SCALE_FACTOR×) — callers scale it back down.
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
    return { data, ...toNominal(pngDimensions(data)) };
  }

  const browser = await getBrowser();
  const { data } = await renderMermaid(browser, code, 'png', {
    backgroundColor: 'white',
    viewport: { width: 800, height: 600, deviceScaleFactor: SCALE_FACTOR },
  });
  const buffer = Buffer.from(data);
  fs.writeFileSync(cachePath, buffer);
  return { data: buffer, ...toNominal(pngDimensions(buffer)) };
}
