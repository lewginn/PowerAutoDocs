import { describe, it, expect } from 'vitest';
import {
  renderClassicWorkflow,
  renderClassicWorkflowsOverview,
} from '../../src/renderers/classicWorkflowRenderer.js';
import type { BulletListNode, DocNode, InlineNode, TableNode } from '../../src/docmodel/nodes.js';
import type { ClassicWorkflowStepModel } from '../../src/ir/classicWorkflow.js';
import { aClassicWorkflow } from '../fixtures/ir.js';

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

const bullets = (nodes: DocNode[]): BulletListNode => {
  const list = nodes.find(n => n.type === 'bullet_list') as BulletListNode | undefined;
  if (!list) throw new Error('expected a bullet_list node');
  return list;
};

/** The paragraph that follows the Triggers heading. */
const triggerText = (nodes: DocNode[]): string => {
  const idx = nodes.findIndex(n => n.type === 'heading' && n.text === 'Triggers');
  if (idx === -1) throw new Error('expected a Triggers heading');
  const para = nodes[idx + 1];
  if (para.type !== 'paragraph') throw new Error('expected a paragraph after Triggers');
  return (para.inlines[0] as { value: string }).value;
};

const noTriggers = { onCreate: false, onUpdate: false, onDelete: false, onDemand: false, updateFields: [] };

/**
 * Local step helper — tests/fixtures/ir.ts has no step factory, and steps are the
 * main branching surface of this renderer, so almost every case needs one.
 */
const aStep = (over: Partial<ClassicWorkflowStepModel> = {}): ClassicWorkflowStepModel => ({
  name: 'Update Widget',
  type: 'update',
  entity: 'acme_widget',
  setFields: ['acme_approved'],
  ...over,
});

describe('renderClassicWorkflow', () => {
  it('leads with the workflow name as a level-1 heading', () => {
    const nodes = renderClassicWorkflow(aClassicWorkflow({ name: 'Stamp Widget Approval' }));
    expect(nodes[0]).toEqual({ type: 'heading', level: 1, text: 'Stamp Widget Approval' });
  });

  it('includes the AI summary block only when a summary exists', () => {
    const withSummary = renderClassicWorkflow(aClassicWorkflow({ aiSummary: 'Approves widgets.' }));
    expect(withSummary[1]).toEqual({ type: 'heading', level: 2, text: 'Summary' });
    expect(withSummary[2]).toEqual({ type: 'blockquote', inlines: [{ type: 'text', value: 'Approves widgets.' }] });

    expect(headings(renderClassicWorkflow(aClassicWorkflow({ aiSummary: undefined })))).not.toContain('Summary');
  });

  it('always lists the same six properties, in order', () => {
    const tbl = firstTable(renderClassicWorkflow(aClassicWorkflow()));
    expect(tbl.headers).toEqual(['Property', 'Value']);
    expect(tbl.rows.map(r => (r[0][0] as { value: string }).value))
      .toEqual(['Status', 'Type', 'Entity', 'Mode', 'Scope', 'Run As']);
  });

  it('renders the entity as a code span, since it is a logical name', () => {
    const tbl = firstTable(renderClassicWorkflow(aClassicWorkflow({ entity: 'acme_widget' })));
    expect(propValue(tbl, 'Entity')).toEqual([{ type: 'code', value: 'acme_widget' }]);
  });

  it('reports status as a word rather than a raw enum', () => {
    const active = firstTable(renderClassicWorkflow(aClassicWorkflow({ status: 'active' })));
    expect(propValue(active, 'Status')).toEqual([{ type: 'text', value: 'Active' }]);

    const inactive = firstTable(renderClassicWorkflow(aClassicWorkflow({ status: 'inactive' })));
    expect(propValue(inactive, 'Status')).toEqual([{ type: 'text', value: 'Inactive' }]);
  });

  it('distinguishes a custom action from a classic workflow', () => {
    const action = firstTable(renderClassicWorkflow(aClassicWorkflow({ category: 'action' })));
    expect(propValue(action, 'Type')).toEqual([{ type: 'text', value: 'Custom Action' }]);

    const workflow = firstTable(renderClassicWorkflow(aClassicWorkflow({ category: 'workflow' })));
    expect(propValue(workflow, 'Type')).toEqual([{ type: 'text', value: 'Classic Workflow' }]);
  });

  it('spells out what real-time and background actually mean', () => {
    // "realtime"/"background" are the raw XML values; sync vs async is the thing a
    // reader of the doc actually needs to know.
    const realtime = firstTable(renderClassicWorkflow(aClassicWorkflow({ mode: 'realtime' })));
    expect(propValue(realtime, 'Mode')).toEqual([{ type: 'text', value: 'Real-time (Synchronous)' }]);

    const background = firstTable(renderClassicWorkflow(aClassicWorkflow({ mode: 'background' })));
    expect(propValue(background, 'Mode')).toEqual([{ type: 'text', value: 'Background (Asynchronous)' }]);
  });

  it('humanises every scope value', () => {
    const scopeOf = (scope: 'user' | 'businessunit' | 'organization') =>
      propValue(firstTable(renderClassicWorkflow(aClassicWorkflow({ scope }))), 'Scope');

    expect(scopeOf('user')).toEqual([{ type: 'text', value: 'User' }]);
    expect(scopeOf('businessunit')).toEqual([{ type: 'text', value: 'Business Unit' }]);
    expect(scopeOf('organization')).toEqual([{ type: 'text', value: 'Organisation' }]);
  });

  it('humanises both run-as values', () => {
    const owner = firstTable(renderClassicWorkflow(aClassicWorkflow({ runAs: 'owner' })));
    expect(propValue(owner, 'Run As')).toEqual([{ type: 'text', value: 'Record Owner' }]);

    const caller = firstTable(renderClassicWorkflow(aClassicWorkflow({ runAs: 'callinguser' })));
    expect(propValue(caller, 'Run As')).toEqual([{ type: 'text', value: 'Calling User' }]);
  });
});

describe('renderClassicWorkflow — triggers', () => {
  it('says so explicitly when nothing triggers the workflow', () => {
    // An empty Triggers section would read as "we failed to parse it"; this is a
    // real state (an unconfigured workflow) and must be distinguishable.
    const nodes = renderClassicWorkflow(aClassicWorkflow({ triggers: { ...noTriggers } }));
    expect(triggerText(nodes)).toBe('None configured');
  });

  it('lists every enabled trigger in a fixed order', () => {
    const nodes = renderClassicWorkflow(aClassicWorkflow({
      triggers: { onCreate: true, onUpdate: true, onDelete: true, onDemand: true, updateFields: [] },
    }));
    expect(triggerText(nodes)).toBe('Create, Delete, Update, On Demand');
  });

  it('names the fields that fire an update trigger', () => {
    // A field-scoped update trigger behaves very differently from an any-field one,
    // so the fields have to survive into the doc.
    const nodes = renderClassicWorkflow(aClassicWorkflow({
      triggers: { ...noTriggers, onUpdate: true, updateFields: ['acme_tier', 'acme_serial'] },
    }));
    expect(triggerText(nodes)).toBe('Update (acme_tier, acme_serial)');
  });

  it('omits the parenthetical when an update trigger has no field filter', () => {
    const nodes = renderClassicWorkflow(aClassicWorkflow({
      triggers: { ...noTriggers, onUpdate: true, updateFields: [] },
    }));
    expect(triggerText(nodes)).toBe('Update');
  });

  it('ignores updateFields when the update trigger is off', () => {
    const nodes = renderClassicWorkflow(aClassicWorkflow({
      triggers: { ...noTriggers, onDemand: true, updateFields: ['acme_tier'] },
    }));
    expect(triggerText(nodes)).toBe('On Demand');
  });
});

describe('renderClassicWorkflow — steps', () => {
  it('omits the Steps section entirely when there are no steps', () => {
    const nodes = renderClassicWorkflow(aClassicWorkflow({ steps: [] }));
    expect(headings(nodes)).not.toContain('Steps');
    expect(nodes.some(n => n.type === 'bullet_list')).toBe(false);
  });

  it('puts the steps under a Steps heading as one bullet list', () => {
    const nodes = renderClassicWorkflow(aClassicWorkflow({ steps: [aStep(), aStep({ name: 'Second' })] }));
    expect(headings(nodes)).toContain('Steps');
    expect(bullets(nodes).items).toHaveLength(2);
  });

  it('describes an update step with its entity and written fields', () => {
    const nodes = renderClassicWorkflow(aClassicWorkflow({
      steps: [aStep({ name: 'Stamp', type: 'update', entity: 'acme_widget', setFields: ['acme_approved', 'acme_tier'] })],
    }));
    expect(bullets(nodes).items[0].inlines).toEqual([
      { type: 'bold', value: 'Stamp' },
      { type: 'text', value: ' — Update ' },
      { type: 'code', value: 'acme_widget' },
      { type: 'text', value: ' (' },
      { type: 'code', value: 'acme_approved' },
      { type: 'text', value: ', ' },
      { type: 'code', value: 'acme_tier' },
      { type: 'text', value: ')' },
    ]);
  });

  it('drops the field parenthetical when an update step writes nothing', () => {
    const nodes = renderClassicWorkflow(aClassicWorkflow({
      steps: [aStep({ name: 'Stamp', type: 'update', entity: 'acme_widget', setFields: [] })],
    }));
    expect(bullets(nodes).items[0].inlines).toEqual([
      { type: 'bold', value: 'Stamp' },
      { type: 'text', value: ' — Update ' },
      { type: 'code', value: 'acme_widget' },
    ]);
  });

  it('describes a create step with its entity and written fields', () => {
    const nodes = renderClassicWorkflow(aClassicWorkflow({
      steps: [aStep({ name: 'Make Part', type: 'create', entity: 'acme_part', setFields: ['acme_name'] })],
    }));
    expect(bullets(nodes).items[0].inlines).toEqual([
      { type: 'bold', value: 'Make Part' },
      { type: 'text', value: ' — Create ' },
      { type: 'code', value: 'acme_part' },
      { type: 'text', value: ' (' },
      { type: 'code', value: 'acme_name' },
      { type: 'text', value: ')' },
    ]);
  });

  it('falls back to a placeholder when a create/update step has no entity', () => {
    // The entity is optional on the IR, but "Update" with nothing after it would
    // read as a complete sentence and hide the fact that parsing came up short.
    const nodes = renderClassicWorkflow(aClassicWorkflow({
      steps: [aStep({ name: 'Mystery', type: 'update', entity: undefined, setFields: [] })],
    }));
    expect(bullets(nodes).items[0].inlines).toContainEqual({ type: 'code', value: '?' });
  });

  it('lists the fields a condition step checks', () => {
    const nodes = renderClassicWorkflow(aClassicWorkflow({
      steps: [{ name: 'Is Premium', type: 'condition', conditionFields: ['acme_tier', 'acme_serial'] }],
    }));
    expect(bullets(nodes).items[0].inlines).toEqual([
      { type: 'bold', value: 'Is Premium' },
      { type: 'text', value: ' — checks ' },
      { type: 'code', value: 'acme_tier' },
      { type: 'text', value: ', ' },
      { type: 'code', value: 'acme_serial' },
    ]);
  });

  it('shows only the name when a condition step checks nothing we could extract', () => {
    const empty = renderClassicWorkflow(aClassicWorkflow({
      steps: [{ name: 'Is Premium', type: 'condition', conditionFields: [] }],
    }));
    expect(bullets(empty).items[0].inlines).toEqual([{ type: 'bold', value: 'Is Premium' }]);

    // conditionFields is optional on the IR — absent must behave like empty, not throw.
    const absent = renderClassicWorkflow(aClassicWorkflow({
      steps: [{ name: 'Is Premium', type: 'condition' }],
    }));
    expect(bullets(absent).items[0].inlines).toEqual([{ type: 'bold', value: 'Is Premium' }]);
  });

  it('quotes the error message on a terminate step', () => {
    const nodes = renderClassicWorkflow(aClassicWorkflow({
      steps: [{ name: 'Bail Out', type: 'terminate', errorMessage: 'Serial required' }],
    }));
    expect(bullets(nodes).items[0].inlines).toEqual([
      { type: 'bold', value: 'Bail Out' },
      { type: 'text', value: ' — Stop workflow' },
      { type: 'text', value: ' — ' },
      { type: 'italic', value: '"Serial required"' },
    ]);
  });

  it('still says a terminate step stops the workflow when it carries no message', () => {
    const nodes = renderClassicWorkflow(aClassicWorkflow({
      steps: [{ name: 'Bail Out', type: 'terminate' }],
    }));
    expect(bullets(nodes).items[0].inlines).toEqual([
      { type: 'bold', value: 'Bail Out' },
      { type: 'text', value: ' — Stop workflow' },
    ]);
  });

  it('falls back to just the name for step types it does not model', () => {
    // 'other' is the parser's catch-all; the step still has to appear rather than
    // vanish from the list.
    const nodes = renderClassicWorkflow(aClassicWorkflow({
      steps: [{ name: 'Send Email', type: 'other', entity: 'acme_widget', setFields: ['acme_x'] }],
    }));
    expect(bullets(nodes).items[0].inlines).toEqual([{ type: 'bold', value: 'Send Email' }]);
  });

  it('indents thenSteps one level below their condition', () => {
    const nodes = renderClassicWorkflow(aClassicWorkflow({
      steps: [{
        name: 'Is Premium',
        type: 'condition',
        conditionFields: ['acme_tier'],
        thenSteps: [aStep({ name: 'Stamp' })],
      }],
    }));
    const items = bullets(nodes).items;
    expect(items.map(item => [item.depth, (item.inlines[0] as { value: string }).value]))
      .toEqual([[0, 'Is Premium'], [1, 'Stamp']]);
  });

  it('nests recursively so a condition inside a condition indents twice', () => {
    const nodes = renderClassicWorkflow(aClassicWorkflow({
      steps: [
        {
          name: 'Outer',
          type: 'condition',
          thenSteps: [
            { name: 'Inner', type: 'condition', thenSteps: [aStep({ name: 'Deep' })] },
          ],
        },
        aStep({ name: 'After' }),
      ],
    }));
    const items = bullets(nodes).items;
    expect(items.map(item => [item.depth, (item.inlines[0] as { value: string }).value]))
      .toEqual([[0, 'Outer'], [1, 'Inner'], [2, 'Deep'], [0, 'After']]);
  });

  it('treats an empty thenSteps array as no branch at all', () => {
    const nodes = renderClassicWorkflow(aClassicWorkflow({
      steps: [{ name: 'Is Premium', type: 'condition', thenSteps: [] }],
    }));
    expect(bullets(nodes).items).toHaveLength(1);
  });

  it('emits no format strings anywhere in the page', () => {
    // constraints.md: renderers return DocNode[] only — markdown syntax belongs to
    // the serializer that owns the format. A renderer that baked fences in here is
    // what produced the double-fenced ERD bug.
    const nodes = renderClassicWorkflow(aClassicWorkflow({
      aiSummary: 'Approves widgets.',
      steps: [{ name: 'Is Premium', type: 'condition', conditionFields: ['acme_tier'], thenSteps: [aStep()] }],
    }));
    const json = JSON.stringify(nodes);
    expect(json).not.toContain('```');
    expect(json).not.toContain('|');
  });
});

describe('renderClassicWorkflowsOverview', () => {
  it('renders a placeholder instead of an empty table when there are no workflows', () => {
    expect(renderClassicWorkflowsOverview([])).toEqual([
      { type: 'paragraph', inlines: [{ type: 'text', value: 'No classic workflows found.' }] },
    ]);
  });

  it('puts one row per workflow under the expected headers', () => {
    const nodes = renderClassicWorkflowsOverview([
      aClassicWorkflow({ name: 'A' }),
      aClassicWorkflow({ name: 'B' }),
    ]);
    const tbl = firstTable(nodes);
    expect(tbl.headers).toEqual(['Workflow', 'Entity', 'Type', 'Mode', 'Triggers']);
    expect(tbl.rows).toHaveLength(2);
  });

  it('links the workflow name only when a basePath is supplied', () => {
    const linked = firstTable(renderClassicWorkflowsOverview([aClassicWorkflow({ name: 'Stamp It' })], '/Workflows'));
    expect(linked.rows[0][0]).toEqual([{ type: 'link', text: 'Stamp It', href: '/Workflows/Stamp It' }]);

    // Without a basePath there is nowhere to point, so it stays plain text
    // rather than emitting a dangling link.
    const plain = firstTable(renderClassicWorkflowsOverview([aClassicWorkflow({ name: 'Stamp It' })]));
    expect(plain.rows[0][0]).toEqual([{ type: 'text', value: 'Stamp It' }]);
  });

  it('uses shorter type and mode labels than the detail page', () => {
    // The index is a scannable grid, so it trades the detail page's fuller
    // "Classic Workflow" / "Real-time (Synchronous)" for the short forms.
    const tbl = firstTable(renderClassicWorkflowsOverview([
      aClassicWorkflow({ category: 'workflow', mode: 'realtime' }),
      aClassicWorkflow({ category: 'action', mode: 'background' }),
    ]));
    expect(tbl.rows.map(r => (r[2][0] as { value: string }).value)).toEqual(['Workflow', 'Custom Action']);
    expect(tbl.rows.map(r => (r[3][0] as { value: string }).value)).toEqual(['Real-time', 'Background']);
  });

  it('renders the entity as a code span', () => {
    const tbl = firstTable(renderClassicWorkflowsOverview([aClassicWorkflow({ entity: 'acme_part' })]));
    expect(tbl.rows[0][1]).toEqual([{ type: 'code', value: 'acme_part' }]);
  });

  it('shows an em dash rather than a blank cell when nothing triggers the workflow', () => {
    const tbl = firstTable(renderClassicWorkflowsOverview([aClassicWorkflow({ triggers: { ...noTriggers } })]));
    expect(tbl.rows[0][4]).toEqual([{ type: 'text', value: '—' }]);
  });

  it('summarises triggers the same way the detail page does', () => {
    const tbl = firstTable(renderClassicWorkflowsOverview([aClassicWorkflow({
      triggers: { onCreate: true, onUpdate: true, onDelete: true, onDemand: true, updateFields: ['acme_tier'] },
    })]));
    expect(tbl.rows[0][4]).toEqual([{ type: 'text', value: 'Create, Delete, Update (acme_tier), On Demand' }]);
  });
});
