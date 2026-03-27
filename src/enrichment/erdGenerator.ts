import type { TableModel } from '../ir/index.js';

export interface ErdConfig {
  /** Logical names of entities to exclude entirely (node + all edges) */
  excludeEntities?: string[];
  /** Relationship schema names to exclude (specific edges) */
  excludeRelationships?: string[];
}

/**
 * Generates a Mermaid ER diagram from the merged solution tables.
 *
 * Filtering rules:
 * 1. Only include relationships where both sides have the publisher prefix
 *    (skips ownerid/createdby/systemuser noise automatically)
 * 2. Remove entities listed in erdConfig.excludeEntities
 * 3. Remove relationships listed in erdConfig.excludeRelationships by schema name
 * 4. Self-referential relationships are always skipped
 *
 * Returns a Mermaid erDiagram string wrapped in ADO Wiki :::mermaid fences,
 * or empty string if no qualifying relationships found.
 */
export function generateERDiagram(
  tables: TableModel[],
  publisherPrefix?: string,
  erdConfig?: ErdConfig
): string {
  const excludeEntities = new Set(
    (erdConfig?.excludeEntities ?? []).map(e => e.toLowerCase())
  );
  const excludeRelationships = new Set(
    (erdConfig?.excludeRelationships ?? []).map(r => r.toLowerCase())
  );

  const prefix = publisherPrefix ? `${publisherPrefix.toLowerCase()}_` : null;

  // Set of custom entity logical names
  const customEntityNames = new Set(
    tables
      .filter(t => !prefix || t.logicalName.toLowerCase().startsWith(prefix))
      .map(t => t.logicalName.toLowerCase())
  );

  // Display name map: logicalName → safe Mermaid node label
  const displayMap = new Map<string, string>();
  for (const t of tables) {
    displayMap.set(t.logicalName.toLowerCase(), safeMermaidName(t.displayName));
  }

  // Collect unique relationships — each relationship appears on both table sides,
  // use schema name as dedup key
  const seen = new Set<string>();
  const edges: { from: string; to: string }[] = [];

  for (const table of tables) {
    for (const rel of table.relationships) {
      if (seen.has(rel.name)) continue;
      seen.add(rel.name);

      const from = rel.referencedEntity.toLowerCase();  // parent/one side
      const to = rel.referencingEntity.toLowerCase();   // child/many side

      // Both sides must be custom entities
      if (prefix && (!customEntityNames.has(from) || !customEntityNames.has(to))) continue;

      // Skip excluded entities
      if (excludeEntities.has(from) || excludeEntities.has(to)) continue;

      // Skip excluded relationships
      if (excludeRelationships.has(rel.name.toLowerCase())) continue;

      // Skip self-referential
      if (from === to) continue;

      edges.push({ from, to });
    }
  }

  if (edges.length === 0) return '';

  // Collect all entity nodes used in at least one edge
  const usedEntities = new Set<string>();
  for (const e of edges) {
    usedEntities.add(e.from);
    usedEntities.add(e.to);
  }

  const lines: string[] = ['erDiagram'];

  // Entity declarations — no columns per design decision
  for (const logicalName of [...usedEntities].sort()) {
    const label = displayMap.get(logicalName) ?? safeMermaidName(logicalName);
    lines.push(`    ${label} {`);
    lines.push(`    }`);
  }

  lines.push('');

  // Relationship edges — ||--o{ = one (parent) to many (child)
  for (const edge of edges) {
    const fromLabel = displayMap.get(edge.from) ?? safeMermaidName(edge.from);
    const toLabel = displayMap.get(edge.to) ?? safeMermaidName(edge.to);
    lines.push(`    ${fromLabel} ||--o{ ${toLabel} : " "`);
  }

  return `:::mermaid\n${lines.join('\n')}\n:::`;
}

/**
 * Converts a display name to a safe Mermaid ER entity identifier.
 * Mermaid ER node names must be alphanumeric + underscores only.
 * "Leave Request" → "LeaveRequest"
 */
function safeMermaidName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^\s+/, '')
    || 'Entity';
}