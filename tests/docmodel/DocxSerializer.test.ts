// tests/docmodel/DocxSerializer.test.ts
//
// Asserts on the real artifact: DocNode[] -> .docx -> unzip -> word/document.xml.
//
// Why not assert on the docx library's Paragraph/Table objects instead: they are
// an opaque builder API whose internals are not a contract, so those assertions
// would pin the library's shape rather than our output. document.xml IS the
// output — it is what Word opens.
//
// Why not byte-compare whole files: zip ordering and timestamps churn, so a
// golden .docx would fail on every run. Reading single elements out of
// document.xml is stable, and it is what proved the heading-backtick bug: every
// renderer test passed while the .docx shipped literal backticks.
//
// adm-zip is a devDependency for exactly this. It is never installed on a
// client's agent (npm ci --omit=dev) and never enters the tarball (files: [dist]).

import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import {
  serializeBlocks, buildDocument, toBuffer, buildToc,
} from '../../src/docmodel/DocxSerializer.js';
import type { MermaidRenderer } from '../../src/docmodel/DocxSerializer.js';
import { resolveWordTheme, DEFAULT_WORD_THEME } from '../../src/docmodel/wordTheme.js';
import type { WordTheme } from '../../src/docmodel/wordTheme.js';
import type { DocNode } from '../../src/docmodel/nodes.js';

interface Opts {
  headingOffset?: number;
  renderMermaid?: MermaidRenderer;
  theme?: WordTheme;
}

/** DocNode[] all the way to the XML Word actually reads. */
async function docxXml(nodes: DocNode[], opts: Opts = {}): Promise<string> {
  const theme = opts.theme ?? DEFAULT_WORD_THEME;
  const blocks = await serializeBlocks(nodes, opts.headingOffset ?? 0, opts.renderMermaid, theme);
  return new AdmZip(await toBuffer(buildDocument(blocks, theme))).readAsText('word/document.xml');
}

/** The visible text runs, in document order. */
const runs = (xml: string): string[] =>
  (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? []).map(m => m.replace(/<[^>]+>/g, ''));

const headingStyles = (xml: string): string[] =>
  (xml.match(/<w:pStyle w:val="(Heading\d)"\/>/g) ?? []).map(m => m.replace(/.*val="|"\/>/g, ''));

const bulletDepths = (xml: string): number[] =>
  (xml.match(/<w:ilvl w:val="(\d+)"\/>/g) ?? []).map(m => Number(m.replace(/\D/g, '')));

const P = (text: string): DocNode => ({ type: 'paragraph', inlines: [{ type: 'text', value: text }] });

// A 1x1 PNG header is enough — nothing decodes it, it is embedded verbatim.
const FAKE_PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const stubMermaid = (width = 1200, height = 600): MermaidRenderer =>
  async () => ({ data: FAKE_PNG, width, height });

// -----------------------------------------------

describe('DocxSerializer — escaping', () => {
  it('escapes XML metacharacters so they survive as literal text', async () => {
    // This is the Word half of "all format syntax belongs to a serializer": a
    // renderer emits the raw string 'Contoso & Co' and must never think about
    // XML. If a renderer ever pre-escaped, it would double-escape here.
    const xml = await docxXml([P('Contoso & Co <tag> "quoted"')]);
    expect(xml).toContain('Contoso &amp; Co &lt;tag&gt; &quot;quoted&quot;');
    expect(runs(xml)[0]).toBe('Contoso &amp; Co &lt;tag&gt; &quot;quoted&quot;');
  });

  it('escapes metacharacters inside a heading too', async () => {
    const xml = await docxXml([{ type: 'heading', level: 1, text: 'R&D <draft>' }]);
    expect(xml).toContain('R&amp;D &lt;draft&gt;');
  });

  it('escapes metacharacters inside table cells', async () => {
    const xml = await docxXml([{
      type: 'table',
      headers: ['A & B'],
      rows: [[[{ type: 'text', value: '<x>' }]]],
    }]);
    expect(xml).toContain('A &amp; B');
    expect(xml).toContain('&lt;x&gt;');
  });
});

describe('DocxSerializer — headings', () => {
  it('maps each DocNode level onto the matching Word heading style', async () => {
    const xml = await docxXml([
      { type: 'heading', level: 1, text: 'One' },
      { type: 'heading', level: 2, text: 'Two' },
      { type: 'heading', level: 3, text: 'Three' },
      { type: 'heading', level: 4, text: 'Four' },
    ]);
    expect(headingStyles(xml)).toEqual(['Heading1', 'Heading2', 'Heading3', 'Heading4']);
    expect(runs(xml)).toEqual(['One', 'Two', 'Three', 'Four']);
  });

  it('shifts every heading by headingOffset', async () => {
    // Renderers emit levels relative to their own section (1 = section title);
    // docAssembler passes an offset to slot that section into the whole document.
    const xml = await docxXml([
      { type: 'heading', level: 1, text: 'A' },
      { type: 'heading', level: 2, text: 'B' },
    ], { headingOffset: 2 });
    expect(headingStyles(xml)).toEqual(['Heading3', 'Heading4']);
  });

  it('caps at Heading4 rather than emitting a style Word has no default for', async () => {
    // Word's built-in styles run deeper, but this document only defines 1-4
    // (see buildStyles), so anything past 4 must clamp or render unstyled.
    const xml = await docxXml([
      { type: 'heading', level: 3, text: 'A' },
      { type: 'heading', level: 4, text: 'B' },
    ], { headingOffset: 3 });
    expect(headingStyles(xml)).toEqual(['Heading4', 'Heading4']);
  });
});

describe('DocxSerializer — inline runs', () => {
  it('marks bold and italic runs', async () => {
    const xml = await docxXml([{
      type: 'paragraph',
      inlines: [{ type: 'bold', value: 'B' }, { type: 'italic', value: 'I' }],
    }]);
    expect(xml).toContain('<w:b/>');
    expect(xml).toContain('<w:i/>');
  });

  it('gives a code inline the theme mono font and its shading chip', async () => {
    // The chip is what separates a logical name from prose at a glance; the mono
    // face alone does not carry it.
    const xml = await docxXml([{
      type: 'paragraph',
      inlines: [{ type: 'code', value: 'contoso_widget' }],
    }]);
    expect(xml).toContain('contoso_widget');
    expect(xml).toContain(`w:fill="${DEFAULT_WORD_THEME.code.fill}"`);
    expect(xml).toContain(`<w:rFonts w:ascii="${DEFAULT_WORD_THEME.code.font}"`);
  });

  it('renders a link as plain text, not a hyperlink', async () => {
    // The Word document is self-contained — a wiki subpage link has nothing to
    // point at, so the text is kept and the link dropped.
    const xml = await docxXml([{
      type: 'paragraph',
      inlines: [{ type: 'link', text: 'Widget', href: '/Tables/Widget' }],
    }]);
    expect(runs(xml)).toEqual(['Widget']);
    expect(xml).not.toContain('/Tables/Widget');
    expect(xml).not.toContain('<w:hyperlink');
  });
});

describe('DocxSerializer — bullet lists', () => {
  it('carries item depth into the Word list level', async () => {
    const xml = await docxXml([{
      type: 'bullet_list',
      items: [
        { depth: 0, inlines: [{ type: 'text', value: 'top' }] },
        { depth: 1, inlines: [{ type: 'text', value: 'child' }] },
        { depth: 2, inlines: [{ type: 'text', value: 'grandchild' }] },
        { depth: 0, inlines: [{ type: 'text', value: 'back' }] },
      ],
    }]);
    expect(bulletDepths(xml)).toEqual([0, 1, 2, 0]);
    expect(runs(xml)).toEqual(['top', 'child', 'grandchild', 'back']);
  });

  it('emits nothing for an empty list rather than an empty list paragraph', async () => {
    const xml = await docxXml([{ type: 'bullet_list', items: [] }]);
    expect(bulletDepths(xml)).toEqual([]);
    expect(runs(xml)).toEqual([]);
  });
});

describe('DocxSerializer — code blocks', () => {
  it('emits one paragraph per line, since Word has no multi-line code construct', async () => {
    const xml = await docxXml([{ type: 'code_block', text: 'line one\nline two\nline three' }]);
    expect(runs(xml)).toEqual(['line one', 'line two', 'line three']);
  });

  it('keeps a blank line visible by substituting a space', async () => {
    // Word collapses a run with no text, which would silently close up the gap
    // in an email template body.
    const xml = await docxXml([{ type: 'code_block', text: 'a\n\nb' }]);
    expect(runs(xml)).toEqual(['a', ' ', 'b']);
  });

  it('shades every line so the block reads as one panel', async () => {
    const xml = await docxXml([{ type: 'code_block', text: 'a\nb' }]);
    const fills = xml.match(new RegExp(`w:fill="${DEFAULT_WORD_THEME.code.fill}"`, 'g')) ?? [];
    expect(fills.length).toBeGreaterThanOrEqual(2);
  });
});

describe('DocxSerializer — blockquote', () => {
  it('draws an accent bar rather than relying on indentation alone', async () => {
    // This document is full of nested lists; an indent-only quote is ambiguous
    // against them.
    const xml = await docxXml([{ type: 'blockquote', inlines: [{ type: 'text', value: 'quoted' }] }]);
    expect(runs(xml)).toContain('quoted');
    expect(xml).toContain('<w:pBdr>');
    expect(xml).toContain(`w:color="${DEFAULT_WORD_THEME.ruleColor}"`);
  });
});

describe('DocxSerializer — toc placeholder', () => {
  it('drops the placeholder entirely', async () => {
    // MarkdownSerializer emits [[_TOSP_]] for the wiki's subpage table; in Word
    // the content follows inline, so the marker must leave no trace.
    const xml = await docxXml([P('before'), { type: 'toc_placeholder' }, P('after')]);
    expect(runs(xml)).toEqual(['before', 'after']);
    expect(xml).not.toContain('TOSP');
  });
});

describe('DocxSerializer — mermaid', () => {
  it('skips the diagram when no renderer is supplied', async () => {
    // output.wordDiagrams: false takes this path — the run must still produce a
    // document rather than fail.
    const xml = await docxXml([P('before'), { type: 'mermaid', code: 'graph TD;' }, P('after')]);
    expect(xml).not.toContain('<w:drawing>');
    expect(runs(xml)).toEqual(['before', 'after']);
  });

  it('skips the diagram when the renderer returns null', async () => {
    // This is the no-Chrome-on-the-agent fallback. It must degrade to a document
    // without diagrams, never fail the run.
    const xml = await docxXml(
      [P('before'), { type: 'mermaid', code: 'graph TD;' }],
      { renderMermaid: async () => null },
    );
    expect(xml).not.toContain('<w:drawing>');
    expect(runs(xml)).toEqual(['before']);
  });

  it('embeds the rendered PNG as a drawing', async () => {
    const xml = await docxXml(
      [{ type: 'mermaid', code: 'graph TD;' }],
      { renderMermaid: stubMermaid(400, 200) },
    );
    expect(xml).toContain('<w:drawing>');
    expect(xml).toMatch(/<wp:extent cx="\d+" cy="\d+"\/>/);
  });

  it('passes the node code through to the renderer verbatim', async () => {
    // MermaidNode.code is raw DSL with no fence — if a fence ever arrives here,
    // the generator broke its contract and the PNG render fails downstream.
    let seen = '';
    await docxXml([{ type: 'mermaid', code: 'graph TD;\n  A-->B;' }], {
      renderMermaid: async code => { seen = code; return null; },
    });
    expect(seen).toBe('graph TD;\n  A-->B;');
    expect(seen).not.toContain('```');
  });

  it('scales an oversized diagram down to the page and keeps its aspect ratio', async () => {
    // A wide ERD would otherwise run off the page.
    const xml = await docxXml(
      [{ type: 'mermaid', code: 'graph TD;' }],
      { renderMermaid: stubMermaid(1200, 600) },
    );
    const [, cx, cy] = xml.match(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/)!;
    expect(Number(cx) / Number(cy)).toBeCloseTo(2, 5);
    // 6.27" of content width at 914400 EMU/inch.
    expect(Number(cx)).toBeLessThanOrEqual(6.27 * 914400);
  });

  it('leaves a diagram narrower than the page at its natural size', async () => {
    const small = await docxXml([{ type: 'mermaid', code: 'g' }], { renderMermaid: stubMermaid(200, 100) });
    const big   = await docxXml([{ type: 'mermaid', code: 'g' }], { renderMermaid: stubMermaid(1200, 600) });
    const cx = (x: string) => Number(x.match(/<wp:extent cx="(\d+)"/)![1]);
    expect(cx(small)).toBeLessThan(cx(big));
  });
});

describe('DocxSerializer — tables', () => {
  it('emits headers and every row', async () => {
    const xml = await docxXml([{
      type: 'table',
      headers: ['Name', 'Type'],
      rows: [
        [[{ type: 'text', value: 'Widget' }], [{ type: 'text', value: 'Custom' }]],
        [[{ type: 'text', value: 'Part' }], [{ type: 'text', value: 'Custom' }]],
      ],
    }]);
    expect(xml).toContain('<w:tbl>');
    expect(runs(xml)).toEqual(['Name', 'Type', 'Widget', 'Custom', 'Part', 'Custom']);
  });

  it('fills the header row with the theme colour', async () => {
    const theme = resolveWordTheme({ accentColor: '#0F62FE' });
    const xml = await docxXml([{ type: 'table', headers: ['H'], rows: [[[{ type: 'text', value: 'v' }]]] }], { theme });
    expect(xml).toContain('w:fill="0F62FE"');
  });

  it('shades alternate rows when banding is on and not when it is off', async () => {
    const node: DocNode = {
      type: 'table',
      headers: ['H'],
      rows: [0, 1, 2, 3].map(i => [[{ type: 'text' as const, value: `r${i}` }]]),
    };
    const banded = resolveWordTheme({ accentColor: '#0F62FE', tableBanding: true });
    const plain  = resolveWordTheme({ accentColor: '#0F62FE', tableBanding: false });

    const count = (xml: string, fill: string) => (xml.match(new RegExp(`w:fill="${fill}"`, 'g')) ?? []).length;
    expect(count(await docxXml([node], { theme: banded }), banded.table.bandFill)).toBeGreaterThan(0);
    // bandFill is still computed when banding is off — the serializer must not use it.
    expect(count(await docxXml([node], { theme: plain }), plain.table.bandFill)).toBe(0);
  });

  it('survives a ragged row that is shorter than the headers', async () => {
    // Nothing builds one today, but a serializer that throws here would take the
    // whole run down at the last step. Missing cells render empty.
    const xml = await docxXml([{
      type: 'table',
      headers: ['A', 'B', 'C'],
      rows: [[[{ type: 'text', value: 'only' }]]],
    }]);
    expect(runs(xml)).toContain('only');
    expect(xml).toContain('<w:tbl>');
  });
});

describe('DocxSerializer — theming reaches the document', () => {
  it('applies the resolved body and heading fonts to the styles part', async () => {
    const theme = resolveWordTheme({ bodyFont: 'Georgia', headingFont: 'Verdana' });
    const blocks = await serializeBlocks([{ type: 'heading', level: 1, text: 'H' }, P('body')], 0, undefined, theme);
    const zip = new AdmZip(await toBuffer(buildDocument(blocks, theme)));
    const styles = zip.readAsText('word/styles.xml');
    expect(styles).toContain('Georgia');
    expect(styles).toContain('Verdana');
  });

  it('defaults to DEFAULT_WORD_THEME when no theme is passed', async () => {
    const blocks = await serializeBlocks([P('body')]);
    const styles = new AdmZip(await toBuffer(buildDocument(blocks))).readAsText('word/styles.xml');
    expect(styles).toContain(DEFAULT_WORD_THEME.bodyFont);
  });
});

describe('DocxSerializer — document assembly', () => {
  it('produces a valid, openable package with the parts Word requires', async () => {
    const buf = await toBuffer(buildDocument(await serializeBlocks([P('hi')])));
    const names = new AdmZip(buf).getEntries().map(e => e.entryName);
    expect(names).toContain('word/document.xml');
    expect(names).toContain('word/styles.xml');
    expect(names).toContain('[Content_Types].xml');
    expect(buf.length).toBeGreaterThan(0);
  });

  it('builds a TOC that instructs Word to populate it on open', async () => {
    // The field is empty until Word updates it; buildDocument sets
    // features.updateFields so the reader does not see a blank contents page.
    const blocks = await serializeBlocks([P('x')]);
    const zip = new AdmZip(await toBuffer(buildDocument([buildToc(), ...blocks])));
    const xml = zip.readAsText('word/document.xml');
    expect(xml).toContain('TOC');
    expect(zip.readAsText('word/settings.xml')).toContain('updateFields');
  });

  it('serialises an empty document rather than throwing', async () => {
    const buf = await toBuffer(buildDocument(await serializeBlocks([])));
    expect(buf.length).toBeGreaterThan(0);
  });
});
