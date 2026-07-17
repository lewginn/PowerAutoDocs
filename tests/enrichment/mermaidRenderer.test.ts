import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  resolveChromeExecutable,
  renderDiagramPng,
  closeMermaidBrowser,
} from '../../src/enrichment/mermaidRenderer.js';

// SAFETY NOTE FOR ANYONE EXTENDING THIS FILE
// ------------------------------------------
// Chrome is installed on most dev machines. renderDiagramPng's cache *miss* path
// calls getBrowser() -> puppeteer.launch(), which would spawn a real browser and
// render real diagrams during a unit test run. Every test below is confined to a
// path that provably never reaches puppeteer.launch():
//   * resolveChromeExecutable() is a pure fs.existsSync check.
//   * The cache *hit* path returns before getBrowser() is ever called.
//   * The one miss-path test stubs POWERAUTODOCS_CHROME_PATH to a path that does
//     not exist, so resolveChromeExecutable() throws while the argument object of
//     puppeteer.launch({ executablePath: resolveChromeExecutable(), ... }) is being
//     evaluated — i.e. before launch() is invoked at all. It carries an explicit
//     interlock assertion so it fails loudly rather than launching Chrome if that
//     evaluation order ever changes.
// Do not add a test that renders an uncached diagram.

// Cache dirs are always a throwaway tmpdir. The repo's real
// .powerautodocs-diagram-cache/ holds rendered client solution content and must
// never be read or written by a test.
let cacheDir: string;

beforeEach(() => {
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'padocs-mermaid-'));
});

afterEach(() => {
  fs.rmSync(cacheDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/**
 * A hand-built minimal PNG: 8-byte signature followed by an IHDR chunk.
 * pngDimensions() only reads readUInt32BE(16) and readUInt32BE(20), so the
 * width/height fields are the only bytes that have to be meaningful — but the
 * signature and chunk framing are laid out correctly anyway so this stays a
 * recognisable PNG rather than a magic blob.
 */
const aPng = (width: number, height: number): Buffer => {
  const buf = Buffer.alloc(33); // 8 signature + (4 len + 4 type + 13 data + 4 crc)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);        // IHDR data length
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);    // <- pngDimensions reads here
  buf.writeUInt32BE(height, 20);   // <- and here
  buf.writeUInt8(8, 24);           // bit depth
  buf.writeUInt8(6, 25);           // colour type: RGBA
  return buf;
};

/** Mirrors mermaidRenderer's hashOf() so a cache entry can be pre-seeded. */
const cachePathFor = (code: string): string =>
  path.join(cacheDir, `${createHash('sha256').update(code).digest('hex').slice(0, 16)}.png`);

const seedCache = (code: string, png: Buffer): string => {
  const file = cachePathFor(code);
  fs.writeFileSync(file, png);
  return file;
};

/** Seeds and returns the shared cacheDir — keeps the SCALE_FACTOR test to one line. */
const seedThenReturnDir = (code: string, png: Buffer): string => {
  seedCache(code, png);
  return cacheDir;
};

/**
 * Makes "never reaches the browser" an enforced property rather than a comment.
 *
 * Points POWERAUTODOCS_CHROME_PATH at a path that does not exist. Any code path
 * that reaches getBrowser() evaluates puppeteer.launch's argument object, which
 * calls resolveChromeExecutable(), which now throws *before* launch() is invoked.
 * So a regression that made the cache-hit path fall through to a render turns
 * into a loud test failure instead of a silently-spawned Chrome.
 *
 * The interlock assertion proves the trap is armed: if resolveChromeExecutable
 * ever stopped throwing on a missing override, these tests would go back to being
 * able to launch a real browser, and this line fails first.
 */
const blockBrowser = (): void => {
  const missing = path.join(cacheDir, 'no-such-chrome');
  vi.stubEnv('POWERAUTODOCS_CHROME_PATH', missing);
  expect(() => resolveChromeExecutable()).toThrow();
};

describe('resolveChromeExecutable — POWERAUTODOCS_CHROME_PATH override', () => {
  it('returns the override when something exists at that path', () => {
    const exe = path.join(cacheDir, 'my-chrome');
    fs.writeFileSync(exe, '');
    vi.stubEnv('POWERAUTODOCS_CHROME_PATH', exe);

    expect(resolveChromeExecutable()).toBe(exe);
  });

  it('wins over the built-in candidate list', () => {
    // An agent that sets the override has a reason — a second Chrome install, or a
    // non-standard location. Silently preferring a discovered browser would launch
    // the wrong binary and be near-impossible to diagnose from a pipeline log.
    //
    // CHROME_CANDIDATES is a fixed list of absolute system paths that a test cannot
    // create, so "the override beats a real discovery" only has teeth on a machine
    // that actually has a browser. Read discovery first and assert against whatever
    // it found; on a bare CI runner this degrades to the same claim as the test
    // above rather than pretending to prove more.
    const discovered = (() => {
      try { return resolveChromeExecutable(); } catch { return null; }
    })();

    const exe = path.join(cacheDir, 'preferred-chrome');
    fs.writeFileSync(exe, '');
    vi.stubEnv('POWERAUTODOCS_CHROME_PATH', exe);

    expect(resolveChromeExecutable()).toBe(exe);
    if (discovered !== null) {
      // The meaningful case: a browser WAS discoverable and the override still won.
      expect(resolveChromeExecutable()).not.toBe(discovered);
    }
  });

  it('throws naming the bad path when the override points nowhere', () => {
    // The whole point of the up-front check is a legible failure. An operator who
    // typo'd the variable needs to see their own value echoed back.
    const missing = path.join(cacheDir, 'does', 'not', 'exist', 'chrome');
    vi.stubEnv('POWERAUTODOCS_CHROME_PATH', missing);

    expect(() => resolveChromeExecutable()).toThrow(/POWERAUTODOCS_CHROME_PATH is set to/);
    expect(() => resolveChromeExecutable()).toThrow(missing);
  });

  it('falls back to discovery when the override is empty rather than failing', () => {
    // An unset ADO pipeline variable interpolates to '' rather than disappearing,
    // so an empty string has to mean "not set", not "look for a file called ''".
    const attempt = (): string | Error => {
      try { return resolveChromeExecutable(); } catch (e) { return e as Error; }
    };

    vi.stubEnv('POWERAUTODOCS_CHROME_PATH', undefined);
    const whenUnset = attempt();

    vi.stubEnv('POWERAUTODOCS_CHROME_PATH', '');
    const whenEmpty = attempt();

    // Never the override error — that would mean '' was treated as a supplied path.
    expect(whenEmpty instanceof Error ? whenEmpty.message : '')
      .not.toContain('POWERAUTODOCS_CHROME_PATH is set to');
    // Stronger than the absence check alone: '' must be indistinguishable from unset,
    // whichever branch this machine takes.
    if (whenUnset instanceof Error) {
      expect(whenEmpty).toBeInstanceOf(Error);
      expect((whenEmpty as Error).message).toBe(whenUnset.message);
    } else {
      expect(whenEmpty).toBe(whenUnset);
    }
  });
});

describe('resolveChromeExecutable — candidate discovery', () => {
  // This machine may or may not have Chrome/Edge installed, and CI (ubuntu-latest)
  // very likely does not. Asserting either outcome outright would give a test that
  // is green on one and red on the other, so assert the properties that must hold
  // in both cases instead.
  it('either returns a path that genuinely exists, or throws the install guidance', () => {
    vi.stubEnv('POWERAUTODOCS_CHROME_PATH', undefined);

    let found: string | undefined;
    let err: Error | undefined;
    try { found = resolveChromeExecutable(); } catch (e) { err = e as Error; }

    if (found !== undefined) {
      // It must never hand back a speculative path — docAssembler treats a
      // successful return as "diagrams will work" and never re-checks.
      expect(fs.existsSync(found)).toBe(true);
      expect(path.isAbsolute(found)).toBe(true);
    } else {
      // The message has to tell an operator both ways out, since the run degrades
      // silently to a .docx with every diagram missing.
      expect(err?.message).toContain('needs a local Chrome or Edge');
      expect(err?.message).toContain('POWERAUTODOCS_CHROME_PATH');
    }
  });

  it('is deterministic across calls', () => {
    // docAssembler calls it once up front to decide whether to wire up rendering,
    // and getBrowser() calls it again at launch time. The two must agree.
    vi.stubEnv('POWERAUTODOCS_CHROME_PATH', undefined);

    const first = (() => { try { return resolveChromeExecutable(); } catch { return null; } })();
    const second = (() => { try { return resolveChromeExecutable(); } catch { return null; } })();
    expect(second).toBe(first);
  });

  it('does not launch or probe a browser — it is a pure existence check', () => {
    // The check runs before any work is done, on every run. If it ever started
    // launching Chrome to verify, that cost would land on every ADO agent.
    vi.stubEnv('POWERAUTODOCS_CHROME_PATH', undefined);

    // A timing proxy is the only cheap signal available here — resolveChrome-
    // Executable() IS the unit under test, so it cannot be trapped by the env the
    // way the render paths are. Bound generously: a real puppeteer.launch() takes
    // seconds, so 2s still catches the regression without flaking on a loaded runner.
    const start = Date.now();
    try { resolveChromeExecutable(); } catch { /* absent browser is fine here */ }
    expect(Date.now() - start).toBeLessThan(2000);
  });
});

describe('renderDiagramPng — cache hit', () => {
  const code = 'graph TD;\n  A[Widget] --> B[Part];';

  // Every test here asserts the hit path. Arm the trap so that "returns before
  // getBrowser()" is verified by each one, not just asserted in prose.
  beforeEach(blockBrowser);

  it('returns the cached bytes verbatim without touching the browser', async () => {
    // The browser trap is armed: if the hit path regressed into a render, this
    // rejects with the chrome-path error rather than quietly launching Chrome.
    const png = aPng(900, 600);
    seedCache(code, png);

    const rendered = await renderDiagramPng(code, cacheDir);
    // toEqual, not toMatchObject: subset semantics would tolerate a buffer that
    // merely starts with these bytes.
    expect(rendered.data).toEqual(png);
    expect(rendered.data.length).toBe(png.length);
  });

  it('reports dimensions in nominal 1x units — raw pixels divided by SCALE_FACTOR', async () => {
    // THE contract of this module (decisions.md: "3x supersampling, 1x reported
    // dimensions"). Mermaid renders at deviceScaleFactor 3, so the PNG on disk is
    // 3x oversized; DocxSerializer sizes the ImageRun straight from width/height.
    // Return the raw numbers and every diagram in every client's Word document
    // triples in size on the page — while still looking correct in isolation.
    const rendered = await renderDiagramPng(code, seedThenReturnDir(code, aPng(900, 600)));
    expect(rendered.width).toBe(300);
    expect(rendered.height).toBe(200);
  });

  it('scales non-square diagrams down on both axes independently', async () => {
    seedCache(code, aPng(2400, 300));
    const rendered = await renderDiagramPng(code, cacheDir);
    expect(rendered.width).toBe(800);
    expect(rendered.height).toBe(100);
    // Aspect ratio is what DocxSerializer relies on when it clamps to page width.
    expect(rendered.width / rendered.height).toBe(8);
  });

  it('reads width and height from the IHDR chunk, not the other way round', async () => {
    // A transposed read is invisible on a square diagram and wrong on every other.
    seedCache(code, aPng(1200, 600));
    const rendered = await renderDiagramPng(code, cacheDir);
    expect(rendered.width).toBe(400);
    expect(rendered.height).toBe(200);
  });

  it('leaves the cached file untouched', async () => {
    // A hit must not rewrite the entry — the cache is the reason a repeat run is
    // fast, and a rewrite would churn the ADO agent's disk for nothing.
    const png = aPng(900, 600);
    const file = seedCache(code, png);
    await renderDiagramPng(code, cacheDir);
    expect(fs.readFileSync(file)).toEqual(png);
    expect(fs.readdirSync(cacheDir)).toEqual([path.basename(file)]);
  });

  it('is stable across repeated calls with identical code', async () => {
    seedCache(code, aPng(900, 600));
    const first = await renderDiagramPng(code, cacheDir);
    const second = await renderDiagramPng(code, cacheDir);
    expect(second).toEqual(first);
    // Still exactly one entry: the same code must not mint a second cache file.
    expect(fs.readdirSync(cacheDir)).toHaveLength(1);
  });
});

describe('renderDiagramPng — content-addressed cache key', () => {
  beforeEach(blockBrowser);

  it('gives different diagram source its own entry', async () => {
    // The key is a hash of the code, so an ERD and a flow chart in the same run
    // must not collide. If the key ignored content, the second seed would clobber
    // the first and both reads would come back with the same dimensions.
    const erd = 'erDiagram\n  WIDGET ||--o{ PART : has';
    const flow = 'graph TD;\n  Start --> End;';
    seedCache(erd, aPng(900, 600));
    seedCache(flow, aPng(300, 150));

    expect(fs.readdirSync(cacheDir)).toHaveLength(2);
    await expect(renderDiagramPng(erd, cacheDir)).resolves.toMatchObject({ width: 300, height: 200 });
    await expect(renderDiagramPng(flow, cacheDir)).resolves.toMatchObject({ width: 100, height: 50 });
  });

  it('treats a whitespace-only edit as different content', async () => {
    // Not a nicety: it means the cache can never serve a stale diagram after the
    // underlying IR changes, at the cost of an occasional needless re-render.
    // No assertion on cachePathFor() itself here: that helper mirrors the source's
    // hashOf(), so comparing it to itself would be a tautology. The claim is proved
    // on real observed output instead — two seeds, two entries, two distinct reads.
    const a = 'graph TD;\n  A --> B;';
    const b = 'graph TD;\n   A --> B;';

    seedCache(a, aPng(900, 600));
    seedCache(b, aPng(1800, 900));
    expect(fs.readdirSync(cacheDir)).toHaveLength(2); // observed: the two keys differ
    await expect(renderDiagramPng(a, cacheDir)).resolves.toMatchObject({ width: 300 });
    await expect(renderDiagramPng(b, cacheDir)).resolves.toMatchObject({ width: 600 });
  });

  it('names entries with a bare hex hash and a .png extension', async () => {
    // Cache filenames must never carry diagram content: the cache dir holds real
    // client solution structure, and a leaked filename would leak schema names.
    seedCache('erDiagram\n  ACME_CONTRACT ||--o{ ACME_INVOICE : has', aPng(900, 600));
    const [name] = fs.readdirSync(cacheDir);
    expect(name).toMatch(/^[0-9a-f]{16}\.png$/);
  });
});

describe('renderDiagramPng — cache directory', () => {
  it('creates the cache directory when it does not exist', async () => {
    // First run on a fresh ADO agent: nothing is cached between runs, so the dir
    // is always absent. Without the recursive mkdir every diagram would ENOENT.
    const nested = path.join(cacheDir, 'a', 'b', '.powerautodocs-diagram-cache');
    expect(fs.existsSync(nested)).toBe(false);

    // This is the one test that drives a cache MISS, so the trap is load-bearing
    // rather than defence in depth: it is what stops the miss from reaching
    // puppeteer.launch() and rendering for real.
    blockBrowser();

    await expect(renderDiagramPng('graph TD;\n  A --> B;', nested))
      .rejects.toThrow(/POWERAUTODOCS_CHROME_PATH is set to/);

    // The mkdir happens before the cache lookup, so it survives the miss.
    expect(fs.existsSync(nested)).toBe(true);
    expect(fs.statSync(nested).isDirectory()).toBe(true);
  });

  it('tolerates an existing cache directory', async () => {
    blockBrowser();
    const code = 'graph TD;\n  A --> B;';
    seedCache(code, aPng(900, 600));
    await expect(renderDiagramPng(code, cacheDir)).resolves.toMatchObject({ width: 300 });
  });
});

describe('renderDiagramPng — corrupt cache entry', () => {
  const code = 'graph TD;\n  A --> B;';

  // A corrupt entry still passes existsSync, so these stay on the hit path — but
  // arm the trap anyway, so that if the source is later fixed to treat a corrupt
  // entry as a miss, these fail loudly instead of silently rendering for real.
  beforeEach(blockBrowser);

  // BUG: pinning current behaviour, NOT endorsing it. Reported to the
  // parent agent rather than fixed here (this pass writes tests, not source).
  //
  // The hit path does `fs.existsSync(cachePath)` and then reads dimensions
  // straight out of the bytes, with no check that the file is a whole PNG.
  // fs.writeFileSync on the miss path is not atomic, so a run killed mid-write
  // (an ADO agent cancel or timeout) leaves a truncated file at the content-hash
  // path. That path is a pure function of the diagram code, so every subsequent
  // run hits the same corrupt entry: the failure is permanent and self-healing is
  // impossible short of someone manually deleting the cache directory.
  //
  // It is not a soft failure either. docAssembler.ts:109-114 wraps only
  // resolveChromeExecutable() in its try/catch; the renderMermaid closure it
  // builds is called later from DocxSerializer with no guard, so this RangeError
  // propagates out and fails the whole .docx build.
  //
  // A fix would be some combination of: write to a temp file and rename() into
  // place so an entry is only ever whole or absent; and treat an unreadable entry
  // as a miss (verify the 8-byte signature and length, re-render if it fails)
  // rather than trusting existsSync.
  it('throws an opaque RangeError on a truncated cache file instead of re-rendering', async () => {
    fs.writeFileSync(cachePathFor(code), Buffer.alloc(10)); // a half-written PNG

    await expect(renderDiagramPng(code, cacheDir)).rejects.toThrow(RangeError);
    // Nothing in the message mentions the cache, the file, or the diagram — an
    // operator seeing this in a pipeline log has no path to the cause.
    await expect(renderDiagramPng(code, cacheDir)).rejects.toThrow(/offset.*out of range/);
  });

  it('does not evict the corrupt entry, so a retry fails identically', async () => {
    const file = cachePathFor(code);
    fs.writeFileSync(file, Buffer.alloc(10));

    await expect(renderDiagramPng(code, cacheDir)).rejects.toThrow(RangeError);
    // Still there — re-running the pipeline cannot recover.
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.statSync(file).size).toBe(10);
  });

  it('reads garbage dimensions from a zero-length-but-long-enough file', async () => {
    // Worse than the throw: 32 zero bytes are long enough to read, so this is
    // taken as a valid 0x0 diagram and flows into DocxSerializer, where
    // `scale = widthPx / rendered.width` is 0/0 = NaN and the ImageRun gets NaN
    // dimensions. Silent, and it reaches the client's document.
    fs.writeFileSync(cachePathFor(code), Buffer.alloc(32));

    const rendered = await renderDiagramPng(code, cacheDir);
    expect(rendered.width).toBe(0);
    expect(rendered.height).toBe(0);
  });
});

describe('closeMermaidBrowser', () => {
  it('is a no-op when no browser was ever launched', async () => {
    // docAssembler calls this unconditionally at the end of every run, including
    // runs where diagrams were disabled or Chrome was missing. Throwing here would
    // fail an otherwise-good run at the very last step.
    await expect(closeMermaidBrowser()).resolves.toBeUndefined();
  });

  it('is idempotent', async () => {
    await closeMermaidBrowser();
    await expect(closeMermaidBrowser()).resolves.toBeUndefined();
  });

  it('does not launch a browser in order to close one', async () => {
    // Deterministic rather than a timing proxy: with the chrome path pointed at
    // nothing, any route from close() into getBrowser() throws. Resolving cleanly
    // is therefore positive evidence that it never went near a launch.
    blockBrowser();
    await expect(closeMermaidBrowser()).resolves.toBeUndefined();
  });
});
