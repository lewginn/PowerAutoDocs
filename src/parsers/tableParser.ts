import { XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';
import * as path from 'path';
import { TableModel, ColumnModel, ColumnType } from '../ir/index.js';

// -----------------------------------------------
// STEP 1: Configure the XML parser
// -----------------------------------------------
// fast-xml-parser needs a few options to handle
// Power Platform XML correctly:
// - attributeNamePrefix: when XML nodes have attributes
//   like <Name LocalizedName="foo">, this controls how
//   we access them in JS. We use "@_" so it becomes @_LocalizedName
// - ignoreAttributes: false means DON'T skip attributes
//   (we need them — LocalizedName lives in an attribute)
// - isArray: some nodes should always be arrays even if
//   there's only one item. Without this, a table with one
//   column would give you an object, not an array of one.
const parser = new XMLParser({
  attributeNamePrefix: '@_',
  ignoreAttributes: false,
  isArray: (name) => ['attribute', 'displayname', 'Description', 'LocalizedName'].includes(name)
});

// -----------------------------------------------
// STEP 2: Map PP types to our IR ColumnType
// -----------------------------------------------
// Power Platform has its own internal type names in XML.
// This function translates them to the clean set we
// defined in our IR. If we see something unexpected,
// we return 'unknown' rather than crashing.
function mapColumnType(ppType: string): ColumnType {
  const typeMap: Record<string, ColumnType> = {
    nvarchar: 'string',
    memo: 'memo',
    int: 'integer',
    decimal: 'decimal',
    money: 'money',
    bit: 'boolean',
    datetime: 'datetime',
    lookup: 'lookup',
    owner: 'lookup',
    picklist: 'optionset',
    state: 'optionset',
    status: 'optionset',
    primarykey: 'uniqueidentifier',
    uniqueidentifier: 'uniqueidentifier',
  };
  return typeMap[ppType.toLowerCase()] ?? 'unknown';
}

// -----------------------------------------------
// STEP 3: Helper to safely get a localised string
// -----------------------------------------------
// PP stores display names and descriptions like this:
// <displaynames>
//   <displayname description="My Label" languagecode="1033" />
// </displaynames>
// This helper pulls out the English (1033) one.
// The '??' means "if this is null/undefined, return empty string"
function getEnglishLabel(displaynames: any): string {
  if (!displaynames?.displayname) return '';
  const names = Array.isArray(displaynames.displayname)
    ? displaynames.displayname
    : [displaynames.displayname];
  const english = names.find((n: any) => n['@_languagecode'] === '1033');
  return english?.['@_description'] ?? '';
}

// -----------------------------------------------
// STEP 4: Parse a single column (attribute) node
// -----------------------------------------------
// This takes one <attribute> XML node (already parsed
// into a JS object by fast-xml-parser) and maps it
// to our clean ColumnModel IR shape.
function parseColumn(attr: any): ColumnModel {
  return {
    logicalName: attr.LogicalName ?? '',
    displayName: getEnglishLabel(attr.displaynames),
    description: getEnglishLabel(attr.Descriptions),
    type: mapColumnType(attr.Type ?? 'unknown'),
    isRequired: attr.RequiredLevel === 'required' || attr.RequiredLevel === 'systemrequired',
    isCustom: attr.IsCustomField === '1' || attr.IsCustomField === 1,
    // maxLength only exists on string/memo fields
    maxLength: attr.MaxLength ? parseInt(attr.MaxLength) : undefined,
    // targets only exists on lookup fields — which tables does it point to?
    // We'll flesh this out more when we parse relationships
    targets: undefined,
  };
}

// -----------------------------------------------
// STEP 5: The main exported function
// -----------------------------------------------
// This is what the rest of the app will call.
// Give it a path to an Entity.xml file, get back
// a fully typed TableModel.
export function parseEntityXml(entityXmlPath: string): TableModel {
  // Read the raw file from disk
  const raw = fs.readFileSync(entityXmlPath, 'utf-8');

  // Parse XML string into a plain JS object
  const parsed = parser.parse(raw);

  // Navigate to the entity node inside the parsed object
  // This mirrors the XML structure:
  // <Entity> → <EntityInfo> → <entity>
  const entity = parsed?.Entity?.EntityInfo?.entity;
  if (!entity) {
    throw new Error(`Could not find entity node in: ${entityXmlPath}`);
  }

  // Pull the top-level name info from the <Name> element
  // <Name LocalizedName="DocGen Application">myprefix_DocGenApplication</Name>
  const nameNode = parsed?.Entity?.Name;
  const logicalName = typeof nameNode === 'string' ? nameNode : nameNode?.['#text'] ?? '';
  const displayName = nameNode?.['@_LocalizedName'] ?? logicalName;

  // Get the plural display name from LocalizedCollectionNames
  const collectionName = getEnglishLabel(entity.LocalizedCollectionNames);

  // Get the entity description
  const description = getEnglishLabel(entity.Descriptions);

  // Parse all columns — filter out undefined just in case
  const rawAttributes = entity.attributes?.attribute ?? [];
  const columns: ColumnModel[] = rawAttributes.map(parseColumn).filter(Boolean);

  // Build and return the TableModel
  return {
    logicalName,
    displayName,
    pluralDisplayName: collectionName,
    description,
    isCustom: logicalName.includes('_'), // custom tables have publisher prefix
    isActivity: entity.IsActivity === '1' || entity.IsActivity === 1,
    columns,
    relationships: [], // will be populated by relationship parser later
    forms: [],         // will be populated by form parser later
    views: [],         // will be populated by view parser later
  };
}