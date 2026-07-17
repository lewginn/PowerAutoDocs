import { describe, it, expect } from 'vitest';
import {
  renderGlobalChoicesIndex,
  renderGlobalChoicePage,
  encodeChoiceName,
} from '../../src/renderers/globalChoiceRenderer.js';
import type { DocNode, TableNode } from '../../src/docmodel/nodes.js';
import { aGlobalChoice } from '../fixtures/ir.js';
import type { ChoiceOptionModel } from '../../src/ir/index.js';

const firstTable = (nodes: DocNode[]): TableNode => {
  const tbl = nodes.find(n => n.type === 'table') as TableNode | undefined;
  if (!tbl) throw new Error('expected a table node');
  return tbl;
};

/** The label column of a Property/Value table. */
const propLabels = (tbl: TableNode): string[] =>
  tbl.rows.map(r => (r[0][0] as { value: string }).value);

const propValue = (tbl: TableNode, label: string) =>
  tbl.rows.find(r => (r[0][0] as { value: string }).value === label)?.[1];

// Local — tests/fixtures/ir.ts has no option factory, and every option field
// participates in the page's column-visibility logic.
const anOption = (over: Partial<ChoiceOptionModel> = {}): ChoiceOptionModel => ({
  value: 100000000,
  label: 'Standard',
  description: '',
  isHidden: false,
  externalValue: '',
  ...over,
});

describe('renderGlobalChoicesIndex', () => {
  it('renders a placeholder instead of an empty table when there are no choices', () => {
    const nodes = renderGlobalChoicesIndex([], '/Choices');
    expect(nodes.some(n => n.type === 'table')).toBe(false);
    expect(nodes).toContainEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: 'No global choices found in this solution.' }],
    });
  });

  it('puts one row per choice under the expected headers', () => {
    const nodes = renderGlobalChoicesIndex(
      [aGlobalChoice({ displayName: 'A' }), aGlobalChoice({ displayName: 'B' })],
      '/Choices',
    );
    const tbl = firstTable(nodes);
    expect(tbl.headers).toEqual(['Display Name', 'Schema Name', 'Type', 'Options']);
    expect(tbl.rows).toHaveLength(2);
  });

  it('links each choice to its own page under the basePath', () => {
    const tbl = firstTable(renderGlobalChoicesIndex([aGlobalChoice({ displayName: 'Widget Tier' })], '/Choices'));
    expect(tbl.rows[0][0]).toEqual([{ type: 'link', text: 'Widget Tier', href: '/Choices/Widget Tier' }]);
  });

  it('shows a plain total when no options are hidden', () => {
    const tbl = firstTable(renderGlobalChoicesIndex(
      [aGlobalChoice({ options: [anOption(), anOption({ value: 100000001 })] })],
      '/Choices',
    ));
    expect(tbl.rows[0][3]).toEqual([{ type: 'text', value: '2' }]);
  });

  it('reports the visible count and how many are hidden', () => {
    // The visible count is what a user sees in the UI; the hidden ones still
    // exist in the solution, so burying them entirely would misrepresent it.
    const tbl = firstTable(renderGlobalChoicesIndex(
      [aGlobalChoice({
        options: [anOption(), anOption({ value: 2, isHidden: true }), anOption({ value: 3, isHidden: true })],
      })],
      '/Choices',
    ));
    expect(tbl.rows[0][3]).toEqual([{ type: 'text', value: '1 (2 hidden)' }]);
  });

  it('renders the schema name as a code span', () => {
    const tbl = firstTable(renderGlobalChoicesIndex([aGlobalChoice({ schemaName: 'acme_widgettier' })], '/Choices'));
    expect(tbl.rows[0][1]).toEqual([{ type: 'code', value: 'acme_widgettier' }]);
  });
});

describe('renderGlobalChoicePage', () => {
  it('leads with the display name as a level-1 heading', () => {
    const nodes = renderGlobalChoicePage(aGlobalChoice({ displayName: 'Widget Tier' }));
    expect(nodes[0]).toEqual({ type: 'heading', level: 1, text: 'Widget Tier' });
  });

  it('omits the Description row when the choice has none rather than rendering it blank', () => {
    expect(propLabels(firstTable(renderGlobalChoicePage(aGlobalChoice({ description: '' })))))
      .toEqual(['Schema Name', 'Type', 'Global']);
    expect(propLabels(firstTable(renderGlobalChoicePage(aGlobalChoice({ description: 'How premium.' })))))
      .toEqual(['Schema Name', 'Type', 'Global', 'Description']);
  });

  it('reports global as a word, not a boolean', () => {
    expect(propValue(firstTable(renderGlobalChoicePage(aGlobalChoice({ isGlobal: true }))), 'Global'))
      .toEqual([{ type: 'text', value: 'Yes' }]);
    expect(propValue(firstTable(renderGlobalChoicePage(aGlobalChoice({ isGlobal: false }))), 'Global'))
      .toEqual([{ type: 'text', value: 'No' }]);
  });

  it('states that none are defined rather than emitting an empty options table', () => {
    const nodes = renderGlobalChoicePage(aGlobalChoice({ options: [] }));
    expect(nodes.filter(n => n.type === 'table')).toHaveLength(1); // the meta table only
    expect(nodes).toContainEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: 'No options defined.' }],
    });
  });

  it('drops the optional columns when no option populates them', () => {
    // Most choices are just value/label — carrying three empty columns would be
    // noise on every page.
    const nodes = renderGlobalChoicePage(aGlobalChoice({ options: [anOption()] }));
    const opts = nodes.filter(n => n.type === 'table')[1] as TableNode;
    expect(opts.headers).toEqual(['Value', 'Label']);
    expect(opts.rows[0]).toEqual([[{ type: 'text', value: '100000000' }], [{ type: 'text', value: 'Standard' }]]);
  });

  it('adds each optional column as soon as a single option populates it', () => {
    const nodes = renderGlobalChoicePage(aGlobalChoice({
      options: [anOption(), anOption({ value: 2, description: 'Costs more.', externalValue: 'PREM', isHidden: true })],
    }));
    const opts = nodes.filter(n => n.type === 'table')[1] as TableNode;
    expect(opts.headers).toEqual(['Value', 'Label', 'Description', 'External Value', 'Hidden']);
    // The option that lacks those fields still gets cells, so the row stays aligned.
    expect(opts.rows[0]).toHaveLength(5);
    expect(opts.rows[0][2]).toEqual([{ type: 'text', value: '' }]);
    expect(opts.rows[1][4]).toEqual([{ type: 'text', value: 'Yes' }]);
  });

  it('leaves the Hidden cell blank for visible options rather than saying No', () => {
    const nodes = renderGlobalChoicePage(aGlobalChoice({
      options: [anOption(), anOption({ value: 2, isHidden: true })],
    }));
    const opts = nodes.filter(n => n.type === 'table')[1] as TableNode;
    expect(opts.rows[0][2]).toEqual([{ type: 'text', value: '' }]);
  });

  it('falls back to a marker when an option has no label', () => {
    // An unlabelled option is a real (if broken) solution state; an empty cell
    // would read as a rendering failure.
    const nodes = renderGlobalChoicePage(aGlobalChoice({ options: [anOption({ label: '' })] }));
    const opts = nodes.filter(n => n.type === 'table')[1] as TableNode;
    expect(opts.rows[0][1]).toEqual([{ type: 'text', value: 'No label' }]);
  });

  it('renders the numeric value as text so 0 is not lost', () => {
    const nodes = renderGlobalChoicePage(aGlobalChoice({ options: [anOption({ value: 0 })] }));
    const opts = nodes.filter(n => n.type === 'table')[1] as TableNode;
    expect(opts.rows[0][0]).toEqual([{ type: 'text', value: '0' }]);
  });
});

describe('encodeChoiceName', () => {
  it('strips the characters that would break an ADO wiki page path', () => {
    expect(encodeChoiceName('Tier/Level?#100%')).toBe('TierLevel100');
  });

  it('leaves an ordinary name untouched', () => {
    expect(encodeChoiceName('Widget Tier')).toBe('Widget Tier');
  });
});
