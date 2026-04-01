// renderers/webResourceRenderer.ts

import * as fs from 'fs';
import * as path from 'path';
import type { WebResourceModel, WebResourceFunction } from '../ir/index.js';
import type { DocNode, InlineNode } from '../docmodel/nodes.js';
import { h, pt, p, t, c, b, lnk, table, ct, cc, cell, bulletList, bullet } from '../docmodel/nodes.js';
import { serialize } from '../docmodel/MarkdownSerializer.js';

// -----------------------------------------------
// Summary page
// -----------------------------------------------

export function renderWebResourceSummary(
  resources: WebResourceModel[],
  basePath?: string
): DocNode[] {
  const nodes: DocNode[] = [];

  nodes.push(h(1, 'Web Resources'));

  if (resources.length === 0) {
    nodes.push(pt('No web resources found in this solution.'));
    return nodes;
  }

  const jsResources    = resources.filter(r => r.resourceType === 'JavaScript');
  const otherResources = resources.filter(r => r.resourceType !== 'JavaScript');
  const totalFunctions = jsResources.reduce((sum, r) => sum + (r.functions?.length ?? 0), 0);

  nodes.push(pt(
    `${resources.length} web resource(s) — ${jsResources.length} JavaScript file(s), ${totalFunctions} function(s) total.`
  ));

  if (jsResources.length > 0) {
    nodes.push(h(2, 'JavaScript Files'));
    nodes.push(table(
      ['Name', 'Namespace', 'Functions', 'Dependencies', 'Version'],
      jsResources.map(r => {
        const title = r.name.split('/').pop() ?? r.name;
        return [
          basePath ? cell(lnk(title, `${basePath}/${title}`)) : ct(title),
          ct(r.namespace ?? '—'),
          ct(String(r.functions?.length ?? 0)),
          ct(r.dependencies.length > 0 ? r.dependencies.join(', ') : '—'),
          ct(r.introducedVersion),
        ];
      })
    ));
  }

  if (otherResources.length > 0) {
    nodes.push(h(2, 'Other Resources'));
    nodes.push(table(
      ['Name', 'Type', 'Version'],
      otherResources.map(r => [ct(r.name), ct(r.resourceType), ct(r.introducedVersion)])
    ));
  }

  return nodes;
}

// -----------------------------------------------
// Per-file detail page
// -----------------------------------------------

export function renderWebResourceDetail(resource: WebResourceModel): DocNode[] {
  const nodes: DocNode[] = [];

  const title = resource.name.split('/').pop() ?? resource.name;

  nodes.push(h(1, title));
  nodes.push(h(2, 'Metadata'));
  nodes.push(table(
    ['Property', 'Value'],
    [
      [ct('Name'),               ct(resource.name)],
      [ct('Display Name'),       ct(resource.displayName)],
      [ct('Type'),               ct(resource.resourceType)],
      [ct('Introduced Version'), ct(resource.introducedVersion)],
      [ct('Namespace'),          ct(resource.namespace ?? '—')],
    ]
  ));

  if (resource.dependencies.length > 0) {
    nodes.push(h(2, 'Dependencies'));
    nodes.push(pt('This file depends on the following web resources:'));
    nodes.push(bulletList(resource.dependencies.map(dep => bullet(0, c(dep)))));
  }

  if (resource.resourceType === 'JavaScript') {
    const fns = resource.functions ?? [];

    nodes.push(h(2, 'Functions'));

    if (fns.length === 0) {
      nodes.push(pt('No named functions detected.'));
    } else {
      nodes.push(pt(`${fns.length} function(s) defined in \`${resource.namespace ?? title}\`.`));

      const handlers = fns.filter(f => /^(OnLoad|OnChange|OnSave|OnBlur|OnFocus)/i.test(f.name));
      const helpers  = fns.filter(f => !/^(OnLoad|OnChange|OnSave|OnBlur|OnFocus)/i.test(f.name));

      if (handlers.length > 0) {
        nodes.push(h(3, 'Event Handlers'));
        nodes.push(renderFunctionTable(handlers));
      }

      if (helpers.length > 0) {
        nodes.push(h(3, 'Helper Functions'));
        nodes.push(renderFunctionTable(helpers));
      }
    }
  }

  return nodes;
}

function renderFunctionTable(fns: WebResourceFunction[]): DocNode {
  return table(
    ['Function', 'Async', 'Parameters', 'Description'],
    fns.map(f => [
      ct(f.name),
      ct(f.isAsync ? 'Yes' : 'No'),
      ct(f.params.length > 0 ? f.params.join(', ') : '—'),
      ct(f.jsDoc ?? '—'),
    ])
  );
}

// -----------------------------------------------
// Local file writer
// -----------------------------------------------

export function writeWebResourceMarkdown(
  resources: WebResourceModel[],
  outputPath: string
): void {
  fs.mkdirSync(outputPath, { recursive: true });

  const summaryMd = serialize(renderWebResourceSummary(resources));
  fs.writeFileSync(path.join(outputPath, 'Web-Resources.md'), summaryMd, 'utf-8');
  console.log(`  Wrote Web-Resources.md (${resources.length} resources)`);

  const jsResources = resources.filter(r => r.resourceType === 'JavaScript');
  if (jsResources.length === 0) return;

  const detailDir = path.join(outputPath, 'web-resources');
  fs.mkdirSync(detailDir, { recursive: true });

  for (const resource of jsResources) {
    const fileName = sanitiseFileName(resource.name) + '.md';
    fs.writeFileSync(
      path.join(detailDir, fileName),
      serialize(renderWebResourceDetail(resource)),
      'utf-8'
    );
  }

  console.log(`  Wrote ${jsResources.length} web resource detail page(s)`);
}

function sanitiseFileName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_');
}
