// renderers/tableRenderer.ts

import * as fs from 'fs';
import * as path from 'path';
import type { TableModel, ColumnModel, RelationshipModel } from '../ir/index.js';
import type { DocGenConfig } from '../config/index.js';
import type { BusinessRuleModel } from '../ir/businessRule.js';

// -----------------------------------------------
// Shared helpers
// -----------------------------------------------

function pad(str: string, length: number): string {
  return str.padEnd(length, ' ');
}

function markdownTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => (r[i] ?? '').length))
  );
  const header  = '| ' + headers.map((h, i) => pad(h, widths[i])).join(' | ') + ' |';
  const divider = '| ' + widths.map(w => '-'.repeat(w)).join(' | ') + ' |';
  const body    = rows.map(
    row => '| ' + row.map((cell, i) => pad(cell ?? '', widths[i])).join(' | ') + ' |'
  );
  return [header, divider, ...body].join('\n');
}

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
// Index page — summary + [[_TOSP_]]
// -----------------------------------------------

export function renderTableIndexMarkdown(table: TableModel): string {
  const lines: string[] = [];

  lines.push(`# ${table.displayName}`);
  lines.push('');

  lines.push(markdownTable(
    ['Property', 'Value'],
    [
      ['Logical Name',  `\`${table.logicalName}\``],
      ['Display Name',  table.displayName],
      ...(table.pluralDisplayName ? [['Plural Name', table.pluralDisplayName]] : []),
      ['Type',          table.isCustom ? 'Custom Table' : 'Standard Table (Extended)'],
      ['Activity Table', table.isActivity ? 'Yes' : 'No'],
      ...(table.description ? [['Description', table.description]] : []),
    ] as string[][]
  ));
  lines.push('');

  if (table.aiSummary) {
    lines.push('## Summary');
    lines.push('');
    lines.push(table.aiSummary);
    lines.push('');
  }

  lines.push('[[_TOSP_]]');
  lines.push('');

  return lines.join('\n');
}

// -----------------------------------------------
// Columns subpage
// -----------------------------------------------

function renderColumnTable(columns: ColumnModel[]): string {
  const rows = columns.map(col => [
    col.displayName,
    `\`${col.logicalName}\``,
    friendlyType(col),
    col.isRequired ? 'Yes' : 'No',
    col.description || '',
  ]);
  return markdownTable(
    ['Display Name', 'Logical Name', 'Type', 'Required', 'Description'],
    rows
  );
}

export function renderTableColumnsMarkdown(table: TableModel): string {
  const lines: string[] = [];

  lines.push(`# ${table.displayName} — Columns`);
  lines.push('');

  if (table.columns.length === 0) {
    lines.push('_No columns found in solution for this table._');
    return lines.join('\n');
  }

  const customCols   = table.columns.filter(c =>  c.isCustom);
  const standardCols = table.columns.filter(c => !c.isCustom);

  if (customCols.length > 0) {
    lines.push('## Custom Columns');
    lines.push('');
    lines.push(renderColumnTable(customCols));
    lines.push('');
  }

  if (standardCols.length > 0) {
    lines.push('## Standard Columns');
    lines.push('');
    lines.push(renderColumnTable(standardCols));
    lines.push('');
  }

  return lines.join('\n');
}

// -----------------------------------------------
// Views subpage
// -----------------------------------------------

export function renderTableViewsMarkdown(table: TableModel): string {
  const lines: string[] = [];

  lines.push(`# ${table.displayName} — Views`);
  lines.push('');

  if (table.views.length === 0) {
    lines.push('_No views found._');
    return lines.join('\n');
  }

  const viewRows = table.views.map(v => [
    v.name,
    v.type,
    v.isDefault ? 'Yes' : 'No',
    v.columns.length.toString(),
    v.description || '',
  ]);
  lines.push(markdownTable(
    ['View Name', 'Type', 'Default', 'Column Count', 'Description'],
    viewRows
  ));
  lines.push('');

  for (const view of table.views) {
    lines.push(`## ${view.name}`);
    lines.push('');
    lines.push(`**Type:** ${view.type}`);
    if (view.description) lines.push(`**Notes:** ${view.description}`);
    lines.push('');

    if (view.filters.length > 0) {
      lines.push('**Filters:**');
      lines.push('');
      for (const f of view.filters) {
        const indent = '  '.repeat(f.depth);
        const value  = f.value ? ` \`${f.value}\`` : '';
        if (f.isJoin) {
          const joinLabel = f.joinType === 'inner' ? 'inner join' : 'outer join';
          const field     = f.joinField ? ` via \`${f.joinField}\`` : '';
          lines.push(`${indent}- **${f.attribute}**${field} — ${joinLabel}`);
        } else {
          const groupPrefix = f.filterType === 'or' ? '*(or)* ' : '';
          lines.push(`${indent}- ${groupPrefix}\`${f.attribute}\` ${f.operator}${value}`);
        }
      }
      lines.push('');
    }

    if (view.columns.length === 0) {
      lines.push('**Columns:** _none_');
    } else {
      lines.push('**Columns:** ' + view.columns.map(c => `\`${c}\``).join(', '));
    }
    lines.push('');
  }

  return lines.join('\n');
}

// -----------------------------------------------
// Forms subpage
// -----------------------------------------------

export function renderTableFormsMarkdown(table: TableModel, config: DocGenConfig): string {
  const lines: string[] = [];
  const formLayout = config.render.formLayout;

  lines.push(`# ${table.displayName} — Forms`);
  lines.push('');

  if (table.forms.length === 0) {
    lines.push('_No forms found._');
    return lines.join('\n');
  }

  const formRows = table.forms.map(f => [
    f.name,
    f.type,
    f.tabs.length.toString(),
    f.tabs.reduce((acc, t) => acc + t.sections.reduce((s, sec) => s + sec.columns.length, 0), 0).toString(),
  ]);
  lines.push(markdownTable(
    ['Form Name', 'Type', 'Tab Count', 'Total Fields'],
    formRows
  ));
  lines.push('');

  if (formLayout === 'detailed') {
    for (const form of table.forms) {
      lines.push(`## ${form.name} (${form.type})`);
      lines.push('');
      for (const tab of form.tabs) {
        lines.push(`### ${tab.label}`);
        lines.push('');
        for (const section of tab.sections) {
          lines.push(`**${section.label}**`);
          lines.push('');
          if (section.columns.length === 0) {
            lines.push('_No fields in this section._');
          } else {
            lines.push(section.columns.map(c => `- \`${c}\``).join('\n'));
          }
          lines.push('');
        }
      }
    }
  }

  return lines.join('\n');
}

// -----------------------------------------------
// Relationships subpage
// -----------------------------------------------

function renderRelationshipTable(relationships: RelationshipModel[], currentTable: string): string {
  const rows = relationships.map(rel => {
    const isParent  = rel.referencedEntity.toLowerCase() === currentTable.toLowerCase();
    const direction = isParent ? 'One (this) → Many' : 'Many → One (this)';
    const otherTable = isParent ? rel.referencingEntity : rel.referencedEntity;
    return [
      rel.name,
      direction,
      otherTable,
      `\`${rel.referencingAttribute}\``,
      rel.description || '',
    ];
  });
  return markdownTable(
    ['Relationship Name', 'Direction', 'Related Table', 'Lookup Field', 'Description'],
    rows
  );
}

export function renderTableRelationshipsMarkdown(table: TableModel): string {
  const lines: string[] = [];

  lines.push(`# ${table.displayName} — Relationships`);
  lines.push('');

  if (table.relationships.length === 0) {
    lines.push('_No relationships found._');
    return lines.join('\n');
  }

  const customRels   = table.relationships.filter(r =>  r.isCustom);
  const standardRels = table.relationships.filter(r => !r.isCustom);

  if (customRels.length > 0) {
    lines.push('## Custom Relationships');
    lines.push('');
    lines.push(renderRelationshipTable(customRels, table.logicalName));
    lines.push('');
  }

  if (standardRels.length > 0) {
    lines.push('## Standard Relationships');
    lines.push('');
    lines.push(renderRelationshipTable(standardRels, table.logicalName));
    lines.push('');
  }

  return lines.join('\n');
}

// -----------------------------------------------
// Business Rules — index page (summary + [[_TOSP_]])
// -----------------------------------------------

export function renderTableBusinessRulesMarkdown(
  table: TableModel,
  rules: BusinessRuleModel[]
): string {
  const lines: string[] = [];

  lines.push(`# ${table.displayName} — Business Rules`);
  lines.push('');

  if (rules.length === 0) {
    lines.push('_No business rules found for this table._');
    return lines.join('\n');
  }

  const rows = rules.map(r => {
    const scopeLabel =
      r.scope === 'specificForm' ? 'Specific Form' :
      r.scope === 'allForms'     ? 'All Forms'     : 'Entity';
    return [r.name, r.status === 'active' ? 'Active' : 'Inactive', scopeLabel];
  });

  lines.push(markdownTable(['Rule', 'Status', 'Scope'], rows));
  lines.push('');
  lines.push('[[_TOSP_]]');
  lines.push('');

  return lines.join('\n');
}

// -----------------------------------------------
// Business Rules — individual rule page
// -----------------------------------------------

const ACTION_LABELS: Record<string, string> = {
  show:           '**Show**',
  hide:           '**Hide**',
  setRequired:    '**Set Required**',
  setRecommended: '**Set Recommended**',
  setOptional:    '**Set Optional**',
  setValue:       '**Set Value**',
  clearValue:     '**Clear**',
};

function renderActionGroup(actions: BusinessRuleModel['conditions'][0]['thenActions']): string {
  const groups = new Map<string, string[]>();
  for (const a of actions) {
    if (!groups.has(a.type)) groups.set(a.type, []);
    groups.get(a.type)!.push(`\`${a.field}\``);
  }
  return [...groups.entries()]
    .map(([type, fields]) => `${ACTION_LABELS[type] ?? type}: ${fields.join(', ')}`)
    .join('  \n');
}

export function renderSingleBusinessRuleMarkdown(rule: BusinessRuleModel): string {
  const lines: string[] = [];

  lines.push(`# ${rule.name}`);
  lines.push('');

  const scopeLabel =
    rule.scope === 'specificForm' ? 'Specific Form' :
    rule.scope === 'allForms'     ? 'All Forms'     : 'Entity (Server-side)';

  lines.push(markdownTable(
    ['Property', 'Value'],
    [
      ['Status', rule.status === 'active' ? 'Active' : 'Inactive'],
      ['Entity', `\`${rule.entity}\``],
      ['Scope',  scopeLabel],
    ]
  ));
  lines.push('');

  if (rule.conditions.length === 0) {
    lines.push('_No conditions extracted._');
    return lines.join('\n');
  }

  lines.push('## Logic');
  lines.push('');

  for (let i = 0; i < rule.conditions.length; i++) {
    const cond  = rule.conditions[i];
    const label = cond.description ?? `Condition ${i + 1}`;

    lines.push(`### If \`${cond.conditionField}\` — ${label}`);
    lines.push('');

    if (cond.thenActions.length > 0) {
      lines.push(renderActionGroup(cond.thenActions));
    }

    if (cond.elseActions.length > 0) {
      lines.push('');
      lines.push('**Else**');
      lines.push('');
      lines.push(renderActionGroup(cond.elseActions));
    }

    lines.push('');
  }

  return lines.join('\n');
}

// -----------------------------------------------
// Legacy single-file renderer (used by writeTableMarkdown for local output)
// -----------------------------------------------

export function renderTableMarkdown(table: TableModel, config: DocGenConfig): string {
  const sections: string[] = [
    renderTableIndexMarkdown(table).replace('[[_TOSP_]]', '').trim(),
    renderTableColumnsMarkdown(table),
  ];

  if (config.components.views && table.views.length > 0) {
    sections.push(renderTableViewsMarkdown(table));
  }
  if (config.components.forms && table.forms.length > 0) {
    sections.push(renderTableFormsMarkdown(table, config));
  }
  if (config.components.relationships && table.relationships.length > 0) {
    sections.push(renderTableRelationshipsMarkdown(table));
  }

  return sections.join('\n\n');
}

export function writeTableMarkdown(table: TableModel, outputDir: string, config: DocGenConfig): void {
  fs.mkdirSync(outputDir, { recursive: true });
  const filename = `${table.logicalName}.md`;
  const filepath = path.join(outputDir, filename);
  const content  = renderTableMarkdown(table, config).replace(/\r\n/g, '\n');
  fs.writeFileSync(filepath, content, 'utf-8');
  console.log(`Written: ${filepath}`);
}