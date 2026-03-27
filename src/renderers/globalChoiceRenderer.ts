import type { GlobalChoiceModel } from '../ir/globalChoice.js';
import { toADOWikiLink } from './rendererUtils.js';

/**
 * Renders the Global Choices index page.
 * basePath should be the full wiki path to the Global Choices page,
 * e.g. "/WikiNode/Global Choices"
 */
export function renderGlobalChoicesIndex(
  choices: GlobalChoiceModel[],
  basePath: string
): string {
  const lines: string[] = [];

  lines.push('# Global Choices\n');
  lines.push('Solution-level option sets reusable across multiple tables and columns.\n');

  if (choices.length === 0) {
    lines.push('_No global choices found in this solution._');
    return lines.join('\n');
  }

  lines.push('| Display Name | Schema Name | Type | Options |');
  lines.push('| --- | --- | --- | --- |');

  for (const c of choices) {
    const visibleCount = c.options.filter(o => !o.isHidden).length;
    const totalCount = c.options.length;
    const countLabel = visibleCount < totalCount
      ? `${visibleCount} (${totalCount - visibleCount} hidden)`
      : String(totalCount);

    const link = `[${c.displayName}](${toADOWikiLink(`${basePath}/${c.displayName}`)})`;

    lines.push(`| ${link} | \`${c.schemaName}\` | ${c.optionSetType} | ${countLabel} |`);
  }

  return lines.join('\n');
}

export function renderGlobalChoicePage(choice: GlobalChoiceModel): string {
  const lines: string[] = [];

  lines.push(`# ${choice.displayName}\n`);

  lines.push('| Property | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Schema Name | \`${choice.schemaName}\` |`);
  lines.push(`| Type | ${choice.optionSetType} |`);
  lines.push(`| Global | ${choice.isGlobal ? 'Yes' : 'No'} |`);
  if (choice.description) {
    lines.push(`| Description | ${choice.description} |`);
  }
  lines.push('');

  lines.push('## Options\n');

  if (choice.options.length === 0) {
    lines.push('_No options defined._');
    return lines.join('\n');
  }

  const hasDescriptions = choice.options.some(o => o.description !== '');
  const hasExternalValues = choice.options.some(o => o.externalValue !== '');
  const hasHidden = choice.options.some(o => o.isHidden);

  const headers = ['Value', 'Label'];
  if (hasDescriptions) headers.push('Description');
  if (hasExternalValues) headers.push('External Value');
  if (hasHidden) headers.push('Hidden');

  lines.push(`| ${headers.join(' | ')} |`);
  lines.push(`| ${headers.map(() => '---').join(' | ')} |`);

  for (const opt of choice.options) {
    const row = [String(opt.value), opt.label || '_No label_'];
    if (hasDescriptions) row.push(opt.description || '');
    if (hasExternalValues) row.push(opt.externalValue || '');
    if (hasHidden) row.push(opt.isHidden ? 'Yes' : '');
    lines.push(`| ${row.join(' | ')} |`);
  }

  return lines.join('\n');
}

export function encodeChoiceName(displayName: string): string {
  return displayName.replace(/[/?#%]/g, '');
}