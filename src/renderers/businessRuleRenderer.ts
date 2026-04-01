// renderers/businessRuleRenderer.ts

import type { BusinessRuleModel, BusinessRuleAction, BusinessRuleCondition } from '../ir/businessRule.js';
import type { DocNode, InlineNode } from '../docmodel/nodes.js';
import { h, pt, p, t, c, b, table, ct, cc, bulletList, bullet } from '../docmodel/nodes.js';

// -----------------------------------------------
// Action group — groups actions by type
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

function actionGroupNodes(actions: BusinessRuleAction[]): DocNode[] {
  if (actions.length === 0) return [pt('No actions.')];

  const groups = new Map<string, string[]>();
  for (const action of actions) {
    if (!groups.has(action.type)) groups.set(action.type, []);
    groups.get(action.type)!.push(action.field);
  }

  return [...groups.entries()].map(([type, fields]) => {
    const label = ACTION_LABELS[type] ?? type;
    const inlines: InlineNode[] = [b(label + ':'), t(' ')];
    fields.forEach((field, idx) => {
      inlines.push(c(field));
      if (idx < fields.length - 1) inlines.push(t(', '));
    });
    return p(...inlines);
  });
}

// -----------------------------------------------
// Single business rule detail page
// -----------------------------------------------

export function renderBusinessRule(rule: BusinessRuleModel): DocNode[] {
  const nodes: DocNode[] = [];

  nodes.push(h(1, rule.name));

  const scopeLabel =
    rule.scope === 'specificForm' ? 'Specific Form' :
    rule.scope === 'allForms'     ? 'All Forms' : 'Entity';

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
  } else {
    nodes.push(h(2, 'Logic'));
    for (let i = 0; i < rule.conditions.length; i++) {
      const cond  = rule.conditions[i];
      const label = cond.description ? cond.description : `Condition ${i + 1}`;

      nodes.push(h(3, `If \`${cond.conditionField}\` — ${label}`));
      nodes.push(...actionGroupNodes(cond.thenActions));

      if (cond.elseActions.length > 0) {
        nodes.push(p(b('Else')));
        nodes.push(...actionGroupNodes(cond.elseActions));
      }
    }
  }

  return nodes;
}

// -----------------------------------------------
// Summary index table
// -----------------------------------------------

export function renderBusinessRulesOverview(rules: BusinessRuleModel[]): DocNode[] {
  if (rules.length === 0) return [pt('No business rules found.')];

  return [table(
    ['Rule', 'Entity', 'Scope', 'Conditions'],
    rules.map(r => {
      const scopeLabel =
        r.scope === 'specificForm' ? 'Specific Form' :
        r.scope === 'allForms'     ? 'All Forms' : 'Entity';

      const summary = r.conditions.map(cond => {
        const label = cond.description ?? `\`${cond.conditionField}\``;
        const actionTypes = [...new Set(cond.thenActions.map(a => a.type))];
        const tags: string[] = [];
        if (actionTypes.includes('show') || actionTypes.includes('hide')) tags.push('visibility');
        if (actionTypes.some(t_ => t_.startsWith('set'))) tags.push('required');
        if (actionTypes.includes('clearValue')) tags.push('clear');
        return `${label} (${tags.join(', ') || 'actions'})`;
      }).join('; ');

      return [ct(r.name), cc(r.entity), ct(scopeLabel), ct(summary || '—')];
    })
  )];
}
