import type { ConnectionReferenceModel } from '../ir/connectionReference.js';

/**
 * Renders the Connection References section — added to the existing
 * Integrations page alongside Environment Variables.
 */
export function renderConnectionReferencesPage(
  refs: ConnectionReferenceModel[]
): string {
  const lines: string[] = [];

  lines.push('# Connection References\n');

  if (refs.length === 0) {
    lines.push('_No connection references found in this solution._');
    return lines.join('\n');
  }

  lines.push(
    `${refs.length} connection reference${refs.length === 1 ? '' : 's'} defined in this solution.\n`
  );
  lines.push(
    '> Connection references decouple flows and apps from specific connections, ' +
    'allowing each environment to provide its own connection without modifying the solution.\n'
  );

  lines.push('| Display Name | Connector | Logical Name |');
  lines.push('| --- | --- | --- |');

  for (const r of refs) {
    lines.push(`| ${r.displayName} | ${r.connectorName} | \`${r.logicalName}\` |`);
  }

  return lines.join('\n');
}