// src/docmodel/DocxSerializer.ts
//
// Converts DocNode[] → docx document elements.
// headingOffset is added to every heading level (used by docAssembler).

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, WidthType, ShadingType, TableLayoutType,
  Footer, PageNumber, convertInchesToTwip, TableOfContents, ImageRun,
} from 'docx';
import type { DocNode, InlineNode, BulletItem } from './nodes.js';

// -----------------------------------------------
// Page geometry
// -----------------------------------------------

// A4 page: 8.27" wide, 1" margins each side → 6.27" content = 9029 twips
const PAGE_MARGIN_TWIPS = convertInchesToTwip(1);
const PAGE_WIDTH_TWIPS  = convertInchesToTwip(8.27) - PAGE_MARGIN_TWIPS * 2;

// -----------------------------------------------
// Inline serialisation
// -----------------------------------------------

function inlineRuns(inlines: InlineNode[]): TextRun[] {
  return inlines.map(node => {
    switch (node.type) {
      case 'text':
        return new TextRun({ text: node.value, italics: false });
      case 'code':
        // Light shading mimics the wiki's code "chip". Without it, Courier New
        // alone doesn't separate logical names from prose strongly enough —
        // a flow step like **Name** — List records on `tasks` reads as one
        // undifferentiated run of text, which is most of what made the Word
        // action lists feel mushy next to the wiki's.
        return new TextRun({
          text: node.value,
          font: 'Courier New',
          size: 18,
          italics: false,
          shading: { type: ShadingType.SOLID, color: 'auto', fill: 'F2F2F2' },
        });
      case 'bold':
        return new TextRun({ text: node.value, bold: true, italics: false });
      case 'italic':
        return new TextRun({ text: node.value, italics: true });
      case 'link':
        // Render as plain text — no subpage hyperlinks in a self-contained Word doc
        return new TextRun({ text: node.text });
    }
  });
}

/** Flatten InlineNode[] to a plain string (used for column width measurement). */
function inlinesToText(inlines: InlineNode[]): string {
  return inlines.map(n => {
    switch (n.type) {
      case 'text':   return n.value;
      case 'code':   return n.value;
      case 'bold':   return n.value;
      case 'italic': return n.value;
      case 'link':   return n.text;
    }
  }).join('');
}

// -----------------------------------------------
// Heading level mapping
// -----------------------------------------------

const HEADING_LEVELS: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
};

function resolveHeadingLevel(level: number, offset: number) {
  const resolved = Math.min(level + offset, 4);
  return HEADING_LEVELS[resolved] ?? HeadingLevel.HEADING_4;
}

// -----------------------------------------------
// Column width calculation — proportional to content
// -----------------------------------------------

// Cap long content so one wide column can't starve narrow columns.
const COL_MAX_CHARS = 35;
// Minimum twips per column (~0.42 inch). Keeps narrow columns visible without
// stealing too much from wider ones when there are many columns (e.g. 7+).
const COL_MIN_TWIPS = 600;

function calcColumnWidths(headers: string[], rows: InlineNode[][][]): number[] {
  const rawMax = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(row => inlinesToText(row[i] ?? []).length), 3)
  );
  // Cap wide columns so they don't starve narrower ones
  const clamped = rawMax.map(w => Math.min(w, COL_MAX_CHARS));
  const total    = clamped.reduce((a, b) => a + b, 0);
  const widths   = clamped.map(w => Math.floor((w / total) * PAGE_WIDTH_TWIPS));

  // Second pass: bump any column below the minimum, stealing proportionally
  // from columns that are above it.
  const belowIdx = widths.map((w, i) => w < COL_MIN_TWIPS ? i : -1).filter(i => i >= 0);
  if (belowIdx.length > 0) {
    const deficit  = belowIdx.reduce((s, i) => s + (COL_MIN_TWIPS - widths[i]), 0);
    const aboveIdx = widths.map((w, i) => w > COL_MIN_TWIPS ? i : -1).filter(i => i >= 0);
    const surplus  = aboveIdx.reduce((s, i) => s + widths[i], 0);
    belowIdx.forEach(i  => { widths[i] = COL_MIN_TWIPS; });
    aboveIdx.forEach(i  => { widths[i] = Math.floor(widths[i] * (surplus - deficit) / surplus); });
  }

  // Correct rounding drift on the last column
  const allocated = widths.reduce((a, b) => a + b, 0);
  widths[widths.length - 1] += PAGE_WIDTH_TWIPS - allocated;

  return widths;
}

// -----------------------------------------------
// Table serialisation
// -----------------------------------------------

const SPACER = () => new Paragraph({ children: [], spacing: { after: 160 } });

function serializeTable(headers: string[], rows: InlineNode[][][]): Table {
  const colWidths = calcColumnWidths(headers, rows);

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) =>
      new TableCell({
        width: { size: colWidths[i], type: WidthType.DXA },
        children: [new Paragraph({
          children: [new TextRun({ text: h, bold: true })],
          spacing: { before: 60, after: 60 },
        })],
        shading: { type: ShadingType.SOLID, color: 'E8E8E8' },
      })
    ),
  });

  const bodyRows = rows.map(row =>
    new TableRow({
      children: row.map((cell, i) =>
        new TableCell({
          width: { size: colWidths[i], type: WidthType.DXA },
          children: [new Paragraph({
            children: inlineRuns(cell),
            spacing: { before: 60, after: 60 },
          })],
        })
      ),
    })
  );

  return new Table({
    style: 'TableGrid',
    layout: TableLayoutType.FIXED,
    width: { size: PAGE_WIDTH_TWIPS, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [headerRow, ...bodyRows],
  });
}

// -----------------------------------------------
// Bullet list serialisation
// -----------------------------------------------

// Word's native multilevel bullets — the same thing the wiki's nested markdown
// lists get from the browser: a real indent staircase, a distinct glyph per
// level (●/○/▪), and hanging indents so wrapped text lines up under the text
// rather than falling back to the margin.
//
// A previous attempt hand-rolled this with explicit per-depth `indent`
// values. Don't: hand-rolled indents are a plain paragraph wearing a bullet
// costume, so they carry no list semantics and renderers are free to lay them
// out however they like — Pages flattened them into a near-vertical column,
// which is what made nesting look broken. Native lists render consistently in
// Word, Word Online, Pages and LibreOffice alike.
//
// Spacing is deliberately tight (no `before`) so a long action tree reads as
// one dense block, like the wiki's list, instead of a sparse page of stripes.
function bulletItems(items: BulletItem[]): Paragraph[] {
  return items.map(item =>
    new Paragraph({
      children: inlineRuns(item.inlines),
      bullet: { level: item.depth },
      spacing: { after: 40 },
    })
  );
}

// -----------------------------------------------
// Heading spacing config
// -----------------------------------------------

const HEADING_SPACING: Record<number, { before: number; after: number }> = {
  1: { before: 0,   after: 240 },  // page break handles the before gap
  2: { before: 280, after: 120 },
  3: { before: 200, after: 80  },
  4: { before: 160, after: 60  },
};

// -----------------------------------------------
// Block serialisation
// -----------------------------------------------

type DocxBlock = Paragraph | Table;

/**
 * Renders Mermaid DSL to a PNG for embedding. Kept as an injected callback
 * rather than an import so the docmodel layer stays free of the
 * puppeteer/mermaid-cli dependency chain — docAssembler.ts supplies the real
 * implementation (src/enrichment/mermaidRenderer.ts). Returning null (or
 * omitting the callback) falls back to skipping the diagram, same as before
 * this existed.
 */
export type MermaidRenderer = (code: string) => Promise<{ data: Buffer; width: number; height: number } | null>;

const TWIPS_PER_PIXEL = 15; // 1440 twips/inch ÷ 96px/inch

async function serializeMermaid(code: string, renderMermaid?: MermaidRenderer): Promise<DocxBlock[]> {
  if (!renderMermaid) return [];

  const rendered = await renderMermaid(code);
  if (!rendered) return [];

  const widthPx  = Math.min(rendered.width, PAGE_WIDTH_TWIPS / TWIPS_PER_PIXEL);
  const scale     = widthPx / rendered.width;
  const heightPx  = rendered.height * scale;

  return [
    new Paragraph({
      children: [new ImageRun({
        type: 'png',
        data: rendered.data,
        transformation: { width: widthPx, height: heightPx },
      })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
    }),
  ];
}

export async function serializeBlock(
  node: DocNode,
  headingOffset: number,
  renderMermaid?: MermaidRenderer,
): Promise<DocxBlock | DocxBlock[]> {
  switch (node.type) {
    case 'heading': {
      const absLevel  = Math.min(node.level + headingOffset, 4);
      const spacing   = HEADING_SPACING[absLevel] ?? HEADING_SPACING[4];
      // Forcing a page break before every top-level section heading left large
      // dead zones whenever the prior section ended partway down a page (e.g.
      // the Overview's Solutions table finishing a third of the way down, then
      // "Data Model" punting the rest of the page to whitespace). Letting
      // sections flow naturally — same as everything else in the document —
      // removes that wasted space; Word still keeps headings from being
      // orphaned at the bottom of a page via `keepNext` below.
      return new Paragraph({
        heading: resolveHeadingLevel(node.level, headingOffset),
        keepNext: true,
        children: [new TextRun({ text: node.text, italics: false })],
        spacing,
      });
    }

    case 'paragraph':
      return new Paragraph({
        children: inlineRuns(node.inlines),
        spacing: { after: 120 },
      });

    case 'table':
      // Spacer paragraph after every table for breathing room
      return [serializeTable(node.headers, node.rows), SPACER()];

    case 'bullet_list':
      return bulletItems(node.items);

    case 'mermaid':
      return serializeMermaid(node.code, renderMermaid);

    case 'code_block': {
      const lines = node.text.split('\n');
      return lines.map((line, idx) =>
        new Paragraph({
          children: [new TextRun({ text: line || ' ', font: 'Courier New', size: 18, italics: false })],
          spacing: { after: idx === lines.length - 1 ? 120 : 0 },
        })
      );
    }

    case 'blockquote':
      return new Paragraph({
        children: inlineRuns(node.inlines),
        indent: { left: convertInchesToTwip(0.4) },
        spacing: { after: 120 },
      });

    case 'toc_placeholder':
      return [];
  }
}

// -----------------------------------------------
// Public API
// -----------------------------------------------

export async function serializeBlocks(
  nodes: DocNode[],
  headingOffset = 0,
  renderMermaid?: MermaidRenderer,
): Promise<(Paragraph | Table)[]> {
  const blocks: (Paragraph | Table)[] = [];
  for (const node of nodes) {
    const result = await serializeBlock(node, headingOffset, renderMermaid);
    blocks.push(...(Array.isArray(result) ? result : [result]));
  }
  return blocks;
}

export function buildToc(): TableOfContents {
  return new TableOfContents('Table of Contents', {
    hyperlink: true,
    headingStyleRange: '1-3',
  });
}

export function buildDocument(blocks: (Paragraph | Table)[]): Document {
  return new Document({
    features: { updateFields: true },
    sections: [{
      properties: {
        page: {
          size: {
            width:  convertInchesToTwip(8.27),   // A4
            height: convertInchesToTwip(11.69),
          },
          margin: {
            top:    PAGE_MARGIN_TWIPS,
            bottom: PAGE_MARGIN_TWIPS,
            left:   PAGE_MARGIN_TWIPS,
            right:  PAGE_MARGIN_TWIPS,
          },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun('Page '),
                new TextRun({ children: [PageNumber.CURRENT] }),
                new TextRun(' of '),
                new TextRun({ children: [PageNumber.TOTAL_PAGES] }),
              ],
            }),
          ],
        }),
      },
      children: blocks,
    }],
  });
}

export async function toBuffer(doc: Document): Promise<Buffer> {
  return Packer.toBuffer(doc);
}
