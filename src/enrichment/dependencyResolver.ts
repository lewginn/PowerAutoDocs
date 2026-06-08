// enrichment/dependencyResolver.ts
//
// Cross-references Power Automate Flows against Dataverse Tables to surface
// which flows touch which tables — purely derived from already-parsed IR,
// returned as lookup maps (matches the erdGenerator pattern: read-only IR in,
// derived data out — nothing is mutated on the IR objects).

import type { FlowModel, TableModel } from '../ir/index.js';

export interface FlowTableDependencies {
  /** Table logical name (lowercase) → flows that reference it */
  tableToFlows: Map<string, FlowModel[]>;
  /** Flow id → tables it references */
  flowToTables: Map<string, TableModel[]>;
}

/**
 * Dataverse connector actions reference entities by their (often plural)
 * entity-set name — e.g. `opportunities`, `vel_approvals` — while
 * TableModel.logicalName is singular (`opportunity`, `vel_approval`). These
 * candidates cover the common English pluralisation patterns Dataverse's
 * default entity-set naming follows, so a plural reference still resolves to
 * its singular logical name.
 */
function singularCandidates(name: string): string[] {
  const candidates = [name];
  if (name.endsWith('ies') && name.length > 3) candidates.push(name.slice(0, -3) + 'y');
  if (name.endsWith('ses') && name.length > 3) candidates.push(name.slice(0, -2));
  if (name.endsWith('es') && name.length > 2) candidates.push(name.slice(0, -2));
  if (name.endsWith('s') && name.length > 1) candidates.push(name.slice(0, -1));
  return candidates;
}

/**
 * Matches each flow's trigger entity and action entityName fields against
 * the solution's TableModels by logical name (case-insensitive, with a
 * singular/plural fallback). Flows that don't reference any table present in
 * this solution are omitted from both maps — most Dataverse tables a flow
 * touches are standard/uncustomised and won't have a TableModel here.
 */
export function resolveFlowTableDependencies(
  flows: FlowModel[],
  tables: TableModel[]
): FlowTableDependencies {
  const tableByLogicalName = new Map(tables.map(t => [t.logicalName.toLowerCase(), t]));

  const tableToFlows = new Map<string, FlowModel[]>();
  const flowToTables = new Map<string, TableModel[]>();

  for (const flow of flows) {
    const entityNames = new Set<string>();
    if (flow.trigger.entity) entityNames.add(flow.trigger.entity.toLowerCase());
    for (const action of flow.actions) {
      if (action.entityName) entityNames.add(action.entityName.toLowerCase());
    }

    const matchedTables: TableModel[] = [];
    for (const entityName of entityNames) {
      const table = singularCandidates(entityName)
        .map(candidate => tableByLogicalName.get(candidate))
        .find((t): t is TableModel => t !== undefined);
      if (!table) continue;

      matchedTables.push(table);

      const existing = tableToFlows.get(table.logicalName.toLowerCase()) ?? [];
      existing.push(flow);
      tableToFlows.set(table.logicalName.toLowerCase(), existing);
    }

    if (matchedTables.length > 0) {
      flowToTables.set(flow.id, matchedTables);
    }
  }

  return { tableToFlows, flowToTables };
}
