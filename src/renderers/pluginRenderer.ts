import * as fs from 'fs';
import * as path from 'path';
import type { PluginAssemblyModel, PluginStepModel } from '../ir/index.js';

function pad(str: string, length: number): string {
  return str.padEnd(length, ' ');
}

function markdownTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => (r[i] ?? '').length))
  );
  const header = '| ' + headers.map((h, i) => pad(h, widths[i])).join(' | ') + ' |';
  const divider = '| ' + widths.map(w => '-'.repeat(w)).join(' | ') + ' |';
  const body = rows.map(
    row => '| ' + row.map((cell, i) => pad(cell ?? '', widths[i])).join(' | ') + ' |'
  );
  return [header, divider, ...body].join('\n');
}

// -----------------------------------------------
// Top-level summary — index of all assemblies
// /Automation/Plugins
// -----------------------------------------------
export function renderPluginSummaryMarkdown(assemblies: PluginAssemblyModel[]): string {
  const lines: string[] = [];

  lines.push('# Plugin Assemblies');
  lines.push('');

  if (assemblies.length === 0) {
    lines.push('_No plugin assemblies found in this solution._');
    return lines.join('\n');
  }

  const totalSteps = assemblies.reduce((sum, a) => sum + a.steps.length, 0);
  lines.push(`${assemblies.length} assembly/assemblies, ${totalSteps} registered step(s).`);
  lines.push('');

  const summaryRows = assemblies.map(a => [
    a.assemblyName,
    a.version,
    a.isolationMode,
    a.pluginTypeNames.length.toString(),
    a.steps.length.toString(),
  ]);

  lines.push(markdownTable(
    ['Assembly', 'Version', 'Isolation', 'Plugin Types', 'Steps'],
    summaryRows
  ));
  lines.push('');

  return lines.join('\n');
}

// -----------------------------------------------
// Assembly index page — links to each plugin class
// /Automation/Plugins/AppName-CE-Plugins
// -----------------------------------------------
export function renderAssemblyIndexMarkdown(assembly: PluginAssemblyModel, basePath: string): string {
  const lines: string[] = [];

  lines.push(`# ${assembly.assemblyName}`);
  lines.push('');

  lines.push('| Property | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Version | ${assembly.version} |`);
  lines.push(`| Isolation Mode | ${assembly.isolationMode} |`);
  lines.push(`| Plugin Types | ${assembly.pluginTypeNames.length} |`);
  lines.push(`| Registered Steps | ${assembly.steps.length} |`);
  lines.push('');

  if (assembly.pluginTypeNames.length === 0) {
    lines.push('_No plugin types found._');
    return lines.join('\n');
  }

  lines.push('## Plugin Types');
  lines.push('');

  // Build index table — one row per plugin class, with step count
  const stepsByClass = new Map<string, PluginStepModel[]>();
  for (const step of assembly.steps) {
    const existing = stepsByClass.get(step.className) ?? [];
    existing.push(step);
    stepsByClass.set(step.className, existing);
  }

  const typeRows = assembly.pluginTypeNames.map(fullName => {
    const shortName = fullName.startsWith(assembly.assemblyName + '.')
      ? fullName.slice(assembly.assemblyName.length + 1)
      : fullName;
    const steps = stepsByClass.get(shortName) ?? [];
    const entities = [...new Set(steps.map(s => s.primaryEntity))].join(', ');
    return [
      `[${shortName}](${toADOWikiLink(`${basePath}/${shortName}`)})`,
      steps.length.toString(),
      entities || '—',
    ];
  });

  lines.push(markdownTable(
    ['Plugin Class', 'Steps', 'Entities'],
    typeRows
  ));
  lines.push('');

  return lines.join('\n');
}

// -----------------------------------------------
// Individual plugin class page
// /Automation/Plugins/AppName-CE-Plugins/ApplicationPostOperation
// -----------------------------------------------
export function renderSinglePluginTypeMarkdown(
  className: string,
  steps: PluginStepModel[],
  assembly: PluginAssemblyModel
): string {
  const lines: string[] = [];

  lines.push(`# ${className}`);
  lines.push('');

  lines.push('| Property | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Assembly | \`${assembly.assemblyName}\` |`);
  lines.push(`| Version | ${assembly.version} |`);
  lines.push(`| Isolation Mode | ${assembly.isolationMode} |`);
  lines.push(`| Registered Steps | ${steps.length} |`);
  lines.push('');

  if (steps.length === 0) {
    lines.push('_No registered steps found for this plugin type._');
    return lines.join('\n');
  }

  // ---- Registered Steps ----
  lines.push('## Registered Steps');
  lines.push('');

  const stepRows = steps.map(s => [
    s.message,
    `\`${s.primaryEntity}\``,
    s.stage,
    s.mode,
    s.filteringAttributes.length > 0
      ? s.filteringAttributes.map(a => `\`${a}\``).join(', ')
      : '_(all)_',
  ]);

  lines.push(markdownTable(
    ['Message', 'Entity', 'Stage', 'Mode', 'Filtering Attributes'],
    stepRows
  ));
  lines.push('');

  // ---- Step Images ----
  const stepsWithImages = steps.filter(s => s.images.length > 0);
  if (stepsWithImages.length > 0) {
    lines.push('## Step Images');
    lines.push('');

    for (const step of stepsWithImages) {
      lines.push(`### ${step.message} of \`${step.primaryEntity}\``);
      lines.push('');

      const imageRows = step.images.map(img => [
        img.name,
        img.imageType,
        img.attributes.length > 0
          ? img.attributes.map(a => `\`${a}\``).join(', ')
          : '_(all)_',
      ]);

      lines.push(markdownTable(
        ['Image Name', 'Type', 'Attributes'],
        imageRows
      ));
      lines.push('');
    }
  }

  return lines.join('\n');
}

// -----------------------------------------------
// Local file writer
// -----------------------------------------------
export function writePluginMarkdown(assemblies: PluginAssemblyModel[], outputDir: string): void {
  fs.mkdirSync(outputDir, { recursive: true });
  const filepath = path.join(outputDir, 'plugins.md');

  const lines: string[] = [];
  for (const assembly of assemblies) {
    lines.push(renderAssemblyIndexMarkdown(assembly, ''));
    for (const fullName of assembly.pluginTypeNames) {
      const shortName = fullName.startsWith(assembly.assemblyName + '.')
        ? fullName.slice(assembly.assemblyName.length + 1)
        : fullName;
      const steps = assembly.steps.filter(s => s.className === shortName);
      lines.push(renderSinglePluginTypeMarkdown(shortName, steps, assembly));
    }
  }

  const content = lines.join('\n').replace(/\r\n/g, '\n');
  fs.writeFileSync(filepath, content, 'utf-8');
  console.log(`Written: ${filepath}`);
}
function toADOWikiLink(fullPath: string): string {
  return fullPath
    .replace(/-/g, '%2D')       // encode existing hyphens first
    .replace(/\(/g, '\\(')      // escape parentheses
    .replace(/\)/g, '\\)')
    .replace(/ /g, '-');        // spaces to hyphens last
}