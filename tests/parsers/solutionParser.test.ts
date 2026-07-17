import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseSolution } from '../../src/parsers/solutionParser.js';
import { aConfig } from '../fixtures/config.js';
import type { TableModel } from '../../src/ir/index.js';

const SOLUTION = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'fixtures', 'solutions', 'ContosoDemo',
);

type ConfigOverride = Parameters<typeof aConfig>[0];

// Relationships live outside Entities/ and are the relationship parser's contract,
// not this sweep's — switching them off keeps these tests about entity handling.
const sweep = (over: ConfigOverride = {}): TableModel[] =>
  parseSolution(
    SOLUTION,
    aConfig({ ...over, components: { relationships: false, ...(over.components ?? {}) } }),
    'contoso',
  );

const table = (logicalName: string, over: ConfigOverride = {}): TableModel =>
  sweep(over).find(t => t.logicalName === logicalName)!;

const columnNames = (t: TableModel) => t.columns.map(c => c.logicalName);

describe('parseSolution', () => {
  it('returns one table per entity folder that has an Entity.xml', () => {
    // Order follows the folder listing — the sweep deliberately does not sort, so
    // downstream ordering is the renderer's decision, not an accident here.
    expect(sweep().map(t => t.logicalName)).toEqual([
      'account',
      'contoso_inspection',
      'contoso_part',
      'contoso_widget',
    ]);
  });

  it('skips a folder with no Entity.xml', () => {
    // contoso_orphan/ has none. Exports carry leftover folders like this.
    expect(sweep().map(t => t.logicalName)).not.toContain('contoso_orphan');
  });

  it('loses only the entity that fails to parse, not the solution', () => {
    // contoso_broken/Entity.xml throws. One damaged entity out of a hundred must
    // not turn a documentation run into a blank document.
    const names = sweep().map(t => t.logicalName);
    expect(names).not.toContain('contoso_broken');
    expect(names).toHaveLength(4);
  });

  it('returns empty for a path with no Entities folder', () => {
    // Solutions with no tables at all are legitimate — flows-only, for instance.
    expect(parseSolution(path.join(SOLUTION, 'NoSuchFolder'), aConfig(), 'contoso')).toEqual([]);
  });

  it('drops the configured noise columns', () => {
    // transactioncurrencyid and versionnumber are in the default exclusion list:
    // plumbing every table has, that no reader has ever wanted documented.
    const names = columnNames(table('account'));
    expect(names).not.toContain('transactioncurrencyid');
    expect(names).not.toContain('versionnumber');
    expect(names).toContain('name');
  });

  it('drops base-currency shadow columns, but only the money ones', () => {
    // Dataverse mirrors every money column into a _base twin. The type check is
    // what stops the rule eating an ordinary column that happens to end in _base.
    const names = columnNames(table('account'));
    expect(names).not.toContain('contoso_annualvalue_base');  // money
    expect(names).toContain('contoso_annualvalue');
    expect(names).toContain('contoso_ledgerref_base');        // nvarchar — not a shadow
  });

  it('keeps base-currency columns when the exclusion is switched off', () => {
    expect(columnNames(table('account', { parse: { excludeBaseCurrencyFields: false } })))
      .toContain('contoso_annualvalue_base');
  });

  it('keeps only custom columns under customColumnsOnly', () => {
    // The common ask: "document what we built, not what Microsoft shipped."
    expect(columnNames(table('account', { parse: { customColumnsOnly: true } })))
      .toEqual(['contoso_grade', 'contoso_annualvalue', 'contoso_ledgerref_base']);
  });

  it('applies the column filters on top of each other', () => {
    // customColumnsOnly does not rescue an excluded or base-currency column.
    const names = columnNames(table('account', { parse: { customColumnsOnly: true } }));
    expect(names).not.toContain('contoso_annualvalue_base');
    expect(names).not.toContain('accountid');
  });

  it('wires views onto the table when views are enabled', () => {
    expect(table('contoso_widget').views.map(v => v.name)).toContain('Active Widgets');
  });

  it('leaves views empty when the component is switched off', () => {
    // The toggle has to stop the work, not just hide it — clients pay for the parse.
    expect(table('contoso_widget', { components: { views: false } }).views).toEqual([]);
  });

  it('wires forms onto the table when forms are enabled', () => {
    expect(table('contoso_widget').forms.map(f => f.name)).toContain('Widget');
  });

  it('leaves forms empty when the component is switched off', () => {
    expect(table('contoso_widget', { components: { forms: false } }).forms).toEqual([]);
  });

  it('leaves relationships empty when the component is switched off', () => {
    expect(table('contoso_widget').relationships).toEqual([]);
  });

  it('parses the same tables with every component enabled', () => {
    // The default config turns everything on. Relationship *content* belongs to
    // relationshipParser's own tests, so this only pins that enabling the extra
    // passes neither throws nor changes which tables come back.
    expect(parseSolution(SOLUTION, aConfig(), 'contoso').map(t => t.logicalName))
      .toEqual(['account', 'contoso_inspection', 'contoso_part', 'contoso_widget']);
  });
});
