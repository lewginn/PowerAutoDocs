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

export interface DocGenConfig {
  solutions: SolutionEntry[];

  output: {
    /** Directory to write generated markdown files */
    path: string;
    /** Generate a Word (.docx) document in addition to wiki output. Default: false */
    word?: boolean;
    /** Filename for the Word document (default: 'solution-documentation.docx') */
    wordFilename?: string;
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