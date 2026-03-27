import { XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';
import * as path from 'path';
import type { RelationshipModel } from '../ir/index.js';
import type { DocGenConfig } from '../config/index.js';

const parser = new XMLParser({
    attributeNamePrefix: '@_',
    ignoreAttributes: false,
    isArray: (name) => ['EntityRelationship', 'Description'].includes(name)
});

function getEnglishDescription(relationshipDescription: any): string {
    const descriptions = relationshipDescription?.Descriptions?.Description ?? [];
    const english = descriptions.find((d: any) => d['@_languagecode'] === '1033');
    return english?.['@_description'] ?? '';
}

function parseRelationshipFile(filePath: string, publisherPrefix: string): RelationshipModel[] {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = parser.parse(raw);

    const relationships = parsed?.EntityRelationships?.EntityRelationship ?? [];
    const results: RelationshipModel[] = [];

    for (const rel of relationships) {
        const name: string = rel['@_Name'] ?? '';
        const type: string = rel.EntityRelationshipType ?? 'OneToMany';
        const referencingEntity: string = rel.ReferencingEntityName ?? '';
        const referencedEntity: string = rel.ReferencedEntityName ?? '';
        const referencingAttribute: string = rel.ReferencingAttributeName ?? '';
        const description = getEnglishDescription(rel.RelationshipDescription);

        // Use publisherPrefix from config — fallback to checking for any underscore prefix
        // if prefix is not configured (handles the warning case in loader.ts)
        const isCustom = publisherPrefix
            ? referencingAttribute.toLowerCase().startsWith(`${publisherPrefix.toLowerCase()}_`)
            : referencingAttribute.includes('_') && !referencingAttribute.startsWith('ms');

        results.push({
            name,
            type: type as RelationshipModel['type'],
            referencingEntity,
            referencedEntity,
            referencingAttribute,
            description,
            isCustom,
        });
    }

    return results;
}

export function parseAllRelationships(
    unpackedPath: string,
    config: DocGenConfig,
    publisherPrefix: string  
): RelationshipModel[] {
    const relationshipsPath = path.join(unpackedPath, 'Other', 'Relationships');

    if (!fs.existsSync(relationshipsPath)) {
        console.warn(`No Relationships folder found at: ${relationshipsPath}`);
        return [];
    }

    const files = fs
        .readdirSync(relationshipsPath)
        .filter(f => f.endsWith('.xml'));

    console.log(`Found ${files.length} relationship files`);

    const all: RelationshipModel[] = [];

    for (const file of files) {
        const filePath = path.join(relationshipsPath, file);
        try {
            const rels = parseRelationshipFile(filePath, publisherPrefix);
            all.push(...rels);
        } catch (err) {
            console.error(`Failed to parse relationships file: ${file}`, err);
        }
    }

    return all;
}

export function getRelationshipsForTable(
    allRelationships: RelationshipModel[],
    tableLogicalName: string
): RelationshipModel[] {
    const name = tableLogicalName.toLowerCase();
    return allRelationships.filter(
        r =>
            r.referencingEntity.toLowerCase() === name ||
            r.referencedEntity.toLowerCase() === name
    );
}
