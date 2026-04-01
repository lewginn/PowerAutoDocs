// renderers/environmentVariableRenderer.ts

import type { EnvironmentVariableModel } from '../ir/environmentVariable.js';
import type { EnvironmentVariablesConfig } from '../config/schema.js';
import type { DocNode, InlineNode } from '../docmodel/nodes.js';
import { h, pt, p, t, c, b, i, bqt, table, ct, cc, cell } from '../docmodel/nodes.js';

const SECRET_STORE_LABELS: Record<number, string> = {
  0: '—',
  1: 'Azure Key Vault',
  2: 'Microsoft Secret Store',
};

function secretStoreLabel(n: number): string {
  return SECRET_STORE_LABELS[n] ?? `Unknown (${n})`;
}

function defaultValueCell(model: EnvironmentVariableModel): InlineNode[] {
  if (model.secretStore > 0) return [i('[secret]')];
  if (model.defaultValue !== '') return [c(model.defaultValue)];
  return [i('Not set')];
}

function currentValueCell(model: EnvironmentVariableModel): InlineNode[] {
  if (model.secretStore > 0) return [i('[secret — stored externally]')];
  if (model.currentValue !== undefined) return [c(model.currentValue)];
  return [i('Not set')];
}

export function renderEnvironmentVariablesPage(
  envVars: EnvironmentVariableModel[],
  options: Pick<EnvironmentVariablesConfig, 'showDefaultValue' | 'showCurrentValue'> = {
    showDefaultValue: true,
    showCurrentValue: true,
  }
): DocNode[] {
  const nodes: DocNode[] = [];

  nodes.push(h(1, 'Environment Variables'));

  if (envVars.length === 0) {
    nodes.push(pt('No environment variables found in this solution.'));
    return nodes;
  }

  nodes.push(pt(
    `${envVars.length} environment variable${envVars.length === 1 ? '' : 's'} defined in this solution.`
  ));

  const hasDataSource = envVars.some(v => v.type === 'DataSource');
  if (hasDataSource) {
    nodes.push(bqt(
      'DataSource variables hold a record GUID referencing a Dataverse lookup. ' +
      'The value shown is the resolved GUID — check the target table for the display name.'
    ));
  }

  const headers = ['Display Name', 'Schema Name', 'Type', 'Required'];
  if (options.showDefaultValue) headers.push('Default Value');
  if (options.showCurrentValue) headers.push('Current Value');
  headers.push('Secret Store');

  nodes.push(table(
    headers,
    envVars.map(v => {
      const row: InlineNode[][] = [
        ct(v.displayName || v.schemaName),
        cc(v.schemaName),
        ct(v.type),
        ct(v.isRequired ? 'Yes' : 'No'),
      ];
      if (options.showDefaultValue) row.push(defaultValueCell(v));
      if (options.showCurrentValue) row.push(currentValueCell(v));
      row.push(ct(secretStoreLabel(v.secretStore)));
      return row;
    })
  ));

  return nodes;
}
