import type { SecurityRoleModel, EntityPrivileges, PrivilegeLevel } from '../ir/securityRole.js';
import { toADOWikiLink } from './rendererUtils.js';

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

function dots(level: PrivilegeLevel): string {
  return LEVEL_DOTS[level];
}

function mdTable(headers: string[], rows: string[][]): string {
  const sep = headers.map(() => '---');
  return [
    `| ${headers.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
    ...rows.map(row => `| ${row.join(' | ')} |`),
  ].join('\n');
}

/**
 * Renders the Security Roles index page.
 * basePath should be the full wiki path to the Security Roles page,
 * e.g. "/WikiNode/Security/Security Roles"
 */
export function renderSecurityRolesIndex(
  roles: SecurityRoleModel[],
  basePath: string
): string {
  const lines: string[] = [];

  lines.push('# Security Roles\n');
  lines.push('Custom security roles defined in this solution.\n');

  if (roles.length === 0) {
    lines.push('_No custom security roles found in this solution._');
    return lines.join('\n');
  }

  const rows = roles.map(r => [
    `[${r.name}](${toADOWikiLink(`${basePath}/${encodeRoleName(r.name)}`)})`,
    r.isAutoAssigned ? 'Yes' : 'No',
    String(r.privileges.length),
  ]);

  lines.push(mdTable(['Role', 'Auto Assigned', 'Custom Entities'], rows));

  return lines.join('\n');
}

export function renderSecurityRolePage(role: SecurityRoleModel): string {
  const lines: string[] = [];

  lines.push(`# ${role.name}\n`);

  lines.push('| Property | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Auto Assigned | ${role.isAutoAssigned ? 'Yes' : 'No'} |`);
  lines.push(`| Customizable | ${role.isCustomizable ? 'Yes' : 'No'} |`);
  lines.push(`| Custom Entity Count | ${role.privileges.length} |`);
  lines.push('');

  lines.push('## Access Level Key\n');
  lines.push(
    mdTable(
      ['Dots', 'Level', 'Scope'],
      Object.entries(LEVEL_DOTS).map(([lvl, d]) => [
        d,
        lvl,
        LEVEL_LABELS[lvl as PrivilegeLevel],
      ])
    )
  );
  lines.push('');

  lines.push('## Privilege Matrix\n');

  if (role.privileges.length === 0) {
    lines.push('_No custom entity privileges assigned to this role._');
    return lines.join('\n');
  }

  const headers = [
    'Entity', 'Create', 'Read', 'Write', 'Delete',
    'Append', 'Append To', 'Assign', 'Share',
  ];

  const rows = role.privileges.map((p: EntityPrivileges) => [
    p.entityName,
    dots(p.create), dots(p.read), dots(p.write), dots(p.delete),
    dots(p.append), dots(p.appendTo), dots(p.assign), dots(p.share),
  ]);

  lines.push(mdTable(headers, rows));

  return lines.join('\n');
}

export function encodeRoleName(roleName: string): string {
  return roleName.replace(/[/?#%]/g, '');
}