// renderers/emailTemplateRenderer.ts

import type { EmailTemplateModel } from '../ir/emailTemplate.js';
import type { DocNode } from '../docmodel/nodes.js';
import { h, pt, p, t, c, b, lnk, table, ct, cc, cell, bulletList, bullet, codeBlock } from '../docmodel/nodes.js';

const LANGUAGE_MAP: Record<number, string> = {
  1033: 'English (United States)',
  1036: 'French',
  1031: 'German',
  1034: 'Spanish',
  1041: 'Japanese',
  2052: 'Chinese (Simplified)',
};

function resolveLanguage(code: number): string {
  return LANGUAGE_MAP[code] ? `${LANGUAGE_MAP[code]} (${code})` : String(code);
}

export function renderEmailTemplatesIndex(
  templates: EmailTemplateModel[],
  basePath: string
): DocNode[] {
  const nodes: DocNode[] = [];

  nodes.push(h(1, 'Email Templates'));
  nodes.push(pt('Custom email templates defined in this solution.'));

  if (templates.length === 0) {
    nodes.push(pt('No custom email templates found in this solution.'));
    return nodes;
  }

  nodes.push(table(
    ['Title', 'Target Entity', 'Subject'],
    templates.map(tpl => {
      const subjectPreview = tpl.subject
        ? tpl.subject.substring(0, 80) + (tpl.subject.length > 80 ? '…' : '')
        : 'No subject';
      return [
        cell(lnk(tpl.title, `${basePath}/${tpl.title}`)),
        ct(tpl.targetEntity),
        ct(subjectPreview),
      ];
    })
  ));

  return nodes;
}

export function renderEmailTemplatePage(template: EmailTemplateModel): DocNode[] {
  const nodes: DocNode[] = [];

  nodes.push(h(1, template.title));

  const metaRows: import('../docmodel/nodes.js').InlineNode[][][] = [
    [ct('Target Entity'), ct(template.targetEntity)],
    [ct('Template ID'),   cc(template.id)],
    [ct('Language'),      ct(resolveLanguage(template.languageCode))],
  ];
  if (template.description) metaRows.push([ct('Description'), ct(template.description)]);
  nodes.push(table(['Property', 'Value'], metaRows));

  nodes.push(h(2, 'Subject'));
  nodes.push(template.subject ? pt(template.subject) : pt('No subject defined.'));

  nodes.push(h(2, 'Body'));
  nodes.push(template.body ? codeBlock(template.body) : pt('No body content found.'));

  if (template.dynamicFields.length > 0) {
    nodes.push(h(2, 'Dynamic Fields'));
    nodes.push(pt('Fields referenced in this template (shown as `{fieldName}` placeholders above):'));
    nodes.push(bulletList(template.dynamicFields.map(field => bullet(0, c(field)))));
  }

  return nodes;
}
