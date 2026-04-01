// renderers/modelDrivenAppRenderer.ts

import type { ModelDrivenAppModel } from '../ir/modelDrivenApp.js';
import type { DocNode, InlineNode } from '../docmodel/nodes.js';
import { h, pt, p, t, c, b, lnk, table, ct, cc, cell } from '../docmodel/nodes.js';

export function renderModelDrivenAppsIndex(
  apps: ModelDrivenAppModel[],
  basePath: string
): DocNode[] {
  const nodes: DocNode[] = [];

  nodes.push(h(1, 'Model-Driven Apps'));
  nodes.push(pt('Model-driven applications defined in this solution.'));

  if (apps.length === 0) {
    nodes.push(pt('No model-driven apps found in this solution.'));
    return nodes;
  }

  nodes.push(table(
    ['App', 'Status', 'Form Factor', 'Custom Entities', 'Roles'],
    apps.map(app => [
      cell(lnk(app.displayName, `${basePath}/${app.displayName}`)),
      ct(app.isActive ? 'Active' : 'Inactive'),
      ct(app.formFactor),
      ct(String(app.customEntities.length)),
      ct(String(app.roleCount)),
    ])
  ));

  return nodes;
}

export function renderModelDrivenAppPage(app: ModelDrivenAppModel): DocNode[] {
  const nodes: DocNode[] = [];

  nodes.push(h(1, app.displayName));

  const metaRows: InlineNode[][][] = [
    [ct('Unique Name'),     cc(app.uniqueName)],
    [ct('Status'),          ct(app.isActive ? 'Active' : 'Inactive')],
    [ct('Form Factor'),     ct(app.formFactor)],
    [ct('Security Roles'),  ct(String(app.roleCount))],
  ];
  if (app.description) metaRows.push([ct('Description'), ct(app.description)]);
  nodes.push(table(['Property', 'Value'], metaRows));

  if (app.appSettings.length > 0) {
    nodes.push(h(2, 'App Settings'));
    nodes.push(table(
      ['Setting', 'Value'],
      app.appSettings.map(s => [cc(s.key), ct(s.value)])
    ));
  }

  // Custom entities — 3-column layout
  nodes.push(h(2, 'Custom Entities'));
  if (app.customEntities.length === 0) {
    nodes.push(pt('No custom entities included in this app.'));
  } else {
    nodes.push(pt(`${app.customEntities.length} custom entities included:`));
    nodes.push(table(
      ['', '', ''],
      chunk(app.customEntities, 3).map(row =>
        row.map(e => cc(e)).concat(
          Array(3 - row.length).fill(ct(''))
        )
      )
    ));
  }

  // Standard entities — 3-column layout
  nodes.push(h(2, 'Standard Entities'));
  if (app.standardEntities.length === 0) {
    nodes.push(pt('No standard entities included in this app.'));
  } else {
    nodes.push(pt(`${app.standardEntities.length} standard Dataverse entities included:`));
    nodes.push(table(
      ['', '', ''],
      chunk(app.standardEntities, 3).map(row =>
        row.map(e => cc(e)).concat(
          Array(3 - row.length).fill(ct(''))
        )
      )
    ));
  }

  return nodes;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}
