// renderers/globalChoiceRenderer.ts

import type { GlobalChoiceModel } from '../ir/globalChoice.js';
import type { DocNode, InlineNode } from '../docmodel/nodes.js';
import { h, pt, p, t, c, b, i, lnk, table, ct, cc, cell } from '../docmodel/nodes.js';

export function renderGlobalChoicesIndex(
  choices: GlobalChoiceModel[],
  basePath: string
): DocNode[] {
  const nodes: DocNode[] = [];

  nodes.push(h(1, 'Global Choices'));
  nodes.push(pt('Solution-level option sets reusable across multiple tables and columns.'));

  if (choices.length === 0) {
    nodes.push(pt('No global choices found in this solution.'));
    return nodes;
  }

  nodes.push(table(
    ['Display Name', 'Schema Name', 'Type', 'Options'],
    choices.map(c_ => {
      const visibleCount = c_.options.filter(o => !o.isHidden).length;
      const totalCount   = c_.options.length;
      const countLabel   = visibleCount < totalCount
        ? `${visibleCount} (${totalCount - visibleCount} hidden)`
        : String(totalCount);

      return [
        cell(lnk(c_.displayName, `${basePath}/${c_.displayName}`)),
        cc(c_.schemaName),
        ct(c_.optionSetType),
        ct(countLabel),
      ];
    })
  ));

  return nodes;
}

export function renderGlobalChoicePage(choice: GlobalChoiceModel): DocNode[] {
  const nodes: DocNode[] = [];

  nodes.push(h(1, choice.displayName));
  nodes.push(table(
    ['Property', 'Value'],
    [
      [ct('Schema Name'), cc(choice.schemaName)],
      [ct('Type'),        ct(choice.optionSetType)],
      [ct('Global'),      ct(choice.isGlobal ? 'Yes' : 'No')],
      ...(choice.description ? [[ct('Description'), ct(choice.description)]] : []),
    ] as InlineNode[][][]
  ));

  nodes.push(h(2, 'Options'));

  if (choice.options.length === 0) {
    nodes.push(pt('No options defined.'));
    return nodes;
  }

  const hasDescriptions   = choice.options.some(o => o.description !== '');
  const hasExternalValues = choice.options.some(o => o.externalValue !== '');
  const hasHidden         = choice.options.some(o => o.isHidden);

  const headers = ['Value', 'Label'];
  if (hasDescriptions)   headers.push('Description');
  if (hasExternalValues) headers.push('External Value');
  if (hasHidden)         headers.push('Hidden');

  nodes.push(table(
    headers,
    choice.options.map(opt => {
      const row: InlineNode[][] = [ct(String(opt.value)), ct(opt.label || 'No label')];
      if (hasDescriptions)   row.push(ct(opt.description || ''));
      if (hasExternalValues) row.push(ct(opt.externalValue || ''));
      if (hasHidden)         row.push(ct(opt.isHidden ? 'Yes' : ''));
      return row;
    })
  ));

  return nodes;
}

export function encodeChoiceName(displayName: string): string {
  return displayName.replace(/[/?#%]/g, '');
}
