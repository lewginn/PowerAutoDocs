// tests/enrichment/aiSummariser.test.ts
//
// The unit under test spends the client's money. Every assertion here is
// ultimately about one of three questions:
//
//   1. Did we call the provider when we should have?  (staleness)
//   2. Did we NOT call it when we shouldn't have?     (cost)
//   3. When it went wrong, did the run survive?       (degradation)
//
// No mocks: enrichWithAiSummaries takes a ProviderFactory as its 6th argument
// (see the seam note in aiSummariser.ts / decisions.md), so every provider here
// is a plain hand-written object passed in as a parameter.
//
// configDir is always a real mkdtemp dir — the cache file must never land in the
// repo, and the repo's own .powerautodocs-ai-cache.json holds client data.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  enrichWithAiSummaries,
  type EnrichmentModels,
  type ProviderFactory,
} from '../../src/enrichment/aiSummariser.js';
import { createSummary } from '../../src/logger.js';
import type { RunSummary } from '../../src/logger.js';
import type { AiEnrichmentComponentsConfig, DocGenConfig } from '../../src/config/schema.js';
import type { WebResourceFunction } from '../../src/ir/index.js';
import {
  aClassicWorkflow,
  aBusinessRule,
  aFlow,
  anAction,
  aPluginAssembly,
  aWebResource,
} from '../fixtures/ir.js';
import { aConfig } from '../fixtures/config.js';

// -----------------------------------------------
// Harness
// -----------------------------------------------

let dir: string;
let cachePath: string;
let summary: RunSummary;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'padocs-ai-'));
  cachePath = path.join(dir, '.powerautodocs-ai-cache.json');
  summary = createSummary();
  // The summariser narrates every kind it processes.
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/**
 * A hand-written AiProvider behind a hand-written factory. `prompts` is the
 * cost meter: its length is exactly how many times a real run would have paid
 * an API bill, so most tests here assert on it.
 */
const aFakeProvider = (respond: (prompt: string) => string = () => 'A canned summary.') => {
  const prompts: string[] = [];
  let factoryCalls = 0;
  const factory: ProviderFactory = () => {
    factoryCalls++;
    return { summarise: async (prompt: string) => { prompts.push(prompt); return respond(prompt); } };
  };
  return { factory, prompts, get factoryCalls() { return factoryCalls; } };
};

/** A provider whose every call rejects — the "the API is down" path. */
const aFailingProvider = (message = 'HTTP 529 overloaded') => {
  let calls = 0;
  const factory: ProviderFactory = () => ({
    summarise: async () => { calls++; throw new Error(message); },
  });
  return { factory, get calls() { return calls; } };
};

// Every AI component toggle, off — taken from the real defaults rather than
// written out here, so a new component kind cannot silently default to `true`
// in these tests while defaulting to `false` in production.
// Frozen: this is a live reference into one clone shared by every test in the
// file, so an accidental mutation would leak across tests as a toggle that is
// mysteriously already on. Every use spreads it, so freezing costs nothing.
const ALL_COMPONENTS_OFF: AiEnrichmentComponentsConfig =
  Object.freeze(aConfig().aiEnrichment!.components);

// The premise of ALL_COMPONENTS_OFF: if a kind ever ships defaulting to `true`,
// clients start paying for it silently — and these tests would stop testing
// opt-in at all, since anAiConfig() would enable it everywhere.
it('every AI component kind defaults to off', () => {
  expect(Object.values(ALL_COMPONENTS_OFF)).not.toContain(true);
  expect(aConfig().aiEnrichment!.enabled).toBe(false);
});

/**
 * Enrichment on, with only the named components opted in.
 * aiEnrichment must be supplied whole: DocGenConfig declares it optional, and the
 * fixture's DeepPartial does not recurse through optional properties.
 */
const anAiConfig = (components: Partial<AiEnrichmentComponentsConfig> = { flows: true }): DocGenConfig =>
  aConfig({
    aiEnrichment: {
      enabled: true,
      provider: 'anthropic',
      // Never a real key — the fake factory never reads it anyway.
      anthropic: { apiKeyEnv: 'FAKE_ENV_VAR_FOR_TESTS' },
      components: { ...ALL_COMPONENTS_OFF, ...components },
    },
  });

const someModels = (over: Partial<EnrichmentModels> = {}): EnrichmentModels => ({
  flows: [],
  classicWorkflows: [],
  businessRules: [],
  pluginAssemblies: [],
  webResources: [],
  ...over,
});

interface CacheEntry { hash: string; summary: string; generatedAt: string }

const readCache = (p = cachePath): Record<string, CacheEntry> =>
  JSON.parse(fs.readFileSync(p, 'utf-8'));

const writeCache = (cache: Record<string, CacheEntry>, p = cachePath): void =>
  fs.writeFileSync(p, JSON.stringify(cache, null, 2), 'utf-8');

const anEntry = (over: Partial<CacheEntry> = {}): CacheEntry => ({
  hash: 'deadbeef-not-a-real-hash',
  summary: 'A previously cached summary.',
  generatedAt: '2020-01-01T00:00:00.000Z',
  ...over,
});

const aFn = (over: Partial<WebResourceFunction> = {}): WebResourceFunction => ({
  name: 'onLoad',
  isAsync: false,
  params: ['executionContext'],
  ...over,
});

/** The prompt ends with the summarisable view as pretty JSON — pull it back out. */
const viewJsonFrom = (prompt: string): string => {
  const marker = 'Component data (JSON):\n';
  const at = prompt.indexOf(marker);
  expect(at).toBeGreaterThan(-1);
  return prompt.slice(at + marker.length);
};

const FLOW_KEY = 'flows:Create Part On Widget Create';

// -----------------------------------------------
// Disabled
// -----------------------------------------------

describe('enrichWithAiSummaries — disabled', () => {
  it('does nothing at all when aiEnrichment is absent from the config', async () => {
    const config = aConfig();
    delete config.aiEnrichment;
    const flow = aFlow();
    const provider = aFakeProvider();

    await enrichWithAiSummaries(config, dir, someModels({ flows: [flow] }), summary, false, provider.factory);

    // Not "no summary" — no provider was ever constructed, so no key was read
    // and no request could have been made.
    expect(provider.factoryCalls).toBe(0);
    expect(flow.aiSummary).toBeUndefined();
    expect(fs.existsSync(cachePath)).toBe(false);
  });

  it('does nothing when enabled is false, even with components opted in', async () => {
    const config = anAiConfig({ flows: true });
    config.aiEnrichment!.enabled = false;
    const flow = aFlow();
    const provider = aFakeProvider();

    await enrichWithAiSummaries(config, dir, someModels({ flows: [flow] }), summary, false, provider.factory);

    expect(provider.factoryCalls).toBe(0);
    expect(flow.aiSummary).toBeUndefined();
    expect(fs.existsSync(cachePath)).toBe(false);
  });
});

// -----------------------------------------------
// Provider setup failure
// -----------------------------------------------

describe('enrichWithAiSummaries — provider setup failure', () => {
  it('degrades instead of crashing when the factory throws', async () => {
    // Realistically: the apiKeyEnv var is not set on the build agent. That must
    // cost the run its summaries, not the whole document.
    const factory: ProviderFactory = () => { throw new Error('FAKE_ENV_VAR_FOR_TESTS is not set'); };
    const flow = aFlow();

    await expect(
      enrichWithAiSummaries(anAiConfig(), dir, someModels({ flows: [flow] }), summary, false, factory),
    ).resolves.toBeUndefined();

    expect(flow.aiSummary).toBeUndefined();
    expect(summary.aiSummaryFailures).toEqual([
      { component: 'provider', name: 'anthropic', reason: 'FAKE_ENV_VAR_FOR_TESTS is not set' },
    ]);
    expect(summary.aiSummariesGenerated).toBe(0);
  });

  it('reports the setup failure on stderr', async () => {
    const factory: ProviderFactory = () => { throw new Error('bad endpoint'); };
    await enrichWithAiSummaries(anAiConfig(), dir, someModels({ flows: [aFlow()] }), summary, false, factory);

    const errors = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(c => String(c[0]));
    expect(errors.some(e => e.includes('provider setup failed') && e.includes('bad endpoint'))).toBe(true);
  });

  it('leaves an existing cache file untouched rather than truncating it', async () => {
    // Bailing out before saveCache matters: a transient missing env var must not
    // wipe a cache the client has been paying to build up.
    writeCache({ [FLOW_KEY]: anEntry({ summary: 'Precious.' }) });
    const factory: ProviderFactory = () => { throw new Error('nope'); };

    await enrichWithAiSummaries(anAiConfig(), dir, someModels({ flows: [aFlow()] }), summary, false, factory);

    expect(readCache()[FLOW_KEY].summary).toBe('Precious.');
  });
});

// -----------------------------------------------
// Cache miss / hit — the whole point of the module
// -----------------------------------------------

describe('enrichWithAiSummaries — cache miss', () => {
  it('summarises, sets aiSummary and writes a complete cache entry', async () => {
    const flow = aFlow();
    const provider = aFakeProvider(() => 'Creates a Part whenever a Widget appears.');

    await enrichWithAiSummaries(anAiConfig(), dir, someModels({ flows: [flow] }), summary, false, provider.factory);

    expect(provider.prompts).toHaveLength(1);
    expect(flow.aiSummary).toBe('Creates a Part whenever a Widget appears.');

    const entry = readCache()[FLOW_KEY];
    expect(entry.summary).toBe('Creates a Part whenever a Widget appears.');
    expect(entry.hash).toMatch(/^[0-9a-f]{64}$/);
    // A real, round-trippable ISO timestamp — this is what tells a human when
    // the summary was last paid for.
    expect(new Date(entry.generatedAt).toISOString()).toBe(entry.generatedAt);

    expect(summary.aiSummariesGenerated).toBe(1);
    expect(summary.aiSummariesCached).toBe(0);
  });

  it('builds a prompt carrying the component data and the flow lens', async () => {
    const provider = aFakeProvider();
    const flow = aFlow({ name: 'Notify On Overdue Part' });

    await enrichWithAiSummaries(anAiConfig(), dir, someModels({ flows: [flow] }), summary, false, provider.factory);

    const prompt = provider.prompts[0];
    expect(prompt).toContain('Power Automate flow');
    expect(JSON.parse(viewJsonFrom(prompt))).toMatchObject({
      name: 'Notify On Overdue Part',
      isActive: true,
      trigger: { type: 'DataverseCreate', entity: 'acme_widget' },
    });
  });

  it('does not call the provider when there is nothing to summarise', async () => {
    const provider = aFakeProvider();
    await enrichWithAiSummaries(anAiConfig(), dir, someModels(), summary, false, provider.factory);
    expect(provider.prompts).toHaveLength(0);
  });
});

describe('enrichWithAiSummaries — cache hit', () => {
  it('reuses a cached summary without calling the provider', async () => {
    // If this ever breaks, every client pays for every summary on every run,
    // forever, and nobody notices because the output still looks right.
    const first = aFakeProvider(() => 'Generated once.');
    await enrichWithAiSummaries(anAiConfig(), dir, someModels({ flows: [aFlow()] }), summary, false, first.factory);

    const flow = aFlow();
    const second = aFakeProvider(() => 'Should never be asked for.');
    const summary2 = createSummary();
    await enrichWithAiSummaries(anAiConfig(), dir, someModels({ flows: [flow] }), summary2, false, second.factory);

    expect(second.prompts).toHaveLength(0);
    expect(flow.aiSummary).toBe('Generated once.');
    expect(summary2.aiSummariesCached).toBe(1);
    expect(summary2.aiSummariesGenerated).toBe(0);
  });

  it('preserves the original generatedAt on a hit rather than restamping it', async () => {
    // generatedAt is what tells a human when the summary was last paid for. If a
    // hit restamped it, every entry would read as "generated today" forever and
    // the field would be worthless.
    //
    // Comparing run 1's stamp against run 2's cannot prove this: both runs land
    // in the same millisecond, so `new Date().toISOString()` returns the SAME
    // string either way and the assertion holds even against restamping code.
    // Instead, backdate the entry on disk (keeping its hash, so it still hits)
    // to a value now() can never produce, and require it to survive untouched.
    const provider = aFakeProvider();
    await enrichWithAiSummaries(anAiConfig(), dir, someModels({ flows: [aFlow()] }), summary, false, provider.factory);

    const seeded = readCache()[FLOW_KEY];
    const backdated = '2020-01-01T00:00:00.000Z';
    writeCache({ [FLOW_KEY]: { ...seeded, generatedAt: backdated } });

    const flow = aFlow();
    await enrichWithAiSummaries(anAiConfig(), dir, someModels({ flows: [flow] }), createSummary(), false, provider.factory);

    // It really was a hit — otherwise the stamp would be rewritten legitimately
    // and this would prove nothing about the hit path.
    expect(provider.prompts).toHaveLength(1);
    expect(flow.aiSummary).toBe('A canned summary.');
    expect(readCache()[FLOW_KEY].generatedAt).toBe(backdated);
  });

  it('regenerates on a hit when forceRegenerate is set', async () => {
    const first = aFakeProvider(() => 'Old wording.');
    await enrichWithAiSummaries(anAiConfig(), dir, someModels({ flows: [aFlow()] }), summary, false, first.factory);

    const flow = aFlow();
    const second = aFakeProvider(() => 'New wording.');
    const summary2 = createSummary();
    await enrichWithAiSummaries(anAiConfig(), dir, someModels({ flows: [flow] }), summary2, true, second.factory);

    expect(second.prompts).toHaveLength(1);
    expect(flow.aiSummary).toBe('New wording.');
    expect(readCache()[FLOW_KEY].summary).toBe('New wording.');
    expect(summary2.aiSummariesGenerated).toBe(1);
    expect(summary2.aiSummariesCached).toBe(0);
  });
});

// -----------------------------------------------
// Hash sensitivity — both directions
// -----------------------------------------------

describe('enrichWithAiSummaries — cache hash', () => {
  const seedCache = async () => {
    const provider = aFakeProvider(() => 'Original summary.');
    await enrichWithAiSummaries(anAiConfig(), dir, someModels({ flows: [aFlow()] }), createSummary(), false, provider.factory);
  };

  it('invalidates when a field inside the summarisable view changes', async () => {
    await seedCache();

    // Same flow name (so the same cache key), but an action now writes to a
    // different table. The old summary is now factually wrong — regenerate.
    const flow = aFlow({ actions: [anAction({ entityName: 'acme_invoice' })] });
    const provider = aFakeProvider(() => 'Fresh summary.');
    await enrichWithAiSummaries(anAiConfig(), dir, someModels({ flows: [flow] }), summary, false, provider.factory);

    expect(provider.prompts).toHaveLength(1);
    expect(flow.aiSummary).toBe('Fresh summary.');
    expect(summary.aiSummariesGenerated).toBe(1);
  });

  it('does not invalidate when a field outside the view changes', async () => {
    await seedCache();

    // A new GUID on every unpack would churn the entire cache if ids were hashed.
    const flow = aFlow({ id: '99999999-9999-9999-9999-999999999999' });
    const provider = aFakeProvider(() => 'Should never be asked for.');
    await enrichWithAiSummaries(anAiConfig(), dir, someModels({ flows: [flow] }), summary, false, provider.factory);

    expect(provider.prompts).toHaveLength(0);
    expect(flow.aiSummary).toBe('Original summary.');
    expect(summary.aiSummariesCached).toBe(1);
  });

  // BUG (pinned, not a spec): the cache key is `{kind}:{displayName}`, but
  // Dataverse does not enforce unique display names on flows, classic workflows
  // or business rules. Two same-named flows therefore share one cache key, each
  // overwrites the other's entry within the same run, and neither can ever hit —
  // they are re-bought on every run, forever. The run summary reports it as
  // "2 generated, 0 from cache" every time, which looks like normal first-run
  // behaviour rather than a fault.
  //
  // A key that cannot collide (the flow id, or name + a hash discriminator)
  // would fix it, but that changes the on-disk cache format, so the call is the
  // source's. Un-pin by asserting run 2 is 0 generated / 2 cached.
  it('pins: two components sharing a display name can never cache', async () => {
    const twoFlows = () => [
      aFlow({ name: 'Sync Widgets', actions: [anAction({ entityName: 'acme_alpha' })] }),
      aFlow({ name: 'Sync Widgets', actions: [anAction({ entityName: 'acme_beta' })] }),
    ];
    const first = aFakeProvider(() => 'Summary.');
    const run1 = createSummary();
    await enrichWithAiSummaries(anAiConfig(), dir, someModels({ flows: twoFlows() }), run1, false, first.factory);

    // Two flows, two API calls, but only one cache entry survives.
    expect(first.prompts).toHaveLength(2);
    expect(Object.keys(readCache())).toEqual(['flows:Sync Widgets']);

    // Identical input, second run: should be a clean double hit. It is not.
    const second = aFakeProvider(() => 'Summary.');
    const run2 = createSummary();
    await enrichWithAiSummaries(anAiConfig(), dir, someModels({ flows: twoFlows() }), run2, false, second.factory);

    expect(second.prompts).toHaveLength(2);
    expect(run2.aiSummariesGenerated).toBe(2);
    expect(run2.aiSummariesCached).toBe(0);
  });

  it('treats an entry whose hash does not match as a miss', async () => {
    writeCache({ [FLOW_KEY]: anEntry({ summary: 'Stale nonsense.' }) });
    const flow = aFlow();
    const provider = aFakeProvider(() => 'Correct summary.');

    await enrichWithAiSummaries(anAiConfig(), dir, someModels({ flows: [flow] }), summary, false, provider.factory);

    expect(provider.prompts).toHaveLength(1);
    expect(flow.aiSummary).toBe('Correct summary.');
    expect(readCache()[FLOW_KEY].summary).toBe('Correct summary.');
  });

  it('folds a prompt version into the hash, so a bump invalidates everything', async () => {
    // Proven without touching PROMPT_VERSION: recover the exact view from the
    // prompt, hash it on its own, and seed the cache with that. If the stored
    // hash were just sha256(view) this would hit; it must miss, which is only
    // possible if something else (the version salt) is folded in.
    const probe = aFakeProvider(() => 'v1 summary.');
    await enrichWithAiSummaries(anAiConfig(), dir, someModels({ flows: [aFlow()] }), createSummary(), false, probe.factory);

    const viewOnlyHash = crypto.createHash('sha256')
      .update(JSON.stringify(JSON.parse(viewJsonFrom(probe.prompts[0]))))
      .digest('hex');
    expect(readCache()[FLOW_KEY].hash).not.toBe(viewOnlyHash);

    writeCache({ [FLOW_KEY]: anEntry({ hash: viewOnlyHash, summary: 'Written by an older prompt version.' }) });
    const flow = aFlow();
    const provider = aFakeProvider(() => 'Regenerated for the new prompt.');
    await enrichWithAiSummaries(anAiConfig(), dir, someModels({ flows: [flow] }), summary, false, provider.factory);

    expect(provider.prompts).toHaveLength(1);
    expect(flow.aiSummary).toBe('Regenerated for the new prompt.');
  });
});

// -----------------------------------------------
// Summarise failure — skip and continue
// -----------------------------------------------

describe('enrichWithAiSummaries — provider call failure', () => {
  it('records the failure and leaves aiSummary unset when there is no cached fallback', async () => {
    const flow = aFlow();
    const failing = aFailingProvider('HTTP 429 rate limited');

    await expect(
      enrichWithAiSummaries(anAiConfig(), dir, someModels({ flows: [flow] }), summary, false, failing.factory),
    ).resolves.toBeUndefined();

    expect(flow.aiSummary).toBeUndefined();
    expect(summary.aiSummaryFailures).toEqual([
      { component: 'Flows', name: 'Create Part On Widget Create', reason: 'HTTP 429 rate limited' },
    ]);
    expect(summary.aiSummariesGenerated).toBe(0);
    expect(readCache()).toEqual({});
  });

  it('falls back to a stale cached summary rather than shipping a blank page', async () => {
    writeCache({ [FLOW_KEY]: anEntry({ summary: 'Slightly out of date, but true enough.' }) });
    const flow = aFlow();
    const failing = aFailingProvider();

    await enrichWithAiSummaries(anAiConfig(), dir, someModels({ flows: [flow] }), summary, false, failing.factory);

    expect(flow.aiSummary).toBe('Slightly out of date, but true enough.');
    expect(summary.aiSummaryFailures).toHaveLength(1);
    // The stale entry survives the save, so the next run can fall back again.
    expect(readCache()[FLOW_KEY].summary).toBe('Slightly out of date, but true enough.');
    expect(summary.aiSummariesGenerated).toBe(0);
  });

  it('warns on stderr naming the component that failed', async () => {
    await enrichWithAiSummaries(
      anAiConfig(), dir, someModels({ flows: [aFlow()] }), summary, false, aFailingProvider('boom').factory,
    );
    const warnings = (console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(c => String(c[0]));
    expect(warnings.some(w => w.includes('Create Part On Widget Create') && w.includes('boom'))).toBe(true);
  });

  it('keeps going after one component fails, so one bad flow does not lose the rest', async () => {
    const flows = [aFlow({ name: 'Alpha' }), aFlow({ name: 'Bravo' }), aFlow({ name: 'Charlie' })];
    let calls = 0;
    const factory: ProviderFactory = () => ({
      summarise: async () => {
        calls++;
        if (calls === 2) throw new Error('transient');
        return 'Summary.';
      },
    });

    await enrichWithAiSummaries(anAiConfig(), dir, someModels({ flows }), summary, false, factory);

    expect(flows.map(f => f.aiSummary)).toEqual(['Summary.', undefined, 'Summary.']);
    expect(summary.aiSummariesGenerated).toBe(2);
    expect(summary.aiSummaryFailures.map(f => f.name)).toEqual(['Bravo']);
  });
});

// -----------------------------------------------
// Per-component opt-in
// -----------------------------------------------

describe('enrichWithAiSummaries — component toggles', () => {
  it('summarises only the kinds that are opted in', async () => {
    const flow = aFlow();
    const assembly = aPluginAssembly();
    const provider = aFakeProvider(() => 'Summary.');

    await enrichWithAiSummaries(
      anAiConfig({ flows: false, plugins: true }),
      dir,
      someModels({ flows: [flow], pluginAssemblies: [assembly] }),
      summary,
      false,
      provider.factory,
    );

    expect(flow.aiSummary).toBeUndefined();
    expect(assembly.aiSummary).toBe('Summary.');
    expect(provider.prompts).toHaveLength(1);
    expect(provider.prompts[0]).toContain('plugin assembly');
    expect(Object.keys(readCache())).toEqual(['plugins:Acme.Widgets.Plugins']);
  });

  it('keys each kind by its own unique name and covers workflows and business rules', async () => {
    const workflow = aClassicWorkflow();
    const rule = aBusinessRule();
    const provider = aFakeProvider(() => 'Summary.');

    await enrichWithAiSummaries(
      anAiConfig({ classicWorkflows: true, businessRules: true }),
      dir,
      someModels({ classicWorkflows: [workflow], businessRules: [rule] }),
      summary,
      false,
      provider.factory,
    );

    expect(workflow.aiSummary).toBe('Summary.');
    expect(rule.aiSummary).toBe('Summary.');
    expect(Object.keys(readCache()).sort()).toEqual([
      'businessRules:Require Serial For Premium Widgets',
      'classicWorkflows:Stamp Widget Approval',
    ]);
    expect(summary.aiSummariesGenerated).toBe(2);
  });
});

// -----------------------------------------------
// Web resources
// -----------------------------------------------

const JS_KEY = 'webResources:acme_/Scripts/Widget.js';

describe('enrichWithAiSummaries — web resources', () => {
  it('summarises JavaScript only, ignoring other resource types', async () => {
    // A CSS or PNG resource has nothing for the model to read, so paying for
    // a summary of one is pure waste.
    const js = aWebResource();
    const css = aWebResource({ name: 'acme_/Styles/site.css', resourceType: 'CSS' });
    const png = aWebResource({ name: 'acme_/Images/logo.png', resourceType: 'PNG' });
    const provider = aFakeProvider(() => 'A file summary.');

    await enrichWithAiSummaries(
      anAiConfig({ webResources: true }), dir, someModels({ webResources: [js, css, png] }),
      summary, false, provider.factory,
    );

    expect(provider.prompts).toHaveLength(1);
    expect(js.aiSummary).toBe('A file summary.');
    expect(css.aiSummary).toBeUndefined();
    expect(png.aiSummary).toBeUndefined();
    expect(Object.keys(readCache())).toEqual([JS_KEY]);
  });

  it('asks for structured JSON so one call covers the file and every function', async () => {
    const provider = aFakeProvider(() => 'text');
    await enrichWithAiSummaries(
      anAiConfig({ webResources: true }), dir,
      someModels({ webResources: [aWebResource({ functions: [aFn()] })] }),
      summary, false, provider.factory,
    );
    expect(provider.prompts[0]).toContain('"fileSummary"');
    expect(provider.prompts[0]).toContain('"functionSummaries"');
  });

  it('fans a JSON response out to the file summary and each function', async () => {
    const wr = aWebResource({
      functions: [aFn({ name: 'onLoad' }), aFn({ name: 'onSave', isAsync: true })],
    });
    const provider = aFakeProvider(() => JSON.stringify({
      fileSummary: 'Form scripting for the Widget table.',
      functionSummaries: { onLoad: 'Locks the serial field.', onSave: 'Validates the serial.' },
    }));

    await enrichWithAiSummaries(
      anAiConfig({ webResources: true }), dir, someModels({ webResources: [wr] }),
      summary, false, provider.factory,
    );

    expect(wr.aiSummary).toBe('Form scripting for the Widget table.');
    expect(wr.functions!.map(f => f.aiSummary)).toEqual(['Locks the serial field.', 'Validates the serial.']);
  });

  it('strips a markdown code fence before parsing', async () => {
    // Models add fences no matter how firmly the prompt says not to. Without
    // this, the whole fenced blob would render as the file summary.
    const wr = aWebResource({ functions: [aFn({ name: 'onLoad' })] });
    const provider = aFakeProvider(() =>
      '```json\n{"fileSummary":"Widget form logic.","functionSummaries":{"onLoad":"Runs on load."}}\n```');

    await enrichWithAiSummaries(
      anAiConfig({ webResources: true }), dir, someModels({ webResources: [wr] }),
      summary, false, provider.factory,
    );

    expect(wr.aiSummary).toBe('Widget form logic.');
    expect(wr.functions![0].aiSummary).toBe('Runs on load.');
  });

  it('treats a plain-prose response as the whole file summary', async () => {
    const wr = aWebResource({ functions: [aFn({ name: 'onLoad' })] });
    const provider = aFakeProvider(() => 'This script wires up the Widget main form.');

    await enrichWithAiSummaries(
      anAiConfig({ webResources: true }), dir, someModels({ webResources: [wr] }),
      summary, false, provider.factory,
    );

    expect(wr.aiSummary).toBe('This script wires up the Widget main form.');
    expect(wr.functions![0].aiSummary).toBeUndefined();
  });

  it('falls back when the response is a JSON array rather than an object', async () => {
    // Documented fallback (aiSummariser.ts:453) — a non-object parse is treated
    // exactly like prose. Pinning it because it is the deliberate design, not a
    // BUG: tryParseJsonObject rejects arrays so `parsed.fileSummary` can
    // never be read off one. See the defect note in the report about what this
    // then renders.
    const wr = aWebResource({ functions: [aFn({ name: 'onLoad' })] });
    const provider = aFakeProvider(() => '["onLoad does a thing"]');

    await enrichWithAiSummaries(
      anAiConfig({ webResources: true }), dir, someModels({ webResources: [wr] }),
      summary, false, provider.factory,
    );

    expect(wr.aiSummary).toBe('["onLoad does a thing"]');
    expect(wr.functions![0].aiSummary).toBeUndefined();
  });

  it('ignores function names the parser never found', async () => {
    // A hallucinated function must not invent a row in the Functions table.
    const wr = aWebResource({ functions: [aFn({ name: 'onLoad' })] });
    const provider = aFakeProvider(() => JSON.stringify({
      fileSummary: 'Widget form logic.',
      functionSummaries: { onLoad: 'Runs on load.', imaginaryHelper: 'Does not exist.' },
    }));

    await enrichWithAiSummaries(
      anAiConfig({ webResources: true }), dir, someModels({ webResources: [wr] }),
      summary, false, provider.factory,
    );

    expect(wr.functions).toHaveLength(1);
    expect(wr.functions![0].aiSummary).toBe('Runs on load.');
  });

  it('skips blank function summaries and trims the rest', async () => {
    const wr = aWebResource({
      functions: [aFn({ name: 'onLoad' }), aFn({ name: 'onSave' }), aFn({ name: 'onChange' })],
    });
    const provider = aFakeProvider(() => JSON.stringify({
      fileSummary: 'Widget form logic.',
      functionSummaries: { onLoad: '   ', onSave: '  Validates the serial.  ', onChange: 42 },
    }));

    await enrichWithAiSummaries(
      anAiConfig({ webResources: true }), dir, someModels({ webResources: [wr] }),
      summary, false, provider.factory,
    );

    // Whitespace-only would render an empty cell that looks like a bug;
    // a non-string is ignored outright.
    expect(wr.functions!.map(f => f.aiSummary)).toEqual([undefined, 'Validates the serial.', undefined]);
  });

  // BUG (pinned, not a spec): a well-formed JSON response whose fileSummary is
  // missing (or is a non-string) leaves m.aiSummary unset — aiSummariser.ts:441
  // only assigns when `typeof parsed.fileSummary === 'string'`, and the prose
  // fallback at :454 is unreachable because the response DID parse as an object.
  //
  // The call was still made and paid for, the cache entry is still written, and
  // the run summary still counts it as "1 generated" — so the page ships with no
  // file-level summary and nothing in the log says so. Worse, the entry now
  // caches a response that can never produce a file summary, so the gap is
  // permanent until the component changes.
  //
  // Desired: fall back to the raw text (as the prose path does) or record an
  // aiSummaryFailure. Both are the source owner's call. Un-pin by asserting a
  // non-empty aiSummary, or a failure entry, below.
  it('pins: JSON without a fileSummary bills for a summary and renders none', async () => {
    const wr = aWebResource({ functions: [aFn({ name: 'onLoad' })] });
    const provider = aFakeProvider(() => JSON.stringify({ functionSummaries: { onLoad: 'Runs on load.' } }));

    await enrichWithAiSummaries(
      anAiConfig({ webResources: true }), dir, someModels({ webResources: [wr] }),
      summary, false, provider.factory,
    );

    expect(wr.aiSummary).toBeUndefined();
    expect(wr.functions![0].aiSummary).toBe('Runs on load.');
    // The cost was incurred and reported as a success regardless.
    expect(provider.prompts).toHaveLength(1);
    expect(summary.aiSummariesGenerated).toBe(1);
    expect(summary.aiSummaryFailures).toEqual([]);
    expect(readCache()[JS_KEY]).toBeDefined();
  });

  it('re-fans the cached JSON out to functions on a cache hit', async () => {
    // The cache stores the raw JSON string, so a hit has to re-parse it — if it
    // did not, every cached run would silently lose all per-function summaries.
    const json = JSON.stringify({
      fileSummary: 'Widget form logic.',
      functionSummaries: { onLoad: 'Runs on load.' },
    });
    const first = aFakeProvider(() => json);
    await enrichWithAiSummaries(
      anAiConfig({ webResources: true }), dir,
      someModels({ webResources: [aWebResource({ functions: [aFn({ name: 'onLoad' })] })] }),
      createSummary(), false, first.factory,
    );

    const wr = aWebResource({ functions: [aFn({ name: 'onLoad' })] });
    const second = aFakeProvider(() => 'never');
    await enrichWithAiSummaries(
      anAiConfig({ webResources: true }), dir, someModels({ webResources: [wr] }),
      summary, false, second.factory,
    );

    expect(second.prompts).toHaveLength(0);
    expect(wr.aiSummary).toBe('Widget form logic.');
    expect(wr.functions![0].aiSummary).toBe('Runs on load.');
    expect(summary.aiSummariesCached).toBe(1);
  });

  it('invalidates the cache when a function is added to the file', async () => {
    const json = JSON.stringify({ fileSummary: 'Old.', functionSummaries: { onLoad: 'Runs on load.' } });
    const first = aFakeProvider(() => json);
    await enrichWithAiSummaries(
      anAiConfig({ webResources: true }), dir,
      someModels({ webResources: [aWebResource({ functions: [aFn({ name: 'onLoad' })] })] }),
      createSummary(), false, first.factory,
    );

    const wr = aWebResource({ functions: [aFn({ name: 'onLoad' }), aFn({ name: 'onSave' })] });
    const second = aFakeProvider(() => JSON.stringify({ fileSummary: 'New.', functionSummaries: {} }));
    await enrichWithAiSummaries(
      anAiConfig({ webResources: true }), dir, someModels({ webResources: [wr] }),
      summary, false, second.factory,
    );

    expect(second.prompts).toHaveLength(1);
    expect(wr.aiSummary).toBe('New.');
  });
});

// -----------------------------------------------
// Cache pruning
// -----------------------------------------------

describe('enrichWithAiSummaries — cache pruning', () => {
  it('drops an orphaned entry for a kind that ran this time', async () => {
    // The flow was renamed or deleted; its entry can never be hit again, so it
    // would otherwise sit in the committed cache file forever.
    writeCache({
      [FLOW_KEY]: anEntry(),
      'flows:A Flow That No Longer Exists': anEntry({ summary: 'Orphan.' }),
    });
    const provider = aFakeProvider(() => 'Summary.');

    await enrichWithAiSummaries(anAiConfig(), dir, someModels({ flows: [aFlow()] }), summary, false, provider.factory);

    expect(Object.keys(readCache())).toEqual([FLOW_KEY]);
  });

  it('preserves entries for a kind that is switched off', async () => {
    // Deliberate (aiSummariser.ts:460) — toggling plugins off for one run must
    // not force every plugin summary to be re-bought when it is toggled back on.
    writeCache({ 'plugins:Acme.Widgets.Plugins': anEntry({ summary: 'Plugin summary.' }) });
    const provider = aFakeProvider(() => 'Summary.');

    await enrichWithAiSummaries(
      anAiConfig({ flows: true, plugins: false }), dir,
      someModels({ flows: [aFlow()], pluginAssemblies: [aPluginAssembly()] }),
      summary, false, provider.factory,
    );

    expect(readCache()['plugins:Acme.Widgets.Plugins'].summary).toBe('Plugin summary.');
  });

  it('prunes an enabled kind even when it has no models at all this run', async () => {
    // Every flow was removed from the solution — all its entries are orphans.
    writeCache({ 'flows:Gone': anEntry(), 'plugins:Kept': anEntry() });
    const provider = aFakeProvider();

    await enrichWithAiSummaries(anAiConfig({ flows: true }), dir, someModels(), summary, false, provider.factory);

    expect(Object.keys(readCache())).toEqual(['plugins:Kept']);
  });

  it('leaves entries with an unrecognised key prefix alone', async () => {
    writeCache({ 'somethingElse:Whatever': anEntry({ summary: 'Not ours.' }) });
    const provider = aFakeProvider(() => 'Summary.');

    await enrichWithAiSummaries(anAiConfig(), dir, someModels({ flows: [aFlow()] }), summary, false, provider.factory);

    expect(readCache()['somethingElse:Whatever'].summary).toBe('Not ours.');
  });
});

// -----------------------------------------------
// Cache file handling
// -----------------------------------------------

describe('enrichWithAiSummaries — cache file', () => {
  it('warns and starts empty on an unparseable cache file rather than failing the run', async () => {
    fs.writeFileSync(cachePath, '{ this is not json', 'utf-8');
    const flow = aFlow();
    const provider = aFakeProvider(() => 'Summary.');

    await expect(
      enrichWithAiSummaries(anAiConfig(), dir, someModels({ flows: [flow] }), summary, false, provider.factory),
    ).resolves.toBeUndefined();

    const warnings = (console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(c => String(c[0]));
    expect(warnings.some(w => w.includes('could not be parsed'))).toBe(true);
    expect(provider.prompts).toHaveLength(1);
    // And the corrupt file is replaced with a valid one, so it self-heals.
    expect(readCache()[FLOW_KEY].summary).toBe('Summary.');
  });

  // BUG (pinned, not a spec): a cache file containing a JSON *array* permanently
  // and silently disables caching.
  //
  // loadCache (aiSummariser.ts:61) guards with `typeof parsed === 'object' &&
  // parsed !== null`, which an array passes — so `[]` is returned as the cache.
  // Lookups miss (fine), but the writes at :292 land as non-index properties on
  // an array, and JSON.stringify drops those. saveCache therefore rewrites `[]`
  // every run. The document still renders correctly, so nothing looks wrong —
  // the client just re-buys every summary on every run, forever.
  //
  // tryParseJsonObject (:239) gets this right with an explicit !Array.isArray
  // check; loadCache is missing the same guard. The fix is one clause, but the
  // choice is the source's to make, so current behaviour is pinned here.
  // Un-pin by asserting the entry is readable back once loadCache rejects arrays.
  it('pins: a JSON-array cache file silently discards every write', async () => {
    fs.writeFileSync(cachePath, '[]', 'utf-8');
    const flow = aFlow();
    const provider = aFakeProvider(() => 'Summary.');

    await enrichWithAiSummaries(anAiConfig(), dir, someModels({ flows: [flow] }), summary, false, provider.factory);

    // This run behaves correctly...
    expect(provider.prompts).toHaveLength(1);
    expect(flow.aiSummary).toBe('Summary.');
    expect(summary.aiSummariesGenerated).toBe(1);

    // ...but nothing was persisted, so the next run pays again. Desired
    // behaviour: the file is a valid object cache holding FLOW_KEY.
    expect(fs.readFileSync(cachePath, 'utf-8').trim()).toBe('[]');
    expect(readCache()[FLOW_KEY]).toBeUndefined();

    // Proof of the recurring cost: an identical second run is a full miss.
    const second = aFakeProvider(() => 'Summary.');
    const summary2 = createSummary();
    await enrichWithAiSummaries(anAiConfig(), dir, someModels({ flows: [aFlow()] }), summary2, false, second.factory);
    expect(second.prompts).toHaveLength(1);
    expect(summary2.aiSummariesCached).toBe(0);
  });

  it('honours a custom cacheFile path and creates its directory', async () => {
    const config = anAiConfig();
    config.aiEnrichment!.cacheFile = 'nested/deeper/ai-cache.json';
    const provider = aFakeProvider(() => 'Summary.');

    await enrichWithAiSummaries(config, dir, someModels({ flows: [aFlow()] }), summary, false, provider.factory);

    expect(fs.existsSync(cachePath)).toBe(false);
    expect(readCache(path.join(dir, 'nested/deeper/ai-cache.json'))[FLOW_KEY].summary).toBe('Summary.');
  });

  it('writes the cache as readable JSON — it is meant to be committed and diffed', async () => {
    const provider = aFakeProvider(() => 'Summary.');
    await enrichWithAiSummaries(anAiConfig(), dir, someModels({ flows: [aFlow()] }), summary, false, provider.factory);

    const raw = fs.readFileSync(cachePath, 'utf-8');
    expect(raw).toContain('\n  "flows:Create Part On Widget Create": {');
    expect(raw.endsWith('\n')).toBe(true);
  });
});
