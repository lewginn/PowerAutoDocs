import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseGlobalChoices } from '../../src/parsers/globalChoiceParser.js';

const SOLUTION = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'fixtures', 'solutions', 'ContosoDemo',
);

describe('parseGlobalChoices', () => {
  it('sorts by display name, not by the order the files land on disk', () => {
    // contoso_ApprovalStatus.xml is read first (readdir is alphabetical) but its
    // display name sorts last — this fails if the sort is dropped.
    expect(parseGlobalChoices(SOLUTION, 'contoso').map(c => c.displayName))
      .toEqual(['Case Origin', 'contoso_LegacyFlag', 'Service Tier', 'Widget Approval Status']);
  });

  it('maps a choice and its options onto the IR', () => {
    const tier = parseGlobalChoices(SOLUTION, 'contoso')
      .find(c => c.schemaName === 'contoso_ServiceTier');

    expect(tier).toEqual({
      schemaName:    'contoso_ServiceTier',
      displayName:   'Service Tier',
      description:   'Support tier a Contoso customer has purchased.',
      optionSetType: 'picklist',
      isGlobal:      true,
      options: [
        { value: 100000000, label: 'Standard',          description: 'Business hours only.', isHidden: false, externalValue: 'STD' },
        { value: 100000001, label: 'Premium',           description: '',                     isHidden: false, externalValue: ''    },
        { value: 100000002, label: 'Retired Gold Tier', description: '',                     isHidden: true,  externalValue: ''    },
      ],
    });
  });

  it('prefers the 1033 label over one that appears earlier in the file', () => {
    // The Standard option lists French (1036) first. Language order in a real export
    // is not guaranteed, so picking labels[0] would silently produce French docs.
    const standard = parseGlobalChoices(SOLUTION, 'contoso')
      .find(c => c.schemaName === 'contoso_ServiceTier')!
      .options.find(o => o.value === 100000000)!;
    expect(standard.label).toBe('Standard');
  });

  it('falls back to the first available label when no 1033 exists', () => {
    // A single-language solution would otherwise document a blank label, which is
    // worse than showing the non-English one.
    const legacy = parseGlobalChoices(SOLUTION, 'contoso')
      .find(c => c.schemaName === 'contoso_LegacyFlag')!;
    expect(legacy.options[0].label).toBe('Drapeau hérité');
  });

  it('keeps hidden options rather than filtering them, and flags them', () => {
    // Hidden options still exist in data, so the renderer — not the parser — decides
    // whether to show them.
    const tier = parseGlobalChoices(SOLUTION, 'contoso')
      .find(c => c.schemaName === 'contoso_ServiceTier')!;
    expect(tier.options.map(o => o.isHidden)).toEqual([false, false, true]);
  });

  it('prefers the localizedName attribute over the displaynames element', () => {
    // contoso_ServiceTier carries both, and they disagree on purpose.
    const tier = parseGlobalChoices(SOLUTION, 'contoso')
      .find(c => c.schemaName === 'contoso_ServiceTier')!;
    expect(tier.displayName).toBe('Service Tier');
    expect(tier.displayName).not.toBe('Ignored Display Name');
  });

  it('falls back through displaynames, then to the schema name', () => {
    const byName = Object.fromEntries(
      parseGlobalChoices(SOLUTION, 'contoso').map(c => [c.schemaName, c.displayName]),
    );
    expect(byName['contoso_CaseOrigin']).toBe('Case Origin');       // no localizedName attr
    expect(byName['contoso_LegacyFlag']).toBe('contoso_LegacyFlag'); // neither source present
  });

  it('maps optionSetType, falling back to Unknown for an unrecognised type', () => {
    // The IR union is closed, so an unmapped Dataverse type must not leak through as
    // a raw string and break renderers that switch on it.
    const byName = Object.fromEntries(
      parseGlobalChoices(SOLUTION, 'contoso').map(c => [c.schemaName, c.optionSetType]),
    );
    expect(byName['contoso_ServiceTier']).toBe('picklist');
    expect(byName['contoso_ApprovalStatus']).toBe('bool');
    expect(byName['contoso_LegacyFlag']).toBe('Unknown'); // OptionSetType is "multiselectpicklist"
  });

  it('reads isGlobal from the file and defaults it to true when absent', () => {
    const byName = Object.fromEntries(
      parseGlobalChoices(SOLUTION, 'contoso').map(c => [c.schemaName, c.isGlobal]),
    );
    expect(byName['contoso_LegacyFlag']).toBe(false); // IsGlobal 0
    expect(byName['contoso_ServiceTier']).toBe(true);
  });

  it('filters to the publisher prefix, and returns everything without one', () => {
    // new_ProductLine.xml belongs to another publisher — documenting it would mean
    // documenting components the client does not own.
    expect(parseGlobalChoices(SOLUTION, 'contoso').map(c => c.schemaName))
      .not.toContain('new_ProductLine');
    expect(parseGlobalChoices(SOLUTION).map(c => c.displayName))
      .toContain('Product Line');
  });

  it('matches the prefix case-insensitively', () => {
    expect(parseGlobalChoices(SOLUTION, 'CONTOSO').map(c => c.schemaName))
      .toEqual(parseGlobalChoices(SOLUTION, 'contoso').map(c => c.schemaName));
  });

  it('drops a malformed file without losing the rest of the folder', () => {
    // contoso_BrokenChoice.xml is a truncated export. One bad component must not cost
    // the client the other four.
    const all = parseGlobalChoices(SOLUTION, 'contoso');
    expect(all.map(c => c.schemaName)).not.toContain('contoso_BrokenChoice');
    expect(all).toHaveLength(4);
  });

  it('ignores non-xml files in the folder', () => {
    expect(parseGlobalChoices(SOLUTION, 'contoso').map(c => c.schemaName))
      .not.toContain('notes');
  });

  it('returns empty for a solution with no OptionSets folder', () => {
    // Every sweeping parser must tolerate an absent component folder — most real
    // solutions contain only a few component types.
    expect(parseGlobalChoices(path.join(SOLUTION, 'Other'), 'contoso')).toEqual([]);
  });
});
