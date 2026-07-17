import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { log, logHeader, logSummary, createSummary, type RunSummary } from '../src/logger.js';

// Spying on console is a plain object-property spy, not a module mock — the logger's
// only observable behaviour IS what lands on stdout/stderr, so that is what we assert on.
let out: string[];
let warned: string[];
let errored: string[];

beforeEach(() => {
  out = [];
  warned = [];
  errored = [];
  vi.spyOn(console, 'log').mockImplementation((m?: unknown) => { out.push(String(m)); });
  vi.spyOn(console, 'warn').mockImplementation((m?: unknown) => { warned.push(String(m)); });
  vi.spyOn(console, 'error').mockImplementation((m?: unknown) => { errored.push(String(m)); });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Everything logSummary printed, as one blob — line breaks inside a call included. */
const summaryText = (): string => out.join('\n');

/**
 * The single "  Status: …" line logSummary emits. Asserts there is exactly one:
 * `find` would silently take the first of several, so a refactor that printed the
 * status twice — or an earlier detail line that happened to match — would pass unseen.
 */
const statusLine = (): string => {
  const matches = summaryText().split('\n').filter(l => l.trim().startsWith('Status:'));
  expect(matches).toHaveLength(1);
  return matches[0].trim();
};

const aSummary = (over: Partial<RunSummary> = {}): RunSummary => ({ ...createSummary(), ...over });

describe('log — stream routing', () => {
  // ADO surfaces stderr differently from stdout, so a level landing on the wrong
  // stream changes whether a client's pipeline log shows the problem in red.
  it('sends errors to console.error only', () => {
    log('error', 'boom');
    expect(errored).toEqual(['  ✗ boom']);
    expect(out).toEqual([]);
    expect(warned).toEqual([]);
  });

  it('sends warnings to console.warn only', () => {
    log('warn', 'careful');
    expect(warned).toEqual(['  ⚠ careful']);
    expect(out).toEqual([]);
    expect(errored).toEqual([]);
  });

  it('sends info, success and skip to console.log', () => {
    log('info', 'a');
    log('success', 'b');
    log('skip', 'c');
    expect(out).toEqual(['  → a', '  ✓ b', '  ↷ c']);
    expect(warned).toEqual([]);
    expect(errored).toEqual([]);
  });
});

describe('log — symbol prefixes', () => {
  it('prefixes each level with its own symbol and a single space', () => {
    log('info', 'm');
    log('success', 'm');
    log('skip', 'm');
    log('warn', 'm');
    log('error', 'm');
    expect([...out, ...warned, ...errored]).toEqual([
      '  → m', '  ✓ m', '  ↷ m', '  ⚠ m', '  ✗ m',
    ]);
  });

  it('passes the message through untouched, including empty and multi-line text', () => {
    log('info', '');
    log('info', 'line one\nline two');
    expect(out).toEqual(['  → ', '  → line one\nline two']);
  });
});

describe('logHeader', () => {
  it('prints a blank line, the message, then a rule as long as the message', () => {
    logHeader('Parsing');
    expect(out).toEqual(['\nParsing', '───────']);
    expect(out[1]).toHaveLength('Parsing'.length);
  });

  it('caps the rule at 60 characters so a long heading does not wrap the log', () => {
    const long = 'x'.repeat(140);
    logHeader(long);
    expect(out[0]).toBe(`\n${long}`);
    expect(out[1]).toHaveLength(60);
    expect(out[1]).toBe('─'.repeat(60));
  });

  it('rules a 60-char heading to its exact length — the boundary', () => {
    logHeader('y'.repeat(60));
    expect(out[1]).toHaveLength(60);
  });

  it('emits an empty rule for an empty heading rather than throwing', () => {
    logHeader('');
    expect(out).toEqual(['\n', '']);
  });
});

describe('createSummary', () => {
  it('returns a fully zeroed summary', () => {
    expect(createSummary()).toEqual({
      solutionsProcessed: 0,
      solutionsSkipped: [],
      parseWarnings: [],
      pagesPublished: 0,
      publishFailures: [],
      aiSummariesGenerated: 0,
      aiSummariesCached: 0,
      aiSummaryFailures: [],
    });
  });

  it('hands back fresh arrays each call, not shared references', () => {
    // src/index.ts:71 takes one summary per run and pushes into it all the way
    // through. Shared arrays would bleed one run's failures into the next.
    const a = createSummary();
    const b = createSummary();
    a.solutionsSkipped.push({ name: 'x', reason: 'y' });
    a.parseWarnings.push({ solution: 's', component: 'c', reason: 'r' });
    a.publishFailures.push({ path: 'p', reason: 'r' });
    a.aiSummaryFailures.push({ component: 'c', name: 'n', reason: 'r' });
    expect(b.solutionsSkipped).toEqual([]);
    expect(b.parseWarnings).toEqual([]);
    expect(b.publishFailures).toEqual([]);
    expect(b.aiSummaryFailures).toEqual([]);
  });
});

describe('logSummary — status line', () => {
  // This line is the human-readable twin of the exit code (src/index.ts:441-442).
  // Getting it wrong tells a client a broken run was fine.

  it('reports success on a clean run', () => {
    logSummary(aSummary({ solutionsProcessed: 3, pagesPublished: 12 }));
    expect(statusLine()).toBe('Status: ✓ Completed successfully');
  });

  it('reports errors when a solution was skipped', () => {
    logSummary(aSummary({ solutionsSkipped: [{ name: 'Core', reason: 'missing folder' }] }));
    expect(statusLine()).toBe('Status: ✗ Completed with errors');
  });

  it('reports errors when a page failed to publish', () => {
    logSummary(aSummary({ publishFailures: [{ path: '/Tables/Widget', reason: '403' }] }));
    expect(statusLine()).toBe('Status: ✗ Completed with errors');
  });

  it('reports warnings when there are parse warnings and nothing worse', () => {
    logSummary(aSummary({
      parseWarnings: [{ solution: 'Core', component: 'Flow', reason: 'unreadable json' }],
    }));
    expect(statusLine()).toBe('Status: ⚠ Completed with warnings');
  });

  it('lets errors outrank warnings when both are present', () => {
    logSummary(aSummary({
      solutionsSkipped: [{ name: 'Core', reason: 'missing folder' }],
      parseWarnings: [{ solution: 'Core', component: 'Flow', reason: 'unreadable json' }],
    }));
    expect(statusLine()).toBe('Status: ✗ Completed with errors');
  });

  it('grades an AI-summary-only failure as a warning', () => {
    // Was pinned as a bug: hasWarnings derived from parseWarnings alone, so a
    // run whose every AI summary failed printed '✓ Completed successfully' — the
    // failures were listed in the block above and contradicted by the status line
    // four lines later. index.ts:320 funnels a whole-run enrichment crash into this
    // same array, so *total* AI failure printed ✓ too.
    logSummary(aSummary({
      solutionsProcessed: 1,
      aiSummariesGenerated: 4,
      aiSummaryFailures: [
        { component: 'Flow', name: 'Create Widget', reason: 'rate limited' },
        { component: 'Plugin', name: 'WidgetPlugin', reason: 'timeout' },
      ],
    }));
    expect(statusLine()).toBe('Status: ⚠ Completed with warnings');
    expect(summaryText()).toContain('AI summary failures   : 2');
  });

  it('still grades a hard error above an AI failure', () => {
    // AI failures must not mask a real error — errors outrank warnings.
    logSummary(aSummary({
      publishFailures: [{ path: '/Docs/Overview', reason: '403' }],
      aiSummaryFailures: [{ component: 'Flow', name: 'Create Widget', reason: 'timeout' }],
    }));
    expect(statusLine()).toBe('Status: ✗ Completed with errors');
  });

  it('reports success when AI summaries all succeed', () => {
    // The other half of the fix: warnings must not fire on a clean AI run, or the
    // status line would be useless in the opposite direction.
    logSummary(aSummary({
      solutionsProcessed: 1,
      aiSummariesGenerated: 4,
      aiSummariesCached: 2,
    }));
    expect(statusLine()).toBe('Status: ✓ Completed successfully');
  });
});

describe('logSummary — conditional blocks', () => {
  it('always prints the header and the processed count', () => {
    logSummary(aSummary({ solutionsProcessed: 2 }));
    expect(summaryText()).toContain('PowerAutoDoc — Run Summary');
    expect(summaryText()).toContain('Solutions processed : 2');
  });

  it('omits the skipped, warning, publish and AI blocks entirely on a clean run', () => {
    logSummary(aSummary({ solutionsProcessed: 1 }));
    const text = summaryText();
    expect(text).not.toContain('Solutions skipped');
    expect(text).not.toContain('Parse warnings');
    expect(text).not.toContain('Wiki pages published');
    expect(text).not.toContain('Publish failures');
    expect(text).not.toContain('AI summaries generated');
  });

  it('prints the wiki line only once at least one page was published', () => {
    logSummary(aSummary({ pagesPublished: 0 }));
    expect(summaryText()).not.toContain('Wiki pages published');

    out = [];
    logSummary(aSummary({ pagesPublished: 7 }));
    expect(summaryText()).toContain('Wiki pages published: 7');
  });

  it('still reports publish failures when not a single page published', () => {
    // The worst realistic wiki run — bad PAT, every page 401s — leaves pagesPublished
    // at 0. The failures block sits OUTSIDE the `pagesPublished > 0` guard
    // (logger.ts:52 vs :56) and must stay there: nesting it would silently swallow
    // the whole report on exactly the run a client most needs to read.
    logSummary(aSummary({
      pagesPublished: 0,
      publishFailures: [
        { path: '/Tables/Widget', reason: '401 Unauthorized' },
        { path: '/Flows/Create', reason: '401 Unauthorized' },
      ],
    }));
    const text = summaryText();
    expect(text).not.toContain('Wiki pages published');
    expect(text).toContain('Publish failures    : 2');
    expect(text).toContain('✗ /Tables/Widget — 401 Unauthorized');
    expect(statusLine()).toBe('Status: ✗ Completed with errors');
  });

  it('prints the AI block when summaries were generated, even with no failures', () => {
    logSummary(aSummary({ aiSummariesGenerated: 5 }));
    const text = summaryText();
    expect(text).toContain('AI summaries generated: 5');
    expect(text).toContain('AI summaries cached   : 0');
    expect(text).not.toContain('AI summary failures');
  });

  it('prints the AI block when everything came from cache', () => {
    // A fully cached run generated nothing; the block must still report the cache hits.
    logSummary(aSummary({ aiSummariesCached: 9 }));
    expect(summaryText()).toContain('AI summaries cached   : 9');
  });

  it('prints the AI block when the only AI activity was failure', () => {
    // The counts are both zero here — the block hangs off the failures alone.
    logSummary(aSummary({
      aiSummaryFailures: [{ component: 'Flow', name: 'F', reason: 'no key' }],
    }));
    const text = summaryText();
    expect(text).toContain('AI summaries generated: 0');
    expect(text).toContain('AI summary failures   : 1');
  });
});

describe('logSummary — detail lines', () => {
  it('names every skipped solution with its reason', () => {
    logSummary(aSummary({
      solutionsSkipped: [
        { name: 'Core', reason: 'folder not found' },
        { name: 'Addon', reason: 'no Solution.xml' },
      ],
    }));
    const text = summaryText();
    expect(text).toContain('Solutions skipped   : 2');
    expect(text).toContain('✗ Core — folder not found');
    expect(text).toContain('✗ Addon — no Solution.xml');
  });

  it('names every parse warning with its solution and component', () => {
    logSummary(aSummary({
      parseWarnings: [
        { solution: 'Core', component: 'Flow', reason: 'malformed definition' },
        { solution: 'Core', component: 'Table', reason: 'missing attribute' },
      ],
    }));
    const text = summaryText();
    expect(text).toContain('Parse warnings (2):');
    expect(text).toContain('⚠ [Core] Flow — malformed definition');
    expect(text).toContain('⚠ [Core] Table — missing attribute');
  });

  it('names every publish failure by wiki path', () => {
    logSummary(aSummary({
      pagesPublished: 4,
      publishFailures: [
        { path: '/Tables/Widget', reason: '401 Unauthorized' },
        { path: '/Flows/Create', reason: '500 Server Error' },
      ],
    }));
    const text = summaryText();
    expect(text).toContain('Publish failures    : 2');
    expect(text).toContain('✗ /Tables/Widget — 401 Unauthorized');
    expect(text).toContain('✗ /Flows/Create — 500 Server Error');
  });

  it('names every AI summary failure by component and name', () => {
    logSummary(aSummary({
      aiSummariesGenerated: 2,
      aiSummariesCached: 1,
      aiSummaryFailures: [{ component: 'Plugin', name: 'WidgetPlugin', reason: 'timeout' }],
    }));
    expect(summaryText()).toContain('✗ [Plugin] WidgetPlugin — timeout');
  });

  it('puts the whole summary on stdout, never on stderr', () => {
    // Even the failure detail lines: the summary is a report, and index.ts signals
    // the actual failure through the exit code rather than the stream.
    logSummary(aSummary({
      solutionsSkipped: [{ name: 'Core', reason: 'gone' }],
      publishFailures: [{ path: '/p', reason: 'boom' }],
      aiSummaryFailures: [{ component: 'Flow', name: 'F', reason: 'boom' }],
    }));
    expect(errored).toEqual([]);
    expect(warned).toEqual([]);
    // Name the lines that are actually at risk of being rerouted to console.error,
    // rather than just asserting *something* reached stdout — which any output passes.
    const text = summaryText();
    expect(text).toContain('✗ Core — gone');
    expect(text).toContain('✗ /p — boom');
    expect(text).toContain('✗ [Flow] F — boom');
    expect(statusLine()).toBe('Status: ✗ Completed with errors');
  });
});
