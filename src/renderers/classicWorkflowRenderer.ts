// renderers/classicWorkflowRenderer.ts

import type { ClassicWorkflowModel, ClassicWorkflowStepModel } from '../ir/classicWorkflow.js';
import type { DocNode, InlineNode } from '../docmodel/nodes.js';
import { h, pt, p, t, c, b, i, table, ct, cc, bulletList, bullet } from '../docmodel/nodes.js';
import { serialize } from '../docmodel/MarkdownSerializer.js';

// -----------------------------------------------
// Step list — nested bullet items
// -----------------------------------------------

function buildStepItems(steps: ClassicWorkflowStepModel[], depth = 0): ReturnType<typeof bullet>[] {
  const items: ReturnType<typeof bullet>[] = [];

  for (const step of steps) {
    const inlines: InlineNode[] = [];

    switch (step.type) {
      case 'condition': {
        const fields = step.conditionFields?.map(f => f) ?? [];
        inlines.push(b(step.name));
        if (fields.length > 0) {
          inlines.push(t(' — checks '));
          fields.forEach((f, idx) => {
            inlines.push(c(f));
            if (idx < fields.length - 1) inlines.push(t(', '));
          });
        }
        break;
      }
      case 'update': {
        const fields = step.setFields ?? [];
        inlines.push(b(step.name));
        inlines.push(t(' — Update '));
        inlines.push(c(step.entity ?? '?'));
        if (fields.length > 0) {
          inlines.push(t(' ('));
          fields.forEach((f, idx) => {
            inlines.push(c(f));
            if (idx < fields.length - 1) inlines.push(t(', '));
          });
          inlines.push(t(')'));
        }
        break;
      }
      case 'create': {
        const fields = step.setFields ?? [];
        inlines.push(b(step.name));
        inlines.push(t(' — Create '));
        inlines.push(c(step.entity ?? '?'));
        if (fields.length > 0) {
          inlines.push(t(' ('));
          fields.forEach((f, idx) => {
            inlines.push(c(f));
            if (idx < fields.length - 1) inlines.push(t(', '));
          });
          inlines.push(t(')'));
        }
        break;
      }
      case 'terminate': {
        inlines.push(b(step.name));
        inlines.push(t(' — Stop workflow'));
        if (step.errorMessage) {
          inlines.push(t(' — '));
          inlines.push(i(`"${step.errorMessage}"`));
        }
        break;
      }
      default:
        inlines.push(b(step.name));
    }

    items.push(bullet(depth, ...inlines));

    if (step.thenSteps && step.thenSteps.length > 0) {
      items.push(...buildStepItems(step.thenSteps, depth + 1));
    }
  }

  return items;
}

// -----------------------------------------------
// Trigger summary
// -----------------------------------------------

function triggerText(wf: ClassicWorkflowModel): string {
  const parts: string[] = [];
  if (wf.triggers.onCreate) parts.push('Create');
  if (wf.triggers.onDelete) parts.push('Delete');
  if (wf.triggers.onUpdate) {
    const fields = wf.triggers.updateFields.length > 0
      ? ` (${wf.triggers.updateFields.join(', ')})`
      : '';
    parts.push(`Update${fields}`);
  }
  if (wf.triggers.onDemand) parts.push('On Demand');
  return parts.length === 0 ? 'None configured' : parts.join(', ');
}

// -----------------------------------------------
// Single workflow detail page
// -----------------------------------------------

export function renderClassicWorkflow(wf: ClassicWorkflowModel): DocNode[] {
  const nodes: DocNode[] = [];

  nodes.push(h(1, wf.name));

  const categoryLabel = wf.category === 'action' ? 'Custom Action' : 'Classic Workflow';
  const modeLabel     = wf.mode === 'realtime' ? 'Real-time (Synchronous)' : 'Background (Asynchronous)';
  const scopeLabel    = wf.scope === 'user' ? 'User' : wf.scope === 'businessunit' ? 'Business Unit' : 'Organisation';
  const runAsLabel    = wf.runAs === 'owner' ? 'Record Owner' : 'Calling User';

  nodes.push(table(
    ['Property', 'Value'],
    [
      [ct('Status'),  ct(wf.status === 'active' ? 'Active' : 'Inactive')],
      [ct('Type'),    ct(categoryLabel)],
      [ct('Entity'),  cc(wf.entity)],
      [ct('Mode'),    ct(modeLabel)],
      [ct('Scope'),   ct(scopeLabel)],
      [ct('Run As'),  ct(runAsLabel)],
    ]
  ));

  nodes.push(h(2, 'Triggers'));
  nodes.push(pt(triggerText(wf)));

  if (wf.steps.length > 0) {
    nodes.push(h(2, 'Steps'));
    const items = buildStepItems(wf.steps);
    nodes.push(items.length > 0 ? bulletList(items) : pt('No steps extracted.'));
  }

  return nodes;
}

// -----------------------------------------------
// Overview index table
// -----------------------------------------------

export function renderClassicWorkflowsOverview(workflows: ClassicWorkflowModel[]): DocNode[] {
  if (workflows.length === 0) return [pt('No classic workflows found.')];

  return [table(
    ['Workflow', 'Entity', 'Type', 'Mode', 'Triggers'],
    workflows.map(wf => {
      const triggerParts: string[] = [];
      if (wf.triggers.onCreate) triggerParts.push('Create');
      if (wf.triggers.onDelete) triggerParts.push('Delete');
      if (wf.triggers.onUpdate) {
        const fields = wf.triggers.updateFields.length > 0
          ? ` (${wf.triggers.updateFields.join(', ')})`
          : '';
        triggerParts.push(`Update${fields}`);
      }
      if (wf.triggers.onDemand) triggerParts.push('On Demand');

      return [
        ct(wf.name),
        cc(wf.entity),
        ct(wf.category === 'action' ? 'Custom Action' : 'Workflow'),
        ct(wf.mode === 'realtime' ? 'Real-time' : 'Background'),
        ct(triggerParts.join(', ') || '—'),
      ];
    })
  )];
}
