import { describe, it, expect } from 'vitest';
import {
  renderModelDrivenAppsIndex,
  renderModelDrivenAppPage,
} from '../../src/renderers/modelDrivenAppRenderer.js';
import type { DocNode, TableNode } from '../../src/docmodel/nodes.js';
import { aModelDrivenApp } from '../fixtures/ir.js';

const tables = (nodes: DocNode[]): TableNode[] => nodes.filter(n => n.type === 'table') as TableNode[];

const firstTable = (nodes: DocNode[]): TableNode => {
  const tbl = nodes.find(n => n.type === 'table') as TableNode | undefined;
  if (!tbl) throw new Error('expected a table node');
  return tbl;
};

const propLabels = (tbl: TableNode): string[] =>
  tbl.rows.map(r => (r[0][0] as { value: string }).value);

const propValue = (tbl: TableNode, label: string) =>
  tbl.rows.find(r => (r[0][0] as { value: string }).value === label)?.[1];

const headings = (nodes: DocNode[]): string[] =>
  nodes.filter(n => n.type === 'heading').map(n => (n as { text: string }).text);

/** The entity-grid table that follows a given heading. */
const tableAfter = (nodes: DocNode[], heading: string): TableNode | undefined => {
  const start = nodes.findIndex(n => n.type === 'heading' && n.text === heading);
  if (start === -1) throw new Error(`no heading ${heading}`);
  const rest = nodes.slice(start + 1);
  const next = rest.findIndex(n => n.type === 'heading');
  const section = next === -1 ? rest : rest.slice(0, next);
  return section.find(n => n.type === 'table') as TableNode | undefined;
};

describe('renderModelDrivenAppsIndex', () => {
  it('renders a placeholder instead of an empty table when there are no apps', () => {
    const nodes = renderModelDrivenAppsIndex([], '/Apps');
    expect(nodes.some(n => n.type === 'table')).toBe(false);
    expect(nodes).toContainEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: 'No model-driven apps found in this solution.' }],
    });
  });

  it('puts one row per app under the expected headers', () => {
    const tbl = firstTable(renderModelDrivenAppsIndex(
      [aModelDrivenApp({ displayName: 'A' }), aModelDrivenApp({ displayName: 'B' })],
      '/Apps',
    ));
    expect(tbl.headers).toEqual(['App', 'Status', 'Form Factor', 'Custom Entities', 'Roles']);
    expect(tbl.rows).toHaveLength(2);
  });

  it('links each app to its own page under the basePath', () => {
    const tbl = firstTable(renderModelDrivenAppsIndex([aModelDrivenApp({ displayName: 'Widget Hub' })], '/Apps'));
    expect(tbl.rows[0][0]).toEqual([{ type: 'link', text: 'Widget Hub', href: '/Apps/Widget Hub' }]);
  });

  it('reports active state as a word, not a boolean', () => {
    const active = firstTable(renderModelDrivenAppsIndex([aModelDrivenApp({ isActive: true })], '/Apps'));
    const inactive = firstTable(renderModelDrivenAppsIndex([aModelDrivenApp({ isActive: false })], '/Apps'));
    expect(active.rows[0][1]).toEqual([{ type: 'text', value: 'Active' }]);
    expect(inactive.rows[0][1]).toEqual([{ type: 'text', value: 'Inactive' }]);
  });

  it('summarises custom entities as a count, and counts only the custom ones', () => {
    // Standard entities are listed on the page but excluded from this count —
    // the index is meant to signal how much bespoke surface an app carries.
    const tbl = firstTable(renderModelDrivenAppsIndex([aModelDrivenApp({
      customEntities: ['acme_widget', 'acme_part'],
      standardEntities: ['account', 'contact', 'systemuser'],
    })], '/Apps'));
    expect(tbl.rows[0][3]).toEqual([{ type: 'text', value: '2' }]);
  });

  it('renders a zero role count rather than dropping the cell', () => {
    const tbl = firstTable(renderModelDrivenAppsIndex([aModelDrivenApp({ roleCount: 0 })], '/Apps'));
    expect(tbl.rows[0][4]).toEqual([{ type: 'text', value: '0' }]);
  });
});

describe('renderModelDrivenAppPage', () => {
  it('leads with the display name as a level-1 heading', () => {
    const nodes = renderModelDrivenAppPage(aModelDrivenApp({ displayName: 'Widget Hub' }));
    expect(nodes[0]).toEqual({ type: 'heading', level: 1, text: 'Widget Hub' });
  });

  it('omits the Description row when the app has none', () => {
    expect(propLabels(firstTable(renderModelDrivenAppPage(aModelDrivenApp({ description: '' })))))
      .toEqual(['Unique Name', 'Status', 'Form Factor', 'Security Roles']);
    expect(propLabels(firstTable(renderModelDrivenAppPage(aModelDrivenApp({ description: 'Manage widgets.' })))))
      .toEqual(['Unique Name', 'Status', 'Form Factor', 'Security Roles', 'Description']);
  });

  it('renders the unique name as a code span', () => {
    const tbl = firstTable(renderModelDrivenAppPage(aModelDrivenApp({ uniqueName: 'acme_WidgetHub' })));
    expect(propValue(tbl, 'Unique Name')).toEqual([{ type: 'code', value: 'acme_WidgetHub' }]);
  });

  it('drops the App Settings section when the app has no settings', () => {
    expect(headings(renderModelDrivenAppPage(aModelDrivenApp({ appSettings: [] }))))
      .not.toContain('App Settings');
  });

  it('lists app settings as key/value with the key as code', () => {
    const nodes = renderModelDrivenAppPage(aModelDrivenApp({
      appSettings: [{ key: 'EnableFlows', value: 'true' }],
    }));
    expect(tableAfter(nodes, 'App Settings')).toEqual({
      type: 'table',
      headers: ['Setting', 'Value'],
      rows: [[[{ type: 'code', value: 'EnableFlows' }], [{ type: 'text', value: 'true' }]]],
    });
  });

  it('keeps both entity sections even when one is empty', () => {
    // The absence of custom entities is itself worth documenting — silently
    // dropping the heading would read as a rendering gap.
    const nodes = renderModelDrivenAppPage(aModelDrivenApp({ customEntities: [], standardEntities: [] }));
    expect(headings(nodes)).toEqual(['Widget Hub', 'Custom Entities', 'Standard Entities']);
    expect(nodes).toContainEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: 'No custom entities included in this app.' }],
    });
    expect(nodes).toContainEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: 'No standard entities included in this app.' }],
    });
    expect(tables(nodes)).toHaveLength(1); // the meta table only
  });

  it('splits custom and standard entities into their own grids', () => {
    const nodes = renderModelDrivenAppPage(aModelDrivenApp({
      customEntities: ['acme_widget'],
      standardEntities: ['account'],
    }));
    expect(tableAfter(nodes, 'Custom Entities')?.rows[0][0]).toEqual([{ type: 'code', value: 'acme_widget' }]);
    expect(tableAfter(nodes, 'Standard Entities')?.rows[0][0]).toEqual([{ type: 'code', value: 'account' }]);
  });

  it('lays entities out three to a row', () => {
    const nodes = renderModelDrivenAppPage(aModelDrivenApp({
      customEntities: ['a', 'b', 'c', 'd', 'e', 'f'],
    }));
    const grid = tableAfter(nodes, 'Custom Entities');
    expect(grid?.headers).toEqual(['', '', '']);
    expect(grid?.rows).toHaveLength(2);
    expect(grid?.rows[1]).toEqual([
      [{ type: 'code', value: 'd' }], [{ type: 'code', value: 'e' }], [{ type: 'code', value: 'f' }],
    ]);
  });

  it('pads a short final row so it stays aligned with the three columns', () => {
    // A ragged last row would desync the grid in markdown and docx alike.
    const nodes = renderModelDrivenAppPage(aModelDrivenApp({ customEntities: ['a', 'b', 'c', 'd'] }));
    const grid = tableAfter(nodes, 'Custom Entities');
    expect(grid?.rows).toHaveLength(2);
    expect(grid?.rows[1]).toEqual([
      [{ type: 'code', value: 'd' }], [{ type: 'text', value: '' }], [{ type: 'text', value: '' }],
    ]);
  });

  it('states the entity count above each grid', () => {
    const nodes = renderModelDrivenAppPage(aModelDrivenApp({
      customEntities: ['a', 'b'],
      standardEntities: ['account'],
    }));
    expect(nodes).toContainEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: '2 custom entities included:' }],
    });
    expect(nodes).toContainEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: '1 standard Dataverse entities included:' }],
    });
  });
});
