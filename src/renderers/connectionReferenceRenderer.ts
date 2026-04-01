// renderers/connectionReferenceRenderer.ts

import type { ConnectionReferenceModel } from '../ir/connectionReference.js';
import type { DocNode } from '../docmodel/nodes.js';
import { h, pt, bqt, table, ct, cc } from '../docmodel/nodes.js';

export function renderConnectionReferencesPage(
  refs: ConnectionReferenceModel[]
): DocNode[] {
  const nodes: DocNode[] = [];

  nodes.push(h(1, 'Connection References'));

  if (refs.length === 0) {
    nodes.push(pt('No connection references found in this solution.'));
    return nodes;
  }

  nodes.push(pt(
    `${refs.length} connection reference${refs.length === 1 ? '' : 's'} defined in this solution.`
  ));
  nodes.push(bqt(
    'Connection references decouple flows and apps from specific connections, ' +
    'allowing each environment to provide its own connection without modifying the solution.'
  ));

  nodes.push(table(
    ['Display Name', 'Connector', 'Logical Name'],
    refs.map(r => [ct(r.displayName), ct(r.connectorName), cc(r.logicalName)])
  ));

  return nodes;
}
