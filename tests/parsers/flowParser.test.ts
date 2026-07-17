import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseAllFlows } from '../../src/parsers/flowParser.js';
import type { FlowModel } from '../../src/ir/index.js';

const SOLUTION = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'fixtures', 'solutions', 'ContosoDemo',
);

const flows = parseAllFlows(SOLUTION);
const byName = (name: string): FlowModel => {
  const flow = flows.find(f => f.name === name);
  if (!flow) throw new Error(`No flow named "${name}" — fixture drifted. Got: ${flows.map(f => f.name).join(', ')}`);
  return flow;
};

describe('parseAllFlows', () => {
  it('parses every well-formed flow in Workflows/ and nothing else', () => {
    // Pinned as a set, so a regression that silently drops one flow — or starts
    // emitting the degenerate fixtures — fails here rather than in a later assertion.
    expect(flows.map(f => f.name).sort()).toEqual([
      'ArchiveWidgetDelete',
      'Escalate widget update',
      'Notify on widget create',
      'Review widget create or update',
      'Sync widgets nightly',
      'Unknown Flow',
      'Widget manual run',
      'Widget record selected',
      'Widget unmapped message',
    ].sort());
  });

  describe('identity and metadata', () => {
    it('strips the braces from WorkflowId and always marks the category ModernFlow', () => {
      const flow = byName('Notify on widget create');
      expect(flow.id).toBe('9a1f0c3e-1000-4000-8000-000000000001');
      expect(flow.category).toBe('ModernFlow');
    });

    it('prefers the 1033 localized name over the other languages and the Name attribute', () => {
      // The fixture carries a 1036 (French) LocalizedName too. Docs are English-only,
      // so picking the first entry instead of the 1033 one would be wrong.
      expect(byName('Notify on widget create').name).toBe('Notify on widget create');
    });

    it('falls back to the Name attribute when no LocalizedNames block exists', () => {
      // Managed/older exports frequently omit LocalizedNames entirely.
      expect(flows.some(f => f.name === 'ArchiveWidgetDelete')).toBe(true);
    });

    it('falls back to "Unknown Flow" when there is no name anywhere', () => {
      expect(byName('Unknown Flow').id).toBe('9a1f0c3e-1000-4000-8000-000000000009');
    });

    it('reads isActive from StateCode, where only 1 is on', () => {
      // StateCode 0 is a real, common state — a draft flow. It must not read as active,
      // because "this flow runs in production" is the single most load-bearing fact in the doc.
      expect(byName('Notify on widget create').isActive).toBe(true);
      expect(byName('Escalate widget update').isActive).toBe(false);
    });
  });

  describe('triggers', () => {
    it('maps the Dataverse webhook message code to a trigger type', () => {
      expect(byName('Notify on widget create').trigger.type).toBe('DataverseCreate');
      expect(byName('Escalate widget update').trigger.type).toBe('DataverseUpdate');
      expect(byName('ArchiveWidgetDelete').trigger.type).toBe('DataverseDelete');
      expect(byName('Review widget create or update').trigger.type).toBe('DataverseCreateOrUpdate');
    });

    it('describes each Dataverse trigger with its entity', () => {
      expect(byName('ArchiveWidgetDelete').trigger).toEqual({
        name: 'When a widget is deleted',
        type: 'DataverseDelete',
        entity: 'contoso_widget',
        description: 'When a `contoso_widget` record is deleted',
      });
    });

    it('carries the filter attributes and filter expression through verbatim', () => {
      // These are what tell a reader why the flow did not fire — losing them
      // makes the trigger documentation actively misleading.
      const trigger = byName('Escalate widget update').trigger;
      expect(trigger.filterAttributes).toBe('contoso_status,contoso_owner');
      expect(trigger.filterExpression).toBe('contoso_status eq 100000001');
    });

    it('leaves filters undefined rather than empty-string when absent', () => {
      const trigger = byName('Notify on widget create').trigger;
      expect(trigger.filterAttributes).toBeUndefined();
      expect(trigger.filterExpression).toBeUndefined();
    });

    it('degrades an unrecognised webhook message code to Other, keeping the entity', () => {
      // Microsoft adds message codes; an unknown one must not be silently reported
      // as a Create.
      expect(byName('Widget unmapped message').trigger).toEqual({
        name: 'When an unusual message fires',
        type: 'Other',
        entity: 'contoso_widget',
        description: 'Dataverse trigger on `contoso_widget`',
      });
    });

    it('reads a Recurrence trigger as Scheduled with its interval and frequency', () => {
      expect(byName('Sync widgets nightly').trigger).toEqual({
        name: 'Every 24 hours',
        type: 'Scheduled',
        description: 'Scheduled — every 24 Hour',
      });
    });

    it('reads a Request trigger as Manual', () => {
      expect(byName('Widget manual run').trigger).toEqual({
        name: 'Manually trigger a flow',
        type: 'Manual',
        description: 'Manually triggered or called from Power Apps',
      });
    });

    it('reads a RecordSelected trigger as Manual and keeps the entity it is bound to', () => {
      expect(byName('Widget record selected').trigger).toEqual({
        name: 'When a row is selected',
        type: 'Manual',
        entity: 'contoso_widgets',
        description: 'When a `contoso_widgets` record is selected in a Dataverse form or view',
      });
    });

    it('degrades an unrecognised trigger type to Other and names the raw type', () => {
      expect(byName('Unknown Flow').trigger).toEqual({
        name: 'When an HTTP request arrives',
        type: 'Other',
        description: 'Trigger: HttpWebhook',
      });
    });

    it('replaces the underscores in the trigger key to get a readable name', () => {
      expect(byName('Sync widgets nightly').trigger.name).toBe('Every 24 hours');
    });
  });

  describe('actions', () => {
    it('flattens the nested action tree into a depth/parent-tagged list, in reading order', () => {
      // The flat list *is* the contract renderers consume; depth and parentName are the
      // only record of the structure, so order + nesting are pinned together here.
      expect(byName('Notify on widget create').actions.map(a => [a.name, a.depth, a.parentName]))
        .toEqual([
          ['Get widget owner',    0, undefined],
          ['Check widget amount', 0, undefined],
          ['Send approval email', 1, 'Check widget amount (Yes)'],
          ['Protect the update',  1, 'Check widget amount (Yes)'],
          ['Update widget',       2, 'Protect the update'],
          ['Terminate quietly',   1, 'Check widget amount (No)'],
        ]);
    });

    it('maps an action onto the IR', () => {
      const update = byName('Notify on widget create').actions
        .find(a => a.name === 'Update widget');

      expect(update).toEqual({
        name: 'Update widget',
        type: 'OpenApiConnection',
        operationId: 'UpdateRecord',
        entityName: 'contoso_widgets',
        description: 'Update record on `contoso_widgets`',
        runAfter: ['Send approval email'],
        depth: 2,
        parentName: 'Protect the update',
      });
    });

    it('records runAfter dependencies with underscores stripped, matching the action names', () => {
      // runAfter keys are raw JSON action keys; if they are not de-underscored the same
      // way action names are, nothing downstream can join the two.
      const check = byName('Notify on widget create').actions
        .find(a => a.name === 'Check widget amount')!;
      expect(check.runAfter).toEqual(['Get widget owner']);

      const owner = byName('Notify on widget create').actions
        .find(a => a.name === 'Get widget owner')!;
      expect(owner.runAfter).toEqual([]);
    });

    it('serialises an If expression into a readable condition with a branch count', () => {
      const check = byName('Notify on widget create').actions
        .find(a => a.name === 'Check widget amount')!;
      expect(check.description)
        .toBe('If contoso_amount > 1000 and contoso_status = Pending (Yes: 2 actions / No: 1 action)');
    });

    it('names the Foreach collection after the action it loops over, not the raw expression', () => {
      const loop = byName('Escalate widget update').actions
        .find(a => a.name === 'For each escalation')!;
      expect(loop.description).toBe('Loop over List escalations (1 action)');
    });

    it('walks Switch cases and the default branch, tagging each with its case key', () => {
      expect(byName('Escalate widget update').actions.map(a => [a.name, a.depth, a.parentName]))
        .toEqual([
          ['List escalations',   0, undefined],
          ['For each escalation', 0, undefined],
          ['Route by tier',      1, 'For each escalation'],
          ['Notify tier one',    2, 'Route by tier (Tier_one)'],
          ['Log unknown tier',   2, 'Route by tier (default)'],
        ]);
    });

    it('falls back to the action type as operationId when there is no connector host', () => {
      const compose = byName('Sync widgets nightly').actions[0];
      expect(compose.operationId).toBe('Compose');
      expect(compose.description).toBe('Compose value');
    });

    it('describes an unmapped operation instead of dropping it', () => {
      // New connectors and actions ship constantly; an unknown one must still appear
      // in the docs rather than vanish.
      const unknown = byName('Unknown Flow').actions
        .find(a => a.name === 'Do something unrecognised')!;
      expect(unknown.description).toBe('Run action: SomeFutureAction');
    });

    it('leaves entityName undefined for non-Dataverse actions', () => {
      const email = byName('Notify on widget create').actions
        .find(a => a.name === 'Send approval email')!;
      expect(email.entityName).toBeUndefined();
    });

    it('returns no actions for a trigger-only flow', () => {
      expect(byName('Review widget create or update').actions).toEqual([]);
    });
  });

  describe('connection references', () => {
    it('collects the logical names of every connection reference', () => {
      expect(byName('Notify on widget create').connectionReferences).toEqual([
        'contoso_sharedcommondataserviceforapps_ab12c',
        'contoso_sharedoffice365_de34f',
      ]);
    });

    it('drops a connection reference with no logical name rather than emitting a blank', () => {
      // The fixture has a third entry whose connection block is empty — a blank entry
      // would render as an empty bullet and, worse, as a phantom cross-link target.
      expect(byName('Notify on widget create').connectionReferences).toHaveLength(2);
    });

    it('returns an empty list when the flow uses no connectors', () => {
      expect(byName('Sync widgets nightly').connectionReferences).toEqual([]);
    });
  });

  it('generates a mermaid diagram at parse time', () => {
    const diagram = byName('Notify on widget create').mermaidDiagram!;
    expect(diagram.startsWith('flowchart TD')).toBe(true);
    // The diagram must contain no format wrapper — fencing belongs to the serializer
    // that owns the output format, and a double-fenced diagram has shipped before.
    expect(diagram).not.toContain('```');
  });

  describe('separation from the other Workflows/ component types', () => {
    it('ignores classic workflows and business rules, which share the same folder', () => {
      // Workflows/ holds modern flows, classic XAML workflows and business rules together.
      // parseAllFlows globs *.xml, so it reads all of their metadata files too and must
      // reject anything that is not Category 5.
      const foreign = ['Approve widget', 'Zeta widget action', 'Show approval fields', 'Zulu amount rule'];
      for (const name of foreign) {
        expect(flows.some(f => f.name === name)).toBe(false);
      }
    });
  });

  describe('degradation', () => {
    it('returns empty for a solution with no Workflows folder', () => {
      // Most real solutions contain only a few component types.
      expect(parseAllFlows(path.join(SOLUTION, 'Other'))).toEqual([]);
    });

    const dropped = [
      ['sibling JSON is not valid JSON', 'BrokenJsonWidget'],
      ['JsonFileName points at a file that does not exist', 'MissingJsonWidget'],
      ['there is no JsonFileName element', 'NoJsonNameWidget'],
      ['the JSON has no properties.definition', 'NoDefinitionWidget'],
    ] as const;

    for (const [why, name] of dropped) {
      it(`drops a flow when ${why}, keeping the rest`, () => {
        expect(flows.some(f => f.name === name)).toBe(false);
      });
    }

    it('ignores a stray XML file with no Workflow node', () => {
      // A parser that threw here would lose every flow in the solution, not just this file.
      expect(flows.length).toBe(9);
    });
  });
});
