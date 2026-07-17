import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseEnvironmentVariables } from '../../src/parsers/environmentVariableParser.js';

const SOLUTION = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'fixtures', 'solutions', 'ContosoDemo',
);

describe('parseEnvironmentVariables', () => {
  it('reads every definition folder and sorts by display name', () => {
    // Folder order is apiEndpoint, enableAudit, legacyToggle — deliberately not the
    // display-name order, so this fails if the sort is dropped.
    expect(parseEnvironmentVariables(SOLUTION).map(v => v.displayName))
      .toEqual(['Audit Enabled', 'contoso_legacyToggle', 'Service Endpoint URL']);
  });

  it('maps a definition onto the IR', () => {
    const apiEndpoint = parseEnvironmentVariables(SOLUTION)
      .find(v => v.schemaName === 'contoso_apiEndpoint');

    expect(apiEndpoint).toEqual({
      schemaName:   'contoso_apiEndpoint',
      displayName:  'Service Endpoint URL',
      description:  'Base URL the integration calls.',
      type:         'String',
      defaultValue: 'https://api.contoso.example/v1',
      currentValue: 'https://api-uat.contoso.example/v1',
      isRequired:   false,
      secretStore:  0,
    });
  });

  it('reads currentValue from the sibling values JSON, distinct from the default', () => {
    const [, , apiEndpoint] = parseEnvironmentVariables(SOLUTION);
    expect(apiEndpoint.currentValue).toBe('https://api-uat.contoso.example/v1');
    expect(apiEndpoint.defaultValue).toBe('https://api.contoso.example/v1');
  });

  it('leaves currentValue undefined when no values JSON exists', () => {
    const audit = parseEnvironmentVariables(SOLUTION)
      .find(v => v.schemaName === 'contoso_enableAudit')!;
    expect(audit.currentValue).toBeUndefined();
    expect(audit.defaultValue).toBe('no');
  });

  it('maps type codes to labels and isrequired to a boolean', () => {
    const audit = parseEnvironmentVariables(SOLUTION)
      .find(v => v.schemaName === 'contoso_enableAudit')!;
    expect(audit.type).toBe('Boolean');
    expect(audit.isRequired).toBe(true);
  });

  it('degrades rather than throws on a malformed definition', () => {
    const legacy = parseEnvironmentVariables(SOLUTION)
      .find(v => v.schemaName === 'contoso_legacyToggle')!;
    expect(legacy.type).toBe('Unknown');          // type code outside TYPE_MAP
    expect(legacy.displayName).toBe('contoso_legacyToggle'); // no <displayname>
    expect(legacy.description).toBe('');
    expect(legacy.secretStore).toBe(1);
  });

  it('returns empty for a solution with no EnvironmentVariableDefinitions folder', () => {
    // Every sweeping parser must tolerate an absent component folder — most real
    // solutions contain only a few component types.
    expect(parseEnvironmentVariables(path.join(SOLUTION, 'Other'))).toEqual([]);
  });
});
