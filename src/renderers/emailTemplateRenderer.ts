import type { EmailTemplateModel } from '../ir/emailTemplate.js';
import { toADOWikiLink } from './rendererUtils.js';

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
): string {
  const lines: string[] = [];

  lines.push('# Email Templates\n');
  lines.push('Custom email templates defined in this solution.\n');

  if (templates.length === 0) {
    lines.push('_No custom email templates found in this solution._');
    return lines.join('\n');
  }

  lines.push('| Title | Target Entity | Subject |');
  lines.push('| --- | --- | --- |');

  for (const t of templates) {
    const link = `[${t.title}](${toADOWikiLink(`${basePath}/${t.title}`)})`;
    const subjectPreview = t.subject
      ? t.subject.substring(0, 80) + (t.subject.length > 80 ? '…' : '')
      : '_No subject_';
    lines.push(`| ${link} | ${t.targetEntity} | ${subjectPreview} |`);
  }

  return lines.join('\n');
}

export function renderEmailTemplatePage(template: EmailTemplateModel): string {
  const lines: string[] = [];

  lines.push(`# ${template.title}\n`);

  // Metadata
  lines.push('| Property | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Target Entity | ${template.targetEntity} |`);
  lines.push(`| Template ID | \`${template.id}\` |`);
  lines.push(`| Language | ${resolveLanguage(template.languageCode)} |`);
  if (template.description) {
    lines.push(`| Description | ${template.description} |`);
  }
  lines.push('');

  // Subject
  lines.push('## Subject\n');
  if (template.subject) {
    lines.push(template.subject);
  } else {
    lines.push('_No subject defined._');
  }
  lines.push('');

  // Body
  lines.push('## Body\n');
  if (template.body) {
    // Render as a code block to preserve line breaks and show {field} placeholders clearly
    lines.push('```');
    lines.push(template.body);
    lines.push('```');
  } else {
    lines.push('_No body content found._');
  }
  lines.push('');

  // Dynamic fields summary
  if (template.dynamicFields.length > 0) {
    lines.push('## Dynamic Fields\n');
    lines.push('Fields referenced in this template (shown as `{fieldName}` placeholders above):\n');
    for (const field of template.dynamicFields) {
      lines.push(`- \`${field}\``);
    }
    lines.push('');
  }

  return lines.join('\n');
}