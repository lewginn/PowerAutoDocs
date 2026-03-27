import type { BusinessRuleModel, BusinessRuleAction, BusinessRuleCondition } from '../ir/businessRule.js';

function markdownTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => (r[i] ?? '').length), 3)
  );
  const pad = (s: string, w: number) => s + ' '.repeat(w - s.length);
  const sep = widths.map(w => '-'.repeat(w));
  const fmt = (row: string[]) =>
    '| ' + row.map((c, i) => pad(c ?? '', widths[i])).join(' | ') + ' |';
  return [fmt(headers), fmt(sep), ...rows.map(fmt)].join('\n');
}

// -----------------------------------------------
// Action group rendering
// Groups actions by type and renders as compact lines
// e.g. "**Show:** `field1`, `field2`"
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

function renderActionGroup(actions: BusinessRuleAction[]): string {
  if (actions.length === 0) return '_No actions._';

  // Group by type
  const groups = new Map<string, string[]>();
  for (const action of actions) {
    if (!groups.has(action.type)) groups.set(action.type, []);
    groups.get(action.type)!.push(`\`${action.field}\``);
  }

  return [...groups.entries()]
    .map(([type, fields]) => `${ACTION_LABELS[type] ?? type}: ${fields.join(', ')}`)
    .join('  \n');
}

// -----------------------------------------------
// Single condition block
// -----------------------------------------------

function renderCondition(cond: BusinessRuleCondition, index: number): string {
  const lines: string[] = [];

  const label = cond.description
    ? `${cond.description}`
    : `Condition ${index + 1}`;

  lines.push(`### If \`${cond.conditionField}\` — ${label}`);
  lines.push('');
  lines.push(renderActionGroup(cond.thenActions));

  if (cond.elseActions.length > 0) {
    lines.push('');
    lines.push('**Else**');
    lines.push('');
    lines.push(renderActionGroup(cond.elseActions));
  }

  return lines.join('\n');
}

// -----------------------------------------------
// Single business rule detail page
// -----------------------------------------------

export function renderBusinessRuleMarkdown(rule: BusinessRuleModel): string {
  const lines: string[] = [];

  lines.push(`# ${rule.name}`);
  lines.push('');

  const scopeLabel =
    rule.scope === 'specificForm' ? 'Specific Form' :
    rule.scope === 'allForms'     ? 'All Forms' : 'Entity';

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
  } else {
    lines.push('## Logic');
    lines.push('');
    for (let i = 0; i < rule.conditions.length; i++) {
      lines.push(renderCondition(rule.conditions[i], i));
      lines.push('');
    }
  }

  return lines.join('\n');
}

// -----------------------------------------------
// Summary index page for /Automation/Business Rules
// -----------------------------------------------

export function renderBusinessRulesOverview(rules: BusinessRuleModel[]): string {
  if (rules.length === 0) return '_No business rules found._';

  const lines: string[] = [];
  lines.push(markdownTable(
    ['Rule', 'Entity', 'Scope', 'Conditions'],
    rules.map(r => {
      const scopeLabel =
        r.scope === 'specificForm' ? 'Specific Form' :
        r.scope === 'allForms'     ? 'All Forms' : 'Entity';

      // Summarise what each condition does
      const summary = r.conditions.map(c => {
        const label = c.description ?? `\`${c.conditionField}\``;
        const actionTypes = [...new Set(c.thenActions.map(a => a.type))];
        const hasShow = actionTypes.includes('show') || actionTypes.includes('hide');
        const hasReq  = actionTypes.some(t => t.startsWith('set'));
        const hasClear = actionTypes.includes('clearValue');
        const tags: string[] = [];
        if (hasShow)  tags.push('visibility');
        if (hasReq)   tags.push('required');
        if (hasClear) tags.push('clear');
        return `${label} (${tags.join(', ') || 'actions'})`;
      }).join('; ');

      return [r.name, `\`${r.entity}\``, scopeLabel, summary || '—'];
    })
  ));

  return lines.join('\n');
}