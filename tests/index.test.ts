// tests/index.test.ts
//
// main() is the whole pipeline: flags -> config -> per-solution parse -> render ->
// publish -> summary -> exit code. It has never been tested, because importing this
// module used to run it. The isCliEntry guard at the bottom of src/index.ts fixed
// that, and the first test in this file is the regression guard for it.
//
// What is asserted. main() keeps its state (the RunSummary) entirely private, so
// there is nothing to return-value-check. The observable contract is what a client
// actually sees: the console output logSummary() prints, the files on disk, and the
// process exit code. Every assertion here is on one of those three.
//
// SAFETY. main() can reach a browser (Word diagrams -> Chrome) and the network
// (wiki publish -> fetch). Neither is allowed:
//   * Diagrams: output.wordDiagrams is false in every config built here, AND
//     POWERAUTODOCS_CHROME_PATH is stubbed to a path that does not exist, so
//     resolveChromeExecutable() throws before any launch. afterEach then proves
//     the real .powerautodocs-cache/diagrams/ (client data, in this repo) was
//     neither created nor touched.
//   * Network: main() calls publishToWiki(config.wiki, pages) with no injectable
//     fetch, so the only safe wiki configs are ones that stop before the request.
//     THE INVARIANT: every wiki block in this file sets pat: 'REDACTED', which
//     main() rejects before building a request. Do not "improve" that to a
//     realistic-looking fake — a config.wiki that survives to publishToWiki makes
//     a real HTTPS call to dev.azure.com. Relying on a test's OTHER assertions to
//     suppress config.wiki is not enough: those describe the very behaviour under
//     test, so the day one regresses is the day the suite starts calling out. The
//     PAT check is the belt that holds whether or not the source is correct.
//     See the caveat in the publish describe.
//
// Everything on disk goes to an mkdtemp dir. The ContosoDemo fixture is only ever
// read; tests that need to mutate a solution copy it into the tmpdir first.

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import { main } from '../src/index.js';
import { DEFAULT_CACHE_DIR } from '../src/config/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONTOSO = path.join(HERE, 'fixtures', 'solutions', 'ContosoDemo');
const DIAGRAM_CACHE = path.join(process.cwd(), DEFAULT_CACHE_DIR, 'diagrams');

/** Entry names of the diagram cache, or null when it does not exist. */
const readCache = (): string[] | null =>
  fs.existsSync(DIAGRAM_CACHE) ? fs.readdirSync(DIAGRAM_CACHE).sort() : null;

/** The repo root. Guarded in afterEach — see the defaults test for why it matters. */
const REPO_CWD = process.cwd();

let cacheSnapshot: string[] | null;
let dir: string;
let outDir: string;
let argvBackup: string[];
let exit: ReturnType<typeof vi.spyOn>;
let logs: string[];
let warns: string[];
let errors: string[];

/** Everything main() printed, whichever console stream it went to. */
const output = () => [...logs, ...warns, ...errors].join('\n');

beforeAll(() => {
  cacheSnapshot = readCache();
});

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'padocs-index-'));
  outDir = path.join(dir, 'out');
  vi.stubEnv('POWERAUTODOCS_CHROME_PATH', path.join(dir, 'no-such-chrome'));
  // DOC_GEN_CONFIG_DIR is main()'s fallback when configDir is omitted. Clear it so
  // a developer's real config can never be picked up by a test on this machine.
  vi.stubEnv('DOC_GEN_CONFIG_DIR', '');

  argvBackup = process.argv;
  process.argv = [process.argv[0], process.argv[1]];

  logs = []; warns = []; errors = [];
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')); });
  vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { warns.push(a.join(' ')); });
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a.join(' ')); });

  // A stubbed exit RETURNS, where the real one would end the process. Every test
  // below therefore asserts that exit was called, never on what ran afterwards.
  exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
});

afterEach(() => {
  // Proof no browser launched: the real client-data cache dir is the same set of
  // entries it was before this file ran. Never rm it — it is not ours to delete.
  expect(readCache()).toEqual(cacheSnapshot);

  // Any test that chdir's must restore. main() resolves the DEFAULT solution and
  // output paths ('./unpacked', './output') relative to cwd, and both of those are
  // real client-data dirs in this repo — so a leaked chdir would not just break the
  // next test, it would decide whether the next test reads a client's solution.
  expect(process.cwd()).toBe(REPO_CWD);

  process.argv = argvBackup;
  fs.rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// -----------------------------------------------
// Harness
// -----------------------------------------------

/** Writes doc-gen.config.yml into the tmp config dir and returns that dir. */
function writeConfig(cfg: Record<string, unknown>): string {
  fs.writeFileSync(path.join(dir, 'doc-gen.config.yml'), yaml.dump(cfg), 'utf-8');
  return dir;
}

/**
 * A config that reaches the end of a run without a browser, a network call or a
 * document build. Tests opt back into whatever they are actually exercising.
 */
const baseConfig = (over: Record<string, unknown> = {}) => ({
  solutions: [{ path: CONTOSO, publisherPrefix: 'contoso' }],
  output: { path: outDir, wiki: false, word: false, pdf: false, wordDiagrams: false },
  ...over,
});

const setArgv = (...flags: string[]) => {
  process.argv = [process.argv[0], process.argv[1], ...flags];
};

/** Files written directly into the output dir (not recursive). */
const outputFiles = () => (fs.existsSync(outDir) ? fs.readdirSync(outDir).sort() : []);

/** Recursively copies the ContosoDemo fixture so a test can corrupt it safely. */
function copyFixture(name = 'ContosoCopy'): string {
  const copy = path.join(dir, name);
  fs.cpSync(CONTOSO, copy, { recursive: true });
  return copy;
}

/** A copy of the fixture renamed end-to-end, to stand in as a second, distinct solution. */
function aSecondSolution(): string {
  const copy = copyFixture('FabrikamCopy');
  const manifest = path.join(copy, 'Other', 'Solution.xml');
  const renamed = fs.readFileSync(manifest, 'utf-8')
    .replace('<UniqueName>ContosoDemo</UniqueName>', '<UniqueName>FabrikamDemo</UniqueName>')
    .replace('description="Contoso Demo"', 'description="Fabrikam Demo"');
  fs.writeFileSync(manifest, renamed, 'utf-8');
  return copy;
}

// -----------------------------------------------
// The import guard
// -----------------------------------------------

describe('module import', () => {
  it('exports main without running it', async () => {
    // The regression guard for the isCliEntry check at src/index.ts:453. This module
    // used to call main() as a top-level side effect, so importing it in a test ran a
    // real parse against whatever doc-gen.config.yml happened to be in the cwd — i.e.
    // a client's config, on a developer's machine. resetModules forces a fresh
    // evaluation so the guard is genuinely re-run here, not served from cache.
    vi.resetModules();
    const mod = await import('../src/index.js');

    expect(typeof mod.main).toBe('function');

    // main() is async — give a microtask-and-a-tick for any accidental run to start
    // talking to the console or the process.
    await new Promise((r) => setImmediate(r));

    expect(logs).toEqual([]);
    expect(warns).toEqual([]);
    expect(errors).toEqual([]);
    expect(exit).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------
// CLI flags
// -----------------------------------------------

describe('main — CLI flags', () => {
  it('rejects an unknown flag with the valid list and exits 1', async () => {
    setArgv('--word', '--verbose');
    // solutions: [] keeps the run trivial — the flag check happens before any of it.
    await main(writeConfig(baseConfig({ solutions: [] }))).catch(() => {});

    expect(errors.join('\n')).toContain('Unknown flag(s): --verbose');
    expect(errors.join('\n')).toContain('--word  --wiki  --pdf  --regenerate-ai');
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('ignores bare (non---) arguments', async () => {
    // Only tokens starting with -- are treated as flags; a stray positional arg
    // from a pipeline task must not fail the run.
    setArgv('somefile.yml');
    await main(writeConfig(baseConfig({ solutions: [] })));

    expect(errors.join('\n')).not.toContain('Unknown flag');
    expect(exit).not.toHaveBeenCalled();
  });

  it('treats an output flag as the EXCLUSIVE selection, suppressing config-enabled formats', async () => {
    // src/index.ts:108-115. This is a real footgun: --wiki does not mean "also do
    // wiki", it means "wiki ONLY". word: true and pdf: true in the config below are
    // both silently turned off. If that ever changes, a local --wiki run starts
    // building documents nobody asked for.
    setArgv('--wiki');
    await main(writeConfig(baseConfig({
      output: { path: outDir, wiki: true, word: true, pdf: true, wordDiagrams: false },
      wiki: {
        organisation: 'contoso', project: 'Demo', wikiIdentifier: 'Demo.wiki',
        parentPath: '/Docs', pat: 'REDACTED',
      },
    })));

    // Wiki was selected: the run reached the publish block and stopped at the PAT
    // check (which is what keeps this test off the network).
    expect(errors.join('\n')).toContain('wiki.pat is not set');
    // Word and PDF were suppressed despite being true in the config.
    expect(outputFiles()).not.toContain('solution-documentation.docx');
    expect(outputFiles()).not.toContain('solution-documentation.pdf');
    expect(output()).not.toContain('Generating Word document');
    expect(output()).not.toContain('Generating PDF document');
  });

  it('forces Word on and Wiki off when --word is passed, overriding the config', async () => {
    // The mirror of the above: word: false in config, wiki: true with a full wiki
    // block — the flag wins on both counts.
    setArgv('--word');
    await main(writeConfig(baseConfig({
      output: {
        path: outDir, wiki: true, word: false, pdf: false,
        wordDiagrams: false, wordFilename: 'contoso.docx',
      },
      wiki: {
        organisation: 'contoso', project: 'Demo', wikiIdentifier: 'Demo.wiki',
        parentPath: '/Docs', pat: 'REDACTED',
      },
    })));

    expect(outputFiles()).toContain('contoso.docx');
    // output.wiki was forced false, which nulls config.wiki (src/index.ts:118-120).
    // Had it not been, the run would have reached the publish block and said so —
    // 'wiki.pat is not set' — instead of this. Either way it never leaves the machine.
    expect(logs.join('\n')).toContain('No wiki config — skipping publish');
    expect(output()).not.toContain('Publishing to ADO Wiki');
    expect(exit).not.toHaveBeenCalled();
  });

  it('warns when --wiki is passed but the config has no wiki block', async () => {
    setArgv('--wiki');
    await main(writeConfig(baseConfig({ solutions: [] })));

    expect(warns.join('\n')).toContain('--wiki flag set but no wiki config');
    expect(exit).not.toHaveBeenCalled();
  });

  it('falls through to the config when no output flag is passed', async () => {
    // No flags at all: the config's own word/wiki/pdf values must survive untouched.
    await main(writeConfig(baseConfig({
      output: { path: outDir, wiki: false, word: true, pdf: false, wordDiagrams: false },
    })));

    expect(outputFiles()).toContain('solution-documentation.docx');
    expect(exit).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------
// Config loading
// -----------------------------------------------

describe('main — config loading', () => {
  it('reports an unreadable config with an actionable hint and exits 1', async () => {
    fs.writeFileSync(path.join(dir, 'doc-gen.config.yml'), 'output:\n  path: [unclosed\n', 'utf-8');
    // The real process.exit(1) would end the run here; the stub returns, so main()
    // carries on into `config.output` and throws. Catch it and assert on the exit.
    await main(dir).catch(() => {});

    expect(errors.join('\n')).toContain('Failed to load config');
    expect(errors.join('\n')).toContain('Is doc-gen.config.yml present');
    expect(errors.join('\n')).toContain('DOC_GEN_CONFIG_DIR');
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('runs on defaults when no config file exists at all', async () => {
    // SAFETY — READ BEFORE EDITING. loadConfig warns and returns CONFIG_DEFAULTS,
    // whose solutions[0].path is the RELATIVE './unpacked' and whose output.path is
    // the RELATIVE './output' (src/config/loader.ts:24,29). Relative paths resolve
    // against process.cwd() — which under vitest is THIS REPO, where ./unpacked and
    // ./output are the real, gitignored, client-data directories. Run naively, this
    // test parses a client's solution and writes documentation into the working tree.
    //
    // It does not do so *today* only by accident: ./unpacked holds its solutions one
    // level down, so ./unpacked/Other/Solution.xml misses and the run degrades to a
    // skip. Unpack a solution directly into ./unpacked — the exact thing that folder
    // is for — and this test silently starts reading client data instead.
    //
    // So chdir into the tmpdir for the duration: './unpacked' and './output' now
    // resolve under tmp, the defaults path is still exercised for real, and the repo
    // is untouchable regardless of what happens to be on the machine. The afterEach
    // cwd guard catches this if the restore below is ever dropped.
    const cwdBackup = process.cwd();
    process.chdir(dir);
    try {
      await main(dir);
    } finally {
      process.chdir(cwdBackup);
    }

    expect(warns.join('\n')).toContain('using defaults');
    expect(logs.join('\n')).toContain('Solutions skipped   : 1');
    // The default relative path, echoed back — proof the defaults were genuinely
    // used, and that the run resolved them somewhere other than the repo.
    expect(errors.join('\n')).toContain('Folder not found: ./unpacked');
    expect(exit).toHaveBeenCalledWith(1);
  });
});

// -----------------------------------------------
// Solution path validation
// -----------------------------------------------

describe('main — solution path validation', () => {
  it('skips a missing folder with the pac unpack hint and exits 1', async () => {
    const missing = path.join(dir, 'not-unpacked');
    await main(writeConfig(baseConfig({
      solutions: [{ path: missing, publisherPrefix: 'contoso', displayName: 'Contoso Demo' }],
    })));

    // The hint is the whole point of this branch — a missing folder in a pipeline is
    // almost always a missing `pac solution unpack` step, and the error should say so
    // rather than leave someone reading a stack trace.
    expect(errors.join('\n')).toContain(`Folder not found: ${missing}`);
    expect(errors.join('\n')).toContain('pac solution unpack --zipfile MySolution.zip --folder');
    // Only the first line of the reason reaches the summary — the hint stays in the log.
    expect(logs.join('\n')).toContain(`✗ Contoso Demo — Folder not found: ${missing}`);
    expect(logs.join('\n')).toContain('Solutions processed : 0');
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('skips a folder that exists but is not a pac-unpacked solution', async () => {
    const notASolution = path.join(dir, 'random-folder');
    fs.mkdirSync(notASolution);
    await main(writeConfig(baseConfig({
      solutions: [{ path: notASolution, publisherPrefix: 'contoso' }],
    })));

    expect(errors.join('\n')).toContain("doesn't look like a pac-unpacked solution folder");
    expect(logs.join('\n')).toContain(`✗ ${notASolution} — No Other/Solution.xml found`);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('labels a skipped solution by displayName when set, else by path', async () => {
    await main(writeConfig(baseConfig({
      solutions: [
        { path: path.join(dir, 'a'), publisherPrefix: 'contoso', displayName: 'Alpha Solution' },
        { path: path.join(dir, 'b'), publisherPrefix: 'contoso' },
      ],
    })));

    expect(logs.join('\n')).toContain('✗ Alpha Solution — Folder not found');
    expect(logs.join('\n')).toContain(`✗ ${path.join(dir, 'b')} — Folder not found`);
    expect(logs.join('\n')).toContain('Solutions skipped   : 2');
    expect(exit).toHaveBeenCalledWith(1);
  });
});

// -----------------------------------------------
// Happy path
// -----------------------------------------------

describe('main — happy path', () => {
  it('processes ContosoDemo, writes markdown and exits clean', async () => {
    await main(writeConfig(baseConfig()));

    expect(logs.join('\n')).toContain('Processing: ' + CONTOSO);
    expect(logs.join('\n')).toContain('Solutions processed : 1');
    expect(logs.join('\n')).not.toContain('Solutions skipped');

    // The overview is the one page every run produces.
    expect(outputFiles()).toContain('overview.md');
    const overview = fs.readFileSync(path.join(outDir, 'overview.md'), 'utf-8');
    expect(overview).toContain('Contoso Demo');
    expect(overview).toContain('1.2.3.4');

    // Per-table pages land under tables/, driven by components.tables.
    const tablePages = fs.readdirSync(path.join(outDir, 'tables'));
    expect(tablePages).toContain('contoso_widget.md');

    expect(exit).not.toHaveBeenCalled();
  });

  it('honours a component toggle rather than writing pages for it', async () => {
    await main(writeConfig(baseConfig({
      solutions: [{ path: CONTOSO, publisherPrefix: 'contoso' }],
      output: { path: outDir, wiki: false, word: false, pdf: false, wordDiagrams: false },
      components: { tables: false, flows: false },
    })));

    // Tables still parse (the count is still logged and the merged model still needs
    // them) — but no per-table markdown is written.
    expect(logs.join('\n')).toMatch(/Tables: \d+ entities/);
    expect(fs.existsSync(path.join(outDir, 'tables'))).toBe(false);
    expect(exit).not.toHaveBeenCalled();
  });

  it('merges tables across multiple solution entries', async () => {
    // Two entries pointing at the same fixture: mergedSolution.tables must be the
    // concatenation, not the last one to win (src/index.ts:173-177). The merged model
    // is private, so the Word document — the one consumer that iterates
    // mergedSolution.tables — is what makes the concatenation visible.
    setArgv('--word');
    await main(writeConfig(baseConfig({
      solutions: [
        { path: CONTOSO, publisherPrefix: 'contoso', displayName: 'First' },
        { path: CONTOSO, publisherPrefix: 'contoso', displayName: 'Second' },
      ],
      output: { path: outDir, wiki: false, word: true, pdf: false, wordDiagrams: false },
    })));

    expect(logs.join('\n')).toContain('Solutions processed : 2');
    expect(logs.join('\n')).toContain('Processing: First');
    expect(logs.join('\n')).toContain('Processing: Second');
    expect(exit).not.toHaveBeenCalled();

    const docx = path.join(outDir, 'solution-documentation.docx');
    expect(fs.existsSync(docx)).toBe(true);
    expect(fs.statSync(docx).size).toBeGreaterThan(0);
  });

  it('describes every solution in the local markdown overview, not just the last', async () => {
    // Was pinned: writeOverviewMarkdown() wrote a fixed 'overview.md' and
    // main() called it once per solution INSIDE the per-solution loop, so with
    // two solutions the second silently overwrote the first. The same shape
    // applied to flows.md, plugins.md and webresources.md — all four are now
    // written once, after the loop, from the accumulated allSolutions/allFlows/
    // allPluginAssemblies/allWebResources arrays, the same "assemble once at
    // the end" shape the wiki/Word/PDF outputs already used (and which is why
    // THEY were never affected by this bug).
    const second = aSecondSolution();
    await main(writeConfig(baseConfig({
      solutions: [
        { path: CONTOSO, publisherPrefix: 'contoso' },
        { path: second, publisherPrefix: 'contoso' },
      ],
    })));

    expect(logs.join('\n')).toContain('Solutions processed : 2');

    const overview = fs.readFileSync(path.join(outDir, 'overview.md'), 'utf-8');
    expect(overview).toContain('Fabrikam Demo');
    expect(overview).toContain('Contoso Demo');
  });
});

// -----------------------------------------------
// Degradation
// -----------------------------------------------

describe('main — parser degradation', () => {
  it('records a parse warning and keeps going when a parser throws', async () => {
    // Entities/ is replaced by a FILE. validateSolutionPath still passes (it only
    // checks Other/Solution.xml), parseSolution's existsSync(entitiesPath) is true,
    // and readdirSync then throws ENOTDIR — a genuine throw out of a parser, which is
    // what tryParse (src/index.ts:36-51) exists to absorb.
    const copy = copyFixture();
    fs.rmSync(path.join(copy, 'Entities'), { recursive: true, force: true });
    fs.writeFileSync(path.join(copy, 'Entities'), 'not a directory', 'utf-8');

    await main(writeConfig(baseConfig({
      solutions: [{ path: copy, publisherPrefix: 'contoso', displayName: 'Broken Tables' }],
    })));

    // Warned, recorded against the right solution and component...
    expect(warns.join('\n')).toContain('Tables parser failed');
    expect(logs.join('\n')).toContain('⚠ [Broken Tables] Tables —');

    // ...but the solution is NOT skipped: it falls back to zero tables and the rest of
    // the components still parse.
    expect(logs.join('\n')).toContain('Solutions processed : 1');
    expect(logs.join('\n')).not.toContain('Solutions skipped');
    expect(logs.join('\n')).toContain('Tables: 0 entities');
    expect(outputFiles()).toContain('overview.md');
  });

  it('grades a parse-warning run as a warning and exits 0, not 1', async () => {
    // Pinning the documented contract (.claude/docs/process.md:214): parse warnings
    // are degradation, not failure. A pipeline must stay green when one component of
    // one solution could not be read — only skipped solutions and publish failures
    // are worth failing a client's build over.
    const copy = copyFixture();
    fs.rmSync(path.join(copy, 'Entities'), { recursive: true, force: true });
    fs.writeFileSync(path.join(copy, 'Entities'), 'not a directory', 'utf-8');

    await main(writeConfig(baseConfig({
      solutions: [{ path: copy, publisherPrefix: 'contoso' }],
    })));

    expect(logs.join('\n')).toContain('⚠ Completed with warnings');
    expect(exit).not.toHaveBeenCalled();
  });

  it('skips the whole solution when the manifest itself will not parse', async () => {
    // Solution.xml exists (so validateSolutionPath passes) but carries no
    // SolutionManifest — the parser throws, tryParse returns null, and without a
    // manifest there is nothing to hang the rest of the solution off.
    const copy = copyFixture();
    fs.writeFileSync(
      path.join(copy, 'Other', 'Solution.xml'),
      '<?xml version="1.0" encoding="utf-8"?>\n<ImportExportXml />\n',
      'utf-8',
    );

    await main(writeConfig(baseConfig({
      solutions: [{ path: copy, publisherPrefix: 'contoso', displayName: 'Bad Manifest' }],
    })));

    expect(warns.join('\n')).toContain('Manifest parser failed');
    expect(logs.join('\n')).toContain('✗ Bad Manifest — Manifest parse failed');
    expect(logs.join('\n')).toContain('Solutions processed : 0');
    // No overview page for a solution that was never readable.
    expect(outputFiles()).not.toContain('overview.md');
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('carries on to the next solution after one is skipped', async () => {
    // A bad entry must not cost a client the documentation for their good ones.
    await main(writeConfig(baseConfig({
      solutions: [
        { path: path.join(dir, 'missing'), publisherPrefix: 'contoso', displayName: 'Ghost' },
        { path: CONTOSO, publisherPrefix: 'contoso', displayName: 'Real' },
      ],
    })));

    expect(logs.join('\n')).toContain('Solutions processed : 1');
    expect(logs.join('\n')).toContain('✗ Ghost — Folder not found');
    expect(outputFiles()).toContain('overview.md');
    // Skipped solutions are still a hard failure for the run overall.
    expect(logs.join('\n')).toContain('✗ Completed with errors');
    expect(exit).toHaveBeenCalledWith(1);
  });
});

// -----------------------------------------------
// Wiki publish
// -----------------------------------------------

describe('main — wiki publish', () => {
  // CAVEAT: main() calls publishToWiki(config.wiki, pages) without passing the
  // doFetch seam, so there is no way to reach a successful publish without a real
  // HTTP request. Every test here therefore covers a path that stops BEFORE the
  // request. The pagesPublished counting at src/index.ts:357-371 is not reachable
  // from main() in a test until main() threads a fetch through.

  it('skips publishing entirely when output.wiki is false, even with a full wiki block', async () => {
    // src/index.ts:118-120 nulls config.wiki. This is the switch that lets a client
    // keep their wiki credentials in the config while doing a local-only run — if it
    // regressed, that run would start hitting their real ADO org.
    await main(writeConfig(baseConfig({
      output: { path: outDir, wiki: false, word: false, pdf: false, wordDiagrams: false },
      wiki: {
        organisation: 'contoso', project: 'Demo', wikiIdentifier: 'Demo.wiki',
        parentPath: '/Docs', pat: 'REDACTED',
      },
    })));

    expect(logs.join('\n')).toContain('No wiki config — skipping publish (local output only)');
    expect(output()).not.toContain('Publishing to ADO Wiki');
    expect(exit).not.toHaveBeenCalled();
  });

  it('records a publish failure rather than requesting with an unset PAT', async () => {
    // 'REDACTED' is the placeholder the shipped sample config carries. Publishing
    // with it would 401 against the client's org on every page; failing up front
    // with the "inject it via your pipeline secret" hint is the useful behaviour.
    await main(writeConfig(baseConfig({
      output: { path: outDir, wiki: true, word: false, pdf: false, wordDiagrams: false },
      wiki: {
        organisation: 'contoso', project: 'Demo', wikiIdentifier: 'Demo.wiki',
        parentPath: '/Docs', pat: 'REDACTED',
      },
    })));

    expect(errors.join('\n')).toContain('wiki.pat is not set — cannot publish');
    expect(logs.join('\n')).toContain('Inject the PAT at runtime via your pipeline secret variable');
    expect(logs.join('\n')).toContain('✗ (all pages) — PAT not configured');
    // A publish failure is a hard failure — the pipeline must go red.
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('catches a whitespace PAT in main(), and still writes the Word doc', async () => {
    // Was pinned as a bug covering two defects; the old pin predicted this
    // exact test ("should then assert the summary prints and the .docx is written
    // anyway"). Both are now fixed:
    //
    // 1. main()'s PAT check was `!pat || pat === 'REDACTED'` while publishToWiki's
    //    also trimmed and case-folded, so a whitespace-only PAT — a common ADO
    //    variable-substitution failure — sailed past main()'s friendly, actionable
    //    error and was rejected deeper in as a throw. main() now uses the same guard.
    // 2. The publishToWiki call was the only unguarded fallible step in main(), so
    //    that throw escaped: no run summary, and no Word document despite
    //    output.word being true and the .docx not depending on the wiki at all.
    //
    // SAFETY — this is the one wiki block in this file that is not pat: 'REDACTED',
    // so read this before touching it. A whitespace PAT is network-proof for a
    // STRONGER reason than the REDACTED ones: it is now rejected by main()'s own
    // guard before the publisher is even called, and publishToWiki rejects it again
    // before its first doFetch. Both guards would have to be deleted to reach the
    // network. Do not give it a realistic-looking value.
    const cfg = writeConfig(baseConfig({
      output: { path: outDir, wiki: true, word: true, pdf: false, wordDiagrams: false },
      wiki: {
        organisation: 'contoso', project: 'Demo', wikiIdentifier: 'Demo.wiki',
        parentPath: '/Docs', pat: '   ',
      },
    }));

    // No longer throws out of main().
    await main(cfg);

    // main()'s own PAT branch now catches it, with the actionable message.
    expect(errors.join('\n')).toContain('wiki.pat is not set');
    // The run completes: summary prints, and the failure is recorded as one.
    expect(output()).toContain('Run Summary');
    expect(output()).toContain('PAT not configured');
    // The Word document is no longer collateral damage.
    expect(outputFiles()).toContain('solution-documentation.docx');
    expect(outputFiles()).toContain('overview.md');
    // A publish failure is a hard error, so the pipeline still fails — loudly and
    // after doing all the work it could, rather than silently mid-flight.
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('does not attempt a publish when every solution was skipped', async () => {
    // mergedSolution stays null, so the publish block is never entered — a run that
    // parsed nothing must not overwrite a client's wiki with empty pages.
    await main(writeConfig(baseConfig({
      solutions: [{ path: path.join(dir, 'missing'), publisherPrefix: 'contoso' }],
      output: { path: outDir, wiki: true, word: false, pdf: false, wordDiagrams: false },
      wiki: {
        organisation: 'contoso', project: 'Demo', wikiIdentifier: 'Demo.wiki',
        parentPath: '/Docs', pat: 'REDACTED',
      },
    })));

    // Neither the header nor the PAT rejection appears: the block was never entered.
    expect(output()).not.toContain('Publishing to ADO Wiki');
    expect(output()).not.toContain('wiki.pat is not set');
    expect(exit).toHaveBeenCalledWith(1);
  });
});

// -----------------------------------------------
// AI enrichment
// -----------------------------------------------

describe('main — AI enrichment', () => {
  it('does not enter the enrichment block when it is disabled', async () => {
    // The default. Nothing should reach a provider — no key, no request, no cache file.
    await main(writeConfig(baseConfig()));

    expect(output()).not.toContain('AI Enrichment');
    expect(fs.existsSync(path.join(dir, DEFAULT_CACHE_DIR, '.powerautodocs-ai-cache.json'))).toBe(false);
  });

  it('reports a failing enrichment run as a warning without failing the build', async () => {
    // No API key in the env, so the provider factory throws inside
    // enrichWithAiSummaries. main() catches it (src/index.ts:318-321) and records an
    // aiSummaryFailure — which, deliberately, is NOT one of the conditions that exits
    // 1. AI is a nice-to-have; losing it must not cost a client their documentation.
    vi.stubEnv('CONTOSO_FAKE_AI_KEY', '');
    await main(writeConfig(baseConfig({
      aiEnrichment: {
        enabled: true,
        provider: 'anthropic',
        anthropic: { apiKeyEnv: 'CONTOSO_FAKE_AI_KEY' },
        components: { flows: true },
      },
    })));

    expect(logs.join('\n')).toContain('AI Enrichment');
    expect(logs.join('\n')).toContain('AI summary failures');
    // The documentation still got written, and the run is not a hard failure.
    expect(outputFiles()).toContain('overview.md');
    expect(exit).not.toHaveBeenCalled();
  });
});
