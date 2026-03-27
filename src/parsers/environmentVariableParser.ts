import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';
import type { EnvironmentVariableModel, EnvironmentVariableType } from '../ir/environmentVariable.js';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: () => false,
});

// Maps Dataverse type codes to readable labels
const TYPE_MAP: Record<string, EnvironmentVariableType> = {
  '100000000': 'String',
  '100000001': 'Number',
  '100000002': 'Boolean',
  '100000003': 'JSON',
  '100000010': 'DataSource',
};

function parseType(raw: string | number | undefined): EnvironmentVariableType {
  return TYPE_MAP[String(raw ?? '')] ?? 'Unknown';
}

/**
 * Reads a single EnvironmentVariableDefinitions/{schemaName}/ folder.
 * Returns null if the definition file is missing or malformed.
 */
function parseEnvVarFolder(folderPath: string): EnvironmentVariableModel | null {
  const defPath = path.join(folderPath, 'environmentvariabledefinition.xml');
  if (!fs.existsSync(defPath)) return null;

  const xml = fs.readFileSync(defPath, 'utf-8');
  const doc = xmlParser.parse(xml);
  const def = doc['environmentvariabledefinition'];
  if (!def) return null;

  const schemaName: string = def['@_schemaname'] ?? path.basename(folderPath);

  // Display name — prefer the `default` attribute on the <displayname> element
  const displayName: string =
    def['displayname']?.['@_default'] ??
    def['displayname'] ??
    schemaName;

  // Description
  const description: string =
    def['description']?.['@_default'] ??
    def['description'] ??
    '';

  const defaultValue: string = String(def['defaultvalue'] ?? '');
  const isRequired: boolean = String(def['isrequired']) === '1';
  const secretStore: number = Number(def['secretstore'] ?? 0);
  const type = parseType(def['type']);

  // Try to read the current value from the optional values JSON
  let currentValue: string | undefined;
  const valPath = path.join(folderPath, 'environmentvariablevalues.json');
  if (fs.existsSync(valPath)) {
    try {
      const json = JSON.parse(fs.readFileSync(valPath, 'utf-8'));
      const raw = json?.environmentvariablevalues?.environmentvariablevalue?.value;
      if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
        currentValue = String(raw);
      }
    } catch {
      // malformed JSON — leave currentValue undefined
    }
  }

  return {
    schemaName,
    displayName,
    description,
    type,
    defaultValue,
    currentValue,
    isRequired,
    secretStore,
  };
}

/**
 * Scans the EnvironmentVariableDefinitions/ folder and returns a model per variable.
 * Sorted alphabetically by display name.
 */
export function parseEnvironmentVariables(solutionRoot: string): EnvironmentVariableModel[] {
  const defsDir = path.join(solutionRoot, 'EnvironmentVariableDefinitions');
  if (!fs.existsSync(defsDir)) return [];

  return fs
    .readdirSync(defsDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => parseEnvVarFolder(path.join(defsDir, e.name)))
    .filter((m): m is EnvironmentVariableModel => m !== null)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}