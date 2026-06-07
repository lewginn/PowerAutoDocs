import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { DocGenConfig } from './schema.js';

const DEFAULT_EXCLUDED_COLUMNS = [
  'timezoneruleversionnumber',
  'utcconversiontimezonecode',
  'importsequencenumber',
  'overriddencreatedon',
  'exchangerate',
  'transactioncurrencyid',
  'owningteam',
  'owninguser',
  'owningbusinessunit',
  'createdonbehalfby',
  'modifiedonbehalfby',
  'versionnumber',
];

export const CONFIG_DEFAULTS: DocGenConfig = {
  solutions: [
    {
      path: './unpacked',
      publisherPrefix: ''
    },
  ],
  output: {
    path: './output',
    wiki: true,
    word: true,
    wordFilename: 'solution-documentation.docx',
  },
  parse: {
    customColumnsOnly: false,
    excludeBaseCurrencyFields: true,
    excludeStandardRelationships: true,
    excludedColumns: DEFAULT_EXCLUDED_COLUMNS,
  },
  render: {
    formLayout: 'compact',
  },
  components: {
    tables: true,
    forms: true,
    views: true,
    relationships: true,
    flows: true,
    classicWorkflows: true,
    plugins: true,
    webResources: true,
    securityRoles: true,
    environmentVariables: {
      enabled: true,
      showDefaultValue: true,
      showCurrentValue: true,
    },
    globalChoices: true,
    emailTemplates: true,
    modelDrivenApps: true,
    connectionReferences: true
  },
  aiEnrichment: {
    enabled: false,
    provider: 'anthropic',
    components: {
      flows: false,
      classicWorkflows: false,
      businessRules: false,
      plugins: false,
      webResources: false,
    },
    cacheFile: '.powerautodocs-ai-cache.json',
  },
};

/**
 * Deep merge — right side wins, arrays are replaced not concatenated.
 * Keeps all defaults for any keys not present in the loaded file.
 */
function deepMerge<T>(defaults: T, overrides: Partial<T>): T {
  const result = { ...defaults };
  for (const key of Object.keys(overrides) as (keyof T)[]) {
    const override = overrides[key];
    const def = defaults[key];
    if (
      override !== null &&
      override !== undefined &&
      typeof override === 'object' &&
      !Array.isArray(override) &&
      typeof def === 'object' &&
      def !== null &&
      !Array.isArray(def)
    ) {
      result[key] = deepMerge(def, override as any);
    } else if (override !== undefined) {
      result[key] = override as T[keyof T];
    }
  }
  return result;
}

/**
 * Validates the aiEnrichment block at config-load time.
 * This is deliberately fail-fast (throws) rather than skip-and-continue —
 * a misconfigured AI block means the user explicitly opted in but got the
 * shape wrong, so surfacing it immediately (before any parsing/rendering
 * work happens) is far more useful than silently disabling enrichment
 * partway through a run.
 */
function validateAiEnrichmentConfig(config: DocGenConfig): void {
  const ai = config.aiEnrichment;
  if (!ai || !ai.enabled) return;

  const errors: string[] = [];

  if (ai.provider === 'anthropic') {
    if (!ai.anthropic) {
      errors.push(`aiEnrichment.provider is 'anthropic' but aiEnrichment.anthropic is missing`);
    } else {
      if (!ai.anthropic.apiKeyEnv) errors.push(`aiEnrichment.anthropic.apiKeyEnv is required`);
      // model is optional — AnthropicProvider falls back to DEFAULT_ANTHROPIC_MODEL
    }
  } else if (ai.provider === 'azure-openai') {
    if (!ai.azureOpenAI) {
      errors.push(`aiEnrichment.provider is 'azure-openai' but aiEnrichment.azureOpenAI is missing`);
    } else {
      const az = ai.azureOpenAI;
      if (!az.endpointEnv) errors.push(`aiEnrichment.azureOpenAI.endpointEnv is required`);
      if (!az.deployment) errors.push(`aiEnrichment.azureOpenAI.deployment is required`);
      if (!az.apiVersion) errors.push(`aiEnrichment.azureOpenAI.apiVersion is required`);
      if (!az.useManagedIdentity && !az.apiKeyEnv) {
        errors.push(`aiEnrichment.azureOpenAI requires either apiKeyEnv or useManagedIdentity: true`);
      }
    }
  } else {
    errors.push(`aiEnrichment.provider must be 'anthropic' or 'azure-openai' — got '${ai.provider}'`);
  }

  const anyComponentEnabled = Object.values(ai.components ?? {}).some(Boolean);
  if (!anyComponentEnabled) {
    errors.push(`aiEnrichment.enabled is true but no components are opted in under aiEnrichment.components`);
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid aiEnrichment configuration:\n` +
      errors.map(e => `  - ${e}`).join('\n') +
      `\n  → Fix doc-gen.config.yml, or set aiEnrichment.enabled: false to disable AI summaries.`
    );
  }
}

/**
 * Loads doc-gen.config.yml from the given directory (defaults to cwd).
 * Merges with CONFIG_DEFAULTS — any missing keys fall back to defaults.
 * Throws if the file exists but is invalid YAML.
 */
export function loadConfig(configDir: string = process.cwd()): DocGenConfig {
  const configPath = path.join(configDir, 'doc-gen.config.yml');

  if (!fs.existsSync(configPath)) {
    console.warn(`No doc-gen.config.yml found at ${configPath} — using defaults.`);
    return CONFIG_DEFAULTS;
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  let parsed: unknown;

  try {
    parsed = yaml.load(raw);
  } catch (err) {
    throw new Error(`Failed to parse doc-gen.config.yml: ${(err as Error).message}`);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('doc-gen.config.yml must be a YAML object at the top level.');
  }

  const merged = deepMerge(CONFIG_DEFAULTS, parsed as Partial<DocGenConfig>);

  // Validate each solution entry has a publisherPrefix
  for (const sol of merged.solutions) {
    if (!sol.publisherPrefix) {
      console.warn(
        `Warning: solution "${sol.path}" has no publisherPrefix. ` +
        'Custom component detection will not work correctly.'
      );
    }
  }

  // Fail-fast on a misconfigured AI enrichment block — see validateAiEnrichmentConfig.
  validateAiEnrichmentConfig(merged);

  console.log(`Loaded config from: ${configPath}`);
  return merged;
}