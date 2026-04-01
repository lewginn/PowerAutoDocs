// renderers/securityRoleRenderer.ts

import type { SecurityRoleModel, EntityPrivileges, PrivilegeLevel } from '../ir/securityRole.js';
import type { DocNode, InlineNode } from '../docmodel/nodes.js';
import { h, pt, p, t, c, b, lnk, table, ct, cc, cell } from '../docmodel/nodes.js';

const LEVEL_DOTS: Record<PrivilegeLevel, string> = {
  None:   '○○○○○',
  Basic:  '●○○○○',
  Local:  '●●○○○',
  Deep:   '●●●○○',
  Global: '●●●●●',
};

const LEVEL_LABELS: Record<PrivilegeLevel, string> = {
  None:   'None',
  Basic:  'User',
  Local:  'Business Unit',
  Deep:   'Parent: Child BUs',
  Global: 'Organisation',
};

export function renderSecurityRolesIndex(
  roles: SecurityRoleModel[],
  basePath: string
): DocNode[] {
  const nodes: DocNode[] = [];

  nodes.push(h(1, 'Security Roles'));
  nodes.push(pt('Custom security roles defined in this solution.'));

  if (roles.length === 0) {
    nodes.push(pt('No custom security roles found in this solution.'));
    return nodes;
  }

  nodes.push(table(
    ['Role', 'Auto Assigned', 'Custom Entities'],
    roles.map(r => [
      cell(lnk(r.name, `${basePath}/${encodeRoleName(r.name)}`)),
      ct(r.isAutoAssigned ? 'Yes' : 'No'),
      ct(String(r.privileges.length)),
    ])
  ));

  return nodes;
}

export function renderSecurityRolePage(role: SecurityRoleModel): DocNode[] {
  const nodes: DocNode[] = [];

  nodes.push(h(1, role.name));
  nodes.push(table(
    ['Property', 'Value'],
    [
      [ct('Auto Assigned'),       ct(role.isAutoAssigned ? 'Yes' : 'No')],
      [ct('Customizable'),        ct(role.isCustomizable ? 'Yes' : 'No')],
      [ct('Custom Entity Count'), ct(String(role.privileges.length))],
    ]
  ));

  nodes.push(h(2, 'Access Level Key'));
  nodes.push(table(
    ['Dots', 'Level', 'Scope'],
    (Object.entries(LEVEL_DOTS) as [PrivilegeLevel, string][]).map(([lvl, dots]) => [
      ct(dots),
      ct(lvl),
      ct(LEVEL_LABELS[lvl]),
    ])
  ));

  nodes.push(h(2, 'Privilege Matrix'));

  if (role.privileges.length === 0) {
    nodes.push(pt('No custom entity privileges assigned to this role.'));
    return nodes;
  }

  nodes.push(table(
    ['Entity', 'Create', 'Read', 'Write', 'Delete', 'Append', 'Append To', 'Assign', 'Share'],
    role.privileges.map((priv: EntityPrivileges) => [
      ct(priv.entityName),
      ct(LEVEL_DOTS[priv.create]),
      ct(LEVEL_DOTS[priv.read]),
      ct(LEVEL_DOTS[priv.write]),
      ct(LEVEL_DOTS[priv.delete]),
      ct(LEVEL_DOTS[priv.append]),
      ct(LEVEL_DOTS[priv.appendTo]),
      ct(LEVEL_DOTS[priv.assign]),
      ct(LEVEL_DOTS[priv.share]),
    ])
  ));

  return nodes;
}

export function encodeRoleName(roleName: string): string {
  return roleName.replace(/[/?#%]/g, '');
}
