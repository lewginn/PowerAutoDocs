import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseModelDrivenApps } from '../../src/parsers/modelDrivenAppParser.js';

const SOLUTION = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'fixtures', 'solutions', 'ContosoDemo',
);

describe('parseModelDrivenApps', () => {
  it('sorts by display name, not by the order the folders land on disk', () => {
    // contoso_FieldOps is read first (readdir is alphabetical) but "Warehouse Field Ops"
    // sorts last — this fails if the sort is dropped.
    expect(parseModelDrivenApps(SOLUTION, 'contoso').map(a => a.displayName))
      .toEqual(['Contoso Sales Hub', 'contoso_LegacyAdmin', 'Warehouse Field Ops']);
  });

  it('maps an app onto the IR', () => {
    const hub = parseModelDrivenApps(SOLUTION, 'contoso')
      .find(a => a.uniqueName === 'contoso_SalesHub');

    expect(hub).toEqual({
      uniqueName:  'contoso_SalesHub',
      displayName: 'Contoso Sales Hub',
      description: 'Where the Contoso sales team works widgets and orders.',
      isActive:    true,
      formFactor:  'Web',
      customEntities:   ['contoso_order', 'contoso_widget'],
      standardEntities: ['account', 'contact'],
      roleCount:   3,
      appSettings: [
        { key: 'contoso_EnableQuickCreate', value: 'true' },
        { key: 'contoso_DefaultView',       value: 'Active Widgets' },
      ],
    });
  });

  it('prefers the 1033 name and description over ones appearing earlier in the file', () => {
    // contoso_SalesHub lists French (1036) first; language order in a real export is
    // not guaranteed, so taking [0] would silently produce French docs.
    const hub = parseModelDrivenApps(SOLUTION, 'contoso')
      .find(a => a.uniqueName === 'contoso_SalesHub')!;
    expect(hub.displayName).toBe('Contoso Sales Hub');
    expect(hub.description).toBe('Where the Contoso sales team works widgets and orders.');
  });

  it('falls back to the first available name, then to the unique name', () => {
    const byName = Object.fromEntries(
      parseModelDrivenApps(SOLUTION, 'contoso').map(a => [a.uniqueName, a.displayName]),
    );
    expect(byName['contoso_FieldOps']).toBe('Warehouse Field Ops'); // only a 1036 entry exists
    expect(byName['contoso_LegacyAdmin']).toBe('contoso_LegacyAdmin'); // no LocalizedNames at all
  });

  it('splits entities into custom and standard on the publisher prefix, each sorted', () => {
    // The split is what lets the docs say "these tables are yours" — msdyn_ tables are
    // first-party, and must not be claimed as custom just because they have a prefix.
    const ops = parseModelDrivenApps(SOLUTION, 'contoso')
      .find(a => a.uniqueName === 'contoso_FieldOps')!;
    expect(ops.customEntities).toEqual(['contoso_widget']);
    expect(ops.standardEntities).toEqual(['msdyn_workorder']);
  });

  it('treats every entity as standard when no publisher prefix is supplied', () => {
    const hub = parseModelDrivenApps(SOLUTION)
      .find(a => a.uniqueName === 'contoso_SalesHub')!;
    expect(hub.customEntities).toEqual([]);
    expect(hub.standardEntities).toEqual(['account', 'contact', 'contoso_order', 'contoso_widget']);
  });

  it('counts only entity components, ignoring other component types and nameless ones', () => {
    // contoso_SalesHub also contains a type="26" dashboard and a type="1" with no
    // schemaName; either would surface as a phantom table in the docs.
    const hub = parseModelDrivenApps(SOLUTION, 'contoso')
      .find(a => a.uniqueName === 'contoso_SalesHub')!;
    const all = [...hub.customEntities, ...hub.standardEntities];
    expect(all).toHaveLength(4);
    expect(all).not.toContain('contoso_SalesDashboard');
  });

  it('maps formFactor codes and falls back to Unknown', () => {
    // The IR union is closed — an unmapped code must not leak a raw number through.
    const byName = Object.fromEntries(
      parseModelDrivenApps(SOLUTION, 'contoso').map(a => [a.uniqueName, a.formFactor]),
    );
    expect(byName['contoso_SalesHub']).toBe('Web');       // 1
    expect(byName['contoso_FieldOps']).toBe('Phone');     // 3
    expect(byName['contoso_LegacyAdmin']).toBe('Unknown'); // 9
  });

  it('reads isActive from statecode', () => {
    const byName = Object.fromEntries(
      parseModelDrivenApps(SOLUTION, 'contoso').map(a => [a.uniqueName, a.isActive]),
    );
    expect(byName['contoso_SalesHub']).toBe(true);  // statecode 0
    expect(byName['contoso_FieldOps']).toBe(false); // statecode 1
  });

  it('counts mapped roles and reports zero when there are none', () => {
    const byName = Object.fromEntries(
      parseModelDrivenApps(SOLUTION, 'contoso').map(a => [a.uniqueName, a.roleCount]),
    );
    expect(byName['contoso_SalesHub']).toBe(3);
    expect(byName['contoso_FieldOps']).toBe(1);
    expect(byName['contoso_LegacyAdmin']).toBe(0);
  });

  it('drops app settings that carry no definition name', () => {
    // A keyless setting has nothing to label it with in the docs.
    const hub = parseModelDrivenApps(SOLUTION, 'contoso')
      .find(a => a.uniqueName === 'contoso_SalesHub')!;
    expect(hub.appSettings).toHaveLength(2);
    expect(hub.appSettings.map(s => s.value)).not.toContain('orphaned setting with no definition name');
  });

  it('drops broken and manifest-less app folders without losing the rest', () => {
    // contoso_BrokenApp has an unexpected root element; contoso_NoManifest has no
    // AppModule.xml at all. One bad app must not cost the client the other three.
    const names = parseModelDrivenApps(SOLUTION, 'contoso').map(a => a.uniqueName);
    expect(names).not.toContain('contoso_BrokenApp');
    expect(names).not.toContain('contoso_NoManifest');
    expect(names).toHaveLength(3);
  });

  it('ignores loose files at the AppModules root', () => {
    expect(parseModelDrivenApps(SOLUTION, 'contoso').map(a => a.uniqueName))
      .not.toContain('readme.txt');
  });

  it('returns empty for a solution with no AppModules folder', () => {
    // Every sweeping parser must tolerate an absent component folder — most real
    // solutions contain only a few component types.
    expect(parseModelDrivenApps(path.join(SOLUTION, 'Other'), 'contoso')).toEqual([]);
  });
});
