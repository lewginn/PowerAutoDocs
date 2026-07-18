import { describe, it, expect } from 'vitest';
import { renderFlowSummary, renderSingleFlow } from '../../src/renderers/flowRenderer.js';
import type { BulletListNode, DocNode, TableNode } from '../../src/docmodel/nodes.js';
import { aFlow, anAction, aTable, aTrigger } from '../fixtures/ir.js';

// Pull the bold lead inline off each bullet — that's the action name, and its
// order is the whole point of sortActionsByOrder.
const bulletNames = (nodes: DocNode[]): string[] => {
  const list = nodes.find(n => n.type === 'bullet_list') as BulletListNode | undefined;
  if (!list) throw new Error('expected a bullet_list node');
  return list.items.map(item => {
    const lead = item.inlines[0];
    if (lead.type !== 'bold') throw new Error('expected each bullet to lead with a bold action name');
    return lead.value;
  });
};

const firstTable = (nodes: DocNode[]): TableNode => {
  const tbl = nodes.find(n => n.type === 'table') as TableNode | undefined;
  if (!tbl) throw new Error('expected a table node');
  return tbl;
};

describe('renderFlowSummary', () => {
  it('renders a placeholder instead of an empty table when there are no flows', () => {
    const nodes = renderFlowSummary([]);
    expect(nodes.map(n => n.type)).toEqual(['heading', 'paragraph']);
    expect(nodes.some(n => n.type === 'table')).toBe(false);
  });

  it('puts one row per flow under the expected headers', () => {
    const nodes = renderFlowSummary([aFlow({ name: 'A' }), aFlow({ name: 'B' })]);
    const tbl = firstTable(nodes);
    expect(tbl.headers).toEqual(['Flow Name', 'Trigger Type', 'Entity', 'Actions', 'Status']);
    expect(tbl.rows).toHaveLength(2);
  });

  it('links the flow name only when a basePath is supplied', () => {
    const withBase = firstTable(renderFlowSummary([aFlow({ name: 'Ship It' })], '/Flows'));
    expect(withBase.rows[0][0]).toEqual([
      { type: 'link', text: 'Ship It', href: '/Flows/Ship It' },
    ]);

    // Without a basePath there is nowhere to point, so it stays plain text
    // rather than emitting a dangling link.
    const noBase = firstTable(renderFlowSummary([aFlow({ name: 'Ship It' })]));
    expect(noBase.rows[0][0]).toEqual([{ type: 'text', value: 'Ship It' }]);
  });

  it('spaces out a PascalCase trigger type so it wraps sensibly in a table cell', () => {
    const nodes = renderFlowSummary([aFlow({ trigger: aTrigger({ type: 'DataverseCreateOrUpdate' }) })]);
    expect(firstTable(nodes).rows[0][1]).toEqual([{ type: 'text', value: 'Dataverse Create Or Update' }]);
  });

  it('shows an em dash for a trigger with no entity', () => {
    const nodes = renderFlowSummary([aFlow({ trigger: aTrigger({ type: 'Scheduled', entity: undefined }) })]);
    expect(firstTable(nodes).rows[0][2]).toEqual([{ type: 'text', value: '—' }]);
  });

  it('reports active state as a word, not a boolean', () => {
    const active = firstTable(renderFlowSummary([aFlow({ isActive: true })]));
    const inactive = firstTable(renderFlowSummary([aFlow({ isActive: false })]));
    expect(active.rows[0][4]).toEqual([{ type: 'text', value: 'Active' }]);
    expect(inactive.rows[0][4]).toEqual([{ type: 'text', value: 'Inactive' }]);
  });
});

describe('renderSingleFlow', () => {
  it('leads with the flow name as a level-1 heading', () => {
    const nodes = renderSingleFlow(aFlow({ name: 'Create Part' }));
    expect(nodes[0]).toEqual({ type: 'heading', level: 1, text: 'Create Part' });
  });

  it('includes the AI summary block only when a summary exists', () => {
    const withSummary = renderSingleFlow(aFlow({ aiSummary: 'Creates a part.' }));
    expect(withSummary[1]).toEqual({ type: 'heading', level: 2, text: 'Summary' });

    const without = renderSingleFlow(aFlow({ aiSummary: undefined }));
    expect(without.some(n => n.type === 'heading' && n.text === 'Summary')).toBe(false);
  });

  it('omits the Connections row when the flow uses none', () => {
    const nodes = renderSingleFlow(aFlow({ connectionReferences: [] }));
    const labels = firstTable(nodes).rows.map(r => (r[0][0] as { value: string }).value);
    expect(labels).toEqual(['Status', 'Type']);
  });

  it('comma-separates multiple connection references as code spans', () => {
    const nodes = renderSingleFlow(aFlow({ connectionReferences: ['acme_dataverse', 'acme_office365'] }));
    const connRow = firstTable(nodes).rows.find(r => (r[0][0] as { value: string }).value === 'Connections');
    expect(connRow?.[1]).toEqual([
      { type: 'code', value: 'acme_dataverse' },
      { type: 'text', value: ', ' },
      { type: 'code', value: 'acme_office365' },
    ]);
  });

  it('states no actions rather than emitting an empty list', () => {
    const nodes = renderSingleFlow(aFlow({ actions: [] }));
    expect(nodes.some(n => n.type === 'bullet_list')).toBe(false);
    expect(nodes).toContainEqual({ type: 'paragraph', inlines: [{ type: 'text', value: 'No actions found.' }] });
  });

  it('renders the Tables Used section only when related tables are passed', () => {
    const bare = renderSingleFlow(aFlow());
    expect(bare.some(n => n.type === 'heading' && n.text === 'Tables Used')).toBe(false);

    const withTables = renderSingleFlow(aFlow(), [aTable({ displayName: 'Part' })], '/Tables');
    expect(withTables.some(n => n.type === 'heading' && n.text === 'Tables Used')).toBe(true);
  });

  it('emits the diagram as a mermaid node, never as a fenced string', () => {
    // This is the renderer/serializer boundary from constraints.md: fences belong
    // to the serializer that owns the format. A renderer that emitted "```mermaid"
    // here is what produced the double-fenced ERD bug.
    const nodes = renderSingleFlow(aFlow({ mermaidDiagram: 'graph TD;\n  A-->B;' }));
    const diagram = nodes.find(n => n.type === 'mermaid');
    expect(diagram).toEqual({ type: 'mermaid', code: 'graph TD;\n  A-->B;' });
    expect(JSON.stringify(nodes)).not.toContain('```');
  });

  it('omits the Diagram section entirely when no diagram was generated', () => {
    const nodes = renderSingleFlow(aFlow({ mermaidDiagram: undefined }));
    expect(nodes.some(n => n.type === 'heading' && n.text === 'Diagram')).toBe(false);
    expect(nodes.some(n => n.type === 'mermaid')).toBe(false);
  });
});

describe('renderSingleFlow — action ordering', () => {
  it('orders independent actions by their runAfter dependencies', () => {
    // Deliberately supplied out of order: C runs after B, B after A.
    const nodes = renderSingleFlow(aFlow({
      actions: [
        anAction({ name: 'C', runAfter: ['B'] }),
        anAction({ name: 'A', runAfter: [] }),
        anAction({ name: 'B', runAfter: ['A'] }),
      ],
    }));
    expect(bulletNames(nodes)).toEqual(['A', 'B', 'C']);
  });

  it('emits nested children immediately after their parent, not after all roots', () => {
    // A and B are both top-level; Inner sits inside A. Inner must interleave
    // directly after A rather than being appended at the end.
    const nodes = renderSingleFlow(aFlow({
      actions: [
        anAction({ name: 'A' }),
        anAction({ name: 'B', runAfter: ['A'] }),
        anAction({ name: 'Inner', parentName: 'A', depth: 1 }),
      ],
    }));
    expect(bulletNames(nodes)).toEqual(['A', 'Inner', 'B']);
  });

  it('preserves each action depth so the list nests', () => {
    const nodes = renderSingleFlow(aFlow({
      actions: [anAction({ name: 'A' }), anAction({ name: 'Inner', parentName: 'A', depth: 1 })],
    }));
    const list = nodes.find(n => n.type === 'bullet_list') as BulletListNode;
    expect(list.items.map(i => i.depth)).toEqual([0, 1]);
  });

  it('marks Yes and No condition branches with distinct glyphs', () => {
    const nodes = renderSingleFlow(aFlow({
      actions: [
        anAction({ name: 'Check' }),
        anAction({ name: 'Then', parentName: 'Check (Yes)', depth: 1 }),
        anAction({ name: 'Else', parentName: 'Check (No)', depth: 1 }),
      ],
    }));
    expect(bulletNames(nodes)).toEqual(['Check', '✓ Then', '✗ Else']);
  });

  it('still renders every action when runAfter forms a cycle', () => {
    // A cycle can only come from malformed input, but dropping actions silently
    // would be worse than listing them in an arbitrary order.
    const nodes = renderSingleFlow(aFlow({
      actions: [
        anAction({ name: 'X', runAfter: ['Y'] }),
        anAction({ name: 'Y', runAfter: ['X'] }),
      ],
    }));
    expect(bulletNames(nodes).sort()).toEqual(['X', 'Y']);
  });

  it('appends the runAfter note only when there are dependencies', () => {
    const nodes = renderSingleFlow(aFlow({
      actions: [anAction({ name: 'A' }), anAction({ name: 'B', runAfter: ['A'] })],
    }));
    const list = nodes.find(n => n.type === 'bullet_list') as BulletListNode;
    expect(list.items[0].inlines.some(i => i.type === 'italic')).toBe(false);
    expect(list.items[1].inlines).toContainEqual({ type: 'italic', value: 'after: A' });
  });
});
