import type { ModelDrivenAppModel } from '../ir/modelDrivenApp.js';
import { toADOWikiLink } from './rendererUtils.js';

export function renderModelDrivenAppsIndex(
  apps: ModelDrivenAppModel[],
  basePath: string
): string {
  const lines: string[] = [];

  lines.push('# Model-Driven Apps\n');
  lines.push('Model-driven applications defined in this solution.\n');

  if (apps.length === 0) {
    lines.push('_No model-driven apps found in this solution._');
    return lines.join('\n');
  }

  lines.push('| App | Status | Form Factor | Custom Entities | Roles |');
  lines.push('| --- | --- | --- | --- | --- |');

  for (const app of apps) {
    const link = `[${app.displayName}](${toADOWikiLink(`${basePath}/${app.displayName}`)})`;
    lines.push(`| ${link} | ${app.isActive ? 'Active' : 'Inactive'} | ${app.formFactor} | ${app.customEntities.length} | ${app.roleCount} |`);
  }

  return lines.join('\n');
}

export function renderModelDrivenAppPage(app: ModelDrivenAppModel): string {
  const lines: string[] = [];

  lines.push(`# ${app.displayName}\n`);

  lines.push('| Property | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Unique Name | \`${app.uniqueName}\` |`);
  lines.push(`| Status | ${app.isActive ? 'Active' : 'Inactive'} |`);
  lines.push(`| Form Factor | ${app.formFactor} |`);
  lines.push(`| Security Roles | ${app.roleCount} |`);
  if (app.description) {
    lines.push(`| Description | ${app.description} |`);
  }
  lines.push('');

  if (app.appSettings.length > 0) {
    lines.push('## App Settings\n');
    lines.push('| Setting | Value |');
    lines.push('| --- | --- |');
    for (const s of app.appSettings) {
      lines.push(`| \`${s.key}\` | ${s.value} |`);
    }
    lines.push('');
  }

  // Custom entities in 3-column table
  lines.push('## Custom Entities\n');
  if (app.customEntities.length === 0) {
    lines.push('_No custom entities included in this app._');
  } else {
    lines.push(`${app.customEntities.length} custom entities included:\n`);
    lines.push('| | | |');
    lines.push('| --- | --- | --- |');
    for (let i = 0; i < app.customEntities.length; i += 3) {
      const row = [
        app.customEntities[i]     ? `\`${app.customEntities[i]}\``     : '',
        app.customEntities[i + 1] ? `\`${app.customEntities[i + 1]}\`` : '',
        app.customEntities[i + 2] ? `\`${app.customEntities[i + 2]}\`` : '',
      ];
      lines.push(`| ${row.join(' | ')} |`);
    }
  }
  lines.push('');

  // Standard entities in 3-column table
  lines.push('## Standard Entities\n');
  if (app.standardEntities.length === 0) {
    lines.push('_No standard entities included in this app._');
  } else {
    lines.push(`${app.standardEntities.length} standard Dataverse entities included:\n`);
    lines.push('| | | |');
    lines.push('| --- | --- | --- |');
    for (let i = 0; i < app.standardEntities.length; i += 3) {
      const row = [
        app.standardEntities[i]     ? `\`${app.standardEntities[i]}\``     : '',
        app.standardEntities[i + 1] ? `\`${app.standardEntities[i + 1]}\`` : '',
        app.standardEntities[i + 2] ? `\`${app.standardEntities[i + 2]}\`` : '',
      ];
      lines.push(`| ${row.join(' | ')} |`);
    }
  }
  lines.push('');

  return lines.join('\n');
}