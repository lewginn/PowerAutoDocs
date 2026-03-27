import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';
import type { GlobalChoiceModel, ChoiceOptionModel, OptionSetType } from '../ir/globalChoice.js';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'option' || name === 'label' || name === 'Description' || name === 'displayname',
});

function parseOptionSetType(raw: string | undefined): OptionSetType {
  switch ((raw ?? '').toLowerCase()) {
    case 'picklist': return 'picklist';
    case 'bool':     return 'bool';
    case 'status':   return 'status';
    case 'state':    return 'state';
    default:         return 'Unknown';
  }
}

function parseOption(raw: any): ChoiceOptionModel {
  const value = Number(raw['@_value'] ?? 0);
  const isHidden = String(raw['@_IsHidden'] ?? '0') === '1';
  const externalValue = String(raw['@_ExternalValue'] ?? '');

  // Label — pick languagecode 1033 (English) first, fall back to first available
  const labels: any[] = raw['labels']?.['label'] ?? [];
  const englishLabel = labels.find((l: any) => String(l['@_languagecode']) === '1033');
  const label: string = (englishLabel ?? labels[0])?.['@_description'] ?? '';

  // Description
  const descriptions: any[] = raw['Descriptions']?.['Description'] ?? [];
  const englishDesc = descriptions.find((d: any) => String(d['@_languagecode']) === '1033');
  const description: string = (englishDesc ?? descriptions[0])?.['@_description'] ?? '';

  return { value, label, description, isHidden, externalValue };
}

function parseChoiceFile(filePath: string): GlobalChoiceModel | null {
  try {
    const xml = fs.readFileSync(filePath, 'utf-8');
    const doc = xmlParser.parse(xml);
    const os = doc['optionset'];
    if (!os) return null;

    const schemaName: string = os['@_Name'] ?? path.basename(filePath, '.xml');

    // Display name — prefer localizedName attribute, fall back to displaynames element
    const localizedName: string = os['@_localizedName'] ?? '';
    const displayNameEl = os['displaynames']?.['displayname'] ?? [];
    const displayNameFromEl: string =
      (Array.isArray(displayNameEl) ? displayNameEl[0] : displayNameEl)?.['@_description'] ?? '';
    const displayName = localizedName || displayNameFromEl || schemaName;

    // Description
    const descEl = os['Descriptions']?.['Description'] ?? [];
    const descItem = Array.isArray(descEl) ? descEl[0] : descEl;
    const description: string = descItem?.['@_description'] ?? '';

    const optionSetType = parseOptionSetType(os['OptionSetType']);
    const isGlobal = String(os['IsGlobal'] ?? '1') === '1';

    // Options — filter out hidden ones by default; keep all and let renderer decide
    const rawOptions: any[] = os['options']?.['option'] ?? [];
    const options = rawOptions.map(parseOption);

    return { schemaName, displayName, description, optionSetType, isGlobal, options };
  } catch {
    return null;
  }
}

/**
 * Scans the OptionSets/ folder and returns a model per global choice file.
 * Filters to custom choices using the publisher prefix (e.g. "myprefix_").
 * Sorted alphabetically by display name.
 */
export function parseGlobalChoices(
  solutionRoot: string,
  publisherPrefix?: string
): GlobalChoiceModel[] {
  const optionSetsDir = path.join(solutionRoot, 'OptionSets');
  if (!fs.existsSync(optionSetsDir)) return [];

  return fs
    .readdirSync(optionSetsDir)
    .filter(f => {
      if (!f.endsWith('.xml')) return false;
      if (publisherPrefix) {
        return f.toLowerCase().startsWith(`${publisherPrefix.toLowerCase()}_`);
      }
      return true;
    })
    .map(f => parseChoiceFile(path.join(optionSetsDir, f)))
    .filter((m): m is GlobalChoiceModel => m !== null)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}