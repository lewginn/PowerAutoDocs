import { XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';
import * as path from 'path';
import type { SolutionModel } from '../ir/index.js';

const parser = new XMLParser({
    attributeNamePrefix: '@_',
    ignoreAttributes: false,
    isArray: (name) => ['LocalizedName', 'Description', 'RootComponent'].includes(name)
});

function getEnglishLabel(localizedNames: any): string {
    if (!localizedNames?.LocalizedName) return '';
    const items = Array.isArray(localizedNames.LocalizedName)
        ? localizedNames.LocalizedName
        : [localizedNames.LocalizedName];
    const english = items.find((n: any) => n['@_languagecode'] === '1033');
    return english?.['@_description'] ?? '';
}

export function parseSolutionManifest(unpackedPath: string): SolutionModel {
    const manifestPath = path.join(unpackedPath, 'Other', 'Solution.xml');

    if (!fs.existsSync(manifestPath)) {
        console.warn(`No Solution.xml found at: ${manifestPath}`);
        // Return a minimal model so the rest of the pipeline doesn't break
        return {
            uniqueName: 'Unknown',
            displayName: 'Unknown',
            version: '0.0.0.0',
            isManaged: false,
            publisher: {
                uniqueName: 'Unknown',
                displayName: 'Unknown',
                prefix: '',
            },
            tables: [],
        };
    }

    const raw = fs.readFileSync(manifestPath, 'utf-8');
    const parsed = parser.parse(raw);

    const manifest = parsed?.ImportExportXml?.SolutionManifest;
    if (!manifest) throw new Error('Invalid Solution.xml — no SolutionManifest found');

    const publisher = manifest.Publisher;

    return {
        uniqueName: manifest.UniqueName ?? '',
        displayName: getEnglishLabel(manifest.LocalizedNames) || manifest.UniqueName,
        version: manifest.Version ?? '',
        isManaged: manifest.Managed === 1 || manifest.Managed === '1',
        publisher: {
            uniqueName: publisher?.UniqueName ?? '',
            displayName: (getEnglishLabel(publisher?.LocalizedNames) || publisher?.UniqueName) ?? '', prefix: publisher?.CustomizationPrefix ?? '',
        },
        tables: [], // populated by solutionParser after entity parsing
    };
}