import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';
import type {
    SecurityRoleModel,
    EntityPrivileges,
    PrivilegeLevel,
} from '../ir/securityRole.js';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

// Maps XML level strings to our PrivilegeLevel type
function parseLevel(level: string | undefined): PrivilegeLevel {
    switch (level) {
        case 'Global': return 'Global';
        case 'Deep': return 'Deep';
        case 'Local': return 'Local';
        case 'Basic': return 'Basic';
        default: return 'None';
    }
}

// Extracts operation and entity logical name from privilege name string.
// e.g. "prvCreatemyprefix_Application" → { op: "create", entityLogical: "myprefix_Application" }
// e.g. "prvAppendTomyprefix_Application" → { op: "appendTo", entityLogical: "myprefix_Application" }
const PRIV_REGEX =
    /^prv(Create|Read|Write|Delete|AppendTo|Append|Assign|Share)(.+)$/i;

interface ParsedPrivilege {
    op: keyof Omit<EntityPrivileges, 'entityName' | 'entityLogicalName'>;
    entityLogical: string;
    originalEntityPart: string;
    level: PrivilegeLevel;
}

function parsePrivilegeName(
    name: string,
    level: string | undefined,
    publisherPrefix?: string
): ParsedPrivilege | null {
    const match = name.match(PRIV_REGEX);
    if (!match) return null;

    const opRaw = match[1].toLowerCase() as string;
    const entityPart = match[2];

    // If a publisher prefix is provided, only accept entities with that prefix.
    // e.g. publisherPrefix="AppName" filters to "myprefix_*" entities only.
    if (publisherPrefix) {
        if (!entityPart.toLowerCase().startsWith(`${publisherPrefix.toLowerCase()}_`)) return null;
    } else {
        // Without a prefix, at minimum require an underscore (i.e. exclude standard OOB entities).
        if (!entityPart.includes('_')) return null;
    }

    // Normalise entity logical name to lowercase
    const entityLogical = entityPart.toLowerCase();

    const op = opRaw === 'appendto'
        ? 'appendTo'
        : (opRaw as keyof Omit<EntityPrivileges, 'entityName' | 'entityLogicalName'>);

    return { op, entityLogical, originalEntityPart: entityPart, level: parseLevel(level) };
}

// Derives a display name from the original (pre-lowercase) entity part.
// Strips the publisher prefix: "myprefix_LeaveType" → "LeaveType"
function deriveDisplayName(originalEntityPart: string): string {
    const withoutPrefix = originalEntityPart.replace(/^[a-zA-Z0-9]+_/, '');
    return withoutPrefix.charAt(0).toUpperCase() + withoutPrefix.slice(1);
}

function emptyPrivileges(
    entityLogical: string,
    originalEntityPart: string
): EntityPrivileges {
    return {
        entityName: deriveDisplayName(originalEntityPart),
        entityLogicalName: entityLogical,
        create: 'None',
        read: 'None',
        write: 'None',
        delete: 'None',
        append: 'None',
        appendTo: 'None',
        assign: 'None',
        share: 'None',
    };
}

export function parseSecurityRole(filePath: string, publisherPrefix?: string): SecurityRoleModel {
    const xml = fs.readFileSync(filePath, 'utf-8');
    const doc = parser.parse(xml);
    const role = doc['Role'];

    const id: string = role['@_id'] ?? '';
    const name: string = role['@_name'] ?? path.basename(filePath, '.xml');
    const isCustomizable = String(role['IsCustomizable']) === '1';
    const isAutoAssigned = String(role['IsAutoAssigned']) === '1';

    // Build entity privilege map
    const entityMap = new Map<string, EntityPrivileges>();

    const rawPrivileges = role['RolePrivileges']?.['RolePrivilege'];
    const privArray = Array.isArray(rawPrivileges)
        ? rawPrivileges
        : rawPrivileges
            ? [rawPrivileges]
            : [];

    for (const priv of privArray) {
        const privName: string = priv['@_name'] ?? '';
        const level: string = priv['@_level'] ?? '';

        const parsed = parsePrivilegeName(privName, level, publisherPrefix);
        if (!parsed) continue;

        if (!entityMap.has(parsed.entityLogical)) {
            entityMap.set(parsed.entityLogical, emptyPrivileges(parsed.entityLogical, parsed.originalEntityPart));
        }

        const entry = entityMap.get(parsed.entityLogical)!;
        entry[parsed.op] = parsed.level;
    }

    // Sort entities alphabetically by display name
    const privileges = Array.from(entityMap.values()).sort((a, b) =>
        a.entityName.localeCompare(b.entityName)
    );

    return { id, name, isCustomizable, isAutoAssigned, privileges };
}

/**
 * Scans a solution's Roles/ folder and returns a model per role file.
 * Pass publisherPrefix (e.g. "AppName") to filter privileges to that solution's
 * custom entities only. Without it, all entities with underscores are included.
 */
export function parseSecurityRoles(solutionRoot: string, publisherPrefix?: string): SecurityRoleModel[] {
    const rolesDir = path.join(solutionRoot, 'Roles');
    if (!fs.existsSync(rolesDir)) return [];

    return fs
        .readdirSync(rolesDir)
        .filter(f => f.endsWith('.xml'))
        .map(f => parseSecurityRole(path.join(rolesDir, f), publisherPrefix))
        .filter(r => r.name.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name));
}
