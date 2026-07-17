import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseConnectionReferences } from '../../src/parsers/connectionReferenceParser.js';

const SOLUTION = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'fixtures', 'solutions', 'ContosoDemo',
);

describe('parseConnectionReferences', () => {
  it('sorts by display name, not by the order in Customizations.xml', () => {
    // Widget API is listed first in the file but sorts third — this fails if the
    // sort is dropped. The display-name-less entry sorts under its logical name.
    expect(parseConnectionReferences(SOLUTION).map(r => r.displayName))
      .toEqual([
        'Contoso Dataverse',
        'Contoso Outlook Mailbox',
        'Contoso Widget API',
        'contoso_sharedcontosoledgerapi_j7k8l',
      ]);
  });

  it('maps a connection reference onto the IR', () => {
    expect(parseConnectionReferences(SOLUTION).find(r => r.displayName === 'Contoso Dataverse'))
      .toEqual({
        logicalName:   'contoso_sharedcommondataserviceforapps_a1b2c',
        displayName:   'Contoso Dataverse',
        connectorId:   '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps',
        connectorName: 'Microsoft Dataverse',
      });
  });

  it('derives a friendly connectorName from the last segment of the connectorId', () => {
    // The connectorId is the only thing in the export that says what a flow actually
    // talks to; "shared_commondataserviceforapps" is unreadable in a client document.
    const byLogical = Object.fromEntries(
      parseConnectionReferences(SOLUTION).map(r => [r.logicalName, r.connectorName]),
    );
    expect(byLogical['contoso_sharedcommondataserviceforapps_a1b2c']).toBe('Microsoft Dataverse');
    expect(byLogical['contoso_sharedoffice365_d3e4f']).toBe('Office 365 Outlook');
  });

  it('falls back to a de-prefixed, de-underscored name for an unknown connector', () => {
    // Custom and third-party connectors will never be in the lookup table, so the
    // fallback has to stay readable rather than blank.
    const byLogical = Object.fromEntries(
      parseConnectionReferences(SOLUTION).map(r => [r.logicalName, r.connectorName]),
    );
    expect(byLogical['contoso_sharedcontosowidgets_g5h6i']).toBe('contosowidgets');
    expect(byLogical['contoso_sharedcontosoledgerapi_j7k8l']).toBe('contoso ledger api');
  });

  it('falls back to the logical name when no display name is given', () => {
    const ledger = parseConnectionReferences(SOLUTION)
      .find(r => r.logicalName === 'contoso_sharedcontosoledgerapi_j7k8l')!;
    expect(ledger.displayName).toBe('contoso_sharedcontosoledgerapi_j7k8l');
  });

  it('drops a reference with no logical name', () => {
    // The logical name is the identity a flow binds to — an entry without one cannot
    // be cross-linked to anything, so it is noise.
    const all = parseConnectionReferences(SOLUTION);
    expect(all).toHaveLength(4);
    expect(all.map(r => r.displayName)).not.toContain('Orphan with no logical name');
  });

  it('returns empty for a solution with no Other/Customizations.xml', () => {
    // Every sweeping parser must tolerate an absent component file — most real
    // solutions contain only a few component types.
    expect(parseConnectionReferences(path.join(SOLUTION, 'AppModules'))).toEqual([]);
  });
});
