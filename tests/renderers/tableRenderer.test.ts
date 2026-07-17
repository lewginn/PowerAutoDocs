import { describe, it, expect } from 'vitest';
import {
  renderTableIndex,
  renderTableColumns,
  renderTableViews,
  renderTableForms,
  renderTableRelationships,
  renderTableBusinessRules,
  renderTableUsedByFlows,
  renderSingleBusinessRule,
} from '../../src/renderers/tableRenderer.js';
import type { BulletListNode, DocNode, TableNode } from '../../src/docmodel/nodes.js';
import {
  aBusinessRule,
  aColumn,
  aFlow,
  aForm,
  aRelationship,
  aTable,
  aView,
} from '../fixtures/ir.js';
import { aConfig } from '../fixtures/config.js';

const tables = (nodes: DocNode[]): TableNode[] => nodes.filter(n => n.type === 'table') as TableNode[];

/** The label column of a Property/Value table. */
const propLabels = (tbl: TableNode): string[] =>
  tbl.rows.map(r => (r[0][0] as { value: string }).value);

/** Look up a Property/Value row by its label. */
const propValue = (tbl: TableNode, label: string) =>
  tbl.rows.find(r => (r[0][0] as { value: string }).value === label)?.[1];

const headings = (nodes: DocNode[]): string[] =>
  nodes.filter(n => n.type === 'heading').map(n => (n as { text: string }).text);

// Array.prototype.at() needs ES2022 and the build targets ES2020 — see tsconfig.json.
const last = (nodes: DocNode[]): DocNode => nodes[nodes.length - 1];

describe('renderTableIndex', () => {
  it('leads with the display name and ends with a TOC placeholder', () => {
    const nodes = renderTableIndex(aTable({ displayName: 'Widget' }));
    expect(nodes[0]).toEqual({ type: 'heading', level: 1, text: 'Widget' });
    expect(last(nodes)).toEqual({ type: 'toc_placeholder' });
  });

  it('omits optional rows that have no value rather than rendering them blank', () => {
    const nodes = renderTableIndex(aTable({ description: '', pluralDisplayName: '' }));
    const labels = propLabels(tables(nodes)[0]);
    expect(labels).not.toContain('Description');
    expect(labels).not.toContain('Plural Name');
    expect(labels).toEqual(['Logical Name', 'Display Name', 'Type', 'Activity Table']);
  });

  it('distinguishes a custom table from an extended standard one', () => {
    const custom = tables(renderTableIndex(aTable({ isCustom: true })))[0];
    expect(propValue(custom, 'Type')).toEqual([{ type: 'text', value: 'Custom Table' }]);

    const standard = tables(renderTableIndex(aTable({ isCustom: false })))[0];
    expect(propValue(standard, 'Type')).toEqual([{ type: 'text', value: 'Standard Table (Extended)' }]);
  });

  it('renders the logical name as a code span', () => {
    const tbl = tables(renderTableIndex(aTable({ logicalName: 'acme_widget' })))[0];
    expect(propValue(tbl, 'Logical Name')).toEqual([{ type: 'code', value: 'acme_widget' }]);
  });

  it('includes the AI summary section only when present', () => {
    expect(headings(renderTableIndex(aTable({ aiSummary: 'A widget.' })))).toContain('Summary');
    expect(headings(renderTableIndex(aTable({ aiSummary: undefined })))).not.toContain('Summary');
  });
});

describe('renderTableColumns', () => {
  it('states that none were found rather than emitting an empty table', () => {
    const nodes = renderTableColumns(aTable({ columns: [] }));
    expect(tables(nodes)).toHaveLength(0);
    expect(nodes).toContainEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: 'No columns found in solution for this table.' }],
    });
  });

  it('splits custom and standard columns into separate sections', () => {
    const nodes = renderTableColumns(aTable({
      columns: [aColumn({ logicalName: 'acme_a', isCustom: true }), aColumn({ logicalName: 'name', isCustom: false })],
    }));
    expect(headings(nodes)).toEqual(['Widget — Columns', 'Custom Columns', 'Standard Columns']);
    expect(tables(nodes)).toHaveLength(2);
  });

  it('omits a section heading when that bucket is empty', () => {
    const nodes = renderTableColumns(aTable({ columns: [aColumn({ isCustom: true })] }));
    expect(headings(nodes)).not.toContain('Standard Columns');
  });

  it('maps raw column types to friendly labels', () => {
    const nodes = renderTableColumns(aTable({
      columns: [
        aColumn({ type: 'memo', isCustom: true }),
        aColumn({ type: 'money', isCustom: true }),
        aColumn({ type: 'boolean', isCustom: true }),
        aColumn({ type: 'optionset', isCustom: true }),
        aColumn({ type: 'uniqueidentifier', isCustom: true }),
      ],
    }));
    const typeCol = tables(nodes)[0].rows.map(r => (r[2][0] as { value: string }).value);
    expect(typeCol).toEqual(['Multiline Text', 'Currency', 'Yes/No', 'Choice', 'Unique Identifier']);
  });

  it('renders required as Yes/No rather than a raw boolean', () => {
    const nodes = renderTableColumns(aTable({
      columns: [aColumn({ isRequired: true, isCustom: true }), aColumn({ isRequired: false, isCustom: true })],
    }));
    const requiredCol = tables(nodes)[0].rows.map(r => (r[3][0] as { value: string }).value);
    expect(requiredCol).toEqual(['Yes', 'No']);
  });
});

describe('renderTableViews', () => {
  it('states that none were found when the table has no views', () => {
    expect(renderTableViews(aTable({ views: [] }))).toContainEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: 'No views found.' }],
    });
  });

  it('gives each view its own heading and property table', () => {
    const nodes = renderTableViews(aTable({ views: [aView({ name: 'Active' }), aView({ name: 'Inactive' })] }));
    expect(headings(nodes)).toEqual(['Widget — Views', 'Active', 'Inactive']);
    expect(tables(nodes)).toHaveLength(2);
  });

  it('says None rather than leaving the columns cell blank', () => {
    const tbl = tables(renderTableViews(aTable({ views: [aView({ columns: [] })] })))[0];
    expect(propValue(tbl, 'Columns')).toEqual([{ type: 'code', value: 'None' }]);
  });

  it('inserts the Description row only when the view has one', () => {
    const withDesc = tables(renderTableViews(aTable({ views: [aView({ description: 'All of them.' })] })))[0];
    expect(propLabels(withDesc)).toEqual(['Type', 'Default', 'Quick Find', 'Description', 'Columns', 'Filters']);

    const noDesc = tables(renderTableViews(aTable({ views: [aView({ description: '' })] })))[0];
    expect(propLabels(noDesc)).toEqual(['Type', 'Default', 'Quick Find', 'Columns', 'Filters']);
  });

  it('formats a plain filter condition as attribute, operator, value', () => {
    const tbl = tables(renderTableViews(aTable({
      views: [aView({ filters: [{ attribute: 'statecode', operator: 'eq', value: '0', depth: 0 }] })],
    })))[0];
    expect(propValue(tbl, 'Filters')).toEqual([{ type: 'text', value: 'statecode eq 0' }]);
  });

  it('omits the value when a filter has none', () => {
    const tbl = tables(renderTableViews(aTable({
      views: [aView({ filters: [{ attribute: 'acme_serial', operator: 'not-null', depth: 0 }] })],
    })))[0];
    expect(propValue(tbl, 'Filters')).toEqual([{ type: 'text', value: 'acme_serial not-null' }]);
  });

  it('marks OR conditions so they are not misread as AND', () => {
    const tbl = tables(renderTableViews(aTable({
      views: [aView({ filters: [{ attribute: 'statecode', operator: 'eq', value: '1', filterType: 'or', depth: 0 }] })],
    })))[0];
    expect(propValue(tbl, 'Filters')).toEqual([{ type: 'text', value: 'OR statecode eq 1' }]);
  });

  it('describes joins with their type and linking field', () => {
    const tbl = tables(renderTableViews(aTable({
      views: [aView({
        filters: [{ attribute: 'acme_part', operator: '', isJoin: true, joinType: 'inner', joinField: 'acme_widgetid', depth: 0 }],
      })],
    })))[0];
    expect(propValue(tbl, 'Filters')).toEqual([
      { type: 'text', value: 'acme_part (inner join via acme_widgetid)' },
    ]);
  });

  it('labels a non-inner join as an outer join', () => {
    const tbl = tables(renderTableViews(aTable({
      views: [aView({ filters: [{ attribute: 'acme_part', operator: '', isJoin: true, joinType: 'outer', depth: 0 }] })],
    })))[0];
    expect(propValue(tbl, 'Filters')).toEqual([{ type: 'text', value: 'acme_part (outer join)' }]);
  });
});

describe('renderTableForms', () => {
  it('states that none were found when the table has no forms', () => {
    expect(renderTableForms(aTable({ forms: [] }), aConfig())).toContainEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: 'No forms found.' }],
    });
  });

  it('totals fields across every tab and section', () => {
    const form = aForm({
      tabs: [
        { label: 'General', sections: [{ label: 'A', columns: ['x', 'y'] }, { label: 'B', columns: ['z'] }] },
        { label: 'Detail', sections: [{ label: 'C', columns: ['w'] }] },
      ],
    });
    const tbl = tables(renderTableForms(aTable({ forms: [form] }), aConfig()))[0];
    expect((tbl.rows[0][2][0] as { value: string }).value).toBe('2'); // tab count
    expect((tbl.rows[0][3][0] as { value: string }).value).toBe('4'); // total fields
  });

  it('shows only the summary table in compact layout', () => {
    const nodes = renderTableForms(aTable({ forms: [aForm()] }), aConfig({ render: { formLayout: 'compact' } }));
    expect(headings(nodes)).toEqual(['Widget — Forms']);
    expect(nodes.some(n => n.type === 'bullet_list')).toBe(false);
  });

  it('breaks out tabs, sections and fields in detailed layout', () => {
    const nodes = renderTableForms(aTable({ forms: [aForm()] }), aConfig({ render: { formLayout: 'detailed' } }));
    expect(headings(nodes)).toEqual(['Widget — Forms', 'Widget Main Form (Main)', 'General']);
    const list = nodes.find(n => n.type === 'bullet_list') as BulletListNode;
    expect(list.items).toEqual([{ depth: 0, inlines: [{ type: 'code', value: 'acme_widgetname' }] }]);
  });

  it('notes an empty section in detailed layout instead of an empty list', () => {
    const form = aForm({ tabs: [{ label: 'General', sections: [{ label: 'Empty', columns: [] }] }] });
    const nodes = renderTableForms(aTable({ forms: [form] }), aConfig({ render: { formLayout: 'detailed' } }));
    expect(nodes).toContainEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: 'No fields in this section.' }],
    });
    expect(nodes.some(n => n.type === 'bullet_list')).toBe(false);
  });
});

describe('renderTableRelationships', () => {
  it('states that none were found when the table has no relationships', () => {
    expect(renderTableRelationships(aTable({ relationships: [] }))).toContainEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: 'No relationships found.' }],
    });
  });

  it('keeps "this" on the one side when the table is the parent', () => {
    // referencedEntity is always the "one" side. This table is referenced, so it
    // is the parent: One (this) → Many. Getting this backwards is a real bug the
    // renderer previously shipped.
    const nodes = renderTableRelationships(aTable({
      logicalName: 'acme_widget',
      relationships: [aRelationship({ referencedEntity: 'acme_widget', referencingEntity: 'acme_part' })],
    }));
    const row = tables(nodes)[0].rows[0];
    expect((row[1][0] as { value: string }).value).toBe('One (this) → Many');
    expect((row[2][0] as { value: string }).value).toBe('acme_part');
  });

  it('keeps "this" on the many side when the table holds the lookup', () => {
    const nodes = renderTableRelationships(aTable({
      logicalName: 'acme_part',
      relationships: [aRelationship({ referencedEntity: 'acme_widget', referencingEntity: 'acme_part' })],
    }));
    const row = tables(nodes)[0].rows[0];
    expect((row[1][0] as { value: string }).value).toBe('Many (this) → One');
    expect((row[2][0] as { value: string }).value).toBe('acme_widget');
  });

  it('compares entity names case-insensitively when deciding direction', () => {
    // Solution XML is not consistent about casing, so a case-sensitive compare
    // would silently flip the direction label.
    const nodes = renderTableRelationships(aTable({
      logicalName: 'acme_widget',
      relationships: [aRelationship({ referencedEntity: 'ACME_Widget', referencingEntity: 'acme_part' })],
    }));
    expect((tables(nodes)[0].rows[0][1][0] as { value: string }).value).toBe('One (this) → Many');
  });

  it('splits custom and standard relationships into separate sections', () => {
    const nodes = renderTableRelationships(aTable({
      relationships: [
        aRelationship({ name: 'custom_rel', isCustom: true }),
        aRelationship({ name: 'standard_rel', isCustom: false }),
      ],
    }));
    expect(headings(nodes)).toEqual([
      'Widget — Relationships', 'Custom Relationships', 'Standard Relationships',
    ]);
  });
});

describe('renderTableBusinessRules', () => {
  it('states that none were found when the table has no rules', () => {
    expect(renderTableBusinessRules(aTable(), [])).toContainEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: 'No business rules found for this table.' }],
    });
  });

  it('ends with a TOC placeholder so sub-pages are linked', () => {
    const nodes = renderTableBusinessRules(aTable(), [aBusinessRule()]);
    expect(last(nodes)).toEqual({ type: 'toc_placeholder' });
  });

  it('humanises every scope value', () => {
    const nodes = renderTableBusinessRules(aTable(), [
      aBusinessRule({ scope: 'specificForm' }),
      aBusinessRule({ scope: 'allForms' }),
      aBusinessRule({ scope: 'entity' }),
    ]);
    const scopes = tables(nodes)[0].rows.map(r => (r[2][0] as { value: string }).value);
    expect(scopes).toEqual(['Specific Form', 'All Forms', 'Entity']);
  });
});

describe('renderTableUsedByFlows', () => {
  it('states that none reference the table when the list is empty', () => {
    expect(renderTableUsedByFlows(aTable(), [])).toContainEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: 'No flows reference this table.' }],
    });
  });

  it('links flow names only when a basePath is supplied', () => {
    const linked = tables(renderTableUsedByFlows(aTable(), [aFlow({ name: 'Ship It' })], '/Flows'))[0];
    expect(linked.rows[0][0]).toEqual([{ type: 'link', text: 'Ship It', href: '/Flows/Ship It' }]);

    const plain = tables(renderTableUsedByFlows(aTable(), [aFlow({ name: 'Ship It' })]))[0];
    expect(plain.rows[0][0]).toEqual([{ type: 'text', value: 'Ship It' }]);
  });
});

describe('renderSingleBusinessRule', () => {
  it('notes when no conditions could be extracted', () => {
    const nodes = renderSingleBusinessRule(aBusinessRule({ conditions: [] }));
    expect(nodes).toContainEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: 'No conditions extracted.' }],
    });
  });

  it('spells out server-side scope on the detail page', () => {
    // The index page says just "Entity"; the detail page has room to explain it.
    const tbl = tables(renderSingleBusinessRule(aBusinessRule({ scope: 'entity' })))[0];
    expect(propValue(tbl, 'Scope')).toEqual([{ type: 'text', value: 'Entity (Server-side)' }]);
  });

  it('falls back to a numbered label when a condition has no description', () => {
    const nodes = renderSingleBusinessRule(aBusinessRule({
      conditions: [{ conditionField: 'acme_tier', description: undefined, thenActions: [], elseActions: [] }],
    }));
    const ifPara = nodes.find(n => n.type === 'paragraph' && n.inlines[0]?.type === 'bold');
    expect(ifPara).toEqual({
      type: 'paragraph',
      inlines: [
        { type: 'bold', value: 'If' },
        { type: 'text', value: ' ' },
        { type: 'code', value: 'acme_tier' },
        { type: 'text', value: ' — Condition 1' },
      ],
    });
  });

  it('groups multiple fields sharing an action type onto one bullet', () => {
    const nodes = renderSingleBusinessRule(aBusinessRule({
      conditions: [{
        conditionField: 'acme_tier',
        description: 'Premium',
        thenActions: [
          { type: 'setRequired', field: 'acme_serial' },
          { type: 'setRequired', field: 'acme_warranty' },
          { type: 'hide', field: 'acme_note' },
        ],
        elseActions: [],
      }],
    }));
    const list = nodes.find(n => n.type === 'bullet_list') as BulletListNode;
    expect(list.items).toHaveLength(2);
    expect(list.items[0].inlines).toEqual([
      { type: 'bold', value: 'Set Required:' },
      { type: 'text', value: ' ' },
      { type: 'code', value: 'acme_serial' },
      { type: 'text', value: ', ' },
      { type: 'code', value: 'acme_warranty' },
    ]);
    expect(list.items[1].inlines[0]).toEqual({ type: 'bold', value: 'Hide:' });
  });

  it('renders the Else branch only when there are else actions', () => {
    const withElse = renderSingleBusinessRule(aBusinessRule());
    expect(withElse.some(n => n.type === 'paragraph' && n.inlines[0]?.type === 'bold' && n.inlines[0].value === 'Else')).toBe(true);

    const noElse = renderSingleBusinessRule(aBusinessRule({
      conditions: [{ conditionField: 'acme_tier', thenActions: [{ type: 'show', field: 'acme_serial' }], elseActions: [] }],
    }));
    expect(noElse.some(n => n.type === 'paragraph' && n.inlines[0]?.type === 'bold' && n.inlines[0].value === 'Else')).toBe(false);
  });
});
