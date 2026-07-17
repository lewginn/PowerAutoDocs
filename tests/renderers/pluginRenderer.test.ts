import { describe, it, expect } from 'vitest';
import {
  renderPluginSummary,
  renderAssemblyIndex,
  renderSinglePluginType,
} from '../../src/renderers/pluginRenderer.js';
import type { DocNode, TableNode } from '../../src/docmodel/nodes.js';
import { aPluginAssembly, aPluginStep } from '../fixtures/ir.js';

const tables = (nodes: DocNode[]): TableNode[] =>
  nodes.filter(n => n.type === 'table') as TableNode[];

const headings = (nodes: DocNode[]): string[] =>
  nodes.filter(n => n.type === 'heading').map(n => (n as { text: string }).text);

/** The label column of a Property/Value table. */
const propValue = (tbl: TableNode, label: string) =>
  tbl.rows.find(r => (r[0][0] as { value: string }).value === label)?.[1];

/** Text of a single-inline cell. */
const cellText = (tbl: TableNode, row: number, col: number): string =>
  (tbl.rows[row][col][0] as { value: string }).value;

// Array.prototype.at() needs ES2022 and the build targets ES2020 — see tsconfig.json.
const last = (nodes: DocNode[]): DocNode => nodes[nodes.length - 1];

describe('renderPluginSummary', () => {
  it('renders a placeholder instead of an empty table when there are no assemblies', () => {
    const nodes = renderPluginSummary([]);
    expect(nodes.map(n => n.type)).toEqual(['heading', 'paragraph']);
    expect(last(nodes)).toEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: 'No plugin assemblies found in this solution.' }],
    });
  });

  it('totals steps across every assembly, not just the first', () => {
    const nodes = renderPluginSummary([
      aPluginAssembly({ steps: [aPluginStep(), aPluginStep()] }),
      aPluginAssembly({ steps: [aPluginStep()] }),
    ]);
    expect(nodes[1]).toEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: '2 assembly/assemblies, 3 registered step(s).' }],
    });
  });

  it('puts one row per assembly under the expected headers', () => {
    const tbl = tables(renderPluginSummary([
      aPluginAssembly({ assemblyName: 'Acme.A' }),
      aPluginAssembly({ assemblyName: 'Acme.B' }),
    ]))[0];
    expect(tbl.headers).toEqual(['Assembly', 'Version', 'Isolation', 'Plugin Types', 'Steps']);
    expect(tbl.rows).toHaveLength(2);
    expect(cellText(tbl, 0, 0)).toBe('Acme.A');
  });

  it('reports counts as strings derived from the collections, not stored fields', () => {
    const tbl = tables(renderPluginSummary([
      aPluginAssembly({
        pluginTypeNames: ['Acme.Widgets.Plugins.One', 'Acme.Widgets.Plugins.Two'],
        steps: [aPluginStep(), aPluginStep(), aPluginStep()],
      }),
    ]))[0];
    expect(cellText(tbl, 0, 3)).toBe('2');
    expect(cellText(tbl, 0, 4)).toBe('3');
  });

  it('surfaces the isolation mode so an unsandboxed assembly is visible', () => {
    const tbl = tables(renderPluginSummary([aPluginAssembly({ isolationMode: 'None' })]))[0];
    expect(cellText(tbl, 0, 2)).toBe('None');
  });
});

describe('renderAssemblyIndex', () => {
  it('leads with the assembly name as a level-1 heading', () => {
    const nodes = renderAssemblyIndex(aPluginAssembly({ assemblyName: 'Acme.Widgets.Plugins' }), '/Plugins');
    expect(nodes[0]).toEqual({ type: 'heading', level: 1, text: 'Acme.Widgets.Plugins' });
  });

  it('includes the AI summary block only when a summary exists', () => {
    const withSummary = renderAssemblyIndex(aPluginAssembly({ aiSummary: 'Handles widgets.' }), '/Plugins');
    expect(withSummary[1]).toEqual({ type: 'heading', level: 2, text: 'Summary' });
    expect(withSummary[2]).toEqual({ type: 'blockquote', inlines: [{ type: 'text', value: 'Handles widgets.' }] });

    const without = renderAssemblyIndex(aPluginAssembly({ aiSummary: undefined }), '/Plugins');
    expect(headings(without)).not.toContain('Summary');
  });

  it('states that none were found rather than emitting an empty plugin type table', () => {
    const nodes = renderAssemblyIndex(aPluginAssembly({ pluginTypeNames: [], steps: [] }), '/Plugins');
    expect(headings(nodes)).not.toContain('Plugin Types');
    expect(last(nodes)).toEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: 'No plugin types found.' }],
    });
    // The property table still renders — only the type listing is suppressed.
    expect(tables(nodes)).toHaveLength(1);
  });

  it('strips the assembly namespace prefix off the plugin class name', () => {
    // pluginTypeNames are fully qualified, but steps carry only the short class
    // name — the link text and the stepsByClass lookup both depend on the strip.
    const tbl = tables(renderAssemblyIndex(aPluginAssembly({
      assemblyName: 'Acme.Widgets.Plugins',
      pluginTypeNames: ['Acme.Widgets.Plugins.WidgetPostOperation'],
      steps: [aPluginStep({ className: 'WidgetPostOperation' })],
    }), '/Plugins'))[1];
    expect(tbl.rows[0][0]).toEqual([
      { type: 'link', text: 'WidgetPostOperation', href: '/Plugins/WidgetPostOperation' },
    ]);
    expect(cellText(tbl, 0, 1)).toBe('1');
  });

  it('leaves a type name alone when it does not sit under the assembly namespace', () => {
    // A type can live in a different namespace to its assembly; a naive
    // slice-by-length would mangle it.
    const tbl = tables(renderAssemblyIndex(aPluginAssembly({
      assemblyName: 'Acme.Widgets.Plugins',
      pluginTypeNames: ['Contoso.Shared.SharedHandler'],
      steps: [],
    }), '/Plugins'))[1];
    expect(tbl.rows[0][0]).toEqual([
      { type: 'link', text: 'Contoso.Shared.SharedHandler', href: '/Plugins/Contoso.Shared.SharedHandler' },
    ]);
  });

  it('groups steps under their class and de-duplicates the entity list', () => {
    const tbl = tables(renderAssemblyIndex(aPluginAssembly({
      assemblyName: 'Acme.Widgets.Plugins',
      pluginTypeNames: ['Acme.Widgets.Plugins.WidgetPostOperation'],
      steps: [
        aPluginStep({ className: 'WidgetPostOperation', primaryEntity: 'acme_widget', message: 'Create' }),
        aPluginStep({ className: 'WidgetPostOperation', primaryEntity: 'acme_widget', message: 'Update' }),
        aPluginStep({ className: 'WidgetPostOperation', primaryEntity: 'acme_part', message: 'Create' }),
      ],
    }), '/Plugins'))[1];
    expect(cellText(tbl, 0, 1)).toBe('3');
    expect(cellText(tbl, 0, 2)).toBe('acme_widget, acme_part');
  });

  it('shows an em dash for a registered type that has no steps', () => {
    const tbl = tables(renderAssemblyIndex(aPluginAssembly({
      assemblyName: 'Acme.Widgets.Plugins',
      pluginTypeNames: ['Acme.Widgets.Plugins.Unused'],
      steps: [],
    }), '/Plugins'))[1];
    expect(cellText(tbl, 0, 1)).toBe('0');
    expect(cellText(tbl, 0, 2)).toBe('—');
  });

  it('ignores steps whose class is not a registered plugin type', () => {
    // stepsByClass is keyed off the step, but the table iterates pluginTypeNames —
    // an orphaned step must not invent a row.
    const tbl = tables(renderAssemblyIndex(aPluginAssembly({
      assemblyName: 'Acme.Widgets.Plugins',
      pluginTypeNames: ['Acme.Widgets.Plugins.WidgetPostOperation'],
      steps: [aPluginStep({ className: 'GhostHandler' })],
    }), '/Plugins'))[1];
    expect(tbl.rows).toHaveLength(1);
    expect(cellText(tbl, 0, 1)).toBe('0');
  });

  it('renders the property table off the live collections', () => {
    const tbl = tables(renderAssemblyIndex(aPluginAssembly({
      version: '2.1.0.0',
      isolationMode: 'Sandbox',
      pluginTypeNames: ['Acme.Widgets.Plugins.A', 'Acme.Widgets.Plugins.B'],
      steps: [aPluginStep({ className: 'A' })],
    }), '/Plugins'))[0];
    expect(propValue(tbl, 'Version')).toEqual([{ type: 'text', value: '2.1.0.0' }]);
    expect(propValue(tbl, 'Isolation Mode')).toEqual([{ type: 'text', value: 'Sandbox' }]);
    expect(propValue(tbl, 'Plugin Types')).toEqual([{ type: 'text', value: '2' }]);
    expect(propValue(tbl, 'Registered Steps')).toEqual([{ type: 'text', value: '1' }]);
  });
});

describe('renderSinglePluginType', () => {
  it('leads with the class name and describes its parent assembly', () => {
    const nodes = renderSinglePluginType('WidgetPostOperation', [], aPluginAssembly({
      assemblyName: 'Acme.Widgets.Plugins',
    }));
    expect(nodes[0]).toEqual({ type: 'heading', level: 1, text: 'WidgetPostOperation' });
    // The assembly name is an identifier, so it gets a code span rather than plain text.
    expect(propValue(tables(nodes)[0], 'Assembly')).toEqual([
      { type: 'code', value: 'Acme.Widgets.Plugins' },
    ]);
  });

  it('counts the steps passed in, not the assembly-wide step list', () => {
    // The caller filters steps by class before calling — the page must reflect
    // that filtered set, otherwise every class page would claim the same total.
    const assembly = aPluginAssembly({ steps: [aPluginStep(), aPluginStep(), aPluginStep()] });
    const nodes = renderSinglePluginType('WidgetPostOperation', [aPluginStep()], assembly);
    expect(propValue(tables(nodes)[0], 'Registered Steps')).toEqual([{ type: 'text', value: '1' }]);
  });

  it('states that none were found rather than emitting an empty step table', () => {
    const nodes = renderSinglePluginType('Unused', [], aPluginAssembly());
    expect(headings(nodes)).toEqual(['Unused']);
    expect(tables(nodes)).toHaveLength(1);
    expect(last(nodes)).toEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: 'No registered steps found for this plugin type.' }],
    });
  });

  it('lists each step with its message, entity, stage and mode', () => {
    const tbl = tables(renderSinglePluginType('WidgetPostOperation', [
      aPluginStep({ message: 'Create', primaryEntity: 'acme_widget', stage: 'PreValidation', mode: 'Asynchronous' }),
    ], aPluginAssembly()))[1];
    expect(tbl.headers).toEqual(['Message', 'Entity', 'Stage', 'Mode', 'Filtering Attributes']);
    expect(tbl.rows[0][0]).toEqual([{ type: 'text', value: 'Create' }]);
    expect(tbl.rows[0][1]).toEqual([{ type: 'code', value: 'acme_widget' }]);
    expect(tbl.rows[0][2]).toEqual([{ type: 'text', value: 'PreValidation' }]);
    expect(tbl.rows[0][3]).toEqual([{ type: 'text', value: 'Asynchronous' }]);
  });

  it('says (all) when a step has no filtering attributes', () => {
    // An empty filter list in the XML means the step fires on every attribute —
    // rendering a blank cell would read as "none", the opposite meaning.
    const tbl = tables(renderSinglePluginType('WidgetPostOperation', [
      aPluginStep({ filteringAttributes: [] }),
    ], aPluginAssembly()))[1];
    expect(tbl.rows[0][4]).toEqual([{ type: 'italic', value: '(all)' }]);
  });

  it('comma-separates filtering attributes as code spans without a trailing separator', () => {
    const tbl = tables(renderSinglePluginType('WidgetPostOperation', [
      aPluginStep({ filteringAttributes: ['acme_tier', 'acme_serial'] }),
    ], aPluginAssembly()))[1];
    expect(tbl.rows[0][4]).toEqual([
      { type: 'code', value: 'acme_tier' },
      { type: 'text', value: ', ' },
      { type: 'code', value: 'acme_serial' },
    ]);
  });

  it('renders a single filtering attribute with no separator at all', () => {
    const tbl = tables(renderSinglePluginType('WidgetPostOperation', [
      aPluginStep({ filteringAttributes: ['acme_tier'] }),
    ], aPluginAssembly()))[1];
    expect(tbl.rows[0][4]).toEqual([{ type: 'code', value: 'acme_tier' }]);
  });

  it('omits the Step Images section when no step registers an image', () => {
    const nodes = renderSinglePluginType('WidgetPostOperation', [
      aPluginStep({ images: [] }),
    ], aPluginAssembly());
    expect(headings(nodes)).toEqual(['WidgetPostOperation', 'Registered Steps']);
  });

  it('gives an image section only to the steps that actually have images', () => {
    const nodes = renderSinglePluginType('WidgetPostOperation', [
      aPluginStep({ message: 'Create', images: [] }),
      aPluginStep({
        message: 'Update',
        primaryEntity: 'acme_widget',
        images: [{ id: 'i1', name: 'PreImage', imageType: 'PreImage', attributes: ['acme_tier'] }],
      }),
    ], aPluginAssembly());
    const imageHeadings = headings(nodes).filter(t => t.includes(' of '));
    expect(imageHeadings).toHaveLength(1);
    expect(imageHeadings[0]).toContain('Update');
    expect(imageHeadings[0]).toContain('acme_widget');
  });

  it('renders one image table per step, listing every image', () => {
    const nodes = renderSinglePluginType('WidgetPostOperation', [
      aPluginStep({
        images: [
          { id: 'i1', name: 'PreImage', imageType: 'PreImage', attributes: ['acme_tier'] },
          { id: 'i2', name: 'PostImage', imageType: 'PostImage', attributes: [] },
        ],
      }),
    ], aPluginAssembly());
    const imgTable = tables(nodes)[2];
    expect(imgTable.headers).toEqual(['Image Name', 'Type', 'Attributes']);
    expect(imgTable.rows).toHaveLength(2);
    expect(imgTable.rows[0][1]).toEqual([{ type: 'text', value: 'PreImage' }]);
    // Same "empty means all attributes" rule as step filtering.
    expect(imgTable.rows[1][2]).toEqual([{ type: 'italic', value: '(all)' }]);
  });

  it('comma-separates image attributes as code spans', () => {
    const nodes = renderSinglePluginType('WidgetPostOperation', [
      aPluginStep({
        images: [{ id: 'i1', name: 'PreImage', imageType: 'Both', attributes: ['acme_tier', 'acme_serial'] }],
      }),
    ], aPluginAssembly());
    expect(tables(nodes)[2].rows[0][2]).toEqual([
      { type: 'code', value: 'acme_tier' },
      { type: 'text', value: ', ' },
      { type: 'code', value: 'acme_serial' },
    ]);
  });
});

describe('plugin renderers — format boundary', () => {
  it('never emits markdown fences from any plugin renderer', () => {
    // constraints.md: renderers return DocNode[]; fences belong to the serializer
    // that owns the format. A fence leaking through here is the double-fence bug.
    const assembly = aPluginAssembly({
      steps: [aPluginStep({
        filteringAttributes: ['acme_tier'],
        images: [{ id: 'i1', name: 'PreImage', imageType: 'PreImage', attributes: ['acme_tier'] }],
      })],
    });
    const all: DocNode[] = [
      ...renderPluginSummary([assembly]),
      ...renderAssemblyIndex(assembly, '/Plugins'),
      ...renderSinglePluginType('WidgetPostOperation', assembly.steps, assembly),
    ];
    expect(JSON.stringify(all)).not.toContain('```');
  });
});
