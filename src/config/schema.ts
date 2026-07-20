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
  /**
   * Advanced override: explicit path to the AI cache file, relative to the
   * config file. Most users don't need this — by default the AI cache lives
   * inside `cache.dir` alongside the diagram cache. Only set this if the AI
   * cache specifically needs to live somewhere else.
   */
  cacheFile?: string;
}

// -----------------------------------------------
// Cache
// -----------------------------------------------

export interface CacheConfig {
  /**
   * Folder (relative to the config file) where both caches live: the AI
   * summary cache and the rendered-diagram cache. One folder to commit back
   * to the repo so re-runs skip unchanged work instead of paying full AI/
   * render cost every time. Default: '.powerautodocs-cache'
   */
  dir?: string;
}

// -----------------------------------------------
// Word theming
// -----------------------------------------------

/**
 * Visual theme for the Word (.docx) output — `output.wordTheme`.
 *
 * Every field is optional. In the common case a brand is expressed with one
 * line (`accentColor`), and headings, table headers, banding and rules are all
 * derived from it. The remaining fields exist for the minority who need exact
 * control over a specific element, and each one overrides only itself.
 *
 * Colours accept '#0F62FE' or '0f62fe'. An unparseable colour warns and falls
 * back to the default rather than failing the run — see resolveWordTheme.
 *
 * Fonts are passed to Word by name. Word silently substitutes fonts that
 * aren't installed on the machine opening the document, so prefer fonts that
 * ship with Office; the defaults deliberately do.
 */
export interface WordThemeConfig {
  /** Brand colour. Headings, table headers, rules and banding derive from it. Default: '#2A6099' */
  accentColor?: string;
  /** Body text font. Default: 'Calibri' */
  bodyFont?: string;
  /** Heading font. Defaults to `bodyFont` if that is set, otherwise 'Calibri Light' */
  headingFont?: string;
  /** Body text size in points. Default: 10.5 */
  bodyFontSize?: number;
  /** Body text colour. Default: '#1A1A1A' */
  bodyColor?: string;
  /** Heading colour. Default: `accentColor` (levels 3-4 are darkened from it) */
  headingColor?: string;
  /** Draw a horizontal rule under level-1 headings. Default: true */
  headingRule?: boolean;
  /** Table header row fill. Default: `accentColor` */
  tableHeaderFill?: string;
  /** Table header text colour. Default: white or near-black, whichever contrasts with the header fill */
  tableHeaderColor?: string;
  /** Shade alternate table rows. Default: true */
  tableBanding?: boolean;
  /**
   * Table text size in points. Default: 9 — a step below body text, because
   * these tables are dense and wide (the privilege matrix is 9 columns) and
   * body size forces cells to wrap mid-word. Also drives column measurement,
   * so raising it widens columns rather than overflowing them.
   */
  tableFontSize?: number;
  /** Fill for shaded table rows. Default: a very light tint of `accentColor` */
  tableBandFill?: string;
  /** Table grid line colour. Default: a light tint of `accentColor` */
  tableBorderColor?: string;
  /** Font for inline code and code blocks. Default: 'Courier New' */
  codeFont?: string;
  /** Background fill of inline code chips and code blocks. Default: '#F2F2F2' */
  codeFill?: string;
  /** Code text colour. Default: a darkened `accentColor` */
  codeColor?: string;
}

export interface DocGenConfig {
  solutions: SolutionEntry[];

  output: {
    /** Directory to write generated markdown files */
    path: string;
    /** Publish to ADO Wiki. Default: true (if wiki config is present) */
    wiki?: boolean;
    /** Generate a Word (.docx) document. Default: true (see CONFIG_DEFAULTS in loader.ts) */
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
    /**
     * Visual theme for the Word document — fonts, brand colour, table styling.
     * Omit entirely for the built-in default theme.
     */
    wordTheme?: WordThemeConfig;
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
    /** Document Power Pages (Portal) sites. Default: false (opt-in for the first release — see loader.ts). */
    powerPages: boolean;
  };

  wiki?: WikiConfig;
  erd?: ErdConfig;
  aiEnrichment?: AiEnrichmentConfig;
  cache?: CacheConfig;
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