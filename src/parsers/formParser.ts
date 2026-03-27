import { XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';
import * as path from 'path';
import type { FormModel, FormTabModel, FormSectionModel } from '../ir/index.js';

const parser = new XMLParser({
  attributeNamePrefix: '@_',
  ignoreAttributes: false,
  isArray: (name) => [
    'tab', 'column', 'section', 'row', 'cell', 'label', 'LocalizedName'
  ].includes(name)
});

function mapFormType(folderName: string): FormModel['type'] {
  const typeMap: Record<string, FormModel['type']> = {
    main: 'Main',
    quick: 'Quick Create',
    card: 'Card',
  };
  return typeMap[folderName.toLowerCase()] ?? 'Other';
}

function getEnglishLabel(labels: any): string {
  if (!labels?.label) return '';
  const items = Array.isArray(labels.label) ? labels.label : [labels.label];
  const english = items.find((l: any) => l['@_languagecode'] === '1033');
  return english?.['@_description'] ?? '';
}

function extractFieldsFromCells(cells: any[]): string[] {
  if (!cells) return [];
  return cells
    .map((cell: any) => cell?.control?.['@_datafieldname'])
    .filter((name: any) => !!name && name.trim() !== '');
}

export function parseFormXml(formXmlPath: string, formType: FormModel['type']): FormModel | null {
  const raw = fs.readFileSync(formXmlPath, 'utf-8');
  const parsed = parser.parse(raw);

  const systemform = parsed?.forms?.systemform;
  if (!systemform) {
    console.warn(`No systemform found in: ${formXmlPath}`);
    return null;
  }

  const localizedNames = systemform.LocalizedNames?.LocalizedName ?? [];
  const nameEntry = localizedNames.find((n: any) => n['@_languagecode'] === '1033');
  const name = nameEntry?.['@_description'] ?? path.basename(formXmlPath);

  const isActive = systemform.FormActivationState === 1 || systemform.FormActivationState === '1';
  if (!isActive) {
    console.log(`Skipping inactive form: ${name}`);
    return null;
  }

  const form = systemform.form;
  if (!form) return null;

  const rawTabs = form.tabs?.tab ?? [];
  const tabs: FormTabModel[] = rawTabs.map((tab: any) => {
    const tabLabel = getEnglishLabel(tab.labels) || 'Untitled Tab';

    const rawColumns = tab.columns?.column ?? [];
    const sections: FormSectionModel[] = [];

    for (const col of rawColumns) {
      const rawSections = col.sections?.section ?? [];
      for (const section of rawSections) {
        const sectionLabel = getEnglishLabel(section.labels) || 'Untitled Section';

        const rawRows = section.rows?.row ?? [];
        const allCells = rawRows.flatMap((row: any) => {
          if (!row.cell) return [];
          return Array.isArray(row.cell) ? row.cell : [row.cell];
        });

        const columns = extractFieldsFromCells(allCells);
        sections.push({ label: sectionLabel, columns });
      }
    }

    return { label: tabLabel, sections };
  });

  const headerCells = form.header?.rows?.row?.flatMap((row: any) => {
    if (!row.cell) return [];
    return Array.isArray(row.cell) ? row.cell : [row.cell];
  }) ?? [];
  const headerFields = extractFieldsFromCells(headerCells);

  if (headerFields.length > 0) {
    tabs.unshift({
      label: 'Header',
      sections: [{ label: 'Header Fields', columns: headerFields }]
    });
  }

  return { name, type: formType, tabs };
}

export function parseEntityForms(entityFolderPath: string): FormModel[] {
  const formXmlPath = path.join(entityFolderPath, 'FormXml');

  if (!fs.existsSync(formXmlPath)) return [];

  const forms: FormModel[] = [];

  const subfolders = fs
    .readdirSync(formXmlPath, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);

  for (const subfolder of subfolders) {
    const formType = mapFormType(subfolder);
    const subfolderPath = path.join(formXmlPath, subfolder);

    const files = fs
      .readdirSync(subfolderPath)
      .filter(f => f.endsWith('.xml'));

    for (const file of files) {
      const filePath = path.join(subfolderPath, file);
      try {
        const form = parseFormXml(filePath, formType);
        if (form) forms.push(form);
      } catch (err) {
        console.error(`Failed to parse form: ${file}`, err);
      }
    }
  }

  const typeOrder: FormModel['type'][] = ['Main', 'Quick Create', 'Quick View', 'Card', 'Other'];
  return forms.sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type));
}