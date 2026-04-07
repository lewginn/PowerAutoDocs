// renderers/tableRenderer.ts

import * as fs from 'fs';
import * as path from 'path';
import type { TableModel, ColumnModel, RelationshipModel } from '../ir/index.js';
import type { DocGenConfig } from '../config/index.js';
import type { BusinessRuleModel } from '../ir/businessRule.js';
import type { DocNode, InlineNode } from '../docmodel/nodes.js';
import { h, pt, p, t, c, b, table, ct, cc, bulletList, bullet, toc } from '../docmodel/nodes.js';
import { serialize } from '../docmodel/MarkdownSerializer.js';

// -----------------------------------------------
// Shared helpers
// -----------------------------------------------

function friendlyType(col: ColumnModel): string {
  const typeLabels: Record<string, string> = {
    string:           'Text',
    memo:             'Multiline Text',
    integer:          'Whole Number',
    decimal:          'Decimal',
    money:            'Currency',
    boolean:          'Yes/No',
    datetime:         'Date & Time',
    lookup:           'Lookup',
    optionset:        'Choice',
    uniqueidentifier: 'Unique Identifier',
    unknown:          'Unknown',
  };
  return typeLabels[col.type] ?? col.type;
}

// -----------------------------------------------
// Index page — summary + toc placeholder
// -----------------------------------------------

export function renderTableIndex(table_: TableModel): DocNode[] {
  const nodes: DocNode[] = [];

  nodes.push(h(1, table_.displayName));
  nodes.push(table(
    ['Property', 'Value'],
    [
      [ct('Logical Name'),  cc(table_.logicalName)],
      [ct('Display Name'),  ct(table_.displayName)],
      ...(table_.pluralDisplayName ? [[ct('Plural Name'), ct(table_.pluralDisplayName)]] : []),
      [ct('Type'),          ct(table_.isCustom ? 'Custom Table' : 'Standard Table (Extended)')],
      [ct('Activity Table'), ct(table_.isActivity ? 'Yes' : 'No')],
      ...(table_.description ? [[ct('Description'), ct(table_.description)]] : []),
    ] as InlineNode[][][]
  ));

  if (table_.aiSummary) {
    nodes.push(h(2, 'Summary'));
    nodes.push(pt(table_.aiSummary));
  }

  nodes.push(toc());

  return nodes;
}

// -----------------------------------------------
// Columns subpage
// -----------------------------------------------

function columnTableRows(columns: ColumnModel[]): InlineNode[][][] {
  return columns.map(col => [
    ct(col.displayName),
    cc(col.logicalName),
    ct(friendlyType(col)),
    ct(col.isRequired ? 'Yes' : 'No'),
    ct(col.description || ''),
  ]);
}

export function renderTableColumns(table_: TableModel): DocNode[] {
  const nodes: DocNode[] = [];

  nodes.push(h(1, `${table_.displayName} — Columns`));

  if (table_.columns.length === 0) {
    nodes.push(pt('No columns found in solution for this table.'));
    return nodes;
  }

  const customCols   = table_.columns.filter(c => c.isCustom);
  const standardCols = table_.columns.filter(c => !c.isCustom);

  if (customCols.length > 0) {
    nodes.push(h(2, 'Custom Columns'));
    nodes.push(table(
      ['Display Name', 'Logical Name', 'Type', 'Required', 'Description'],
      columnTableRows(customCols)
    ));
  }

  if (standardCols.length > 0) {
    nodes.push(h(2, 'Standard Columns'));
    nodes.push(table(
      ['Display Name', 'Logical Name', 'Type', 'Required', 'Description'],
      columnTableRows(standardCols)
    ));
  }

  return nodes;
}

// -----------------------------------------------
// Views subpage
// -----------------------------------------------

export function renderTableViews(table_: TableModel): DocNode[] {
  const nodes: DocNode[] = [];

  nodes.push(h(1, `${table_.displayName} — Views`));

  if (table_.views.length === 0) {
    nodes.push(pt('No views found.'));
    return nodes;
  }

  for (const view of table_.views) {
    nodes.push(h(2, view.name));

    const colsSummary = view.columns.length > 0
      ? view.columns.join(', ')
      : 'None';

    const filtersSummary = view.filters.length > 0
      ? view.filters.map(f => {
          if (f.isJoin) {
            const joinLabel = f.joinType === 'inner' ? 'inner join' : 'outer join';
            return `${f.attribute} (${joinLabel}${f.joinField ? ` via ${f.joinField}` : ''})`;
          }
          const parts = [f.attribute, f.operator];
          if (f.value) parts.push(f.value);
          if (f.filterType === 'or') parts.unshift('OR');
          return parts.join(' ');
        }).join('\n')
      : 'None';

    const rows: InlineNode[][][] = [
      [ct('Type'),        ct(view.type)],
      [ct('Default'),     ct(view.isDefault ? 'Yes' : 'No')],
      [ct('Quick Find'),  ct(view.isQuickFind ? 'Yes' : 'No')],
      [ct('Columns'),     [c(colsSummary)]],
      [ct('Filters'),     ct(filtersSummary)],
    ];
    if (view.description) rows.splice(3, 0, [ct('Description'), ct(view.description)]);

    nodes.push(table(['Property', 'Value'], rows));
  }

  return nodes;
}

// -----------------------------------------------
// Forms subpage
// -----------------------------------------------

export function renderTableForms(table_: TableModel, config: DocGenConfig): DocNode[] {
  const nodes: DocNode[] = [];
  const formLayout = config.render.formLayout;

  nodes.push(h(1, `${table_.displayName} — Forms`));

  if (table_.forms.length === 0) {
    nodes.push(pt('No forms found.'));
    return nodes;
  }

  nodes.push(table(
    ['Form Name', 'Type', 'Tab Count', 'Total Fields'],
    table_.forms.map(f => [
      ct(f.name),
      ct(f.type),
      ct(f.tabs.length.toString()),
      ct(f.tabs.reduce((acc, t_) => acc + t_.sections.reduce((s, sec) => s + sec.columns.length, 0), 0).toString()),
    ])
  ));

  if (formLayout === 'detailed') {
    for (const form of table_.forms) {
      nodes.push(h(2, `${form.name} (${form.type})`));
      for (const tab of form.tabs) {
        nodes.push(h(3, tab.label));
        for (const section of tab.sections) {
          nodes.push(p(b(section.label)));
          if (section.columns.length === 0) {
            nodes.push(pt('No fields in this section.'));
          } else {
            nodes.push(bulletList(section.columns.map(col => bullet(0, c(col)))));
          }
        }
      }
    }
  }

  return nodes;
}

// -----------------------------------------------
// Relationships subpage
// -----------------------------------------------

export function renderTableRelationships(table_: TableModel): DocNode[] {
  const nodes: DocNode[] = [];

  nodes.push(h(1, `${table_.displayName} — Relationships`));

  if (table_.relationships.length === 0) {
    nodes.push(pt('No relationships found.'));
    return nodes;
  }

  function relRows(relationships: RelationshipModel[]): InlineNode[][][] {
    return relationships.map(rel => {
      const isParent   = rel.referencedEntity.toLowerCase() === table_.logicalName.toLowerCase();
      const direction  = isParent ? 'One (this) → Many' : 'Many → One (this)';
      const otherTable = isParent ? rel.referencingEntity : rel.referencedEntity;
      return [
        ct(rel.name),
        ct(direction),
        ct(otherTable),
        cc(rel.referencingAttribute),
        ct(rel.description || ''),
      ];
    });
  }

  const customRels   = table_.relationships.filter(r =>  r.isCustom);
  const standardRels = table_.relationships.filter(r => !r.isCustom);
  const relHeaders   = ['Relationship Name', 'Direction', 'Related Table', 'Lookup Field', 'Description'];

  if (customRels.length > 0) {
    nodes.push(h(2, 'Custom Relationships'));
    nodes.push(table(relHeaders, relRows(customRels)));
  }

  if (standardRels.length > 0) {
    nodes.push(h(2, 'Standard Relationships'));
    nodes.push(table(relHeaders, relRows(standardRels)));
  }

  return nodes;
}

// -----------------------------------------------
// Business Rules — index page
// -----------------------------------------------

export function renderTableBusinessRules(
  table_: TableModel,
  rules: BusinessRuleModel[]
): DocNode[] {
  const nodes: DocNode[] = [];

  nodes.push(h(1, `${table_.displayName} — Business Rules`));

  if (rules.length === 0) {
    nodes.push(pt('No business rules found for this table.'));
    return nodes;
  }

  nodes.push(table(
    ['Rule', 'Status', 'Scope'],
    rules.map(r => {
      const scopeLabel =
        r.scope === 'specificForm' ? 'Specific Form' :
        r.scope === 'allForms'     ? 'All Forms'     : 'Entity';
      return [ct(r.name), ct(r.status === 'active' ? 'Active' : 'Inactive'), ct(scopeLabel)];
    })
  ));

  nodes.push(toc());

  return nodes;
}

// -----------------------------------------------
// Business Rules — individual rule page
// -----------------------------------------------

const ACTION_LABELS: Record<string, string> = {
  show:           'Show',
  hide:           'Hide',
  setRequired:    'Set Required',
  setRecommended: 'Set Recommended',
  setOptional:    'Set Optional',
  setValue:       'Set Value',
  clearValue:     'Clear',
};

function actionBullets(actions: BusinessRuleModel['conditions'][0]['thenActions']): DocNode {
  const groups = new Map<string, string[]>();
  for (const a of actions) {
    if (!groups.has(a.type)) groups.set(a.type, []);
    groups.get(a.type)!.push(a.field);
  }
  return bulletList([...groups.entries()].map(([type, fields]) => {
    const label = ACTION_LABELS[type] ?? type;
    const inlines: InlineNode[] = [b(label + ':'), t(' ')];
    fields.forEach((field, idx) => {
      inlines.push(c(field));
      if (idx < fields.length - 1) inlines.push(t(', '));
    });
    return bullet(0, ...inlines);
  }));
}

export function renderSingleBusinessRule(rule: BusinessRuleModel): DocNode[] {
  const nodes: DocNode[] = [];

  nodes.push(h(1, rule.name));
  const scopeLabel =
    rule.scope === 'specificForm' ? 'Specific Form' :
    rule.scope === 'allForms'     ? 'All Forms'     : 'Entity (Server-side)';

  nodes.push(table(
    ['Property', 'Value'],
    [
      [ct('Status'), ct(rule.status === 'active' ? 'Active' : 'Inactive')],
      [ct('Entity'), cc(rule.entity)],
      [ct('Scope'),  ct(scopeLabel)],
    ]
  ));

  if (rule.conditions.length === 0) {
    nodes.push(pt('No conditions extracted.'));
    return nodes;
  }

  for (let i_ = 0; i_ < rule.conditions.length; i_++) {
    const cond  = rule.conditions[i_];
    const label = cond.description ?? `Condition ${i_ + 1}`;

    nodes.push(p(b('If'), t(' '), c(cond.conditionField), t(` — ${label}`)));
    nodes.push(actionBullets(cond.thenActions));

    if (cond.elseActions.length > 0) {
      nodes.push(p(b('Else')));
      nodes.push(actionBullets(cond.elseActions));
    }
  }

  return nodes;
}

// -----------------------------------------------
// Legacy combined renderer (local file output)
// -----------------------------------------------

export function renderTableMarkdown(table_: TableModel, config: DocGenConfig): string {
  const sections: DocNode[][] = [
    renderTableIndex(table_).filter(n => n.type !== 'toc_placeholder'),
    renderTableColumns(table_),
  ];

  if (config.components.views && table_.views.length > 0) {
    sections.push(renderTableViews(table_));
  }
  if (config.components.forms && table_.forms.length > 0) {
    sections.push(renderTableForms(table_, config));
  }
  if (config.components.relationships && table_.relationships.length > 0) {
    sections.push(renderTableRelationships(table_));
  }

  return sections.map(s => serialize(s).trimEnd()).join('\n\n');
}

export function writeTableMarkdown(table_: TableModel, outputDir: string, config: DocGenConfig): void {
  fs.mkdirSync(outputDir, { recursive: true });
  const filename = `${table_.logicalName}.md`;
  const filepath = path.join(outputDir, filename);
  const content  = renderTableMarkdown(table_, config).replace(/\r\n/g, '\n');
  fs.writeFileSync(filepath, content, 'utf-8');
  console.log(`Written: ${filepath}`);
}
