/**
 * Shape of doc-gen.config.yml
 * All fields are optional — loader merges with defaults.
 */

export interface SolutionEntry {
  /** Path to the unpacked solution folder (relative to config file) */
  path: string;
  /** Publisher prefix used to detect custom components e.g. 'myprefix' */
  publisherPrefix: string;
  /** Optional display name — used in wiki headings. Defaults to folder name. */
  displayName?: string;
}

export interface EnvironmentVariablesConfig {
  /** Include environment variables in the output. Default: false */
  enabled: boolean;
  /** Include the Default Value column. Default: true */
  showDefaultValue: boolean;
  /** Include the Current Value column. Default: true */
  showCurrentValue: boolean;
}

// -----------------------------------------------
// AI Enrichment
// -----------------------------------------------

export type AiProviderType = 'anthropic' | 'azure-openai';

export interface AnthropicProviderConfig {
  /** Name of the env var holding the Anthropic API key (e.g. 'ANTHROPIC_API_KEY') */
  apiKeyEnv: string;
  /** Model identifier e.g. 'claude-sonnet-4-5'. Defaults to 'claude-haiku-4-5' (fast/cheap, ideal for batch summarisation) if omitted. */
  model?: string;
}

export const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5';

export interface AzureOpenAIProviderConfig {
  /** Name of the env var holding the Azure OpenAI endpoint URL */
  endpointEnv: string;
  /** Name of the env var holding the API key. Omit when using managed identity. */
  apiKeyEnv?: string;
  /** Use Azure managed identity instead of an API key. Default: false */
  useManagedIdentity?: boolean;
  /** Deployment name configured in the Azure OpenAI resource */
  deployment: string;
  /** Azure OpenAI REST API version e.g. '2024-10-21' */
  apiVersion: string;
}

export interface AiEnrichmentComponentsConfig {
  /** Summarise Power Automate Flows. Default: false */
  flows: boolean;
  /** Summarise Classic Workflows. Default: false */
  classicWorkflows: boolean;
  /** Summarise Business Rules. Default: false */
  businessRules: boolean;
  /** Summarise Plugin Assemblies / steps. Default: false */
  plugins: boolean;
  /** Summarise JavaScript Web Resources. Default: false */
  webResources: boolean;
}

export interface AiEnrichmentConfig {
  /** Master switch for AI enrichment. Default: false */
  enabled: boolean;
  /** Which provider to use when enabled */
  provider: AiProviderType;
  /** Required when provider: 'anthropic' */
  anthropic?: AnthropicProviderConfig;
  /** Required when provider: 'azure-openai' */
  azureOpenAI?: AzureOpenAIProviderConfig;
  /** Per-component opt-in toggles — all default to false (deliberately not mirroring `components`) */
  components: AiEnrichmentComponentsConfig;
  /** Path to the cache file, relative to the config file. Default: '.powerautodocs-ai-cache.json' */
  cacheFile?: string;
}

export interface DocGenConfig {
  solutions: SolutionEntry[];

  output: {
    /** Directory to write generated markdown files */
    path: string;
    /** Publish to ADO Wiki. Default: true (if wiki config is present) */
    wiki?: boolean;
    /** Generate a Word (.docx) document. Default: false */
    word?: boolean;
    /** Filename for the Word document (default: 'solution-documentation.docx') */
    wordFilename?: string;
    /** Generate a PDF document. Default: false */
    pdf?: boolean;
    /** Filename for the PDF document (default: 'solution-documentation.pdf') */
    pdfFilename?: string;
    /**
     * Render Mermaid diagrams (ERD, flow diagrams) as embedded images in the
     * Word document. Requires a local Chrome/Edge install on the machine or
     * pipeline agent — see POWERAUTODOCS_CHROME_PATH. Default: true.
     * Falls back to omitting diagrams (with a console warning) if no browser
     * is found — never fails the run.
     */
    wordDiagrams?: boolean;
  };

  parse: {
    /** Only include custom columns in output. Default: false */
    customColumnsOnly: boolean;
    /** Strip base currency (_base) money fields. Default: true */
    excludeBaseCurrencyFields: boolean;
    /** Strip standard OOB relationships. Default: true */
    excludeStandardRelationships: boolean;
    /** Additional columns to exclude by logical name */
    excludedColumns: string[];
  };

  render: {
    /** Form layout style. 'compact' = summary table, 'detailed' = full tab/section breakdown */
    formLayout: 'compact' | 'detailed';
  };

  components: {
    /** Toggle each documentation component on/off */
    tables: boolean;
    forms: boolean;
    views: boolean;
    relationships: boolean;
    flows: boolean;
    classicWorkflows: boolean;
    plugins: boolean;
    webResources: boolean;
    securityRoles: boolean;
    environmentVariables: EnvironmentVariablesConfig;
    globalChoices: boolean;
    emailTemplates: boolean;
    modelDrivenApps: boolean;
    connectionReferences: boolean;
  };

  wiki?: WikiConfig;
  erd?: ErdConfig;
  aiEnrichment?: AiEnrichmentConfig;
}
export interface ErdConfig {
  /** Entity logical names to exclude entirely from the diagram */
  excludeEntities?: string[];
  /** Relationship schema names to exclude (specific edges) */
  excludeRelationships?: string[];
}

export interface WikiConfig {
  /** ADO organisation name e.g. CustomerName */
  organisation: string;
  /** ADO project name e.g. ProjectDelta */
  project: string;
  /** Wiki identifier e.g. ProjectDeltaWiki.wiki */
  wikiIdentifier: string;
  /** Parent page path e.g. /WikiNode */
  parentPath: string;
  /** Personal Access Token — move to env var before pipeline */
  pat: string;
}