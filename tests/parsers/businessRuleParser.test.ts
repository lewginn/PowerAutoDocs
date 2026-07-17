import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseBusinessRules } from '../../src/parsers/businessRuleParser.js';
import type { BusinessRuleModel } from '../../src/ir/businessRule.js';

const SOLUTION = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'fixtures', 'solutions', 'ContosoDemo',
);

const rules = parseBusinessRules(SOLUTION);
const byName = (name: string): BusinessRuleModel => {
  const rule = rules.find(r => r.name === name);
  if (!rule) throw new Error(`No business rule named "${name}" — fixture drifted. Got: ${rules.map(r => r.name).join(', ')}`);
  return rule;
};

describe('parseBusinessRules', () => {
  it('reads both pac CLI naming conventions and sorts by name', () => {
    // "Zulu amount rule" is exported as ContosoWidgetAmountRule.xaml.data.xml (pac v2) and
    // the other two as _xaml_data.xml (pac v1). The names are deliberately not in readdir
    // order, so this fails if the sort is dropped or either convention stops matching.
    expect(rules.map(r => r.name)).toEqual([
      'Alpha server rule',
      'Show approval fields',
      'Zulu amount rule',
    ]);
  });

  describe('metadata', () => {
    it('maps the metadata onto the IR', () => {
      const rule = byName('Show approval fields');
      expect(rule.id).toBe('9a1f0c3e-4000-4000-8000-000000000001'); // braces stripped
      expect(rule.entity).toBe('contoso_widget');
      expect(rule.status).toBe('active');
    });

    it('reads StateCode 0 as inactive', () => {
      expect(byName('Zulu amount rule').status).toBe('inactive');
    });

    it('maps ProcessTriggerScope onto where the rule actually runs', () => {
      // The three scopes behave differently for a user: allForms runs client-side
      // everywhere, specificForm only on one form, and entity runs server-side too.
      expect(byName('Show approval fields').scope).toBe('allForms');
      expect(byName('Zulu amount rule').scope).toBe('specificForm');
      expect(byName('Alpha server rule').scope).toBe('entity');
    });
  });

  describe('conditions and actions', () => {
    it('extracts the tested field, the description, and both branches', () => {
      // Dataverse encodes if/else as two sibling ConditionBranch nodes rather than a
      // nested else, so getting the second branch's actions onto elseActions (and not
      // appended to thenActions) is the whole job here.
      expect(byName('Show approval fields').conditions).toEqual([
        {
          conditionField: 'contoso_status',
          description: 'Status is Approved',
          thenActions: [
            { type: 'show', field: 'contoso_approvedby' },
            { type: 'setRequired', field: 'contoso_approvedon' },
          ],
          elseActions: [
            { type: 'hide', field: 'contoso_approvedby' },
            { type: 'setOptional', field: 'contoso_approvedon' },
          ],
        },
      ]);
    });

    it('reads SetVisibility IsVisible as the show/hide split', () => {
      const [condition] = byName('Show approval fields').conditions;
      expect(condition.thenActions[0].type).toBe('show');
      expect(condition.elseActions[0].type).toBe('hide');
    });

    it('maps every RequiredLevel value, defaulting an unrecognised one to optional', () => {
      // RequiredLevel "None" is the default branch of the mapping, and is what the
      // else branch of the fixture uses.
      expect(byName('Show approval fields').conditions[0].thenActions[1].type).toBe('setRequired');
      expect(byName('Show approval fields').conditions[0].elseActions[1].type).toBe('setOptional');
      expect(byName('Zulu amount rule').conditions[0].thenActions[1].type).toBe('setRecommended');
    });

    it('leaves elseActions empty for a rule with a single branch, and description undefined', () => {
      // Most business rules have no else. An absent Description must be undefined rather
      // than an empty string so renderers can omit the label entirely.
      const [condition] = byName('Zulu amount rule').conditions;
      expect(condition.elseActions).toEqual([]);
      expect(condition.description).toBeUndefined();
    });

    it('reads the written field off SetEntityProperty, with and without SetAttributeValue', () => {
      // The two field-setting shapes Dataverse emits: SetAttributeValue paired with a
      // SetEntityProperty, and a bare SetEntityProperty. Both must yield the field name.
      const [withSetAttr, bareSetEntity] = byName('Zulu amount rule').conditions;
      expect(withSetAttr.thenActions[0]).toEqual({ type: 'clearValue', field: 'contoso_discount' });
      expect(bareSetEntity.thenActions).toEqual([{ type: 'clearValue', field: 'contoso_reviewnote' }]);
    });

    it('falls back to "?" when the condition has no readable field', () => {
      const conditions = byName('Zulu amount rule').conditions;
      expect(conditions[conditions.length - 1].conditionField).toBe('?');
    });

    it('skips the Variables collection when hunting for the Activities one', () => {
      // The Show-approval fixture puts a Variables collection first. Taking the first
      // collection blindly would find no GetEntityProperty and report the field as "?".
      expect(byName('Show approval fields').conditions[0].conditionField).toBe('contoso_status');
    });
  });

  describe('separation from the other Workflows/ component types', () => {
    it('skips classic workflows, which use the same _xaml_data.xml file naming', () => {
      // Only the Category === 2 check separates a business rule from a classic workflow;
      // both are XAML under Workflows/ with identical filename shapes.
      for (const name of ['Approve widget', 'Zeta widget action', 'Contoso orphan workflow']) {
        expect(rules.some(r => r.name === name)).toBe(false);
      }
    });

    it('ignores modern flow XML, which does not use the data-file suffix', () => {
      expect(rules.some(r => r.name.includes('widget create'))).toBe(false);
    });
  });

  describe('degradation', () => {
    it('returns empty for a solution with no Workflows folder', () => {
      expect(parseBusinessRules(path.join(SOLUTION, 'Other'))).toEqual([]);
    });

    it('emits metadata with no conditions when the sibling .xaml is missing', () => {
      const serverRule = byName('Alpha server rule');
      expect(serverRule.conditions).toEqual([]);
      expect(serverRule.entity).toBe('contoso_escalation');
    });

    it('skips a data file with no Workflow node instead of emitting a blank record', () => {
      expect(rules.some(r => !r.name)).toBe(false);
      expect(rules).toHaveLength(3);
    });
  });
});
