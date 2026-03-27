import * as fs from 'fs';
import * as path from 'path';
import type { WebResourceModel, WebResourceFunction } from '../ir/index.js';
import { toADOWikiLink } from './rendererUtils.js';

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

// -----------------------------------------------
// Summary page — /Custom Code/Web Resources
// -----------------------------------------------

export function renderWebResourceSummaryMarkdown(
  resources: WebResourceModel[],
  basePath?: string
): string {
  const lines: string[] = [];

  lines.push('# Web Resources');
  lines.push('');

  if (resources.length === 0) {
    lines.push('_No web resources found in this solution._');
    return lines.join('\n');
  }

  const jsResources    = resources.filter(r => r.resourceType === 'JavaScript');
  const otherResources = resources.filter(r => r.resourceType !== 'JavaScript');
  const totalFunctions = jsResources.reduce((sum, r) => sum + (r.functions?.length ?? 0), 0);

  lines.push(`${resources.length} web resource(s) — ${jsResources.length} JavaScript file(s), ${totalFunctions} function(s) total.`);
  lines.push('');

  // --- JavaScript files ---
  if (jsResources.length > 0) {
    lines.push('## JavaScript Files');
    lines.push('');

    const rows = jsResources.map(r => {
      const title = r.name.split('/').pop() ?? r.name;
      const nameCell = basePath
        ? `[${title}](${toADOWikiLink(`${basePath}/${title}`)})`
        : title;
      return [
        nameCell,
        r.namespace ?? '—',
        String(r.functions?.length ?? 0),
        r.dependencies.length > 0 ? r.dependencies.join(', ') : '—',
        r.introducedVersion,
      ];
    });

    lines.push(markdownTable(
      ['Name', 'Namespace', 'Functions', 'Dependencies', 'Version'],
      rows
    ));
    lines.push('');
  }

  // --- Other resource types ---
  if (otherResources.length > 0) {
    lines.push('## Other Resources');
    lines.push('');

    const rows = otherResources.map(r => [
      r.name,
      r.resourceType,
      r.introducedVersion,
    ]);

    lines.push(markdownTable(
      ['Name', 'Type', 'Version'],
      rows
    ));
    lines.push('');
  }

  return lines.join('\n');
}

// -----------------------------------------------
// Per-file detail page — /Custom Code/Web Resources/[name]
// -----------------------------------------------

export function renderWebResourceDetailMarkdown(resource: WebResourceModel): string {
  const lines: string[] = [];

  const title = resource.name.split('/').pop() ?? resource.name;

  lines.push(`# ${title}`);
  lines.push('');

  lines.push('## Metadata');
  lines.push('');
  lines.push(markdownTable(
    ['Property', 'Value'],
    [
      ['Name',               resource.name],
      ['Display Name',       resource.displayName],
      ['Type',               resource.resourceType],
      ['Introduced Version', resource.introducedVersion],
      ['Namespace',          resource.namespace ?? '—'],
    ]
  ));
  lines.push('');

  if (resource.dependencies.length > 0) {
    lines.push('## Dependencies');
    lines.push('');
    lines.push('This file depends on the following web resources:');
    lines.push('');
    for (const dep of resource.dependencies) {
      lines.push(`- \`${dep}\``);
    }
    lines.push('');
  }

  if (resource.resourceType === 'JavaScript') {
    const fns = resource.functions ?? [];

    lines.push('## Functions');
    lines.push('');

    if (fns.length === 0) {
      lines.push('_No named functions detected._');
      lines.push('');
    } else {
      lines.push(`${fns.length} function(s) defined in \`${resource.namespace ?? title}\`.`);
      lines.push('');

      const handlers = fns.filter(f => /^(OnLoad|OnChange|OnSave|OnBlur|OnFocus)/i.test(f.name));
      const helpers  = fns.filter(f => !/^(OnLoad|OnChange|OnSave|OnBlur|OnFocus)/i.test(f.name));

      if (handlers.length > 0) {
        lines.push('### Event Handlers');
        lines.push('');
        lines.push(renderFunctionTable(handlers));
        lines.push('');
      }

      if (helpers.length > 0) {
        lines.push('### Helper Functions');
        lines.push('');
        lines.push(renderFunctionTable(helpers));
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

function renderFunctionTable(fns: WebResourceFunction[]): string {
  const rows = fns.map(f => [
    f.name,
    f.isAsync ? 'Yes' : 'No',
    f.params.length > 0 ? f.params.join(', ') : '—',
    f.jsDoc ?? '—',
  ]);

  return markdownTable(
    ['Function', 'Async', 'Parameters', 'Description'],
    rows
  );
}

// -----------------------------------------------
// Write to disk — mirrors writePluginMarkdown pattern
// -----------------------------------------------

export function writeWebResourceMarkdown(
  resources: WebResourceModel[],
  outputPath: string
): void {
  fs.mkdirSync(outputPath, { recursive: true });

  const summaryMd = renderWebResourceSummaryMarkdown(resources);
  fs.writeFileSync(
    path.join(outputPath, 'Web-Resources.md'),
    summaryMd,
    'utf-8'
  );
  console.log(`  Wrote Web-Resources.md (${resources.length} resources)`);

  const jsResources = resources.filter(r => r.resourceType === 'JavaScript');
  if (jsResources.length === 0) return;

  const detailDir = path.join(outputPath, 'web-resources');
  fs.mkdirSync(detailDir, { recursive: true });

  for (const resource of jsResources) {
    const fileName = sanitiseFileName(resource.name) + '.md';
    const detailMd = renderWebResourceDetailMarkdown(resource);
    fs.writeFileSync(path.join(detailDir, fileName), detailMd, 'utf-8');
  }

  console.log(`  Wrote ${jsResources.length} web resource detail page(s)`);
}

function sanitiseFileName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_');
}