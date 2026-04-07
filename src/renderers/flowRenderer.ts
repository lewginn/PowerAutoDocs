// renderers/flowRenderer.ts

import * as fs from 'fs';
import * as path from 'path';
import type { FlowModel, FlowActionModel } from '../ir/index.js';
import type { DocNode, InlineNode } from '../docmodel/nodes.js';
import { h, pt, p, t, c, b, i, lnk, table, ct, cc, cell, bulletList, bullet, mermaid } from '../docmodel/nodes.js';
import { serialize } from '../docmodel/MarkdownSerializer.js';

// -----------------------------------------------
// Summary page
// -----------------------------------------------

export function renderFlowSummary(flows: FlowModel[], basePath?: string): DocNode[] {
  const nodes: DocNode[] = [];

  nodes.push(h(1, 'Power Automate Flows'));

  if (flows.length === 0) {
    nodes.push(pt('No modern flows found in this solution.'));
    return nodes;
  }

  nodes.push(pt(`${flows.length} flow(s) in this solution.`));
  nodes.push(table(
    ['Flow Name', 'Trigger Type', 'Entity', 'Actions', 'Status'],
    flows.map(f => [
      basePath ? cell(lnk(f.name, `${basePath}/${f.name}`)) : ct(f.name),
      ct(f.trigger.type),
      f.trigger.entity ? cc(f.trigger.entity) : ct('—'),
      ct(f.actions.length.toString()),
      ct(f.isActive ? 'Active' : 'Inactive'),
    ])
  ));

  return nodes;
}

// -----------------------------------------------
// Actions as a bullet list
// -----------------------------------------------

function buildActionItems(actions: FlowActionModel[]): ReturnType<typeof bullet>[] {
  const items: ReturnType<typeof bullet>[] = [];

  for (const a of actions) {
    const branchPrefix = a.parentName?.endsWith('(Yes)') ? '✓ ' :
      a.parentName?.endsWith('(No)') ? '✗ ' : '';

    const inlines: InlineNode[] = [];
    inlines.push(b(branchPrefix + a.name));
    inlines.push(t(' — ' + a.description));
    if (a.runAfter.length > 0) {
      inlines.push(t(' · '));
      inlines.push(i(`after: ${a.runAfter.join(', ')}`));
    }

    items.push(bullet(a.depth, ...inlines));
  }

  return items;
}

// -----------------------------------------------
// Single flow detail page
// -----------------------------------------------

export function renderSingleFlow(flow: FlowModel): DocNode[] {
  const nodes: DocNode[] = [];

  nodes.push(h(1, flow.name));

  const metaRows: InlineNode[][][] = [
    [ct('Status'), ct(flow.isActive ? 'Active' : 'Inactive')],
    [ct('Type'), ct(flow.category === 'ModernFlow' ? 'Power Automate (Modern Flow)' : 'Classic Workflow')],
  ];
  if (flow.connectionReferences.length > 0) {
    const connInlines: InlineNode[] = [];
    flow.connectionReferences.forEach((conn, idx) => {
      connInlines.push(c(conn));
      if (idx < flow.connectionReferences.length - 1) connInlines.push(t(', '));
    });
    metaRows.push([ct('Connections'), connInlines]);
  }
  nodes.push(table(['Property', 'Value'], metaRows));

  // ---- Trigger ----
  nodes.push(h(2, 'Trigger'));
  nodes.push(pt(flow.trigger.description));
  if (flow.trigger.filterAttributes) {
    nodes.push(p(b('Filtering attributes:'), t(' '), c(flow.trigger.filterAttributes)));
  }
  if (flow.trigger.filterExpression) {
    nodes.push(p(b('Filter expression:'), t(' '), c(flow.trigger.filterExpression)));
  }

  // ---- Actions ----
  nodes.push(h(2, 'Actions'));
  if (flow.actions.length === 0) {
    nodes.push(pt('No actions found.'));
  } else {
    const sorted = sortActionsByOrder(flow.actions);
    nodes.push(bulletList(buildActionItems(sorted)));
  }

  // ---- Diagram ----
  if (flow.mermaidDiagram) {
    nodes.push(h(2, 'Diagram'));
    nodes.push(mermaid(flow.mermaidDiagram));
  }

  return nodes;
}

// -----------------------------------------------
// Combined render — kept for local file output
// -----------------------------------------------

export function renderFlowMarkdown(flows: FlowModel[]): string {
  const parts: string[] = [serialize(renderFlowSummary(flows)).trimEnd()];
  for (const flow of flows) {
    parts.push(serialize(renderSingleFlow(flow)).trimEnd());
  }
  return parts.join('\n\n');
}

// -----------------------------------------------
// Sort actions preserving parent→children hierarchy.
// Uses parentName to correctly interleave children
// immediately after their parent action.
// -----------------------------------------------

function sortActionsByOrder(actions: FlowActionModel[]): FlowActionModel[] {
  function topoSort(siblings: FlowActionModel[]): FlowActionModel[] {
    const sorted: FlowActionModel[] = [];
    const remaining = [...siblings];
    const seen = new Set<string>();
    let guard = remaining.length * remaining.length + 1;
    while (remaining.length > 0 && guard-- > 0) {
      const idx = remaining.findIndex(a =>
        a.runAfter.length === 0 || a.runAfter.every(dep => seen.has(dep))
      );
      if (idx === -1) break;
      const [action] = remaining.splice(idx, 1);
      sorted.push(action);
      seen.add(action.name);
    }
    return [...sorted, ...remaining];
  }

  function emit(action: FlowActionModel, result: FlowActionModel[]) {
    result.push(action);
    const children = topoSort(
      actions.filter(a =>
        a.parentName === action.name ||
        a.parentName?.startsWith(action.name + ' (')
      )
    );
    for (const child of children) {
      emit(child, result);
    }
  }

  const roots = topoSort(actions.filter(a => a.parentName === undefined));
  const result: FlowActionModel[] = [];
  for (const root of roots) {
    emit(root, result);
  }

  for (const a of actions) {
    if (!result.includes(a)) result.push(a);
  }

  return result;
}

// -----------------------------------------------
// Local file writer
// -----------------------------------------------

export function writeFlowMarkdown(flows: FlowModel[], outputDir: string): void {
  fs.mkdirSync(outputDir, { recursive: true });
  const filepath = path.join(outputDir, 'flows.md');
  const content = renderFlowMarkdown(flows).replace(/\r\n/g, '\n');
  fs.writeFileSync(filepath, content, 'utf-8');
  console.log(`Written: ${filepath}`);
}
