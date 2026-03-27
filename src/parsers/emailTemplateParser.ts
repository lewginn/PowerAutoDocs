import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';
import type { EmailTemplateModel } from '../ir/emailTemplate.js';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'emailtemplate',
});

const ENTITY_TYPE_MAP: Record<number, string> = {
  0:    'Global',
  1:    'Account',
  2:    'Contact',
  3:    'Opportunity',
  4:    'Lead',
  5:    'Case',
  6:    'Invoice',
  7:    'Order',
  8:    'Quote',
  9:    'Campaign Activity',
  10:   'Campaign',
  4700: 'System',
};

function resolveEntity(code: number): string {
  return ENTITY_TYPE_MAP[code] ?? `Entity (${code})`;
}

/**
 * Reconstructs readable text from an XSL template by interleaving
 * CDATA text content and xsl:value-of dynamic field placeholders in order.
 * Returns { text, dynamicFields }.
 */
function extractFromXsl(xslPath: string): { text: string; dynamicFields: string[] } {
  if (!fs.existsSync(xslPath)) return { text: '', dynamicFields: [] };

  const raw = fs.readFileSync(xslPath, 'utf-8');

  const parts: string[] = [];
  const dynamicFields: string[] = [];

  // Walk CDATA blocks and xsl:value-of selects in document order
  const allMatches = [
    ...raw.matchAll(/\[CDATA\[([\s\S]*?)\]\]|<xsl:value-of select="([^"]+)"/g)
  ];

  for (const m of allMatches) {
    if (m[1] !== undefined) {
      // CDATA block — strip HTML tags, normalise whitespace
      const text = m[1]
        .replace(/<\/?(p|div|li|ul|ol|br)[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n[ \t]+/g, '\n')
        .trim();
      if (text) parts.push(text);
    } else if (m[2] && !m[2].startsWith('/')) {
      // Dynamic field reference — format as {fieldName}
      const field = m[2]
        .replace(/^[a-z_]+\//, '')   // strip entity prefix e.g. "contact/"
        .replace(/\/@name$/, '');       // strip @name attribute selector
      parts.push(`{${field}}`);
      if (!dynamicFields.includes(m[2])) dynamicFields.push(m[2]);
    }
  }

  const text = parts.join('').replace(/\n{3,}/g, '\n\n').trim();
  return { text, dynamicFields };
}

function parseTemplateEntry(entry: any, emailTemplatesDir: string): EmailTemplateModel {
  const id: string = (entry['templateid'] ?? '').replace(/[{}]/g, '');
  const title: string = entry['title'] ?? '';
  const description: string = entry['description'] ?? '';
  const templateTypeCode = Number(entry['templatetypecode'] ?? 0);
  const languageCode = Number(entry['languagecode'] ?? 1033);
  const isCustomizable = String(entry['IsCustomizable'] ?? '1') === '1';

  const xslDir = path.join(emailTemplatesDir, 'EmailDocuments', String(languageCode), '{' + id + '}');

  const subjectXslPath = path.join(xslDir, 'subject.xsl');
  const { text: subject, dynamicFields: subjectFields } = extractFromXsl(subjectXslPath);

  const bodyXslPath = path.join(xslDir, 'body.xsl');
  const { text: body, dynamicFields: bodyFields } = extractFromXsl(bodyXslPath);

  const allFields = [...new Set([...subjectFields, ...bodyFields])].sort();

  return {
    id,
    title,
    description,
    targetEntity: resolveEntity(templateTypeCode),
    templateTypeCode,
    subject,
    body,
    dynamicFields: allFields,
    languageCode,
    isCustomizable,
  };
}

export function parseEmailTemplates(solutionRoot: string): EmailTemplateModel[] {
  const emailTemplatesDir = path.join(solutionRoot, 'Templates');
  const metaPath = path.join(emailTemplatesDir, 'EmailTemplates.xml');

  if (!fs.existsSync(metaPath)) {
    console.log(`No Templates folder found at: ${emailTemplatesDir}`);
    return [];
  }

  const xml = fs.readFileSync(metaPath, 'utf-8');
  const doc = xmlParser.parse(xml);
  const entries: any[] = doc['EmailTemplates']?.['emailtemplate'] ?? [];

  return entries
    .map(e => parseTemplateEntry(e, emailTemplatesDir))
    .filter(t => t.isCustomizable && t.title)
    .sort((a, b) => a.title.localeCompare(b.title));
}