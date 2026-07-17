import { describe, it, expect } from 'vitest';
import { resolveFlowTableDependencies } from '../../src/enrichment/dependencyResolver.js';
import { aFlow, aTable, aTrigger, anAction } from '../fixtures/ir.js';

// A flow with no trigger entity and no actions — the base for tests that want to
// state exactly one reference and nothing else.
const bareFlow = (id: string, name = 'Bare Flow') =>
  aFlow({ id, name, trigger: aTrigger({ entity: undefined }), actions: [] });

/** Names of the flows recorded against a table, for readable assertions. */
const flowNames = (deps: ReturnType<typeof resolveFlowTableDependencies>, logicalName: string) =>
  (deps.tableToFlows.get(logicalName) ?? []).map(f => f.name);

/** Logical names of the tables recorded against a flow. */
const tableNames = (deps: ReturnType<typeof resolveFlowTableDependencies>, flowId: string) =>
  (deps.flowToTables.get(flowId) ?? []).map(t => t.logicalName);

describe('resolveFlowTableDependencies — nothing to resolve', () => {
  it('returns empty maps when there are no flows', () => {
    const deps = resolveFlowTableDependencies([], [aTable()]);
    expect(deps.tableToFlows.size).toBe(0);
    expect(deps.flowToTables.size).toBe(0);
  });

  it('returns empty maps when there are no tables', () => {
    const deps = resolveFlowTableDependencies([aFlow()], []);
    expect(deps.tableToFlows.size).toBe(0);
    expect(deps.flowToTables.size).toBe(0);
  });

  it('returns empty maps when both sides are empty', () => {
    const deps = resolveFlowTableDependencies([], []);
    expect(deps.tableToFlows.size).toBe(0);
    expect(deps.flowToTables.size).toBe(0);
  });
});

describe('resolveFlowTableDependencies — matching', () => {
  it('links a flow to the table its trigger fires on, in both directions', () => {
    const deps = resolveFlowTableDependencies(
      [aFlow({ ...bareFlow('f1', 'On Widget Create'), trigger: aTrigger({ entity: 'acme_widget' }) })],
      [aTable({ logicalName: 'acme_widget' })],
    );
    expect(flowNames(deps, 'acme_widget')).toEqual(['On Widget Create']);
    expect(tableNames(deps, 'f1')).toEqual(['acme_widget']);
  });

  it('links a flow to a table referenced only by an action', () => {
    const deps = resolveFlowTableDependencies(
      [aFlow({
        ...bareFlow('f1', 'Create Part'),
        actions: [anAction({ entityName: 'acme_part' })],
      })],
      [aTable({ logicalName: 'acme_part' })],
    );
    expect(flowNames(deps, 'acme_part')).toEqual(['Create Part']);
    expect(tableNames(deps, 'f1')).toEqual(['acme_part']);
  });

  it('picks up entity references from nested actions regardless of depth', () => {
    // Actions inside an If/Scope still touch the table; depth is presentational.
    const deps = resolveFlowTableDependencies(
      [aFlow({
        ...bareFlow('f1'),
        actions: [anAction({ entityName: 'acme_part', depth: 2, parentName: 'Condition' })],
      })],
      [aTable({ logicalName: 'acme_part' })],
    );
    expect(tableNames(deps, 'f1')).toEqual(['acme_part']);
  });

  it('records every distinct table a flow touches', () => {
    const deps = resolveFlowTableDependencies(
      [aFlow({
        ...bareFlow('f1', 'Widget To Part'),
        trigger: aTrigger({ entity: 'acme_widget' }),
        actions: [anAction({ entityName: 'acme_part' })],
      })],
      [aTable({ logicalName: 'acme_widget' }), aTable({ logicalName: 'acme_part' })],
    );
    expect(tableNames(deps, 'f1')).toEqual(['acme_widget', 'acme_part']);
    expect(flowNames(deps, 'acme_widget')).toEqual(['Widget To Part']);
    expect(flowNames(deps, 'acme_part')).toEqual(['Widget To Part']);
  });

  it('accumulates every flow that touches the same table', () => {
    const deps = resolveFlowTableDependencies(
      [
        aFlow({ ...bareFlow('f1', 'First'), trigger: aTrigger({ entity: 'acme_widget' }) }),
        aFlow({ ...bareFlow('f2', 'Second'), trigger: aTrigger({ entity: 'acme_widget' }) }),
        aFlow({ ...bareFlow('f3', 'Third'), actions: [anAction({ entityName: 'acme_widget' })] }),
      ],
      [aTable({ logicalName: 'acme_widget' })],
    );
    expect(flowNames(deps, 'acme_widget')).toEqual(['First', 'Second', 'Third']);
    // Each flow still gets its own entry keyed by id.
    expect(deps.flowToTables.size).toBe(3);
  });

  it('ignores a trigger with no entity, such as a scheduled flow', () => {
    const deps = resolveFlowTableDependencies(
      [aFlow({ ...bareFlow('f1'), trigger: aTrigger({ type: 'Scheduled', entity: undefined }) })],
      [aTable({ logicalName: 'acme_widget' })],
    );
    expect(deps.tableToFlows.size).toBe(0);
    expect(deps.flowToTables.size).toBe(0);
  });

  it('ignores actions with no entityName, such as a Compose', () => {
    const deps = resolveFlowTableDependencies(
      [aFlow({
        ...bareFlow('f1'),
        actions: [anAction({ type: 'Compose', operationId: '', entityName: undefined })],
      })],
      [aTable({ logicalName: 'acme_widget' })],
    );
    expect(deps.flowToTables.size).toBe(0);
    expect(deps.tableToFlows.size).toBe(0);
  });

  it('omits flows that reference no table in this solution, from both maps', () => {
    // Most Dataverse tables a flow touches are standard/uncustomised and have no
    // TableModel here. Such a flow must be absent, not present with an empty list —
    // the assemblers do `flowToTables.get(id) ?? []`, and an empty array entry would
    // render a "Related Tables" section with nothing in it.
    const deps = resolveFlowTableDependencies(
      [aFlow({
        ...bareFlow('f1'),
        trigger: aTrigger({ entity: 'systemuser' }),
        actions: [anAction({ entityName: 'annotations' })],
      })],
      [aTable({ logicalName: 'acme_widget' })],
    );
    expect(deps.tableToFlows.size).toBe(0);
    expect(deps.flowToTables.has('f1')).toBe(false);
  });

  it('keeps matching flows while dropping non-matching ones', () => {
    const deps = resolveFlowTableDependencies(
      [
        aFlow({ ...bareFlow('f1', 'Matches'), trigger: aTrigger({ entity: 'acme_widget' }) }),
        aFlow({ ...bareFlow('f2', 'Misses'), trigger: aTrigger({ entity: 'account' }) }),
      ],
      [aTable({ logicalName: 'acme_widget' })],
    );
    expect(flowNames(deps, 'acme_widget')).toEqual(['Matches']);
    expect(deps.flowToTables.has('f2')).toBe(false);
  });
});

describe('resolveFlowTableDependencies — case-insensitivity', () => {
  it('matches when the flow references the entity in a different case', () => {
    // Flow JSON is not consistent about casing; a case-sensitive compare would
    // silently drop the link and the wiki would claim no flow uses the table.
    const deps = resolveFlowTableDependencies(
      [aFlow({ ...bareFlow('f1', 'Shouty'), trigger: aTrigger({ entity: 'ACME_Widget' }) })],
      [aTable({ logicalName: 'acme_widget' })],
    );
    expect(tableNames(deps, 'f1')).toEqual(['acme_widget']);
  });

  it('matches when the table logical name is not lowercase, and keys the map lowercase', () => {
    // The assemblers look up with `table.logicalName.toLowerCase()`, so the key
    // must be lowercased no matter how the table's own casing arrived.
    const deps = resolveFlowTableDependencies(
      [aFlow({ ...bareFlow('f1', 'Mixed'), trigger: aTrigger({ entity: 'acme_widget' }) })],
      [aTable({ logicalName: 'AcMe_WidGet' })],
    );
    expect([...deps.tableToFlows.keys()]).toEqual(['acme_widget']);
    expect(flowNames(deps, 'acme_widget')).toEqual(['Mixed']);
    // The TableModel handed back is the real one, with its original casing intact.
    expect(tableNames(deps, 'f1')).toEqual(['AcMe_WidGet']);
  });

  it('matches a mixed-case plural reference against a mixed-case table', () => {
    const deps = resolveFlowTableDependencies(
      [aFlow({ ...bareFlow('f1'), actions: [anAction({ entityName: 'Opportunities' })] })],
      [aTable({ logicalName: 'Opportunity' })],
    );
    expect(tableNames(deps, 'f1')).toEqual(['Opportunity']);
  });
});

describe('resolveFlowTableDependencies — plural entity-set names', () => {
  // Dataverse connector actions reference the entity-set name (plural) while
  // TableModel.logicalName is singular. Each of these is a real pluralisation
  // pattern Dataverse's default entity-set naming produces.

  it("resolves an 'ies' plural to a 'y' singular", () => {
    const deps = resolveFlowTableDependencies(
      [aFlow({ ...bareFlow('f1'), actions: [anAction({ entityName: 'opportunities' })] })],
      [aTable({ logicalName: 'opportunity' })],
    );
    expect(tableNames(deps, 'f1')).toEqual(['opportunity']);
  });

  it("resolves a 'ses' plural by stripping 'es'", () => {
    const deps = resolveFlowTableDependencies(
      [aFlow({ ...bareFlow('f1'), actions: [anAction({ entityName: 'addresses' })] })],
      [aTable({ logicalName: 'address' })],
    );
    expect(tableNames(deps, 'f1')).toEqual(['address']);
  });

  it("resolves an 'es' plural by stripping 'es'", () => {
    const deps = resolveFlowTableDependencies(
      [aFlow({ ...bareFlow('f1'), actions: [anAction({ entityName: 'acme_boxes' })] })],
      [aTable({ logicalName: 'acme_box' })],
    );
    expect(tableNames(deps, 'f1')).toEqual(['acme_box']);
  });

  it("resolves a plain 's' plural by stripping 's'", () => {
    const deps = resolveFlowTableDependencies(
      [aFlow({ ...bareFlow('f1'), actions: [anAction({ entityName: 'accounts' })] })],
      [aTable({ logicalName: 'account' })],
    );
    expect(tableNames(deps, 'f1')).toEqual(['account']);
  });

  it('resolves a prefixed custom plural such as vel_approvals', () => {
    const deps = resolveFlowTableDependencies(
      [aFlow({ ...bareFlow('f1'), trigger: aTrigger({ entity: 'vel_approvals' }) })],
      [aTable({ logicalName: 'vel_approval' })],
    );
    expect(tableNames(deps, 'f1')).toEqual(['vel_approval']);
  });

  it('prefers an exact match over a singularised one', () => {
    // If a table really is named with a trailing 's', the raw name must win —
    // otherwise 'acme_status' would resolve to an unrelated 'acme_statu'.
    const deps = resolveFlowTableDependencies(
      [aFlow({ ...bareFlow('f1'), trigger: aTrigger({ entity: 'acme_widgets' }) })],
      [
        // Deliberately ordered so the singular is the earlier table: the exact
        // match must still win on candidate order, not on table order.
        aTable({ logicalName: 'acme_widget', displayName: 'Widget' }),
        aTable({ logicalName: 'acme_widgets', displayName: 'Widgets (a table really called this)' }),
      ],
    );
    expect(tableNames(deps, 'f1')).toEqual(['acme_widgets']);
    expect(deps.tableToFlows.has('acme_widget')).toBe(false);
  });

  it('does not invent a match when no candidate exists', () => {
    // None of 'acme_gadgets' / 'acme_gadget' names a table here, so there must be
    // no false link — a near-miss must not be rounded to the nearest table.
    const deps = resolveFlowTableDependencies(
      [aFlow({ ...bareFlow('f1'), trigger: aTrigger({ entity: 'acme_gadgets' }) })],
      [aTable({ logicalName: 'acme_widget' })],
    );
    expect(deps.flowToTables.size).toBe(0);
    expect(deps.tableToFlows.size).toBe(0);
  });

  it("prefers the 'ies'->'y' candidate over the plain 's' strip", () => {
    // The transforms are tried in a fixed order, and more than one can hit a real
    // table. 'acme_stories' offers 'acme_story' ('ies'->'y') and 'acme_storie'
    // ('s' strip); the English-correct singular must win. Table order is reversed
    // against the candidate order so it is candidate precedence being proven.
    const deps = resolveFlowTableDependencies(
      [aFlow({ ...bareFlow('f1'), trigger: aTrigger({ entity: 'acme_stories' }) })],
      [aTable({ logicalName: 'acme_storie' }), aTable({ logicalName: 'acme_story' })],
    );
    expect(tableNames(deps, 'f1')).toEqual(['acme_story']);
    expect(deps.tableToFlows.has('acme_storie')).toBe(false);
  });
});

describe('resolveFlowTableDependencies — pluralisation length guards', () => {
  // Entity names shorter than the suffix being stripped must not produce empty
  // or nonsense candidates that crash or match the wrong table.

  it('handles an entity named exactly "ies" without crashing', () => {
    const deps = resolveFlowTableDependencies(
      [aFlow({ ...bareFlow('f1'), trigger: aTrigger({ entity: 'ies' }) })],
      [aTable({ logicalName: 'ies' })],
    );
    expect(tableNames(deps, 'f1')).toEqual(['ies']);
  });

  it('handles an entity named exactly "es" without crashing', () => {
    const deps = resolveFlowTableDependencies(
      [aFlow({ ...bareFlow('f1'), trigger: aTrigger({ entity: 'es' }) })],
      [aTable({ logicalName: 'es' })],
    );
    expect(tableNames(deps, 'f1')).toEqual(['es']);
  });

  it('handles an entity named exactly "s" without crashing', () => {
    const deps = resolveFlowTableDependencies(
      [aFlow({ ...bareFlow('f1'), trigger: aTrigger({ entity: 's' }) })],
      [aTable({ logicalName: 's' })],
    );
    expect(tableNames(deps, 'f1')).toEqual(['s']);
  });

  it.each(['s', 'es', 'ies', 'ses'])(
    'never matches a table with an empty logical name via the short plural %j',
    entity => {
      // A degenerate TableModel keyed on '' must not become the fallback for every
      // short entity name. Each of these is exactly the suffix one branch strips, so
      // an off-by-one in any single length guard would emit '' as a candidate and
      // silently link the flow to the degenerate table. Driving all four means no
      // one guard can regress unnoticed.
      const deps = resolveFlowTableDependencies(
        [aFlow({ ...bareFlow('f1'), trigger: aTrigger({ entity }) })],
        [aTable({ logicalName: '' })],
      );
      expect(deps.flowToTables.size).toBe(0);
      expect(deps.tableToFlows.size).toBe(0);
    },
  );
});

describe('resolveFlowTableDependencies — duplicate references', () => {
  it('lists a flow once when its trigger and an action name the same entity', () => {
    // The raw-name Set dedupes this case: 'acme_widget' is added twice, stored once.
    const deps = resolveFlowTableDependencies(
      [aFlow({
        ...bareFlow('f1', 'Widget Round Trip'),
        trigger: aTrigger({ entity: 'acme_widget' }),
        actions: [
          anAction({ name: 'Update the widget', entityName: 'acme_widget' }),
          anAction({ name: 'Update it again', entityName: 'acme_widget' }),
        ],
      })],
      [aTable({ logicalName: 'acme_widget' })],
    );
    expect(flowNames(deps, 'acme_widget')).toEqual(['Widget Round Trip']);
    expect(tableNames(deps, 'f1')).toEqual(['acme_widget']);
  });

  it('lists a flow once when trigger and action differ only in case', () => {
    // Both are lowercased before entering the Set, so this dedupes too.
    const deps = resolveFlowTableDependencies(
      [aFlow({
        ...bareFlow('f1', 'Case Mix'),
        trigger: aTrigger({ entity: 'acme_widget' }),
        actions: [anAction({ entityName: 'ACME_WIDGET' })],
      })],
      [aTable({ logicalName: 'acme_widget' })],
    );
    expect(flowNames(deps, 'acme_widget')).toEqual(['Case Mix']);
    expect(tableNames(deps, 'f1')).toEqual(['acme_widget']);
  });

  // KNOWN DEFECT — pinned, not a spec. The dedupe Set holds RAW entity strings,
  // but two different raw strings can resolve to the SAME TableModel: a trigger
  // uses the logical name ('acme_widget') while a Dataverse connector action uses
  // the entity-set name ('acme_widgets'). Both survive the Set, both resolve to
  // one table, and the loop pushes into tableToFlows and matchedTables once each.
  //
  // Client-visible impact, on every output format: wikiAssembler.ts:93,
  // docAssembler.ts:142 and pdfAssembler.ts:103 feed tableToFlows straight into
  // renderTableUsedByFlows, so the flow appears as two identical rows under
  // "Used By Flows"; wikiAssembler.ts:133, docAssembler.ts:181 and
  // pdfAssembler.ts:142 feed flowToTables into the flow page, so the table is
  // listed twice under the flow. This is the single most common real shape — a
  // trigger plus a connector action on the same table — so it is likely already
  // shipping.
  //
  // The fix is to dedupe on the resolved table (e.g. a Set of TableModel, or key
  // matchedTables by logicalName) rather than on the raw entity string. Update
  // this test to expect one entry when that lands.
  it('BUG: lists a flow twice when trigger and action resolve to the same table via a plural', () => {
    const deps = resolveFlowTableDependencies(
      [aFlow({
        ...bareFlow('f1', 'Widget Sync'),
        trigger: aTrigger({ entity: 'acme_widget' }),
        actions: [anAction({ name: 'Update a row', entityName: 'acme_widgets' })],
      })],
      [aTable({ logicalName: 'acme_widget' })],
    );
    // Correct behaviour would be ['Widget Sync'] / ['acme_widget'].
    expect(flowNames(deps, 'acme_widget')).toEqual(['Widget Sync', 'Widget Sync']);
    expect(tableNames(deps, 'f1')).toEqual(['acme_widget', 'acme_widget']);
    // And it really is the same object twice, not two lookalike tables.
    const [first, second] = deps.flowToTables.get('f1')!;
    expect(first).toBe(second);
  });
});

describe('resolveFlowTableDependencies — purity', () => {
  it('does not mutate the IR it is handed', () => {
    // The module contract (and the erdGenerator pattern it follows) is read-only
    // IR in, derived data out. A renderer downstream shares these objects.
    const table = aTable({ logicalName: 'acme_widget' });
    const flow = aFlow({ ...bareFlow('f1'), trigger: aTrigger({ entity: 'acme_widget' }) });
    const tableBefore = structuredClone(table);
    const flowBefore = structuredClone(flow);

    const deps = resolveFlowTableDependencies([flow], [table]);

    expect(table).toEqual(tableBefore);
    expect(flow).toEqual(flowBefore);
    // The maps hand back the very same objects, not copies.
    expect(deps.tableToFlows.get('acme_widget')![0]).toBe(flow);
    expect(deps.flowToTables.get('f1')![0]).toBe(table);
  });
});
