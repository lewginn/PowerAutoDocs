// renderers/pluginRenderer.ts

import * as fs from 'fs';
import * as path from 'path';
import type { PluginAssemblyModel, PluginStepModel } from '../ir/index.js';
import type { DocNode, InlineNode } from '../docmodel/nodes.js';
import { h, pt, p, t, c, b, i, lnk, table, ct, cc, cell, bulletList, bullet } from '../docmodel/nodes.js';
import { serialize } from '../docmodel/MarkdownSerializer.js';
import { toADOWikiLink } from './rendererUtils.js';

// -----------------------------------------------
// Top-level summary — index of all assemblies
// -----------------------------------------------

export function renderPluginSummary(assemblies: PluginAssemblyModel[]): DocNode[] {
  const nodes: DocNode[] = [];

  nodes.push(h(1, 'Plugin Assemblies'));

  if (assemblies.length === 0) {
    nodes.push(pt('No plugin assemblies found in this solution.'));
    return nodes;
  }

  const totalSteps = assemblies.reduce((sum, a) => sum + a.steps.length, 0);
  nodes.push(pt(`${assemblies.length} assembly/assemblies, ${totalSteps} registered step(s).`));
  nodes.push(table(
    ['Assembly', 'Version', 'Isolation', 'Plugin Types', 'Steps'],
    assemblies.map(a => [
      ct(a.assemblyName),
      ct(a.version),
      ct(a.isolationMode),
      ct(a.pluginTypeNames.length.toString()),
      ct(a.steps.length.toString()),
    ])
  ));

  return nodes;
}

// -----------------------------------------------
// Assembly index page — links to each plugin class
// -----------------------------------------------

export function renderAssemblyIndex(assembly: PluginAssemblyModel, basePath: string): DocNode[] {
  const nodes: DocNode[] = [];

  nodes.push(h(1, assembly.assemblyName));
  nodes.push(table(
    ['Property', 'Value'],
    [
      [ct('Version'),          ct(assembly.version)],
      [ct('Isolation Mode'),   ct(assembly.isolationMode)],
      [ct('Plugin Types'),     ct(assembly.pluginTypeNames.length.toString())],
      [ct('Registered Steps'), ct(assembly.steps.length.toString())],
    ]
  ));

  if (assembly.pluginTypeNames.length === 0) {
    nodes.push(pt('No plugin types found.'));
    return nodes;
  }

  nodes.push(h(2, 'Plugin Types'));

  const stepsByClass = new Map<string, PluginStepModel[]>();
  for (const step of assembly.steps) {
    const existing = stepsByClass.get(step.className) ?? [];
    existing.push(step);
    stepsByClass.set(step.className, existing);
  }

  nodes.push(table(
    ['Plugin Class', 'Steps', 'Entities'],
    assembly.pluginTypeNames.map(fullName => {
      const shortName = fullName.startsWith(assembly.assemblyName + '.')
        ? fullName.slice(assembly.assemblyName.length + 1)
        : fullName;
      const steps    = stepsByClass.get(shortName) ?? [];
      const entities = [...new Set(steps.map(s => s.primaryEntity))].join(', ');
      return [
        cell(lnk(shortName, `${basePath}/${shortName}`)),
        ct(steps.length.toString()),
        ct(entities || '—'),
      ];
    })
  ));

  return nodes;
}

// -----------------------------------------------
// Individual plugin class page
// -----------------------------------------------

export function renderSinglePluginType(
  className: string,
  steps: PluginStepModel[],
  assembly: PluginAssemblyModel
): DocNode[] {
  const nodes: DocNode[] = [];

  nodes.push(h(1, className));
  nodes.push(table(
    ['Property', 'Value'],
    [
      [ct('Assembly'),         cc(assembly.assemblyName)],
      [ct('Version'),          ct(assembly.version)],
      [ct('Isolation Mode'),   ct(assembly.isolationMode)],
      [ct('Registered Steps'), ct(steps.length.toString())],
    ]
  ));

  if (steps.length === 0) {
    nodes.push(pt('No registered steps found for this plugin type.'));
    return nodes;
  }

  nodes.push(h(2, 'Registered Steps'));
  nodes.push(table(
    ['Message', 'Entity', 'Stage', 'Mode', 'Filtering Attributes'],
    steps.map(s => [
      ct(s.message),
      cc(s.primaryEntity),
      ct(s.stage),
      ct(s.mode),
      s.filteringAttributes.length > 0
        ? (() => {
            const inlines: InlineNode[] = [];
            s.filteringAttributes.forEach((attr, idx) => {
              inlines.push(c(attr));
              if (idx < s.filteringAttributes.length - 1) inlines.push(t(', '));
            });
            return inlines;
          })()
        : [i('(all)')],
    ])
  ));

  const stepsWithImages = steps.filter(s => s.images.length > 0);
  if (stepsWithImages.length > 0) {
    nodes.push(h(2, 'Step Images'));
    for (const step of stepsWithImages) {
      nodes.push(h(3, `${step.message} of \`${step.primaryEntity}\``));
      nodes.push(table(
        ['Image Name', 'Type', 'Attributes'],
        step.images.map(img => [
          ct(img.name),
          ct(img.imageType),
          img.attributes.length > 0
            ? (() => {
                const inlines: InlineNode[] = [];
                img.attributes.forEach((attr, idx) => {
                  inlines.push(c(attr));
                  if (idx < img.attributes.length - 1) inlines.push(t(', '));
                });
                return inlines;
              })()
            : [i('(all)')],
        ])
      ));
    }
  }

  return nodes;
}

// -----------------------------------------------
// Local file writer
// -----------------------------------------------

export function writePluginMarkdown(assemblies: PluginAssemblyModel[], outputDir: string): void {
  fs.mkdirSync(outputDir, { recursive: true });
  const filepath = path.join(outputDir, 'plugins.md');

  const parts: string[] = [];
  for (const assembly of assemblies) {
    parts.push(serialize(renderAssemblyIndex(assembly, '')).trimEnd());
    for (const fullName of assembly.pluginTypeNames) {
      const shortName = fullName.startsWith(assembly.assemblyName + '.')
        ? fullName.slice(assembly.assemblyName.length + 1)
        : fullName;
      const steps = assembly.steps.filter(s => s.className === shortName);
      parts.push(serialize(renderSinglePluginType(shortName, steps, assembly)).trimEnd());
    }
  }

  const content = parts.join('\n\n').replace(/\r\n/g, '\n');
  fs.writeFileSync(filepath, content, 'utf-8');
  console.log(`Written: ${filepath}`);
}
