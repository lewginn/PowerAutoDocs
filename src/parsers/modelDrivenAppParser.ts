import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';
import type { ModelDrivenAppModel } from '../ir/modelDrivenApp.js';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => ['AppModuleComponent', 'Role', 'appsetting', 'LocalizedName', 'Description'].includes(name),
});

const FORM_FACTOR_MAP: Record<number, ModelDrivenAppModel['formFactor']> = {
  1: 'Web',
  2: 'Tablet',
  3: 'Phone',
};

function parseAppModuleFile(filePath: string, publisherPrefix?: string): ModelDrivenAppModel | null {
  try {
    const xml = fs.readFileSync(filePath, 'utf-8');
    const doc = xmlParser.parse(xml);
    const app = doc['AppModule'];
    if (!app) return null;

    const uniqueName: string = app['UniqueName'] ?? path.basename(path.dirname(filePath));

    // Display name from LocalizedNames (prefer 1033)
    const localizedNames: any[] = app['LocalizedNames']?.['LocalizedName'] ?? [];
    const englishName = localizedNames.find(n => String(n['@_languagecode']) === '1033');
    const displayName: string = (englishName ?? localizedNames[0])?.['@_description'] ?? uniqueName;

    // Description
    const descriptions: any[] = app['Descriptions']?.['Description'] ?? [];
    const englishDesc = descriptions.find(d => String(d['@_languagecode']) === '1033');
    const description: string = (englishDesc ?? descriptions[0])?.['@_description'] ?? '';

    const isActive = String(app['statecode'] ?? '0') === '0';
    const formFactorCode = Number(app['FormFactor'] ?? 1);
    const formFactor = FORM_FACTOR_MAP[formFactorCode] ?? 'Unknown';

    // AppModuleComponents — type 1 = entity references by schemaName
    const components: any[] = app['AppModuleComponents']?.['AppModuleComponent'] ?? [];
    const entityComponents = components.filter(c => String(c['@_type']) === '1' && c['@_schemaName']);

    const prefix = publisherPrefix ? `${publisherPrefix.toLowerCase()}_` : null;
    const customEntities: string[] = [];
    const standardEntities: string[] = [];

    for (const c of entityComponents) {
      const schema: string = c['@_schemaName'];
      if (prefix && schema.toLowerCase().startsWith(prefix)) {
        customEntities.push(schema);
      } else {
        standardEntities.push(schema);
      }
    }

    customEntities.sort();
    standardEntities.sort();

    const roles: any[] = app['AppModuleRoleMaps']?.['Role'] ?? [];
    const roleCount = roles.length;

    const rawSettings: any[] = app['appsettings']?.['appsetting'] ?? [];
    const appSettings = rawSettings
      .map(s => ({
        key: String(s['@_settingdefinitionid.uniquename'] ?? ''),
        value: String(s['value'] ?? ''),
      }))
      .filter(s => s.key);

    return {
      uniqueName,
      displayName,
      description,
      isActive,
      formFactor,
      customEntities,
      standardEntities,
      roleCount,
      appSettings,
    };
  } catch {
    return null;
  }
}

/**
 * Scans AppModules/ folder — one subfolder per app, each containing AppModule.xml.
 */
export function parseModelDrivenApps(solutionRoot: string, publisherPrefix?: string): ModelDrivenAppModel[] {
  const appModulesDir = path.join(solutionRoot, 'AppModules');
  if (!fs.existsSync(appModulesDir)) {
    console.log(`No AppModules folder found at: ${appModulesDir}`);
    return [];
  }

  return fs
    .readdirSync(appModulesDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => parseAppModuleFile(path.join(appModulesDir, e.name, 'AppModule.xml'), publisherPrefix))
    .filter((m): m is ModelDrivenAppModel => m !== null)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}