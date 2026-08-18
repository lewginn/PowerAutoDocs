// tests/docmodel/wordTemplate.test.ts
//
// The company-template output path: DocNode[] patched into an existing .docx
// rather than built from scratch.
//
// The template fixtures here are built in code with the docx library and are
// entirely fictional. A real company template must never land in this repo: it
// is public, and the template carries the logo and brand assets. Building them
// in code is also better testing than a committed binary would be, because it
// lets each test state the one template property it depends on — a missing
// placeholder, a cover page to preserve, a custom table style — instead of
// every test sharing one opaque file.

import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import {
  Document, Packer, Paragraph, HeadingLevel, Header, Footer,
} from 'docx';
import {
  serializeBlocks, buildTemplateDocument, buildDocument, toBuffer,
  TEMPLATE_CONTENT_PLACEHOLDER,
} from '../../src/docmodel/DocxSerializer.js';
import { resolveWordTheme } from '../../src/docmodel/wordTheme.js';
import type { WordTheme } from '../../src/docmodel/wordTheme.js';
import { h, t, table, ct, bulletList, bullet } from '../../src/docmodel/nodes.js';
import type { DocNode } from '../../src/docmodel/nodes.js';

// -----------------------------------------------
// Synthetic templates
// -----------------------------------------------

/** Fonts and colours nothing in our own theme would ever produce, so any of
 *  them appearing in the output can only have come from the template. */
const TEMPLATE_STYLES = {
  default: {
    document: { run: { font: 'Fictional Sans', size: 21, color: '222222' } },
    heading1: { run: { font: 'Fictional Display', size: 40, bold: true, color: 'C8102E' } },
    heading2: { run: { font: 'Fictional Display', size: 30, bold: true, color: '6B0F1A' } },
  },
};

interface TemplateOpts {
  /** Body paragraphs placed before the placeholder — stands in for a cover page. */
  coverText?: string;
  /** Omit the placeholder entirely. */
  placeholder?: string | null;
}

async function aTemplate(opts: TemplateOpts = {}): Promise<Buffer> {
  const children: Paragraph[] = [];
  if (opts.coverText) {
    children.push(new Paragraph({ text: opts.coverText, heading: HeadingLevel.TITLE }));
  }
  const placeholder = opts.placeholder === undefined
    ? `{{${TEMPLATE_CONTENT_PLACEHOLDER}}}`
    : opts.placeholder;
  if (placeholder !== null) children.push(new Paragraph(placeholder));

  return await Packer.toBuffer(new Document({
    styles: TEMPLATE_STYLES,
    sections: [{
      headers: { default: new Header({ children: [new Paragraph('FICTIONAL CO HEADER')] }) },
      footers: { default: new Footer({ children: [new Paragraph('Confidential')] }) },
      children,
    }],
  }));
}

// -----------------------------------------------
// Helpers
// -----------------------------------------------

async function patch(nodes: DocNode[], template: Buffer, theme?: WordTheme): Promise<AdmZip> {
  const resolved = theme ?? templated();
  const blocks = await serializeBlocks(nodes, 0, undefined, resolved);
  return new AdmZip(await buildTemplateDocument(blocks, template));
}

const xmlOf = (zip: AdmZip) => zip.readAsText('word/document.xml');

/** Visible text, in document order. */
function textOf(xml: string): string[] {
  return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]);
}

/** Theme as it resolves when a template is in use, optionally naming styles. */
const templated = (styles?: { table?: string }): WordTheme =>
  resolveWordTheme(undefined, { inUse: true, styles });

const aTable = () => table(['Logical Name', 'Type'], [[ct('acme_name'), ct('Text')]]);

// -----------------------------------------------
// Placeholder contract
// -----------------------------------------------

describe('buildTemplateDocument — placeholder contract', () => {
  it('fails with an actionable error when the template has no placeholder', async () => {
    // The failure mode this guards against is silent: the patcher finds nothing
    // to replace and returns the template unchanged, which is a perfectly valid
    // .docx containing the cover page and none of the documentation. That looks
    // like a successful run to a pipeline.
    const blocks = await serializeBlocks([h(1, 'Data Model')], 0, undefined, templated());
    await expect(buildTemplateDocument(blocks, await aTemplate({ placeholder: null })))
      .rejects.toThrow(/no \{\{content\}\} placeholder/);
  });

  it('names the placeholders it did find, so a typo is self-diagnosing', async () => {
    const blocks = await serializeBlocks([h(1, 'Data Model')], 0, undefined, templated());
    await expect(buildTemplateDocument(blocks, await aTemplate({ placeholder: '{{contnet}}' })))
      .rejects.toThrow(/\{\{contnet\}\}/);
  });
});

// -----------------------------------------------
// What the template keeps
// -----------------------------------------------

describe('buildTemplateDocument — template identity survives', () => {
  it('keeps the template stylesheet, so headings resolve to the company fonts', async () => {
    const zip = await patch([h(1, 'Data Model')], await aTemplate());
    const styles = zip.readAsText('word/styles.xml');
    expect(styles).toContain('Fictional Display');
    expect(styles).toContain('C8102E');
  });

  it('keeps the header and footer that carry the branding', async () => {
    const zip = await patch([h(1, 'Data Model')], await aTemplate());
    expect(zip.readAsText('word/header1.xml')).toContain('FICTIONAL CO HEADER');
    expect(zip.readAsText('word/footer1.xml')).toContain('Confidential');
  });

  it('preserves body content ahead of the placeholder, so a cover page survives', async () => {
    // This is the reason content is injected at a placeholder rather than by
    // replacing the body wholesale: a template's cover page is real content.
    const zip = await patch([h(1, 'Data Model')], await aTemplate({ coverText: 'Cover Page' }));
    const text = textOf(xmlOf(zip));
    expect(text).toContain('Cover Page');
    expect(text).toContain('Data Model');
    expect(text.indexOf('Cover Page')).toBeLessThan(text.indexOf('Data Model'));
  });

  it('emits headings by style reference, with no font of its own to override the template', async () => {
    // The mechanism the whole feature rests on. Heading1-9 are OOXML built-ins
    // present in every Word template, so referencing them by name is what makes
    // this work against an arbitrary template rather than a prepared one.
    const xml = xmlOf(await patch([h(1, 'Data Model'), h(2, 'Account')], await aTemplate()));
    expect(xml).toContain('<w:pStyle w:val="Heading1"/>');
    expect(xml).toContain('<w:pStyle w:val="Heading2"/>');
    expect(xml).not.toContain('Fictional Display');
  });
});

// -----------------------------------------------
// Table styling
// -----------------------------------------------

describe('serializeTable — template table style', () => {
  it('references the named style instead of painting its own borders', async () => {
    const xml = xmlOf(await patch([aTable()], await aTemplate(), templated({ table: 'FictionalCo' })));
    expect(xml).toContain('<w:tblStyle w:val="FictionalCo"/>');
  });

  it('drops inline cell shading, which would otherwise beat the style', async () => {
    // Direct formatting wins over a style in Word. Leaving our shading in place
    // would repaint the company's table in our theme's colours — the exact
    // thing adopting the template is meant to prevent.
    const xml = xmlOf(await patch([aTable()], await aTemplate(), templated({ table: 'FictionalCo' })));
    expect(xml).not.toContain('<w:shd');
  });

  it('leaves the no-template path painting its own borders and shading', async () => {
    // The regression guard: a client with no template must get byte-equivalent
    // output to before this feature existed.
    const xml = xmlOf(await patch([aTable()], await aTemplate()));
    expect(xml).not.toContain('<w:tblStyle');
    expect(xml).toContain('<w:shd');
  });

  it('does not style a layout table, which is meant to be invisible', async () => {
    // modelDrivenAppRenderer lays names out in columns via table(['','',''], ...).
    // A bordered corporate style would draw a box around plain columns.
    const layout = table(['', ''], [[ct('Alpha'), ct('Beta')]]);
    const xml = xmlOf(await patch([layout], await aTemplate(), templated({ table: 'FictionalCo' })));
    expect(xml).not.toContain('<w:tblStyle');
  });
});

// -----------------------------------------------
// Bullets
// -----------------------------------------------

describe('bulletItems — bullets under a template', () => {
  it('writes the glyph directly rather than referencing the template\'s numbering', async () => {
    // The bug this exists to prevent: <w:numId> is a reference into
    // numbering.xml, and under a template that file is the template's own.
    // Verified against a real company template whose numId 1 is a *decimal*
    // list, which turned every bulleted flow action into 1, 1.1, 1.1.1.
    const list = bulletList([bullet(0, t('Top')), bullet(1, t('Nested'))]);
    const xml = xmlOf(await patch([list], await aTemplate()));
    expect(xml).not.toContain('<w:numId');
    expect(xml).toContain('\u25CF');
    expect(xml).toContain('\u25CB');
  });

  it('indents by depth, so nesting survives without list semantics', async () => {
    const list = bulletList([bullet(0, t('Top')), bullet(1, t('Nested'))]);
    const xml = xmlOf(await patch([list], await aTemplate()));
    expect(xml).toContain('w:left="360"');
    expect(xml).toContain('w:left="720"');
  });

  it('keeps Word-native lists when no template is in use', async () => {
    // The regression guard on the other side: without a template we own
    // numbering.xml, so the reference is safe and native lists are better.
    const list = bulletList([bullet(0, t('Top')), bullet(1, t('Nested'))]);
    const blocks = await serializeBlocks([list], 0, undefined, resolveWordTheme());
    const xml = new AdmZip(await toBuffer(buildDocument(blocks, resolveWordTheme())))
      .readAsText('word/document.xml');
    expect(xml).toContain('<w:numId');
    expect(xml).toContain('<w:ilvl w:val="1"/>');
  });
});
