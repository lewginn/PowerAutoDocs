import * as fs from 'fs';
import * as path from 'path';
import { parseEntityXml } from './tableParser.js';
import { parseEntityViews } from './viewParser.js';
import { parseEntityForms } from './formParser.js';
import { parseAllRelationships, getRelationshipsForTable } from './relationshipParser.js';
import type { TableModel } from '../ir/index.js';
import type { DocGenConfig } from '../config/index.js';

export function parseSolution(
    unpackedPath: string,
    config: DocGenConfig,
    publisherPrefix: string
): TableModel[] {
    const { parse: parseOpts, components } = config;

    const excludedColumns = new Set(parseOpts.excludedColumns);
    const { customColumnsOnly, excludeBaseCurrencyFields, excludeStandardRelationships } = parseOpts;

    const entitiesPath = path.join(unpackedPath, 'Entities');

    if (!fs.existsSync(entitiesPath)) {
        console.warn(`No Entities folder found at: ${entitiesPath}`);
        return [];
    }

    const entityFolders = fs
        .readdirSync(entitiesPath, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);

    console.log(`Found ${entityFolders.length} entities in solution`);

    // Parse relationships once up front — they live outside entity folders
    const allRelationships = parseAllRelationships(unpackedPath, config, publisherPrefix);

    const tables: TableModel[] = [];

    for (const folderName of entityFolders) {
        const entityFolderPath = path.join(entitiesPath, folderName);
        const entityXmlPath = path.join(entityFolderPath, 'Entity.xml');

        if (!fs.existsSync(entityXmlPath)) {
            console.warn(`Skipping ${folderName} — no Entity.xml found`);
            continue;
        }

        try {
            const table = parseEntityXml(entityXmlPath);

            // Filter columns
            table.columns = table.columns.filter(col => {
                if (excludedColumns.has(col.logicalName)) return false;
                if (customColumnsOnly && !col.isCustom) return false;
                if (excludeBaseCurrencyFields && col.logicalName.endsWith('_base') && col.type === 'money') return false;
                return true;
            });

            // Wire in views, forms and relationships based on component toggles
            table.views = components.views ? parseEntityViews(entityFolderPath) : [];
            table.forms = components.forms ? parseEntityForms(entityFolderPath) : [];

            if (components.relationships) {
                table.relationships = getRelationshipsForTable(allRelationships, table.logicalName);
                if (excludeStandardRelationships) {
                    table.relationships = table.relationships.filter(r => r.isCustom);
                }
            } else {
                table.relationships = [];
            }

            tables.push(table);
        } catch (err) {
            console.error(`Failed to parse entity: ${folderName}`, err);
        }
    }

    return tables;
}
