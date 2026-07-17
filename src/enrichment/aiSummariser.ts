// src/enrichment/aiSummariser.ts
//
// Orchestrator for AI enrichment. Sits in Layer 04 alongside erdGenerator
// and mermaidGenerator — runs after parsing, before rendering, and mutates
// the IR in place by setting `aiSummary` on supported component models.
//
// Cache-first design: every summarisable component is reduced to a small
// "summarisable view" (a stable plain-object projection of the bits that
// matter for a summary). That view is SHA-256 hashed — together with a
// promptVersion constant — to form a cache key check. If the hash matches
// what's on file, the cached summary is reused verbatim (no API call, no
// non-determinism, no cost). If it differs (or there's no entry), a fresh
// summary is generated and the cache entry is replaced.
//
// The same "summarisable view" is also the data payload baked into the
// prompt — single source of truth between hashing and prompting.

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type {
  DocGenConfig,
  AiEnrichmentConfig,
} from '../config/schema.js';
import type {
  FlowModel, ClassicWorkflowModel, BusinessRuleModel,
  PluginAssemblyModel, WebResourceModel,
} from '../ir/index.js';
import { createProvider, type AiProvider } from './providers/index.js';
import { log } from '../logger.js';
import type { RunSummary } from '../logger.js';

// -----------------------------------------------
// Prompt version — bump this deliberately whenever prompt wording changes
// materially. Folded into the cache hash, so bumping it forces every
// summary to regenerate on the next run (deliberate full invalidation).
// -----------------------------------------------
const PROMPT_VERSION = 2;

// -----------------------------------------------
// Cache shape
// -----------------------------------------------

interface AiCacheEntry {
  /** SHA-256 of the summarisable view + promptVersion */
  hash: string;
  /** The generated summary text */
  summary: string;
  /** ISO timestamp of when this entry was (re)generated */
  generatedAt: string;
}

/** Cache file shape: keyed by `{type}:{uniqueName}` */
type AiCache = Record<string, AiCacheEntry>;

function loadCache(cachePath: string): AiCache {
  if (!fs.existsSync(cachePath)) return {};
  try {
    const raw = fs.readFileSync(cachePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) return parsed as AiCache;
    return {};
  } catch {
    log('warn', `AI cache file at ${cachePath} could not be parsed — starting with an empty cache`);
    return {};
  }
}

function saveCache(cachePath: string, cache: AiCache): void {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2) + '\n', 'utf-8');
}

function hashView(view: unknown): string {
  const json = JSON.stringify(view);
  return crypto.createHash('sha256').update(`v${PROMPT_VERSION}:${json}`).digest('hex');
}

// -----------------------------------------------
// Summarisable views — one per component type.
// These are deliberately small, stable projections: only the fields that
// would meaningfully change the summary. Anything cosmetic (ids, raw XML
// offsets, etc.) is excluded so the cache doesn't churn on noise.
// -----------------------------------------------

function flowView(flow: FlowModel) {
  return {
    name: flow.name,
    isActive: flow.isActive,
    trigger: {
      type: flow.trigger.type,
      entity: flow.trigger.entity,
      description: flow.trigger.description,
    },
    actions: flow.actions.map(a => ({
      name: a.name,
      type: a.type,
      operationId: a.operationId,
      entityName: a.entityName,
      description: a.description,
      depth: a.depth,
    })),
    connectionReferences: flow.connectionReferences,
  };
}

function classicWorkflowView(wf: ClassicWorkflowModel) {
  return {
    name: wf.name,
    entity: wf.entity,
    category: wf.category,
    mode: wf.mode,
    scope: wf.scope,
    status: wf.status,
    triggers: wf.triggers,
    steps: wf.steps,
  };
}

function businessRuleView(rule: BusinessRuleModel) {
  return {
    name: rule.name,
    entity: rule.entity,
    status: rule.status,
    scope: rule.scope,
    conditions: rule.conditions,
  };
}

function pluginView(assembly: PluginAssemblyModel) {
  return {
    assemblyName: assembly.assemblyName,
    isolationMode: assembly.isolationMode,
    pluginTypeNames: assembly.pluginTypeNames,
    steps: assembly.steps.map(s => ({
      name: s.name,
      message: s.message,
      stage: s.stage,
      mode: s.mode,
      primaryEntity: s.primaryEntity,
      filteringAttributes: s.filteringAttributes,
    })),
  };
}

function webResourceView(wr: WebResourceModel) {
  return {
    name: wr.name,
    displayName: wr.displayName,
    resourceType: wr.resourceType,
    namespace: wr.namespace,
    functions: (wr.functions ?? []).map(f => ({
      name: f.name,
      isAsync: f.isAsync,
      params: f.params,
      jsDoc: f.jsDoc,
    })),
  };
}

// -----------------------------------------------
// Prompt building — three layers:
//   1. Shared system framing (constant — what AI is for, audience, tone)
//   2. Per-component "lens" — a one-line steer on what to focus on
//   3. The summarisable view, as JSON — the data payload
// -----------------------------------------------

const SYSTEM_FRAMING =
  `You are writing a concise summary for technical handover documentation of a ` +
  `Microsoft Power Platform / Dynamics 365 solution. The audience is developers ` +
  `and consultants who need to quickly understand what a component does and why ` +
  `it exists, without reading its full configuration. Write 2-4 plain sentences. ` +
  `No headings, no bullet points, no markdown formatting — plain prose only. ` +
  `Be factual and specific to the data given; do not invent details.`;

const COMPONENT_LENSES: Record<ComponentKind, string> = {
  flows:
    'This is a Power Automate flow. Focus on what triggers it, what it does step by step at a high level, and which systems/tables it touches.',
  classicWorkflows:
    'This is a classic Dataverse workflow. Focus on what triggers it, what it does, and any notable conditions or branching.',
  businessRules:
    'This is a Dataverse business rule. Focus on what conditions it checks and what actions it takes as a result (e.g. field visibility, validation, default values).',
  plugins:
    'This is a plugin assembly with one or more registered steps. Focus on what events it responds to (message/stage/entity) and what business logic it likely implements.',
  webResources:
    'This is a JavaScript web resource. Focus on its purpose based on its namespace and functions, and where it is likely used (forms/ribbons).',
};

type ComponentKind = 'flows' | 'classicWorkflows' | 'businessRules' | 'plugins' | 'webResources';

function buildPrompt(kind: ComponentKind, view: unknown): string {
  // Web resources get a structured-output prompt — we want both a file-level
  // summary AND a short per-function summary (replaces the near-always-empty
  // jsDoc column in the rendered Functions table) from a single call, so the
  // cost stays exactly what it already was.
  if (kind === 'webResources') {
    return [
      SYSTEM_FRAMING,
      '',
      COMPONENT_LENSES.webResources,
      '',
      'Respond with ONLY a JSON object — no markdown code fences, no commentary ' +
        'before or after — in exactly this shape:',
      '{',
      '  "fileSummary": "2-4 sentence summary of the file as a whole",',
      '  "functionSummaries": {',
      '    "<functionName>": "one short, plain-English sentence describing what this specific function does"',
      '  }',
      '}',
      'Include one entry in functionSummaries for every function listed in the data below, ' +
        'keyed by its exact name. Keep each function summary to a single sentence.',
      '',
      'Component data (JSON):',
      JSON.stringify(view, null, 2),
    ].join('\n');
  }

  return [
    SYSTEM_FRAMING,
    '',
    COMPONENT_LENSES[kind],
    '',
    'Component data (JSON):',
    JSON.stringify(view, null, 2),
  ].join('\n');
}

/**
 * Parses a (possibly fenced) JSON object out of an AI response.
 * Returns null if the text isn't valid JSON — callers fall back gracefully.
 */
function tryParseJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

// -----------------------------------------------
// Generic per-component runner
// -----------------------------------------------

interface SummariseOptions<T> {
  kind: ComponentKind;
  label: string;
  models: T[];
  uniqueName: (model: T) => string;
  buildView: (model: T) => unknown;
  setSummary: (model: T, summary: string) => void;
}

async function summariseComponents<T>(
  provider: AiProvider,
  cache: AiCache,
  summary: RunSummary,
  opts: SummariseOptions<T>,
  forceRegenerate: boolean,
  seenKeys: Set<string>
): Promise<void> {
  if (opts.models.length === 0) return;

  let generated = 0;
  let cached = 0;

  for (const model of opts.models) {
    const uniqueName = opts.uniqueName(model);
    const cacheKey = `${opts.kind}:${uniqueName}`;
    seenKeys.add(cacheKey);
    const view = opts.buildView(model);
    const hash = hashView(view);

    const existing = cache[cacheKey];
    if (!forceRegenerate && existing && existing.hash === hash) {
      opts.setSummary(model, existing.summary);
      cached++;
      continue;
    }

    try {
      const prompt = buildPrompt(opts.kind, view);
      const text = await provider.summarise(prompt);
      opts.setSummary(model, text);
      cache[cacheKey] = {
        hash,
        summary: text,
        generatedAt: new Date().toISOString(),
      };
      generated++;
    } catch (err: any) {
      const reason = err?.message ?? String(err);
      log('warn', `AI summary failed for ${opts.label} "${uniqueName}" — ${reason}`);
      summary.aiSummaryFailures.push({ component: opts.label, name: uniqueName, reason });
      // Skip-and-continue: if a stale cached summary exists, keep it rather
      // than leaving the page with nothing.
      if (existing) {
        opts.setSummary(model, existing.summary);
      }
    }
  }

  summary.aiSummariesGenerated += generated;
  summary.aiSummariesCached += cached;

  if (generated > 0 || cached > 0) {
    log('success', `AI summaries — ${opts.label}: ${generated} generated, ${cached} from cache`);
  }
}

// -----------------------------------------------
// Orchestrator entry point
// -----------------------------------------------

export interface EnrichmentModels {
  flows: FlowModel[];
  classicWorkflows: ClassicWorkflowModel[];
  businessRules: BusinessRuleModel[];
  pluginAssemblies: PluginAssemblyModel[];
  webResources: WebResourceModel[];
}

/**
 * The provider seam. Production passes nothing and gets the real factory; a
 * test passes a fake returning a canned summary.
 *
 * `AiProvider` was always a clean one-method interface, but this function
 * resolved its own provider via `createProvider`, so nothing could reach it
 * without a mocking framework. Injecting the factory is what makes the
 * cache-hit/miss logic — the part that decides whether a client pays for a
 * summary — testable without mocks (decisions.md).
 */
export type ProviderFactory = (config: AiEnrichmentConfig) => AiProvider;

/**
 * Runs AI enrichment over all opted-in components.
 * No-op if aiEnrichment is disabled in config.
 * Mutates the IR models in place — sets `aiSummary` where a summary
 * was generated or retrieved from cache.
 */
export async function enrichWithAiSummaries(
  config: DocGenConfig,
  configDir: string,
  models: EnrichmentModels,
  summary: RunSummary,
  forceRegenerate: boolean = false,
  makeProvider: ProviderFactory = createProvider
): Promise<void> {
  const ai = config.aiEnrichment;
  if (!ai || !ai.enabled) return;

  const cachePath = path.resolve(configDir, ai.cacheFile ?? '.powerautodocs-ai-cache.json');
  const cache = loadCache(cachePath);

  let provider: AiProvider;
  try {
    provider = makeProvider(ai);
  } catch (err: any) {
    log('error', `AI enrichment disabled for this run — provider setup failed: ${err?.message ?? err}`);
    summary.aiSummaryFailures.push({ component: 'provider', name: ai.provider, reason: err?.message ?? String(err) });
    return;
  }

  log('info', `AI enrichment enabled — provider: ${ai.provider}, cache: ${cachePath}`);

  // Tracks every cache key encountered for an enabled component kind this run.
  // Used to prune orphaned entries below — keeps the committed cache file
  // accurate (no stale entries for renamed/removed components lingering forever).
  const seenKeys = new Set<string>();
  const enabledKinds = new Set<ComponentKind>(
    (Object.keys(ai.components) as ComponentKind[]).filter(k => ai.components[k])
  );

  if (ai.components.flows) {
    await summariseComponents(provider, cache, summary, {
      kind: 'flows',
      label: 'Flows',
      models: models.flows,
      uniqueName: f => f.name,
      buildView: flowView,
      setSummary: (m, s) => { m.aiSummary = s; },
    }, forceRegenerate, seenKeys);
  }

  if (ai.components.classicWorkflows) {
    await summariseComponents(provider, cache, summary, {
      kind: 'classicWorkflows',
      label: 'Classic Workflows',
      models: models.classicWorkflows,
      uniqueName: w => w.name,
      buildView: classicWorkflowView,
      setSummary: (m, s) => { m.aiSummary = s; },
    }, forceRegenerate, seenKeys);
  }

  if (ai.components.businessRules) {
    await summariseComponents(provider, cache, summary, {
      kind: 'businessRules',
      label: 'Business Rules',
      models: models.businessRules,
      uniqueName: r => r.name,
      buildView: businessRuleView,
      setSummary: (m, s) => { m.aiSummary = s; },
    }, forceRegenerate, seenKeys);
  }

  if (ai.components.plugins) {
    await summariseComponents(provider, cache, summary, {
      kind: 'plugins',
      label: 'Plugin Assemblies',
      models: models.pluginAssemblies,
      uniqueName: a => a.assemblyName,
      buildView: pluginView,
      setSummary: (m, s) => { m.aiSummary = s; },
    }, forceRegenerate, seenKeys);
  }

  if (ai.components.webResources) {
    await summariseComponents(provider, cache, summary, {
      kind: 'webResources',
      label: 'Web Resources',
      models: models.webResources.filter(w => w.resourceType === 'JavaScript'),
      uniqueName: w => w.name,
      buildView: webResourceView,
      // The provider returns (and the cache stores) a JSON string shaped like
      // { fileSummary, functionSummaries: { <name>: <summary> } } — parsed here
      // and fanned out to both the file-level aiSummary and each function's
      // aiSummary. Falls back to treating the raw text as the file summary if
      // it isn't valid JSON (e.g. a stale pre-v2 cache entry or a provider that
      // ignored the format instruction) so nothing breaks ungracefully.
      setSummary: (m, s) => {
        const parsed = tryParseJsonObject(s);
        if (parsed) {
          if (typeof parsed.fileSummary === 'string') {
            m.aiSummary = parsed.fileSummary;
          }
          const fnSummaries = parsed.functionSummaries;
          if (fnSummaries && typeof fnSummaries === 'object' && m.functions) {
            for (const fn of m.functions) {
              const fnSummary = (fnSummaries as Record<string, unknown>)[fn.name];
              if (typeof fnSummary === 'string' && fnSummary.trim()) {
                fn.aiSummary = fnSummary.trim();
              }
            }
          }
        } else {
          m.aiSummary = s;
        }
      },
    }, forceRegenerate, seenKeys);
  }

  // Prune orphaned entries — only within component kinds that were enabled
  // this run (so toggling a component off doesn't wipe its cached summaries).
  for (const key of Object.keys(cache)) {
    const kind = key.split(':')[0] as ComponentKind;
    if (enabledKinds.has(kind) && !seenKeys.has(key)) {
      delete cache[key];
    }
  }

  saveCache(cachePath, cache);
}
