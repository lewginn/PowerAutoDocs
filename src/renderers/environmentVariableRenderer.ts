import type { EnvironmentVariableModel } from '../ir/environmentVariable.js';
import type { EnvironmentVariablesConfig } from '../config/schema.js';

const SECRET_STORE_LABELS: Record<number, string> = {
  0: '—',
  1: 'Azure Key Vault',
  2: 'Microsoft Secret Store',
};

function secretStoreLabel(n: number): string {
  return SECRET_STORE_LABELS[n] ?? `Unknown (${n})`;
}

function renderDefaultValue(model: EnvironmentVariableModel): string {
  if (model.secretStore > 0) return '_[secret]_';
  if (model.defaultValue !== '') return `\`${model.defaultValue}\``;
  return '_Not set_';
}

function renderCurrentValue(model: EnvironmentVariableModel): string {
  if (model.secretStore > 0) return '_[secret — stored externally]_';
  if (model.currentValue !== undefined) return `\`${model.currentValue}\``;
  return '_Not set_';
}

/**
 * Renders the Integrations / Environment Variables wiki page.
 * Columns shown are controlled by the EnvironmentVariablesConfig options.
 */
export function renderEnvironmentVariablesPage(
  envVars: EnvironmentVariableModel[],
  options: Pick<EnvironmentVariablesConfig, 'showDefaultValue' | 'showCurrentValue'> = {
    showDefaultValue: true,
    showCurrentValue: true,
  }
): string {
  const lines: string[] = [];

  lines.push('# Environment Variables\n');

  if (envVars.length === 0) {
    lines.push('_No environment variables found in this solution._');
    return lines.join('\n');
  }

  lines.push(
    `${envVars.length} environment variable${envVars.length === 1 ? '' : 's'} defined in this solution.\n`
  );

  const hasDataSource = envVars.some(v => v.type === 'DataSource');
  if (hasDataSource) {
    lines.push(
      '> **DataSource** variables hold a record GUID referencing a Dataverse lookup. ' +
      'The value shown is the resolved GUID — check the target table for the display name.\n'
    );
  }

  // Build headers and rows dynamically based on options
  const headers = ['Display Name', 'Schema Name', 'Type', 'Required'];
  if (options.showDefaultValue) headers.push('Default Value');
  if (options.showCurrentValue) headers.push('Current Value');
  headers.push('Secret Store');

  const sep = headers.map(() => '---');
  lines.push(`| ${headers.join(' | ')} |`);
  lines.push(`| ${sep.join(' | ')} |`);

  for (const v of envVars) {
    const row = [
      v.displayName || v.schemaName,
      `\`${v.schemaName}\``,
      v.type,
      v.isRequired ? 'Yes' : 'No',
    ];
    if (options.showDefaultValue) row.push(renderDefaultValue(v));
    if (options.showCurrentValue) row.push(renderCurrentValue(v));
    row.push(secretStoreLabel(v.secretStore));

    lines.push(`| ${row.join(' | ')} |`);
  }

  return lines.join('\n');
}