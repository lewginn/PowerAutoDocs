import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseAllRelationships, getRelationshipsForTable } from '../../src/parsers/relationshipParser.js';
import { aConfig } from '../fixtures/config.js';
import type { RelationshipModel } from '../../src/ir/index.js';

const SOLUTION = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'fixtures', 'solutions', 'ContosoDemo',
);

const parse = (prefix = 'contoso') => parseAllRelationships(SOLUTION, aConfig(), prefix);
const byName = (name: string) => parse().find(r => r.name === name)!;

describe('parseAllRelationships', () => {
  it('reads every relationship file in the folder', () => {
    // Both contoso_widget.xml and contoso_order.xml must be swept — a per-entity file
    // layout means stopping at the first file silently halves the ERD.
    const names = parse().map(r => r.name);
    expect(names).toEqual(expect.arrayContaining([
      'contoso_account_contoso_widget',
      'contoso_widget_owner',
      'contoso_widget_contoso_tag',
      'contoso_widget_contoso_order',
      'msdyn_order_sync',
    ]));
  });

  it('maps a relationship onto the IR', () => {
    expect(byName('contoso_account_contoso_widget')).toEqual({
      name:                 'contoso_account_contoso_widget',
      type:                 'OneToMany',
      referencingEntity:    'contoso_widget',
      referencedEntity:     'account',
      referencingAttribute: 'contoso_accountid',
      description:          'Widgets owned by an account.',
      isCustom:             true,
    });
  });

  it('carries the declared relationship type through', () => {
    // The three types render differently in the ERD, so a collapsed type is a wrong
    // diagram rather than a missing one.
    expect(byName('contoso_account_contoso_widget').type).toBe('OneToMany');
    expect(byName('contoso_widget_owner').type).toBe('ManyToOne');
    expect(byName('contoso_widget_contoso_tag').type).toBe('ManyToMany');
  });

  it('defaults to OneToMany when the type element is absent', () => {
    expect(byName('contoso_widget_contoso_order').type).toBe('OneToMany');
  });

  it('takes the 1033 description over one appearing earlier in the file', () => {
    // The French description is listed first on purpose; language order in an export
    // is not guaranteed.
    expect(byName('contoso_account_contoso_widget').description)
      .toBe('Widgets owned by an account.');
  });

  it('leaves description empty when the relationship has none', () => {
    expect(byName('contoso_widget_owner').description).toBe('');
  });

  it('flags isCustom from the publisher prefix on the referencing attribute', () => {
    // "ownerid" is an out-of-the-box column on a custom table — the table being custom
    // does not make the relationship custom.
    expect(byName('contoso_account_contoso_widget').isCustom).toBe(true);  // contoso_accountid
    expect(byName('contoso_widget_owner').isCustom).toBe(false);           // ownerid
    expect(byName('msdyn_order_sync').isCustom).toBe(false);               // msdyn_healthruleid
  });

  it('matches the prefix case-insensitively', () => {
    expect(parse('CONTOSO').map(r => r.isCustom)).toEqual(parse('contoso').map(r => r.isCustom));
  });

  it('falls back to an underscore-and-not-ms heuristic when no prefix is configured', () => {
    // loader.ts warns rather than fails when the prefix is missing, so this branch runs
    // in real pipelines and must still tell first-party columns apart from custom ones.
    const flags = Object.fromEntries(parse('').map(r => [r.name, r.isCustom]));
    expect(flags['contoso_account_contoso_widget']).toBe(true);  // contoso_accountid
    expect(flags['contoso_widget_owner']).toBe(false);           // ownerid — no underscore
    expect(flags['msdyn_order_sync']).toBe(false);               // msdyn_ — first-party
  });

  it('ignores non-xml files in the folder', () => {
    expect(parse().map(r => r.name)).not.toContain('notes');
  });

  it('keeps every well-formed relationship when a sibling file is malformed', () => {
    // contoso_broken.xml is a truncated export. One bad file must not cost the client
    // the rest of the ERD.
    const real = parse().filter(r => r.referencingEntity !== '');
    expect(real).toHaveLength(5);
  });

  it('does not throw on the malformed file — but does leak an empty relationship', () => {
    // Documenting current behaviour, not endorsing it: the truncated file parses
    // leniently into a name-only entry with no entities on either end, which will
    // reach the ERD. See the accompanying report.
    const leaked = parse().find(r => r.name === 'contoso_truncated_export');
    expect(leaked).toBeDefined();
    expect(leaked!.referencingEntity).toBe('');
    expect(leaked!.referencedEntity).toBe('');
  });

  it('returns empty for a solution with no Other/Relationships folder', () => {
    // Every sweeping parser must tolerate an absent component folder — most real
    // solutions contain only a few component types.
    expect(parseAllRelationships(path.join(SOLUTION, 'AppModules'), aConfig(), 'contoso')).toEqual([]);
  });
});

describe('getRelationshipsForTable', () => {
  const all = parse();

  it('returns relationships where the table is on either side', () => {
    // A table's docs must show what points at it as well as what it points at —
    // filtering on referencingEntity alone loses every inbound link.
    const names = getRelationshipsForTable(all, 'contoso_widget').map(r => r.name).sort();
    expect(names).toEqual([
      'contoso_account_contoso_widget', // contoso_widget is the referencing side
      'contoso_widget_contoso_order',   // contoso_widget is the referenced side
      'contoso_widget_contoso_tag',
      'contoso_widget_owner',
    ]);
  });

  it('matches the table name case-insensitively', () => {
    // Logical names arrive lowercased from Dataverse but schema names do not; callers
    // pass whichever they hold.
    expect(getRelationshipsForTable(all, 'CONTOSO_Widget').map(r => r.name))
      .toEqual(getRelationshipsForTable(all, 'contoso_widget').map(r => r.name));
  });

  it('does not match on a partial or prefix name', () => {
    // "contoso_wid" must not pull in contoso_widget's relationships.
    expect(getRelationshipsForTable(all, 'contoso_wid')).toEqual([]);
  });

  it('returns empty for a table with no relationships', () => {
    expect(getRelationshipsForTable(all, 'contoso_unrelated')).toEqual([]);
  });

  it('returns empty for an empty relationship list', () => {
    expect(getRelationshipsForTable([] as RelationshipModel[], 'contoso_widget')).toEqual([]);
  });
});
