import { describe, it, expect } from 'vitest';
import {
  renderSecurityRolesIndex,
  renderSecurityRolePage,
  encodeRoleName,
} from '../../src/renderers/securityRoleRenderer.js';
import type { DocNode, TableNode } from '../../src/docmodel/nodes.js';
import { aPrivilege, aSecurityRole } from '../fixtures/ir.js';

const tables = (nodes: DocNode[]): TableNode[] =>
  nodes.filter(n => n.type === 'table') as TableNode[];

const headings = (nodes: DocNode[]): string[] =>
  nodes.filter(n => n.type === 'heading').map(n => (n as { text: string }).text);

/** Look up a Property/Value row by its label. */
const propValue = (tbl: TableNode, label: string) =>
  tbl.rows.find(r => (r[0][0] as { value: string }).value === label)?.[1];

const cellText = (tbl: TableNode, row: number, col: number): string =>
  (tbl.rows[row][col][0] as { value: string }).value;

// Array.prototype.at() needs ES2022 and the build targets ES2020 — see tsconfig.json.
const last = (nodes: DocNode[]): DocNode => nodes[nodes.length - 1];

describe('renderSecurityRolesIndex', () => {
  it('renders a placeholder instead of an empty table when there are no roles', () => {
    const nodes = renderSecurityRolesIndex([], '/Security Roles');
    expect(nodes.some(n => n.type === 'table')).toBe(false);
    expect(last(nodes)).toEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: 'No custom security roles found in this solution.' }],
    });
  });

  it('puts one row per role under the expected headers', () => {
    const tbl = tables(renderSecurityRolesIndex([
      aSecurityRole({ name: 'Widget Manager' }),
      aSecurityRole({ name: 'Widget Reader' }),
    ], '/Security Roles'))[0];
    expect(tbl.headers).toEqual(['Role', 'Auto Assigned', 'Custom Entities']);
    expect(tbl.rows).toHaveLength(2);
  });

  it('links each role to its own page under the basePath', () => {
    const tbl = tables(renderSecurityRolesIndex([aSecurityRole({ name: 'Widget Manager' })], '/Security Roles'))[0];
    expect(tbl.rows[0][0]).toEqual([
      { type: 'link', text: 'Widget Manager', href: '/Security Roles/Widget Manager' },
    ]);
  });

  it('sanitises the href but keeps the real role name as the link text', () => {
    // The page was written to disk under the sanitised name, so the href must
    // match that — but the reader still needs to see the true role name.
    const tbl = tables(renderSecurityRolesIndex([
      aSecurityRole({ name: 'Sales/Service #1 100% Admin?' }),
    ], '/Security Roles'))[0];
    expect(tbl.rows[0][0]).toEqual([
      { type: 'link', text: 'Sales/Service #1 100% Admin?', href: '/Security Roles/SalesService 1 100 Admin' },
    ]);
  });

  it('reports auto-assignment as a word rather than a boolean', () => {
    const auto = tables(renderSecurityRolesIndex([aSecurityRole({ isAutoAssigned: true })], '/R'))[0];
    const manual = tables(renderSecurityRolesIndex([aSecurityRole({ isAutoAssigned: false })], '/R'))[0];
    expect(cellText(auto, 0, 1)).toBe('Yes');
    expect(cellText(manual, 0, 1)).toBe('No');
  });

  it('counts the privileges actually held, including zero', () => {
    const some = tables(renderSecurityRolesIndex([
      aSecurityRole({ privileges: [aPrivilege(), aPrivilege()] }),
    ], '/R'))[0];
    expect(cellText(some, 0, 2)).toBe('2');

    const none = tables(renderSecurityRolesIndex([aSecurityRole({ privileges: [] })], '/R'))[0];
    expect(cellText(none, 0, 2)).toBe('0');
  });
});

describe('renderSecurityRolePage', () => {
  it('leads with the role name as a level-1 heading', () => {
    const nodes = renderSecurityRolePage(aSecurityRole({ name: 'Widget Manager' }));
    expect(nodes[0]).toEqual({ type: 'heading', level: 1, text: 'Widget Manager' });
  });

  it('summarises the role properties as words and counts', () => {
    const tbl = tables(renderSecurityRolePage(aSecurityRole({
      isAutoAssigned: true,
      isCustomizable: false,
      privileges: [aPrivilege(), aPrivilege()],
    })))[0];
    expect(propValue(tbl, 'Auto Assigned')).toEqual([{ type: 'text', value: 'Yes' }]);
    expect(propValue(tbl, 'Customizable')).toEqual([{ type: 'text', value: 'No' }]);
    expect(propValue(tbl, 'Custom Entity Count')).toEqual([{ type: 'text', value: '2' }]);
  });

  it('always includes the access level key so the dot glyphs can be decoded', () => {
    const tbl = tables(renderSecurityRolePage(aSecurityRole()))[1];
    expect(tbl.headers).toEqual(['Dots', 'Level', 'Scope']);
    expect(tbl.rows).toHaveLength(5);
  });

  it('maps each Dataverse level to its dot glyph and business-facing scope label', () => {
    // The IR level names are Dataverse internals ("Basic", "Deep"); admins read
    // them as "User" and "Parent: Child BUs". The mapping is the whole point of
    // the key table.
    const tbl = tables(renderSecurityRolePage(aSecurityRole()))[1];
    const rows = tbl.rows.map(r => r.map(cell => (cell[0] as { value: string }).value));
    expect(rows).toEqual([
      ['○○○○○', 'None',   'None'],
      ['●○○○○', 'Basic',  'User'],
      ['●●○○○', 'Local',  'Business Unit'],
      ['●●●○○', 'Deep',   'Parent: Child BUs'],
      ['●●●●●', 'Global', 'Organisation'],
    ]);
  });

  it('keeps the Privilege Matrix heading but says none rather than an empty matrix', () => {
    const nodes = renderSecurityRolePage(aSecurityRole({ privileges: [] }));
    expect(headings(nodes)).toContain('Privilege Matrix');
    expect(last(nodes)).toEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: 'No custom entity privileges assigned to this role.' }],
    });
    // Only the property table and the level key — no matrix table.
    expect(tables(nodes)).toHaveLength(2);
  });

  it('renders every privilege operation as its own column, in a fixed order', () => {
    const tbl = tables(renderSecurityRolePage(aSecurityRole()))[2];
    expect(tbl.headers).toEqual([
      'Entity', 'Create', 'Read', 'Write', 'Delete', 'Append', 'Append To', 'Assign', 'Share',
    ]);
  });

  it('translates each per-operation level into the matching dot glyph', () => {
    // A misaligned column here silently misreports a role's access — the row
    // order must track the header order exactly.
    const tbl = tables(renderSecurityRolePage(aSecurityRole({
      privileges: [aPrivilege({
        entityName: 'Widget',
        create: 'Basic',
        read:   'Global',
        write:  'Local',
        delete: 'None',
        append: 'Deep',
        appendTo: 'Basic',
        assign: 'None',
        share:  'Global',
      })],
    })))[2];
    expect(tbl.rows[0].map(c => (c[0] as { value: string }).value)).toEqual([
      'Widget', '●○○○○', '●●●●●', '●●○○○', '○○○○○', '●●●○○', '●○○○○', '○○○○○', '●●●●●',
    ]);
  });

  it('uses the display entity name rather than the logical name in the matrix', () => {
    const tbl = tables(renderSecurityRolePage(aSecurityRole({
      privileges: [aPrivilege({ entityName: 'Widget', entityLogicalName: 'acme_widget' })],
    })))[2];
    expect(cellText(tbl, 0, 0)).toBe('Widget');
  });

  it('preserves the privilege order it was given rather than re-sorting', () => {
    const tbl = tables(renderSecurityRolePage(aSecurityRole({
      privileges: [
        aPrivilege({ entityName: 'Widget' }),
        aPrivilege({ entityName: 'Part' }),
      ],
    })))[2];
    expect(tbl.rows.map((_, idx) => cellText(tbl, idx, 0))).toEqual(['Widget', 'Part']);
  });
});

describe('encodeRoleName', () => {
  it('strips the characters that would break an ADO wiki page path', () => {
    // / ? # % are all path- or fragment-significant in a wiki URL.
    expect(encodeRoleName('Sales/Service #1 100% Admin?')).toBe('SalesService 1 100 Admin');
  });

  it('leaves a name with no unsafe characters untouched', () => {
    expect(encodeRoleName('Widget Manager')).toBe('Widget Manager');
  });

  it('keeps characters that are legal in a page name', () => {
    // Dashes, dots, parentheses and ampersands are handled downstream by
    // toADOWikiLink — stripping them here would break the page name match.
    expect(encodeRoleName('Widget-Manager (Read & Write) v1.0')).toBe('Widget-Manager (Read & Write) v1.0');
  });
});

describe('security role renderers — format boundary', () => {
  it('never emits markdown fences from any security role renderer', () => {
    // constraints.md: renderers return DocNode[]; markdown syntax belongs to the
    // serializer that owns the format.
    const role = aSecurityRole();
    const all: DocNode[] = [
      ...renderSecurityRolesIndex([role], '/Security Roles'),
      ...renderSecurityRolePage(role),
    ];
    expect(JSON.stringify(all)).not.toContain('```');
  });
});
