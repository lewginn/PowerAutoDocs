import { describe, it, expect } from 'vitest';
import { renderConnectionReferencesPage } from '../../src/renderers/connectionReferenceRenderer.js';
import type { DocNode, TableNode } from '../../src/docmodel/nodes.js';
import { aConnectionReference } from '../fixtures/ir.js';

const firstTable = (nodes: DocNode[]): TableNode => {
  const tbl = nodes.find(n => n.type === 'table') as TableNode | undefined;
  if (!tbl) throw new Error('expected a table node');
  return tbl;
};

describe('renderConnectionReferencesPage', () => {
  it('renders only a heading and a placeholder when there are none', () => {
    const nodes = renderConnectionReferencesPage([]);
    expect(nodes.map(n => n.type)).toEqual(['heading', 'paragraph']);
    expect(nodes).toContainEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: 'No connection references found in this solution.' }],
    });
  });

  it('omits the explanatory callout when there is nothing to explain', () => {
    expect(renderConnectionReferencesPage([]).some(n => n.type === 'blockquote')).toBe(false);
    expect(renderConnectionReferencesPage([aConnectionReference()]).some(n => n.type === 'blockquote')).toBe(true);
  });

  it('leads with the section heading', () => {
    expect(renderConnectionReferencesPage([])[0]).toEqual({
      type: 'heading', level: 1, text: 'Connection References',
    });
  });

  it('pluralises the count sentence', () => {
    expect(renderConnectionReferencesPage([aConnectionReference()])).toContainEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: '1 connection reference defined in this solution.' }],
    });
    expect(renderConnectionReferencesPage([
      aConnectionReference({ logicalName: 'a' }),
      aConnectionReference({ logicalName: 'b' }),
    ])).toContainEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: '2 connection references defined in this solution.' }],
    });
  });

  it('puts one row per reference under the expected headers', () => {
    const tbl = firstTable(renderConnectionReferencesPage([
      aConnectionReference({ logicalName: 'a' }),
      aConnectionReference({ logicalName: 'b' }),
    ]));
    expect(tbl.headers).toEqual(['Display Name', 'Connector', 'Logical Name']);
    expect(tbl.rows).toHaveLength(2);
  });

  it('renders the logical name as a code span and the rest as text', () => {
    // The logical name is what a maker types into a flow's connection binding, so
    // it must stay verbatim and copyable rather than being prose-formatted.
    const tbl = firstTable(renderConnectionReferencesPage([aConnectionReference({
      logicalName: 'acme_sharedcommondataserviceforapps_a1b2c',
      displayName: 'Microsoft Dataverse AcmeWidgets-a1b2c',
      connectorName: 'Microsoft Dataverse',
    })]));
    expect(tbl.rows[0]).toEqual([
      [{ type: 'text', value: 'Microsoft Dataverse AcmeWidgets-a1b2c' }],
      [{ type: 'text', value: 'Microsoft Dataverse' }],
      [{ type: 'code', value: 'acme_sharedcommondataserviceforapps_a1b2c' }],
    ]);
  });

  it('shows the friendly connector name and not the raw connector id path', () => {
    // connectorName is derived by the parser; the renderer must trust it rather
    // than fall back to the unreadable /providers/... path.
    const nodes = renderConnectionReferencesPage([aConnectionReference({
      connectorId: '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps',
      connectorName: 'Microsoft Dataverse',
    })]);
    expect(JSON.stringify(nodes)).not.toContain('/providers/');
  });

  it('preserves the order the references were supplied in', () => {
    const tbl = firstTable(renderConnectionReferencesPage([
      aConnectionReference({ displayName: 'Second', logicalName: 'b' }),
      aConnectionReference({ displayName: 'First', logicalName: 'a' }),
    ]));
    expect(tbl.rows.map(r => (r[0][0] as { value: string }).value)).toEqual(['Second', 'First']);
  });
});
