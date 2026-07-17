import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseClassicWorkflows } from '../../src/parsers/classicWorkflowParser.js';
import type { ClassicWorkflowModel } from '../../src/ir/classicWorkflow.js';

const SOLUTION = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'fixtures', 'solutions', 'ContosoDemo',
);

const workflows = parseClassicWorkflows(SOLUTION);
const byName = (name: string): ClassicWorkflowModel => {
  const wf = workflows.find(w => w.name === name);
  if (!wf) throw new Error(`No classic workflow named "${name}" — fixture drifted. Got: ${workflows.map(w => w.name).join(', ')}`);
  return wf;
};

describe('parseClassicWorkflows', () => {
  it('reads both pac CLI naming conventions and sorts by name', () => {
    // "Approve widget" is exported as ContosoWidgetApproval_xaml_data.xml (pac v1) and
    // "Zeta widget action" as ContosoWidgetAction.xaml.data.xml (pac v2). The fixture names
    // are deliberately not in readdir order, so this fails if the sort is dropped, and it
    // fails if either naming convention stops being recognised.
    expect(workflows.map(w => w.name)).toEqual([
      'Approve widget',
      'Contoso orphan workflow',
      'Empty xaml workflow',
      'Zeta widget action',
    ]);
  });

  describe('metadata', () => {
    it('maps the metadata onto the IR', () => {
      const wf = byName('Approve widget');
      expect(wf.id).toBe('9a1f0c3e-3000-4000-8000-000000000001'); // braces stripped
      expect(wf.entity).toBe('contoso_widget');
      expect(wf.category).toBe('workflow');
      expect(wf.mode).toBe('realtime');
      expect(wf.scope).toBe('user');
      expect(wf.runAs).toBe('owner');
      expect(wf.status).toBe('active');
    });

    it('reads Category 3 as an action rather than a workflow', () => {
      // Actions are callable from flows; workflows are not. Conflating them would
      // misdescribe what a caller can do with the component.
      expect(byName('Zeta widget action').category).toBe('action');
      expect(byName('Approve widget').category).toBe('workflow');
    });

    it('reads Mode, Scope, RunAs and StateCode on their non-default values', () => {
      const action = byName('Zeta widget action');
      expect(action.mode).toBe('background');
      expect(action.scope).toBe('businessunit');
      expect(action.runAs).toBe('callinguser');
      expect(action.status).toBe('inactive');
    });

    it('defaults scope to organization when the Scope element is absent', () => {
      expect(byName('Contoso orphan workflow').scope).toBe('organization');
    });
  });

  describe('triggers', () => {
    it('splits TriggerOnUpdateAttributeList into trimmed field names', () => {
      expect(byName('Approve widget').triggers).toEqual({
        onCreate: true,
        onUpdate: true,
        onDelete: false,
        onDemand: true,
        updateFields: ['contoso_status', 'contoso_amount'],
      });
    });

    it('treats a present UpdateStage as onUpdate even with no attribute list', () => {
      // A workflow registered on the update stage fires on *any* field change; reporting
      // onUpdate: false there would tell a reader the opposite of the truth.
      const action = byName('Zeta widget action');
      expect(action.triggers.onUpdate).toBe(true);
      expect(action.triggers.updateFields).toEqual([]);
      expect(action.triggers.onDelete).toBe(true);
      expect(action.triggers.onCreate).toBe(false);
    });

    it('reports no triggers at all when no trigger elements are present', () => {
      expect(byName('Empty xaml workflow').triggers).toEqual({
        onCreate: false,
        onUpdate: false,
        onDelete: false,
        onDemand: false,
        updateFields: [],
      });
    });
  });

  describe('XAML steps', () => {
    it('extracts top-level Sequences as create/terminate steps with the fields they write', () => {
      expect(byName('Zeta widget action').steps).toEqual([
        {
          name: 'CreateStep1: Raise an escalation',
          type: 'create',
          entity: 'contoso_escalation',
          setFields: ['contoso_name', 'contoso_tier'],
        },
        {
          name: 'StopWorkflowStep2: Escalation already open',
          type: 'terminate',
          // No stepLabelDescription variable in this fixture, so the message is recovered
          // from the DisplayName with the "StopWorkflowStepN: " prefix stripped.
          errorMessage: 'Escalation already open',
        },
      ]);
    });

    it('nests condition branches, recursing into conditions inside conditions', () => {
      // Classic workflows are trees; flattening them, or stopping at the first level,
      // would lose the "only when over the limit" qualifier on the terminate step.
      expect(byName('Approve widget').steps).toEqual([
        {
          name: 'ConditionStep1: Check status',
          type: 'condition',
          conditionFields: ['contoso_status'],
          thenSteps: [
            {
              name: 'UpdateStep1: Stamp approval',
              type: 'update',
              entity: 'contoso_widget',
              // Both read (GetEntityProperty) and written (SetEntityProperty) fields,
              // deduplicated, in document order.
              setFields: ['contoso_amount', 'contoso_approvedon', 'contoso_approvedby'],
            },
            {
              name: 'ConditionStep2: Check amount',
              type: 'condition',
              conditionFields: ['contoso_amount'],
              thenSteps: [
                {
                  name: 'StopWorkflowStep1: Over the limit',
                  type: 'terminate',
                  // Taken from the stepLabelDescription variable, which is the author's
                  // own wording and beats the generated DisplayName.
                  errorMessage: 'Widget amount exceeds the approval limit.',
                },
              ],
            },
          ],
        },
        {
          // An activity the parser has no model for still has to be listed — a step the
          // docs omit entirely is worse than one described vaguely.
          name: 'CustomStep1: Call a custom assembly',
          type: 'other',
        },
      ]);
    });
  });

  describe('separation from the other Workflows/ component types', () => {
    it('skips business rules, which use the same _xaml_data.xml file naming', () => {
      // Business rules are Category 2 and live alongside classic workflows in Workflows/.
      // Only the Category check separates them.
      for (const name of ['Show approval fields', 'Zulu amount rule', 'Alpha server rule']) {
        expect(workflows.some(w => w.name === name)).toBe(false);
      }
    });

    it('ignores modern flow XML, which does not use the data-file suffix', () => {
      expect(workflows.some(w => w.name.includes('widget create'))).toBe(false);
    });
  });

  describe('degradation', () => {
    it('returns empty for a solution with no Workflows folder', () => {
      expect(parseClassicWorkflows(path.join(SOLUTION, 'Other'))).toEqual([]);
    });

    it('emits metadata with no steps when the sibling .xaml is missing', () => {
      // Exports do drop the XAML for some managed workflows. Name, entity and triggers
      // are still worth documenting, so the workflow must not be discarded.
      const orphan = byName('Contoso orphan workflow');
      expect(orphan.steps).toEqual([]);
      expect(orphan.entity).toBe('contoso_widget');
    });

    it('emits metadata with no steps when the .xaml carries no Workflow node', () => {
      expect(byName('Empty xaml workflow').steps).toEqual([]);
    });

    it('skips a data file with no Workflow node instead of emitting a blank record', () => {
      // ContosoBrokenClassic_xaml_data.xml has the right filename but the wrong root.
      // A record with an empty name would sort to the top of the docs and cross-link
      // to nothing.
      expect(workflows.some(w => !w.name)).toBe(false);
      expect(workflows).toHaveLength(4);
    });
  });
});
