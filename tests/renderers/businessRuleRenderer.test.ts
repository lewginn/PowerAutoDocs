import { describe, it, expect } from 'vitest';
import {
  renderBusinessRule,
  renderBusinessRulesOverview,
} from '../../src/renderers/businessRuleRenderer.js';
import type { DocNode, InlineNode, ParagraphNode, TableNode } from '../../src/docmodel/nodes.js';
import type { BusinessRuleCondition } from '../../src/ir/businessRule.js';
import { aBusinessRule } from '../fixtures/ir.js';

// Note: tableRenderer.ts has its own business-rule renderers (renderTableBusinessRules,
// renderSingleBusinessRule) covered in tableRenderer.test.ts. This file covers only
// businessRuleRenderer.ts, which formats the same IR differently — paragraphs rather
// than bullet lists, and a terser scope label.

const firstTable = (nodes: DocNode[]): TableNode => {
  const tbl = nodes.find(n => n.type === 'table') as TableNode | undefined;
  if (!tbl) throw new Error('expected a table node');
  return tbl;
};

/** Look up a Property/Value row by its label. */
const propValue = (tbl: TableNode, label: string): InlineNode[] | undefined =>
  tbl.rows.find(r => (r[0][0] as { value: string }).value === label)?.[1];

const headings = (nodes: DocNode[]): string[] =>
  nodes.filter(n => n.type === 'heading').map(n => (n as { text: string }).text);

const paragraphs = (nodes: DocNode[]): ParagraphNode[] =>
  nodes.filter(n => n.type === 'paragraph') as ParagraphNode[];

const aCondition = (over: Partial<BusinessRuleCondition> = {}): BusinessRuleCondition => ({
  conditionField: 'acme_tier',
  description: 'Tier is Premium',
  thenActions: [{ type: 'setRequired', field: 'acme_serial' }],
  elseActions: [],
  ...over,
});

describe('renderBusinessRule', () => {
  it('leads with the rule name as a level-1 heading', () => {
    const nodes = renderBusinessRule(aBusinessRule({ name: 'Require Serial' }));
    expect(nodes[0]).toEqual({ type: 'heading', level: 1, text: 'Require Serial' });
  });

  it('includes the AI summary block only when a summary exists', () => {
    const withSummary = renderBusinessRule(aBusinessRule({ aiSummary: 'Requires a serial.' }));
    expect(withSummary[1]).toEqual({ type: 'heading', level: 2, text: 'Summary' });
    expect(withSummary[2]).toEqual({ type: 'blockquote', inlines: [{ type: 'text', value: 'Requires a serial.' }] });

    expect(headings(renderBusinessRule(aBusinessRule({ aiSummary: undefined })))).not.toContain('Summary');
  });

  it('lists status, entity and scope as its properties', () => {
    const tbl = firstTable(renderBusinessRule(aBusinessRule()));
    expect(tbl.headers).toEqual(['Property', 'Value']);
    expect(tbl.rows.map(r => (r[0][0] as { value: string }).value)).toEqual(['Status', 'Entity', 'Scope']);
  });

  it('reports status as a word rather than a raw enum', () => {
    const active = firstTable(renderBusinessRule(aBusinessRule({ status: 'active' })));
    expect(propValue(active, 'Status')).toEqual([{ type: 'text', value: 'Active' }]);

    const inactive = firstTable(renderBusinessRule(aBusinessRule({ status: 'inactive' })));
    expect(propValue(inactive, 'Status')).toEqual([{ type: 'text', value: 'Inactive' }]);
  });

  it('renders the entity as a code span, since it is a logical name', () => {
    const tbl = firstTable(renderBusinessRule(aBusinessRule({ entity: 'acme_widget' })));
    expect(propValue(tbl, 'Entity')).toEqual([{ type: 'code', value: 'acme_widget' }]);
  });

  it('humanises every scope value', () => {
    const scopeOf = (scope: 'specificForm' | 'allForms' | 'entity') =>
      propValue(firstTable(renderBusinessRule(aBusinessRule({ scope }))), 'Scope');

    expect(scopeOf('specificForm')).toEqual([{ type: 'text', value: 'Specific Form' }]);
    expect(scopeOf('allForms')).toEqual([{ type: 'text', value: 'All Forms' }]);
    // Note: tableRenderer's detail page says "Entity (Server-side)" for this same
    // value — this renderer uses the bare label.
    expect(scopeOf('entity')).toEqual([{ type: 'text', value: 'Entity' }]);
  });

  it('notes when no conditions could be extracted, and skips the Logic section', () => {
    // An empty Logic section would read as "this rule does nothing"; it actually
    // means parsing came up short, which is a different problem.
    const nodes = renderBusinessRule(aBusinessRule({ conditions: [] }));
    expect(headings(nodes)).not.toContain('Logic');
    expect(nodes).toContainEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: 'No conditions extracted.' }],
    });
  });

  it('gives each condition its own level-3 heading under a single Logic heading', () => {
    const nodes = renderBusinessRule(aBusinessRule({
      conditions: [aCondition({ description: 'First' }), aCondition({ description: 'Second' })],
    }));
    expect(headings(nodes).filter(t => t === 'Logic')).toHaveLength(1);
    const condHeadings = nodes.filter(n => n.type === 'heading' && n.level === 3);
    expect(condHeadings).toHaveLength(2);
  });

  it('falls back to a 1-based ordinal when a condition has no description', () => {
    const nodes = renderBusinessRule(aBusinessRule({
      conditions: [aCondition({ description: undefined }), aCondition({ description: undefined })],
    }));
    const condHeadings = nodes.filter(n => n.type === 'heading' && n.level === 3).map(n => (n as { text: string }).text);
    expect(condHeadings).toEqual(['If acme_tier — Condition 1', 'If acme_tier — Condition 2']);
  });

  it('prefers the parsed description over the ordinal when one exists', () => {
    const nodes = renderBusinessRule(aBusinessRule({
      conditions: [aCondition({ conditionField: 'acme_tier', description: 'Tier is Premium' })],
    }));
    const condHeading = nodes.find(n => n.type === 'heading' && n.level === 3) as { text: string };
    expect(condHeading.text).toBe('If acme_tier — Tier is Premium');
  });

  it('treats an empty description string as missing', () => {
    // The parser can yield '' when the Description key is present but blank; an
    // empty label would render as a dangling em dash.
    const nodes = renderBusinessRule(aBusinessRule({
      conditions: [aCondition({ description: '' })],
    }));
    const condHeading = nodes.find(n => n.type === 'heading' && n.level === 3) as { text: string };
    expect(condHeading.text).toBe('If acme_tier — Condition 1');
  });

  it('groups multiple fields sharing an action type into one paragraph', () => {
    const nodes = renderBusinessRule(aBusinessRule({
      conditions: [aCondition({
        thenActions: [
          { type: 'setRequired', field: 'acme_serial' },
          { type: 'setRequired', field: 'acme_warranty' },
          { type: 'hide', field: 'acme_note' },
        ],
      })],
    }));
    const actionParas = paragraphs(nodes);
    expect(actionParas).toHaveLength(2);
    expect(actionParas[0].inlines).toEqual([
      { type: 'bold', value: 'Set Required:' },
      { type: 'text', value: ' ' },
      { type: 'code', value: 'acme_serial' },
      { type: 'text', value: ', ' },
      { type: 'code', value: 'acme_warranty' },
    ]);
    expect(actionParas[1].inlines[0]).toEqual({ type: 'bold', value: 'Hide:' });
  });

  it('keeps action groups in first-seen order, not action order', () => {
    // Grouping is by Map insertion, so a type reappearing later folds back into
    // its original group rather than starting a second one.
    const nodes = renderBusinessRule(aBusinessRule({
      conditions: [aCondition({
        thenActions: [
          { type: 'hide', field: 'a' },
          { type: 'show', field: 'b' },
          { type: 'hide', field: 'c' },
        ],
      })],
    }));
    const actionParas = paragraphs(nodes);
    expect(actionParas).toHaveLength(2);
    expect(actionParas[0].inlines).toEqual([
      { type: 'bold', value: 'Hide:' },
      { type: 'text', value: ' ' },
      { type: 'code', value: 'a' },
      { type: 'text', value: ', ' },
      { type: 'code', value: 'c' },
    ]);
    expect(actionParas[1].inlines[0]).toEqual({ type: 'bold', value: 'Show:' });
  });

  it('maps every action type to a human label', () => {
    const labelFor = (type: string) => {
      const nodes = renderBusinessRule(aBusinessRule({
        conditions: [aCondition({ thenActions: [{ type: type as never, field: 'acme_serial' }] })],
      }));
      return (paragraphs(nodes)[0].inlines[0] as { value: string }).value;
    };

    expect(labelFor('show')).toBe('Show:');
    expect(labelFor('hide')).toBe('Hide:');
    expect(labelFor('setRequired')).toBe('Set Required:');
    expect(labelFor('setRecommended')).toBe('Set Recommended:');
    expect(labelFor('setOptional')).toBe('Set Optional:');
    expect(labelFor('setValue')).toBe('Set Value:');
    expect(labelFor('clearValue')).toBe('Clear:');
  });

  it('falls back to the raw type when the label table has no entry', () => {
    // Guards against a new BusinessRuleActionType silently rendering as blank if
    // ACTION_LABELS is not updated alongside it.
    const nodes = renderBusinessRule(aBusinessRule({
      conditions: [aCondition({ thenActions: [{ type: 'lockField' as never, field: 'acme_serial' }] })],
    }));
    expect(paragraphs(nodes)[0].inlines[0]).toEqual({ type: 'bold', value: 'lockField:' });
  });

  it('says a condition has no actions rather than emitting nothing under its heading', () => {
    const nodes = renderBusinessRule(aBusinessRule({
      conditions: [aCondition({ thenActions: [], elseActions: [] })],
    }));
    expect(nodes).toContainEqual({ type: 'paragraph', inlines: [{ type: 'text', value: 'No actions.' }] });
  });

  it('renders the Else branch only when there are else actions', () => {
    const withElse = renderBusinessRule(aBusinessRule({
      conditions: [aCondition({ elseActions: [{ type: 'setOptional', field: 'acme_serial' }] })],
    }));
    const elseParas = paragraphs(withElse);
    expect(elseParas.map(p => p.inlines[0])).toContainEqual({ type: 'bold', value: 'Else' });
    // The Else marker is its own paragraph, followed by that branch's groups.
    const elseIdx = elseParas.findIndex(p => p.inlines[0]?.type === 'bold' && p.inlines[0].value === 'Else');
    expect(elseParas[elseIdx + 1].inlines[0]).toEqual({ type: 'bold', value: 'Set Optional:' });

    const noElse = renderBusinessRule(aBusinessRule({ conditions: [aCondition({ elseActions: [] })] }));
    expect(paragraphs(noElse).map(p => p.inlines[0]))
      .not.toContainEqual({ type: 'bold', value: 'Else' });
  });

  it('emits no code fences anywhere in the page', () => {
    // constraints.md: renderers return DocNode[] only — fences belong to the
    // serializer that owns the format.
    const nodes = renderBusinessRule(aBusinessRule({
      aiSummary: 'Requires a serial.',
      conditions: [aCondition({ elseActions: [{ type: 'setOptional', field: 'acme_serial' }] })],
    }));
    expect(JSON.stringify(nodes)).not.toContain('```');
  });
});

describe('renderBusinessRulesOverview', () => {
  it('renders a placeholder instead of an empty table when there are no rules', () => {
    expect(renderBusinessRulesOverview([])).toEqual([
      { type: 'paragraph', inlines: [{ type: 'text', value: 'No business rules found.' }] },
    ]);
  });

  it('puts one row per rule under the expected headers', () => {
    const tbl = firstTable(renderBusinessRulesOverview([aBusinessRule({ name: 'A' }), aBusinessRule({ name: 'B' })]));
    expect(tbl.headers).toEqual(['Rule', 'Entity', 'Scope', 'Conditions']);
    expect(tbl.rows).toHaveLength(2);
  });

  it('never links the rule name — this overview takes no basePath', () => {
    const tbl = firstTable(renderBusinessRulesOverview([aBusinessRule({ name: 'Require Serial' })]));
    expect(tbl.rows[0][0]).toEqual([{ type: 'text', value: 'Require Serial' }]);
    expect(tbl.rows[0][1]).toEqual([{ type: 'code', value: 'acme_widget' }]);
  });

  it('humanises every scope value', () => {
    const tbl = firstTable(renderBusinessRulesOverview([
      aBusinessRule({ scope: 'specificForm' }),
      aBusinessRule({ scope: 'allForms' }),
      aBusinessRule({ scope: 'entity' }),
    ]));
    expect(tbl.rows.map(r => (r[2][0] as { value: string }).value))
      .toEqual(['Specific Form', 'All Forms', 'Entity']);
  });

  it('tags a condition by the kind of actions it takes', () => {
    const summaryOf = (thenActions: BusinessRuleCondition['thenActions']) => {
      const tbl = firstTable(renderBusinessRulesOverview([
        aBusinessRule({ conditions: [aCondition({ description: 'C', thenActions })] }),
      ]));
      return (tbl.rows[0][3][0] as { value: string }).value;
    };

    expect(summaryOf([{ type: 'show', field: 'a' }])).toBe('C (visibility)');
    expect(summaryOf([{ type: 'hide', field: 'a' }])).toBe('C (visibility)');
    expect(summaryOf([{ type: 'setRequired', field: 'a' }])).toBe('C (required)');
    expect(summaryOf([{ type: 'clearValue', field: 'a' }])).toBe('C (clear)');
  });

  it('lists every tag a condition earns, in visibility/required/clear order', () => {
    const tbl = firstTable(renderBusinessRulesOverview([
      aBusinessRule({
        conditions: [aCondition({
          description: 'C',
          thenActions: [
            { type: 'clearValue', field: 'a' },
            { type: 'setValue', field: 'b' },
            { type: 'hide', field: 'c' },
          ],
        })],
      }),
    ]));
    expect((tbl.rows[0][3][0] as { value: string }).value).toBe('C (visibility, required, clear)');
  });

  it('falls back to a generic tag when no action type matches a known bucket', () => {
    const tbl = firstTable(renderBusinessRulesOverview([
      aBusinessRule({ conditions: [aCondition({ description: 'C', thenActions: [{ type: 'lockField' as never, field: 'a' }] })] }),
    ]));
    expect((tbl.rows[0][3][0] as { value: string }).value).toBe('C (actions)');
  });

  it('ignores else actions when tagging — the summary describes the then branch', () => {
    const tbl = firstTable(renderBusinessRulesOverview([
      aBusinessRule({
        conditions: [aCondition({
          description: 'C',
          thenActions: [{ type: 'show', field: 'a' }],
          elseActions: [{ type: 'clearValue', field: 'a' }],
        })],
      }),
    ]));
    expect((tbl.rows[0][3][0] as { value: string }).value).toBe('C (visibility)');
  });

  it('semicolon-separates multiple conditions in one cell', () => {
    const tbl = firstTable(renderBusinessRulesOverview([
      aBusinessRule({
        conditions: [
          aCondition({ description: 'First', thenActions: [{ type: 'show', field: 'a' }] }),
          aCondition({ description: 'Second', thenActions: [{ type: 'clearValue', field: 'b' }] }),
        ],
      }),
    ]));
    expect((tbl.rows[0][3][0] as { value: string }).value).toBe('First (visibility); Second (clear)');
  });

  it('shows an em dash rather than a blank cell when a rule has no conditions', () => {
    const tbl = firstTable(renderBusinessRulesOverview([aBusinessRule({ conditions: [] })]));
    expect(tbl.rows[0][3]).toEqual([{ type: 'text', value: '—' }]);
  });
});
