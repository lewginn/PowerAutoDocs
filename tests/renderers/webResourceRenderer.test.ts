import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  renderWebResourceDetail,
  renderWebResourceSummary,
  writeWebResourceMarkdown,
} from '../../src/renderers/webResourceRenderer.js';
import type { BulletListNode, DocNode, TableNode } from '../../src/docmodel/nodes.js';
import type { WebResourceFunction } from '../../src/ir/index.js';
import { aWebResource } from '../fixtures/ir.js';

// tests/fixtures/ir.ts has no function factory — WebResourceFunction is only ever
// nested inside a resource, so it lives here rather than in the shared fixtures.
const aFunction = (over: Partial<WebResourceFunction> = {}): WebResourceFunction => ({
  name: 'setSerialVisibility',
  isAsync: false,
  params: ['executionContext'],
  ...over,
});

const tables = (nodes: DocNode[]): TableNode[] => nodes.filter(n => n.type === 'table') as TableNode[];

const headings = (nodes: DocNode[]): string[] =>
  nodes.filter(n => n.type === 'heading').map(n => (n as { text: string }).text);

/** The label column of a Property/Value table. */
const propValue = (tbl: TableNode, label: string) =>
  tbl.rows.find(r => (r[0][0] as { value: string }).value === label)?.[1];

/** Flatten one column of a table down to its plain text values. */
const col = (tbl: TableNode, index: number): string[] =>
  tbl.rows.map(r => (r[index][0] as { value: string }).value);

const paragraphTexts = (nodes: DocNode[]): string[] =>
  nodes
    .filter(n => n.type === 'paragraph')
    .map(n => (n as { inlines: { value?: string }[] }).inlines.map(i => i.value ?? '').join(''));

describe('renderWebResourceSummary', () => {
  it('states that none were found rather than emitting an empty table', () => {
    const nodes = renderWebResourceSummary([]);
    expect(nodes.map(n => n.type)).toEqual(['heading', 'paragraph']);
    expect(nodes).toContainEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: 'No web resources found in this solution.' }],
    });
  });

  it('counts functions only across JavaScript resources', () => {
    // A non-JS resource can never carry functions, so it must not inflate the
    // headline count even if the parser somehow attached some.
    const nodes = renderWebResourceSummary([
      aWebResource({ name: 'acme_/Scripts/Widget.js', functions: [aFunction(), aFunction()] }),
      aWebResource({ name: 'acme_/Scripts/Part.js', functions: [aFunction()] }),
      aWebResource({ name: 'acme_/Styles/site.css', resourceType: 'CSS' }),
    ]);
    expect(paragraphTexts(nodes)[0]).toBe(
      '3 web resource(s) — 2 JavaScript file(s), 3 function(s) total.'
    );
  });

  it('treats a JavaScript resource with no functions array as zero functions', () => {
    // functions is optional on the IR — it is absent, not empty, when the file
    // was never parsed for functions.
    const nodes = renderWebResourceSummary([aWebResource({ functions: undefined })]);
    expect(paragraphTexts(nodes)[0]).toBe(
      '1 web resource(s) — 1 JavaScript file(s), 0 function(s) total.'
    );
    expect(col(tables(nodes)[0], 2)).toEqual(['0']);
  });

  it('splits JavaScript and other resources into separate tables', () => {
    const nodes = renderWebResourceSummary([
      aWebResource({ name: 'acme_/Scripts/Widget.js' }),
      aWebResource({ name: 'acme_/Styles/site.css', resourceType: 'CSS' }),
    ]);
    expect(headings(nodes)).toEqual(['Web Resources', 'JavaScript Files', 'Other Resources']);
    expect(tables(nodes)[0].headers).toEqual([
      'Name', 'Namespace', 'Functions', 'Dependencies', 'Version',
    ]);
    expect(tables(nodes)[1].headers).toEqual(['Name', 'Type', 'Version']);
  });

  it('omits a section heading when that bucket is empty', () => {
    expect(headings(renderWebResourceSummary([aWebResource()]))).not.toContain('Other Resources');
    expect(
      headings(renderWebResourceSummary([aWebResource({ resourceType: 'CSS' })]))
    ).not.toContain('JavaScript Files');
  });

  it('links the JavaScript file name only when a basePath is supplied', () => {
    const linked = tables(renderWebResourceSummary([aWebResource()], '/Web-Resources'))[0];
    expect(linked.rows[0][0]).toEqual([
      { type: 'link', text: 'Widget.js', href: '/Web-Resources/Widget.js' },
    ]);

    // Without a basePath there is nowhere to point, so it stays plain text
    // rather than emitting a dangling link.
    const plain = tables(renderWebResourceSummary([aWebResource()]))[0];
    expect(plain.rows[0][0]).toEqual([{ type: 'text', value: 'Widget.js' }]);
  });

  it('shows the file name rather than the full logical name for JavaScript rows', () => {
    // The logical name is prefixed and path-like ("acme_/Scripts/Widget.js");
    // the last segment is what a reader recognises, and it is also what the
    // detail page is titled with, so the two must agree.
    const tbl = tables(renderWebResourceSummary([aWebResource({ name: 'acme_/Scripts/nested/Widget.js' })]))[0];
    expect(col(tbl, 0)).toEqual(['Widget.js']);
  });

  it('keeps the full logical name for non-JavaScript rows', () => {
    const tbl = tables(renderWebResourceSummary([
      aWebResource({ name: 'acme_/Images/logo.png', resourceType: 'PNG' }),
    ]))[0];
    expect(col(tbl, 0)).toEqual(['acme_/Images/logo.png']);
  });

  it('falls back to an em dash for an absent namespace and empty dependencies', () => {
    const tbl = tables(renderWebResourceSummary([
      aWebResource({ namespace: undefined, dependencies: [] }),
    ]))[0];
    expect(col(tbl, 1)).toEqual(['—']);
    expect(col(tbl, 3)).toEqual(['—']);
  });

  it('comma-separates dependencies in the summary row', () => {
    const tbl = tables(renderWebResourceSummary([
      aWebResource({ dependencies: ['acme_/Scripts/Common.js', 'acme_/Scripts/Api.js'] }),
    ]))[0];
    expect(col(tbl, 3)).toEqual(['acme_/Scripts/Common.js, acme_/Scripts/Api.js']);
  });
});

describe('renderWebResourceDetail', () => {
  it('leads with the file name as a level-1 heading', () => {
    const nodes = renderWebResourceDetail(aWebResource({ name: 'acme_/Scripts/Widget.js' }));
    expect(nodes[0]).toEqual({ type: 'heading', level: 1, text: 'Widget.js' });
  });

  it('includes the AI summary block only when a summary exists', () => {
    const withSummary = renderWebResourceDetail(aWebResource({ aiSummary: 'Form logic for Widget.' }));
    expect(withSummary[1]).toEqual({ type: 'heading', level: 2, text: 'Summary' });
    expect(withSummary[2]).toEqual({
      type: 'blockquote',
      inlines: [{ type: 'text', value: 'Form logic for Widget.' }],
    });

    const without = renderWebResourceDetail(aWebResource({ aiSummary: undefined }));
    expect(headings(without)).not.toContain('Summary');
  });

  it('always renders the full metadata table, using an em dash for an absent namespace', () => {
    const tbl = tables(renderWebResourceDetail(aWebResource({
      name: 'acme_/Scripts/Widget.js',
      displayName: 'Widget.js',
      resourceType: 'JavaScript',
      introducedVersion: '1.2.0.0',
      namespace: undefined,
    })))[0];
    expect(propValue(tbl, 'Name')).toEqual([{ type: 'text', value: 'acme_/Scripts/Widget.js' }]);
    expect(propValue(tbl, 'Type')).toEqual([{ type: 'text', value: 'JavaScript' }]);
    expect(propValue(tbl, 'Introduced Version')).toEqual([{ type: 'text', value: '1.2.0.0' }]);
    expect(propValue(tbl, 'Namespace')).toEqual([{ type: 'text', value: '—' }]);
  });

  it('renders the Dependencies section only when the file has dependencies', () => {
    const withDeps = renderWebResourceDetail(aWebResource({
      dependencies: ['acme_/Scripts/Common.js'],
    }));
    expect(headings(withDeps)).toContain('Dependencies');
    const list = withDeps.find(n => n.type === 'bullet_list') as BulletListNode;
    expect(list.items).toEqual([
      { depth: 0, inlines: [{ type: 'code', value: 'acme_/Scripts/Common.js' }] },
    ]);

    const without = renderWebResourceDetail(aWebResource({ dependencies: [] }));
    expect(headings(without)).not.toContain('Dependencies');
    expect(without.some(n => n.type === 'bullet_list')).toBe(false);
  });

  it('omits the Functions section entirely for a non-JavaScript resource', () => {
    // Only JS files are parsed for functions, so a CSS/PNG page saying
    // "no functions detected" would imply something was looked for.
    const nodes = renderWebResourceDetail(aWebResource({ resourceType: 'CSS', functions: undefined }));
    expect(headings(nodes)).not.toContain('Functions');
  });

  it('notes that no functions were detected rather than emitting an empty table', () => {
    const nodes = renderWebResourceDetail(aWebResource({ functions: [] }));
    expect(headings(nodes)).toContain('Functions');
    expect(nodes).toContainEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: 'No named functions detected.' }],
    });
    // The metadata table is the only table on the page.
    expect(tables(nodes)).toHaveLength(1);
  });

  it('treats an absent functions array the same as an empty one', () => {
    const nodes = renderWebResourceDetail(aWebResource({ functions: undefined }));
    expect(nodes).toContainEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: 'No named functions detected.' }],
    });
  });

  it('falls back to the file name when the file declares no namespace', () => {
    // The count line names where the functions live; with no detected namespace
    // the file name is the only meaningful identifier left.
    const named = renderWebResourceDetail(aWebResource({
      namespace: 'Acme.Widget',
      functions: [aFunction(), aFunction()],
    }));
    expect(paragraphTexts(named).some(t => t.includes('2 function(s) defined in') && t.includes('Acme.Widget'))).toBe(true);

    const unnamed = renderWebResourceDetail(aWebResource({
      name: 'acme_/Scripts/Widget.js',
      namespace: undefined,
      functions: [aFunction()],
    }));
    expect(paragraphTexts(unnamed).some(t => t.includes('1 function(s) defined in') && t.includes('Widget.js'))).toBe(true);
  });

  it('separates event handlers from helper functions', () => {
    // Handlers are what a maintainer wires onto a form; helpers are internal.
    // The split is by name prefix, so each recognised prefix is exercised.
    const nodes = renderWebResourceDetail(aWebResource({
      functions: [
        aFunction({ name: 'OnLoad' }),
        aFunction({ name: 'OnChangeTier' }),
        aFunction({ name: 'OnSave' }),
        aFunction({ name: 'OnBlurSerial' }),
        aFunction({ name: 'OnFocusSerial' }),
        aFunction({ name: 'setSerialVisibility' }),
      ],
    }));
    expect(headings(nodes)).toEqual(['Widget.js', 'Metadata', 'Functions', 'Event Handlers', 'Helper Functions']);
    expect(col(tables(nodes)[1], 0)).toEqual([
      'OnLoad', 'OnChangeTier', 'OnSave', 'OnBlurSerial', 'OnFocusSerial',
    ]);
    expect(col(tables(nodes)[2], 0)).toEqual(['setSerialVisibility']);
  });

  it('matches handler prefixes case-insensitively', () => {
    // Solution JavaScript is not consistent about casing, and an onload that
    // fell into "Helper Functions" would be actively misleading.
    const nodes = renderWebResourceDetail(aWebResource({ functions: [aFunction({ name: 'onload' })] }));
    expect(headings(nodes)).toContain('Event Handlers');
    expect(headings(nodes)).not.toContain('Helper Functions');
  });

  it('omits a function section heading when that bucket is empty', () => {
    const helpersOnly = renderWebResourceDetail(aWebResource({
      functions: [aFunction({ name: 'setSerialVisibility' })],
    }));
    expect(headings(helpersOnly)).not.toContain('Event Handlers');
    expect(headings(helpersOnly)).toContain('Helper Functions');
  });

  it('reports async as a word, not a boolean', () => {
    const nodes = renderWebResourceDetail(aWebResource({
      functions: [aFunction({ isAsync: true }), aFunction({ isAsync: false })],
    }));
    expect(col(tables(nodes)[1], 1)).toEqual(['Yes', 'No']);
  });

  it('comma-separates parameters and shows an em dash when there are none', () => {
    const nodes = renderWebResourceDetail(aWebResource({
      functions: [
        aFunction({ params: ['executionContext', 'fieldName'] }),
        aFunction({ params: [] }),
      ],
    }));
    expect(col(tables(nodes)[1], 2)).toEqual(['executionContext, fieldName', '—']);
  });

  it('prefers the AI summary over JSDoc for a function description', () => {
    // Enrichment runs after parsing, so when both exist the AI summary is the
    // more recent and more readable of the two.
    const nodes = renderWebResourceDetail(aWebResource({
      functions: [
        aFunction({ aiSummary: 'Toggles the serial field.', jsDoc: 'Sets visibility.' }),
        aFunction({ aiSummary: undefined, jsDoc: 'Sets visibility.' }),
        aFunction({ aiSummary: undefined, jsDoc: undefined }),
      ],
    }));
    expect(col(tables(nodes)[1], 3)).toEqual(['Toggles the serial field.', 'Sets visibility.', '—']);
  });

  it('never emits markdown fences from the renderer', () => {
    // constraints.md: fences belong to the serializer that owns the format. The
    // double-fenced ERD bug came from a renderer emitting them itself.
    const nodes = renderWebResourceDetail(aWebResource({
      aiSummary: 'Form logic.',
      dependencies: ['acme_/Scripts/Common.js'],
      functions: [aFunction({ name: 'OnLoad' }), aFunction()],
    }));
    expect(JSON.stringify(nodes)).not.toContain('```');
  });
});

describe('writeWebResourceMarkdown', () => {
  let outDir: string;

  beforeEach(() => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'padocs-webresource-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(outDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('writes the summary page even when there are no resources', () => {
    writeWebResourceMarkdown([], outDir);
    expect(fs.existsSync(path.join(outDir, 'Web-Resources.md'))).toBe(true);
    // No JS files means no detail pages, so the sub-directory is never created.
    expect(fs.existsSync(path.join(outDir, 'web-resources'))).toBe(false);
  });

  it('writes a detail page per JavaScript resource and none for other types', () => {
    writeWebResourceMarkdown([
      aWebResource({ name: 'acme_/Scripts/Widget.js' }),
      aWebResource({ name: 'acme_/Styles/site.css', resourceType: 'CSS' }),
    ], outDir);
    expect(fs.readdirSync(path.join(outDir, 'web-resources'))).toEqual(['acme__Scripts_Widget.js.md']);
  });

  it('replaces path separators so the logical name is a legal file name', () => {
    // Logical names contain "/" and can contain other characters that are illegal
    // on Windows — ADO agents run both, so this cannot rely on POSIX rules.
    writeWebResourceMarkdown([aWebResource({ name: 'acme_/Scripts/a:b*c?.js' })], outDir);
    expect(fs.readdirSync(path.join(outDir, 'web-resources'))).toEqual(['acme__Scripts_a_b_c_.js.md']);
  });

  it('creates the output directory if it does not already exist', () => {
    const nested = path.join(outDir, 'deep', 'nested');
    writeWebResourceMarkdown([aWebResource()], nested);
    expect(fs.existsSync(path.join(nested, 'Web-Resources.md'))).toBe(true);
  });
});
