import { describe, it, expect } from 'vitest';
import { renderEnvironmentVariablesPage } from '../../src/renderers/environmentVariableRenderer.js';
import type { DocNode, TableNode } from '../../src/docmodel/nodes.js';
import { anEnvironmentVariable } from '../fixtures/ir.js';
import { aConfig } from '../fixtures/config.js';

const firstTable = (nodes: DocNode[]): TableNode => {
  const tbl = nodes.find(n => n.type === 'table') as TableNode | undefined;
  if (!tbl) throw new Error('expected a table node');
  return tbl;
};

// The renderer takes only the two display toggles, not the whole config — build
// them off the real config so a schema change surfaces here rather than drifting.
const toggles = (over: { showDefaultValue?: boolean; showCurrentValue?: boolean } = {}) => {
  const envConfig = aConfig({ components: { environmentVariables: over } }).components.environmentVariables;
  return { showDefaultValue: envConfig.showDefaultValue, showCurrentValue: envConfig.showCurrentValue };
};

describe('renderEnvironmentVariablesPage', () => {
  it('renders a placeholder instead of an empty table when there are none', () => {
    const nodes = renderEnvironmentVariablesPage([]);
    expect(nodes.map(n => n.type)).toEqual(['heading', 'paragraph']);
    expect(nodes).toContainEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: 'No environment variables found in this solution.' }],
    });
  });

  it('leads with the section heading', () => {
    expect(renderEnvironmentVariablesPage([])[0]).toEqual({
      type: 'heading', level: 1, text: 'Environment Variables',
    });
  });

  it('pluralises the count sentence', () => {
    expect(renderEnvironmentVariablesPage([anEnvironmentVariable()])).toContainEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: '1 environment variable defined in this solution.' }],
    });
    expect(renderEnvironmentVariablesPage([anEnvironmentVariable(), anEnvironmentVariable()])).toContainEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: '2 environment variables defined in this solution.' }],
    });
  });

  it('explains DataSource variables only when the solution has one', () => {
    // A DataSource value renders as a bare GUID, which is meaningless without
    // this note — but the note is pure noise on solutions with no lookups.
    const withDs = renderEnvironmentVariablesPage([anEnvironmentVariable({ type: 'DataSource' })]);
    expect(withDs.some(n => n.type === 'blockquote')).toBe(true);

    const without = renderEnvironmentVariablesPage([anEnvironmentVariable({ type: 'String' })]);
    expect(without.some(n => n.type === 'blockquote')).toBe(false);
  });

  it('defaults to showing Default Value and withholding Current Value', () => {
    // Current value is a live environment value and can carry secrets, so the
    // renderer's own default must be the safe one even if a caller passes nothing.
    const tbl = firstTable(renderEnvironmentVariablesPage([anEnvironmentVariable()]));
    expect(tbl.headers).toEqual([
      'Display Name', 'Schema Name', 'Type', 'Required', 'Default Value', 'Secret Store',
    ]);
  });

  it('never emits the current value, even when one is set', () => {
    const nodes = renderEnvironmentVariablesPage([
      anEnvironmentVariable({ currentValue: 'https://live.invalid/prod-api' }),
    ]);
    expect(JSON.stringify(nodes)).not.toContain('prod-api');
  });

  it('drops the Default Value column when the toggle is off', () => {
    const tbl = firstTable(renderEnvironmentVariablesPage([anEnvironmentVariable()], toggles({
      showDefaultValue: false, showCurrentValue: false,
    })));
    expect(tbl.headers).toEqual(['Display Name', 'Schema Name', 'Type', 'Required', 'Secret Store']);
    expect(tbl.rows[0]).toHaveLength(tbl.headers.length);
  });

  it('keeps every row aligned with the headers on the default path', () => {
    const tbl = firstTable(renderEnvironmentVariablesPage([
      anEnvironmentVariable(),
      anEnvironmentVariable({ schemaName: 'acme_Retries', defaultValue: '', secretStore: 1 }),
    ]));
    for (const row of tbl.rows) expect(row).toHaveLength(tbl.headers.length);
  });

  it('adds a Current Value cell to match the Current Value header', () => {
    // The header push and the cell push must move together. The cell was once
    // commented out while the header push was left in, so every row came out one
    // cell short of the headers whenever the option was on.
    const tbl = firstTable(renderEnvironmentVariablesPage([
      anEnvironmentVariable({ currentValue: 'https://uat.example.invalid/api' }),
    ], toggles({ showDefaultValue: true, showCurrentValue: true })));

    expect(tbl.headers).toContain('Current Value');
    expect(tbl.rows[0]).toHaveLength(tbl.headers.length);
    expect(tbl.rows[0][tbl.headers.indexOf('Current Value')])
      .toEqual([{ type: 'code', value: 'https://uat.example.invalid/api' }]);
  });

  it('stays aligned for every combination of the two toggles', () => {
    // The alignment bug only appeared on one of four paths, so sweep all four.
    for (const showDefaultValue of [true, false]) {
      for (const showCurrentValue of [true, false]) {
        const tbl = firstTable(renderEnvironmentVariablesPage(
          [anEnvironmentVariable(), anEnvironmentVariable({ secretStore: 1, currentValue: undefined })],
          toggles({ showDefaultValue, showCurrentValue }),
        ));
        for (const row of tbl.rows) {
          expect(row, `showDefaultValue=${showDefaultValue} showCurrentValue=${showCurrentValue}`)
            .toHaveLength(tbl.headers.length);
        }
      }
    }
  });

  it('says Not set rather than leaving the current value blank', () => {
    const tbl = firstTable(renderEnvironmentVariablesPage([
      anEnvironmentVariable({ currentValue: undefined }),
    ], toggles({ showDefaultValue: true, showCurrentValue: true })));
    expect(tbl.rows[0][tbl.headers.indexOf('Current Value')])
      .toEqual([{ type: 'italic', value: 'Not set' }]);
  });

  it('masks a secret-store current value instead of printing it', () => {
    // A current value is live environment data — for a Key Vault variable it must
    // never be printed, however the toggle is set.
    const tbl = firstTable(renderEnvironmentVariablesPage([
      anEnvironmentVariable({ secretStore: 1, currentValue: 'live-secret-do-not-print' }),
    ], toggles({ showDefaultValue: true, showCurrentValue: true })));
    expect(tbl.rows[0][tbl.headers.indexOf('Current Value')])
      .toEqual([{ type: 'italic', value: '[secret — stored externally]' }]);
    expect(JSON.stringify(tbl)).not.toContain('live-secret-do-not-print');
  });

  it('masks the default value when it lives in a secret store', () => {
    // The value in the XML for a Key Vault variable is a store reference, not the
    // secret — printing it verbatim would still leak vault/key identifiers.
    const tbl = firstTable(renderEnvironmentVariablesPage([
      anEnvironmentVariable({ secretStore: 1, defaultValue: 'kv-ref-do-not-print' }),
    ]));
    expect(tbl.rows[0][4]).toEqual([{ type: 'italic', value: '[secret]' }]);
    expect(JSON.stringify(tbl)).not.toContain('kv-ref-do-not-print');
  });

  it('renders a plain default value as a code span', () => {
    const tbl = firstTable(renderEnvironmentVariablesPage([
      anEnvironmentVariable({ secretStore: 0, defaultValue: 'https://example.invalid/api' }),
    ]));
    expect(tbl.rows[0][4]).toEqual([{ type: 'code', value: 'https://example.invalid/api' }]);
  });

  it('distinguishes an unset default from an empty string value', () => {
    const tbl = firstTable(renderEnvironmentVariablesPage([anEnvironmentVariable({ defaultValue: '' })]));
    expect(tbl.rows[0][4]).toEqual([{ type: 'italic', value: 'Not set' }]);
  });

  it('names each known secret store and an em dash for none', () => {
    const tbl = firstTable(renderEnvironmentVariablesPage([
      anEnvironmentVariable({ schemaName: 'a', secretStore: 0 }),
      anEnvironmentVariable({ schemaName: 'b', secretStore: 1 }),
      anEnvironmentVariable({ schemaName: 'c', secretStore: 2 }),
    ]));
    expect(tbl.rows.map(r => (r[5][0] as { value: string }).value))
      .toEqual(['—', 'Azure Key Vault', 'Microsoft Secret Store']);
  });

  it('labels an unrecognised secret store rather than rendering undefined', () => {
    // Microsoft can add store types; an unknown number must still be legible.
    const tbl = firstTable(renderEnvironmentVariablesPage([anEnvironmentVariable({ secretStore: 7 })]));
    expect(tbl.rows[0][5]).toEqual([{ type: 'text', value: 'Unknown (7)' }]);
  });

  it('falls back to the schema name when a variable has no display name', () => {
    const tbl = firstTable(renderEnvironmentVariablesPage([
      anEnvironmentVariable({ displayName: '', schemaName: 'acme_ApiBaseUrl' }),
    ]));
    expect(tbl.rows[0][0]).toEqual([{ type: 'text', value: 'acme_ApiBaseUrl' }]);
  });

  it('reports required as a word, not a boolean', () => {
    const tbl = firstTable(renderEnvironmentVariablesPage([
      anEnvironmentVariable({ schemaName: 'a', isRequired: true }),
      anEnvironmentVariable({ schemaName: 'b', isRequired: false }),
    ]));
    expect(tbl.rows.map(r => (r[3][0] as { value: string }).value)).toEqual(['Yes', 'No']);
  });
});
