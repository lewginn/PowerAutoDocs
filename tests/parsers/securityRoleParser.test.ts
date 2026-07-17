import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseSecurityRoles } from '../../src/parsers/securityRoleParser.js';
import type { SecurityRoleModel, EntityPrivileges } from '../../src/ir/securityRole.js';

const SOLUTION = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'fixtures', 'solutions', 'ContosoDemo',
);

const roles = (prefix?: string): SecurityRoleModel[] => parseSecurityRoles(SOLUTION, prefix);

const role = (name: string, prefix = 'contoso'): SecurityRoleModel =>
  roles(prefix).find(r => r.name === name)!;

const entity = (roleName: string, logicalName: string, prefix = 'contoso'): EntityPrivileges =>
  role(roleName, prefix).privileges.find(p => p.entityLogicalName === logicalName)!;

describe('parseSecurityRoles', () => {
  it('reads every role file and sorts by role name', () => {
    // File order is contosoauditor, contosomalformed, contosowidgetmanager, contosowidgetreader —
    // deliberately not the display-name order, so this fails if the sort is dropped.
    expect(roles('contoso').map(r => r.name)).toEqual([
      'Contoso Malformed Role',
      'Contoso Widget Manager',
      'Contoso Widget Reader',
      'Contoso Zone Auditor',
    ]);
  });

  it('ignores non-XML files sitting in Roles/', () => {
    expect(roles('contoso').map(r => r.name)).not.toContain('readme');
  });

  it('maps every privilege level string onto the IR', () => {
    // These four levels are what a client reads to answer "who can see this record?",
    // so each code path through parseLevel is pinned.
    expect(entity('Contoso Widget Manager', 'contoso_widget')).toEqual({
      entityName: 'Widget',
      entityLogicalName: 'contoso_widget',
      create: 'Global',
      read: 'Deep',
      write: 'Local',
      delete: 'Basic',
      append: 'Local',
      appendTo: 'Global',
      // Assign and Share have no RolePrivilege entry at all: an absent privilege is a
      // denied privilege in CRM, and the docs must say so rather than leave a gap.
      assign: 'None',
      share: 'None',
    });
  });

  it('distinguishes prvAppendTo from prvAppend', () => {
    // "Append" and "AppendTo" are different rights on opposite ends of a relationship,
    // and the prefix regex will happily read AppendTo as Append + "To…" if the
    // alternation is reordered.
    const widget = entity('Contoso Widget Manager', 'contoso_widget');
    expect(widget.append).toBe('Local');
    expect(widget.appendTo).toBe('Global');
  });

  it('groups privileges per entity and sorts entities by display name', () => {
    const manager = role('Contoso Widget Manager');
    expect(manager.privileges.map(p => p.entityName)).toEqual(['GadgetLog', 'Widget']);

    // A second entity in the same role must not bleed into the first.
    expect(entity('Contoso Widget Manager', 'contoso_gadgetlog')).toMatchObject({
      read: 'Global',
      write: 'Basic',
      create: 'None',
    });
  });

  it('lowercases the logical name but derives the display name from the original casing', () => {
    const gadgetLog = entity('Contoso Widget Manager', 'contoso_gadgetlog');
    expect(gadgetLog.entityLogicalName).toBe('contoso_gadgetlog');
    expect(gadgetLog.entityName).toBe('GadgetLog');   // publisher prefix stripped, casing kept
  });

  it('filters privileges to the given publisher prefix', () => {
    // Roles routinely carry hundreds of out-of-the-box privileges; without the filter
    // the solution doc drowns in entities the solution does not own.
    const withPrefix = role('Contoso Widget Manager').privileges.map(p => p.entityLogicalName);
    expect(withPrefix).toEqual(['contoso_gadgetlog', 'contoso_widget']);
    expect(withPrefix).not.toContain('fabrikam_ledger');
    expect(withPrefix.some(n => n === 'account')).toBe(false);
  });

  it('without a prefix keeps any prefixed entity but still drops out-of-the-box ones', () => {
    const noPrefix = roles().find(r => r.name === 'Contoso Widget Manager')!
      .privileges.map(p => p.entityLogicalName);
    expect(noPrefix).toEqual(['contoso_gadgetlog', 'fabrikam_ledger', 'contoso_widget']);
    // prvReadaccount / prvCreateaccount have no underscore — the "is it custom?" heuristic.
    expect(noPrefix).not.toContain('account');
  });

  it('ignores privilege names outside the recognised operation set', () => {
    // prvBulkDeletecontoso_widget is a real CRM privilege the IR has no field for;
    // it must be dropped, not coerced into `delete`.
    expect(entity('Contoso Widget Manager', 'contoso_widget').delete).toBe('Basic');
  });

  it('reads isCustomizable and isAutoAssigned as booleans', () => {
    expect(role('Contoso Widget Manager')).toMatchObject({
      id: '{aa222222-2222-4222-8222-222222222222}',
      isCustomizable: true,     // <IsCustomizable>1</IsCustomizable>
      isAutoAssigned: false,    // <IsAutoAssigned>0</IsAutoAssigned>
    });
    expect(role('Contoso Widget Reader')).toMatchObject({
      isCustomizable: false,
      isAutoAssigned: true,
    });
  });

  it('handles a role with a single RolePrivilege element', () => {
    // fast-xml-parser collapses a lone child to an object rather than an array —
    // this parser normalises it by hand, and that branch is otherwise untested.
    expect(role('Contoso Widget Reader').privileges).toEqual([{
      entityName: 'Widget',
      entityLogicalName: 'contoso_widget',
      create: 'None',
      read: 'Basic',
      write: 'None',
      delete: 'None',
      append: 'None',
      appendTo: 'None',
      assign: 'None',
      share: 'None',
    }]);
  });

  it('handles a role with an empty RolePrivileges element', () => {
    expect(role('Contoso Zone Auditor').privileges).toEqual([]);
  });

  it('degrades rather than throws on a malformed role file, and keeps the other roles', () => {
    const broken = role('Contoso Malformed Role');
    expect(broken.isCustomizable).toBe(false);   // <IsCustomizable>maybe</IsCustomizable>
    expect(broken.isAutoAssigned).toBe(false);   // element missing entirely
    // "thisisnotaprivilegename" and a bare "prv" are dropped; an unrecognised level and a
    // missing level both land on 'None' — a wrong guess here would over-report access.
    expect(broken.privileges).toHaveLength(1);
    expect(broken.privileges[0]).toMatchObject({
      entityLogicalName: 'contoso_widget',
      read: 'None',      // level="Omniscient"
      create: 'None',    // no level attribute at all
    });
    expect(roles('contoso')).toHaveLength(4);
  });

  it('returns empty for a solution with no Roles folder', () => {
    // Every sweeping parser must tolerate an absent component folder — most real
    // solutions contain only a few component types.
    expect(parseSecurityRoles(path.join(SOLUTION, 'Other'), 'contoso')).toEqual([]);
  });
});
