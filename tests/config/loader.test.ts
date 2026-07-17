import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadConfig, CONFIG_DEFAULTS } from '../../src/config/loader.js';

// The config file cannot be a committed fixture: .gitignore line 38 ignores
// *doc-gen.config.yml precisely so no client's real config is ever committed.
// So each test writes the YAML it needs into a temp dir instead.
let dir: string;

const writeConfig = (yaml: string): string => {
  fs.writeFileSync(path.join(dir, 'doc-gen.config.yml'), yaml, 'utf-8');
  return dir;
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'powerautodocs-loader-'));
  // loadConfig is chatty on success and on every prefix-less solution.
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('loadConfig — no file present', () => {
  it('falls back to defaults with a warning rather than failing the run', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadConfig(dir)).toEqual(CONFIG_DEFAULTS);
    expect(warn.mock.calls[0][0]).toContain('using defaults');
  });

  it('does not hand back the shared CONFIG_DEFAULTS object', () => {
    // src/index.ts:108-110 assigns straight into config.output.{word,wiki,pdf}
    // when --word/--wiki/--pdf are passed. If loadConfig returned the module-level
    // constant itself, a flagged run with no config file would permanently rewrite
    // the exported defaults for the rest of the process — and would leak across
    // tests in this suite.
    const loaded = loadConfig(dir);
    expect(loaded).not.toBe(CONFIG_DEFAULTS);
    expect(loaded.output).not.toBe(CONFIG_DEFAULTS.output);
    expect(loaded.parse.excludedColumns).not.toBe(CONFIG_DEFAULTS.parse.excludedColumns);
  });

  it('survives a caller mutating the result, as the CLI does', () => {
    const first = loadConfig(dir);
    first.output.word = false;
    first.parse.excludedColumns.push('injected');

    expect(loadConfig(dir).output.word).toBe(true);
    expect(loadConfig(dir).parse.excludedColumns).not.toContain('injected');
    expect(CONFIG_DEFAULTS.output.word).toBe(true);
    expect(CONFIG_DEFAULTS.parse.excludedColumns).not.toContain('injected');
  });
});

describe('loadConfig — merging', () => {
  it('keeps defaults for every key the file omits', () => {
    const config = loadConfig(writeConfig('output:\n  path: ./docs\n'));
    expect(config.output.path).toBe('./docs');
    // Untouched siblings and whole absent blocks still come through.
    expect(config.output.word).toBe(true);
    expect(config.output.wordFilename).toBe('solution-documentation.docx');
    expect(config.components.tables).toBe(true);
    expect(config.render.formLayout).toBe('compact');
  });

  it('merges nested blocks rather than replacing them wholesale', () => {
    // Setting one component must not wipe the other thirteen.
    const config = loadConfig(writeConfig('components:\n  flows: false\n'));
    expect(config.components.flows).toBe(false);
    expect(config.components.tables).toBe(true);
    expect(config.components.plugins).toBe(true);
  });

  it('merges two levels down', () => {
    const config = loadConfig(writeConfig(
      'components:\n  environmentVariables:\n    showCurrentValue: false\n',
    ));
    expect(config.components.environmentVariables.showCurrentValue).toBe(false);
    expect(config.components.environmentVariables.enabled).toBe(true);
    expect(config.components.environmentVariables.showDefaultValue).toBe(true);
  });

  it('replaces arrays instead of concatenating them', () => {
    // Otherwise a user could never shrink excludedColumns below the defaults.
    const config = loadConfig(writeConfig('parse:\n  excludedColumns:\n    - onlythis\n'));
    expect(config.parse.excludedColumns).toEqual(['onlythis']);
  });

  it('replaces the solutions array wholesale', () => {
    const config = loadConfig(writeConfig(
      'solutions:\n  - path: ./a\n    publisherPrefix: contoso\n  - path: ./b\n    publisherPrefix: contoso\n',
    ));
    expect(config.solutions).toHaveLength(2);
    expect(config.solutions[0].path).toBe('./a');
  });

  it('honours an explicit false rather than treating it as absent', () => {
    // A falsy override must still win over a true default.
    const config = loadConfig(writeConfig('output:\n  word: false\n  wiki: false\n'));
    expect(config.output.word).toBe(false);
    expect(config.output.wiki).toBe(false);
  });

  it('warns about a solution with no publisherPrefix but still loads', () => {
    // Custom-component detection silently misbehaves without a prefix, so this
    // is worth saying out loud — but it is not worth failing an entire run over.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config = loadConfig(writeConfig('solutions:\n  - path: ./unpacked\n'));
    expect(config.solutions[0].path).toBe('./unpacked');
    expect(warn.mock.calls.some(c => String(c[0]).includes('publisherPrefix'))).toBe(true);
  });
});

describe('loadConfig — malformed input', () => {
  it('throws with the underlying reason on invalid YAML', () => {
    expect(() => loadConfig(writeConfig('output:\n  path: [unclosed\n')))
      .toThrow(/Failed to parse doc-gen.config.yml/);
  });

  it('rejects a file that is not an object at the top level', () => {
    expect(() => loadConfig(writeConfig('just a string\n')))
      .toThrow(/must be a YAML object at the top level/);
  });

  it('treats an empty file as invalid rather than silently using defaults', () => {
    // yaml.load('') is null. Defaulting here would hide a truncated or
    // half-written config, which is worth surfacing.
    expect(() => loadConfig(writeConfig(''))).toThrow(/must be a YAML object/);
  });
});

describe('loadConfig — aiEnrichment validation', () => {
  // Fail-fast by design: a bad AI block means the user opted in and got the shape
  // wrong. Surfacing that before a long parse beats silently skipping enrichment
  // and leaving them to wonder why every summary is missing.

  it('ignores the block entirely when enrichment is off', () => {
    expect(() => loadConfig(writeConfig(
      'aiEnrichment:\n  enabled: false\n  provider: nonsense\n',
    ))).not.toThrow();
  });

  it('rejects an unknown provider', () => {
    expect(() => loadConfig(writeConfig(
      'aiEnrichment:\n  enabled: true\n  provider: openai\n  components:\n    flows: true\n',
    ))).toThrow(/provider must be 'anthropic' or 'azure-openai'/);
  });

  it('requires the anthropic block when the provider is anthropic', () => {
    expect(() => loadConfig(writeConfig(
      'aiEnrichment:\n  enabled: true\n  provider: anthropic\n  components:\n    flows: true\n',
    ))).toThrow(/aiEnrichment.anthropic is missing/);
  });

  it('requires apiKeyEnv for anthropic but not model', () => {
    // model is optional — AnthropicProvider has its own default.
    expect(() => loadConfig(writeConfig(
      'aiEnrichment:\n  enabled: true\n  provider: anthropic\n  anthropic:\n    model: claude-x\n  components:\n    flows: true\n',
    ))).toThrow(/anthropic.apiKeyEnv is required/);

    expect(() => loadConfig(writeConfig(
      'aiEnrichment:\n  enabled: true\n  provider: anthropic\n  anthropic:\n    apiKeyEnv: KEY\n  components:\n    flows: true\n',
    ))).not.toThrow();
  });

  it('requires endpoint, deployment and apiVersion for azure-openai', () => {
    let err = '';
    try {
      loadConfig(writeConfig(
        'aiEnrichment:\n  enabled: true\n  provider: azure-openai\n  azureOpenAI:\n    apiKeyEnv: KEY\n  components:\n    flows: true\n',
      ));
    } catch (e) { err = (e as Error).message; }
    expect(err).toContain('endpointEnv is required');
    expect(err).toContain('deployment is required');
    expect(err).toContain('apiVersion is required');
  });

  it('accepts azure-openai with managed identity and no api key', () => {
    expect(() => loadConfig(writeConfig(
      'aiEnrichment:\n  enabled: true\n  provider: azure-openai\n  azureOpenAI:\n' +
      '    endpointEnv: EP\n    deployment: gpt\n    apiVersion: "2024-02-01"\n    useManagedIdentity: true\n' +
      '  components:\n    flows: true\n',
    ))).not.toThrow();
  });

  it('demands either an api key or managed identity for azure-openai', () => {
    expect(() => loadConfig(writeConfig(
      'aiEnrichment:\n  enabled: true\n  provider: azure-openai\n  azureOpenAI:\n' +
      '    endpointEnv: EP\n    deployment: gpt\n    apiVersion: "2024-02-01"\n' +
      '  components:\n    flows: true\n',
    ))).toThrow(/either apiKeyEnv or useManagedIdentity/);
  });

  it('rejects enrichment enabled with no component opted in', () => {
    // Otherwise the user pays for a provider round-trip setup and gets nothing.
    expect(() => loadConfig(writeConfig(
      'aiEnrichment:\n  enabled: true\n  provider: anthropic\n  anthropic:\n    apiKeyEnv: KEY\n' +
      '  components:\n    flows: false\n    plugins: false\n',
    ))).toThrow(/no components are opted in/);
  });

  it('reports every problem at once rather than one per run', () => {
    // A pipeline round-trip per mistake would be a miserable way to fix a config.
    let err = '';
    try {
      loadConfig(writeConfig(
        'aiEnrichment:\n  enabled: true\n  provider: azure-openai\n  azureOpenAI:\n    deployment: gpt\n' +
        '  components:\n    flows: false\n',
      ));
    } catch (e) { err = (e as Error).message; }
    expect(err).toContain('endpointEnv is required');
    expect(err).toContain('apiVersion is required');
    expect(err).toContain('no components are opted in');
    expect(err).toContain('set aiEnrichment.enabled: false');
  });
});
