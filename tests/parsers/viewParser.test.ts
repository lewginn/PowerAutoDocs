import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseEntityViews, parseViewXml } from '../../src/parsers/viewParser.js';
import type { ViewModel } from '../../src/ir/index.js';

const ENTITIES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'fixtures', 'solutions', 'ContosoDemo', 'Entities',
);

const WIDGET = path.join(ENTITIES, 'contoso_widget');
const viewFile = (file: string) => path.join(WIDGET, 'SavedQueries', file);
const byName = (name: string): ViewModel =>
  parseEntityViews(WIDGET).find(v => v.name === name)!;

describe('parseViewXml', () => {
  it('maps a saved query onto the IR', () => {
    const view = parseViewXml(viewFile('WidgetLookupView.xml'))!;

    expect(view).toEqual({
      name: 'Widget Lookup View',
      type: 'Lookup',
      columns: ['contoso_name'],
      description: '',   // saved queries carry no description in the XML
      isDefault: false,
      isQuickFind: false,
      filters: [],
    });
  });

  it('maps querytype to a view type', () => {
    expect(parseViewXml(viewFile('WidgetLookupView.xml'))!.type).toBe('Lookup');       // 64
    expect(parseViewXml(viewFile('PartWidgetsSubgrid.xml'))!.type).toBe('SubGrid');    // 128
    expect(parseViewXml(viewFile('ActiveWidgets.xml'))!.type).toBe('Public');          // 0
  });

  it('falls back to Other for an unrecognised querytype', () => {
    // ArchivedWidgets is querytype 512. New querytypes appear over time; an
    // unrecognised one must still be documented, just not mistyped.
    expect(parseViewXml(viewFile('ArchivedWidgets.xml'))!.type).toBe('Other');
  });

  it('lets isquickfindquery win over querytype', () => {
    // QuickFindActiveWidgets is querytype 4 — which maps to nothing — but the
    // quick find flag is the authoritative signal and must take precedence.
    const view = parseViewXml(viewFile('QuickFindActiveWidgets.xml'))!;
    expect(view.type).toBe('Quick Find');
    expect(view.isQuickFind).toBe(true);
  });

  it('reads isdefault', () => {
    expect(parseViewXml(viewFile('ActiveWidgets.xml'))!.isDefault).toBe(true);
    expect(parseViewXml(viewFile('ArchivedWidgets.xml'))!.isDefault).toBe(false);
  });

  it('takes the English name and falls back to the file name without one', () => {
    // ActiveWidgets is named in 1033 and 1036; UnnamedView only in 1036. A view
    // with an empty name would render as a blank heading, so the file name stands in.
    expect(parseViewXml(viewFile('ActiveWidgets.xml'))!.name).toBe('Active Widgets');
    expect(parseViewXml(viewFile('UnnamedView.xml'))!.name).toBe('UnnamedView.xml');
  });

  it('reads the displayed columns from layoutxml, in grid order', () => {
    const view = parseViewXml(viewFile('ActiveWidgets.xml'))!;
    expect(view.columns.slice(0, 2)).toEqual(['contoso_name', 'contoso_quantity']);
  });

  it('drops layout cells that name no column', () => {
    // Layouts contain spacer cells with no @name. They are not columns and must
    // not show up as blank rows in the docs.
    expect(parseViewXml(viewFile('ActiveWidgets.xml'))!.columns).not.toContain('');
  });

  it('rewrites aliased columns through the link-entity join field', () => {
    // part_link joins on to="contoso_partid", so the layout's "part_link.contoso_partnumber"
    // becomes "contoso_partid.contoso_partnumber" — an opaque alias tells a reader nothing.
    expect(parseViewXml(viewFile('ActiveWidgets.xml'))!.columns)
      .toContain('contoso_partid.contoso_partnumber');
  });

  it('leaves an unresolvable alias alone rather than dropping the column', () => {
    // orphan_alias has no matching link-entity. Half a name beats no column.
    expect(parseViewXml(viewFile('ActiveWidgets.xml'))!.columns)
      .toContain('orphan_alias.contoso_code');
  });

  it('extracts the entity filter conditions with their group type', () => {
    const filters = parseViewXml(viewFile('ActiveWidgets.xml'))!.filters;

    expect(filters.slice(0, 2)).toEqual([
      { attribute: 'statecode', operator: 'eq', value: '0', filterType: 'and', depth: 0 },
      { attribute: 'contoso_quantity', operator: 'gt', value: '0', filterType: 'and', depth: 0 },
    ]);
  });

  it('skips a condition with no attribute', () => {
    // ActiveWidgets carries a <condition operator="null"/> with no attribute —
    // there is nothing to say about it, and an empty row would just be noise.
    expect(parseViewXml(viewFile('ActiveWidgets.xml'))!.filters
      .filter(f => !f.attribute)).toEqual([]);
  });

  it('skips the quick find search filter', () => {
    // isquickfindfields="1" is the "which columns does search look at" block, not a
    // filter on the data — documenting `name like {0}` would confuse every reader.
    const filters = parseViewXml(viewFile('QuickFindActiveWidgets.xml'))!.filters;
    expect(filters).toEqual([
      { attribute: 'statecode', operator: 'eq', value: '0', filterType: 'and', depth: 0 },
    ]);
    expect(filters.map(f => f.attribute)).not.toContain('contoso_legacycode');
  });

  it('records link-entities as joins, and their filters below them', () => {
    const filters = parseViewXml(viewFile('ActiveWidgets.xml'))!.filters;

    expect(filters[2]).toEqual({
      attribute: 'contoso_part',
      operator: 'must have data',    // link-type="inner"
      isJoin: true,
      joinType: 'inner',
      joinField: 'contoso_partid',
      depth: 1,
    });
    // The link's own filter sits one level deeper than the link itself, which is
    // what lets a renderer indent it under the join.
    expect(filters[3]).toEqual({
      attribute: 'statecode', operator: 'eq', value: '0', filterType: 'or', depth: 2,
    });
  });

  it('walks nested link-entities and maps outer joins to optional', () => {
    // supplier_link is an outer join nested inside part_link. An inner join changes
    // which rows a view returns; an outer one does not — the wording has to differ.
    const supplier = parseViewXml(viewFile('ActiveWidgets.xml'))!.filters
      .find(f => f.attribute === 'account')!;

    expect(supplier).toMatchObject({
      operator: 'optional',
      isJoin: true,
      joinType: 'outer',
      joinField: 'contoso_supplierid',
    });
  });

  it('returns null when the file holds no saved query', () => {
    expect(parseViewXml(viewFile('NoSavedQuery.xml'))).toBeNull();
  });
});

describe('parseEntityViews', () => {
  it('reads every saved query in the folder', () => {
    expect(parseEntityViews(WIDGET)).toHaveLength(6);
  });

  it('puts the default view first, then sorts the rest by name', () => {
    // The default view is what users actually see, so it leads. "Active Widgets"
    // would sort first alphabetically anyway, so the assertion below is only
    // meaningful because the rest of the list proves the alphabetical tail too.
    expect(parseEntityViews(WIDGET).map(v => v.name)).toEqual([
      'Active Widgets',            // isdefault=1
      'Archived Widgets',
      'Part Widgets Subgrid',
      'Quick Find Active Widgets',
      'UnnamedView.xml',
      'Widget Lookup View',
    ]);
    expect(byName('Active Widgets').isDefault).toBe(true);
  });

  it('ignores non-XML files in the folder', () => {
    // notes.md sits alongside the views; feeding it to the XML parser would at
    // best waste time and at worst throw.
    expect(parseEntityViews(WIDGET).map(v => v.name)).not.toContain('notes.md');
  });

  it('drops an unparseable file without losing the rest', () => {
    // NoSavedQuery.xml yields null. The other six views must survive it.
    const names = parseEntityViews(WIDGET).map(v => v.name);
    expect(names).not.toContain('NoSavedQuery.xml');
    expect(names).toContain('Active Widgets');
  });

  it('returns empty for an entity with no SavedQueries folder', () => {
    // Most tables in a real solution ship no views at all; an absent folder is
    // the normal case, not an error.
    expect(parseEntityViews(path.join(ENTITIES, 'contoso_part'))).toEqual([]);
  });
});
