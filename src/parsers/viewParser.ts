import { XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';
import * as path from 'path';
import type { ViewModel, ViewFilterCondition } from '../ir/index.js';

const parser = new XMLParser({
  attributeNamePrefix: '@_',
  ignoreAttributes: false,
  isArray: (name) => ['cell', 'LocalizedName', 'condition', 'filter', 'link-entity'].includes(name)
});

function mapViewType(querytype: number, isQuickFind: boolean): ViewModel['type'] {
  if (isQuickFind) return 'Quick Find';
  const typeMap: Record<number, ViewModel['type']> = {
    0: 'Public',
    1: 'System',
    2: 'Associated',
    64: 'Lookup',
    128: 'SubGrid',
  };
  return typeMap[querytype] ?? 'Other';
}

function buildAliasMap(fetchxml: any): Record<string, string> {
  const map: Record<string, string> = {};
  const entity = fetchxml?.fetch?.entity;
  if (!entity) return map;

  function processLinks(linkEntity: any) {
    if (!linkEntity) return;
    const links = Array.isArray(linkEntity) ? linkEntity : [linkEntity];
    for (const link of links) {
      const alias = link['@_alias'];
      const joinField = link['@_to'];  // ← was link['@_name']
      if (alias && joinField) map[alias] = joinField;
      if (link['link-entity']) processLinks(link['link-entity']);
    }
  }

  processLinks(entity['link-entity']);
  return map;
}

function extractFilters(fetchxml: any): ViewFilterCondition[] {
  const entity = fetchxml?.fetch?.entity;
  if (!entity) return [];

  const conditions: ViewFilterCondition[] = [];

  function processFilter(filter: any, depth: number) {
    if (!filter) return;
    const filters = Array.isArray(filter) ? filter : [filter];
    for (const f of filters) {
      if (f?.['@_isquickfindfields'] === '1') continue;
      const groupType = f['@_type'] ?? 'and';
      const rawConditions = Array.isArray(f.condition)
        ? f.condition
        : [f.condition].filter(Boolean);
      for (const condition of rawConditions) {
        if (!condition?.['@_attribute']) continue;
        conditions.push({
          attribute: condition['@_attribute'],
          operator: condition['@_operator'] ?? '',
          value: condition['@_value'],
          filterType: groupType,
          depth,
        });
      }
    }
  }

  function processLinkEntity(linkEntity: any, depth: number) {
    if (!linkEntity) return;
    const links = Array.isArray(linkEntity) ? linkEntity : [linkEntity];
    for (const link of links) {
      const entityName = link['@_name'] ?? '';
      const linkType = link['@_link-type'] ?? 'inner';
      const joinField = link['@_to'] ?? '';

      conditions.push({
        attribute: entityName,
        operator: linkType === 'inner' ? 'must have data' : 'optional',
        isJoin: true,
        joinType: linkType,
        joinField,
        depth,
      });

      processFilter(link.filter, depth + 1);

      if (link['link-entity']) processLinkEntity(link['link-entity'], depth + 1);
    }
  }

  processFilter(entity.filter, 0);
  if (entity['link-entity']) processLinkEntity(entity['link-entity'], 1);

  return conditions;
}

export function parseViewXml(viewXmlPath: string): ViewModel | null {
  const raw = fs.readFileSync(viewXmlPath, 'utf-8');
  const parsed = parser.parse(raw);

  const query = parsed?.savedqueries?.savedquery;
  if (!query) {
    console.warn(`No savedquery found in: ${viewXmlPath}`);
    return null;
  }

  const localizedNames = query.LocalizedNames?.LocalizedName ?? [];
  const nameEntry = localizedNames.find((n: any) => n['@_languagecode'] === '1033');
  const name = nameEntry?.['@_description'] ?? path.basename(viewXmlPath);

  const aliasMap = buildAliasMap(query.fetchxml);

  const cells = query.layoutxml?.grid?.row?.cell ?? [];
  const columns: string[] = cells
    .map((cell: any) => {
      const colName: string = cell['@_name'] ?? '';
      if (colName.includes('.')) {
        const [alias, field] = colName.split('.');
        const tableName = aliasMap[alias] ?? alias;
        return `${tableName}.${field}`;
      }
      return colName;
    })
    .filter(Boolean);

  const querytype = parseInt(query.querytype ?? '0');
  const isQuickFind = Number(query.isquickfindquery) === 1;
  const isDefault = Number(query.isdefault) === 1;

  return {
    name,
    type: mapViewType(querytype, isQuickFind),
    columns,
    description: '',
    isDefault,
    isQuickFind,
    filters: extractFilters(query.fetchxml),
  };
}

export function parseEntityViews(entityFolderPath: string): ViewModel[] {
  const savedQueriesPath = path.join(entityFolderPath, 'SavedQueries');

  if (!fs.existsSync(savedQueriesPath)) return [];

  const files = fs
    .readdirSync(savedQueriesPath)
    .filter(f => f.endsWith('.xml'));

  const views: ViewModel[] = [];

  for (const file of files) {
    const filePath = path.join(savedQueriesPath, file);
    try {
      const view = parseViewXml(filePath);
      if (view) views.push(view);
    } catch (err) {
      console.error(`Failed to parse view: ${file}`, err);
    }
  }

  return views.sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return a.name.localeCompare(b.name);
  });
}