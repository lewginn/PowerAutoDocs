// renderers/classicWorkflowRenderer.ts

import type { ClassicWorkflowModel, ClassicWorkflowStepModel } from '../ir/classicWorkflow.js';

function markdownTable(headers: string[], rows: string[][]): string {
  const cols = headers.length;
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
// Step list — nested markdown bullets
// -----------------------------------------------

function renderStep(step: ClassicWorkflowStepModel, depth: number): string {
  const indent = '  '.repeat(depth);
  const lines: string[] = [];

  let summary = '';

  switch (step.type) {
    case 'condition': {
      const fields = step.conditionFields?.map(f => `\`${f}\``).join(', ') ?? '';
      summary = `**${step.name}**${fields ? ` — checks ${fields}` : ''}`;
      break;
    }
    case 'update': {
      const fields = step.setFields?.map(f => `\`${f}\``).join(', ') ?? '';
      summary = `**${step.name}** — Update \`${step.entity ?? '?'}\`${fields ? ` (${fields})` : ''}`;
      break;
    }
    case 'create': {
      const fields = step.setFields?.map(f => `\`${f}\``).join(', ') ?? '';
      summary = `**${step.name}** — Create \`${step.entity ?? '?'}\`${fields ? ` (${fields})` : ''}`;
      break;
    }
    case 'terminate': {
      const msg = step.errorMessage ? ` — _"${step.errorMessage}"_` : '';
      summary = `**${step.name}** — Stop workflow${msg}`;
      break;
    }
    default:
      summary = `**${step.name}**`;
  }

  lines.push(`${indent}- ${summary}`);

  if (step.thenSteps && step.thenSteps.length > 0) {
    for (const child of step.thenSteps) {
      lines.push(renderStep(child, depth + 1));
    }
  }

  return lines.join('\n');
}

function renderStepList(steps: ClassicWorkflowStepModel[]): string {
  if (steps.length === 0) return '_No steps extracted._';
  return steps.map(s => renderStep(s, 0)).join('\n');
}

// -----------------------------------------------
// Trigger summary line
// -----------------------------------------------

function renderTriggers(wf: ClassicWorkflowModel): string {
  const parts: string[] = [];
  if (wf.triggers.onCreate) parts.push('Create');
  if (wf.triggers.onDelete) parts.push('Delete');
  if (wf.triggers.onUpdate) {
    const fields = wf.triggers.updateFields.length > 0
      ? ` (\`${wf.triggers.updateFields.join('`, `')}\`)`
      : '';
    parts.push(`Update${fields}`);
  }
  if (wf.triggers.onDemand) parts.push('On Demand');
  if (parts.length === 0) return '_None configured_';
  return parts.join(', ');
}

// -----------------------------------------------
// Single workflow detail page
// -----------------------------------------------

export function renderClassicWorkflowMarkdown(wf: ClassicWorkflowModel): string {
  const lines: string[] = [];

  lines.push(`# ${wf.name}`);
  lines.push('');

  const categoryLabel =
    wf.category === 'action' ? 'Custom Action' : 'Classic Workflow';

  const modeLabel = wf.mode === 'realtime' ? 'Real-time (Synchronous)' : 'Background (Asynchronous)';

  const scopeLabel =
    wf.scope === 'user' ? 'User' :
    wf.scope === 'businessunit' ? 'Business Unit' : 'Organisation';

  const runAsLabel = wf.runAs === 'owner' ? 'Record Owner' : 'Calling User';

  lines.push(markdownTable(
    ['Property', 'Value'],
    [
      ['Status',   wf.status === 'active' ? 'Active' : 'Inactive'],
      ['Type',     categoryLabel],
      ['Entity',   `\`${wf.entity}\``],
      ['Mode',     modeLabel],
      ['Scope',    scopeLabel],
      ['Run As',   runAsLabel],
    ]
  ));
  lines.push('');

  lines.push('## Triggers');
  lines.push('');
  lines.push(renderTriggers(wf));
  lines.push('');

  if (wf.steps.length > 0) {
    lines.push('## Steps');
    lines.push('');
    lines.push(renderStepList(wf.steps));
    lines.push('');
  }

  return lines.join('\n');
}

// -----------------------------------------------
// Summary table for the /Automation/Classic Workflows index page
// -----------------------------------------------

export function renderClassicWorkflowsOverview(workflows: ClassicWorkflowModel[]): string {
  if (workflows.length === 0) return '_No classic workflows found._';

  const lines: string[] = [];
  lines.push(markdownTable(
    ['Workflow', 'Entity', 'Type', 'Mode', 'Triggers'],
    workflows.map(wf => {
      const triggerParts: string[] = [];
      if (wf.triggers.onCreate)  triggerParts.push('Create');
      if (wf.triggers.onDelete)  triggerParts.push('Delete');
      if (wf.triggers.onUpdate) {
        const fields = wf.triggers.updateFields.length > 0
          ? ` (${wf.triggers.updateFields.join(', ')})`
          : '';
        triggerParts.push(`Update${fields}`);
      }
      if (wf.triggers.onDemand) triggerParts.push('On Demand');

      const categoryLabel =
        wf.category === 'action' ? 'Custom Action' : 'Workflow';

      return [
        wf.name,
        `\`${wf.entity}\``,
        categoryLabel,
        wf.mode === 'realtime' ? 'Real-time' : 'Background',
        triggerParts.join(', ') || '—',
      ];
    })
  ));
  return lines.join('\n');
}