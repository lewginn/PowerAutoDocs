// src/docmodel/DocxSerializer.ts
//
// Converts DocNode[] → docx document elements.
// headingOffset is added to every heading level (used by docAssembler).

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, WidthType, ShadingType, TableLayoutType,
  Footer, PageNumber, convertInchesToTwip, TableOfContents, ImageRun,
  BorderStyle,
} from 'docx';
import type { DocNode, InlineNode, BulletItem } from './nodes.js';
import { DEFAULT_WORD_THEME } from './wordTheme.js';
import type { WordTheme } from './wordTheme.js';

// -----------------------------------------------
// Page geometry
// -----------------------------------------------

// A4 page: 8.27" wide, 1" margins each side → 6.27" content = 9029 twips
const PAGE_MARGIN_TWIPS = convertInchesToTwip(1);
const PAGE_WIDTH_TWIPS  = convertInchesToTwip(8.27) - PAGE_MARGIN_TWIPS * 2;

// Code is set a notch below body text (9pt against a 10.5pt body). Monospace
// faces run optically larger than proportional ones at the same nominal size,
// so matching the numbers would make code chips look bigger than the prose
// around them. Not themeable — it is a relationship to the body size, not a
// brand decision.
const CODE_SIZE_HALF_POINTS = 18;

// -----------------------------------------------
// Inline serialisation
// -----------------------------------------------

function inlineRuns(inlines: InlineNode[], theme: WordTheme): TextRun[] {
  return inlines.map(node => {
    switch (node.type) {
      case 'text':
        return new TextRun({ text: node.value, italics: false });
      case 'code':
        // Light shading mimics the wiki's code "chip". Without it, the mono
        // font alone doesn't separate logical names from prose strongly
        // enough — a flow step like **Name** — List records on `tasks` reads
        // as one undifferentiated run of text, which is most of what made the
        // Word action lists feel mushy next to the wiki's.
        //
        // Code runs are the one place the theme's font/size is applied to the
        // run rather than left to the document default, because they are
        // deliberately deviating from it.
        return new TextRun({
          text: node.value,
          font: theme.code.font,
          size: CODE_SIZE_HALF_POINTS,
          color: theme.code.color,
          italics: false,
          shading: { type: ShadingType.SOLID, color: 'auto', fill: theme.code.fill },
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

// Cell padding. The old table used spacing-only padding and no cell margins,
// so text sat hard against the grid lines — a large part of why the tables
// read as cramped. Horizontal padding matters more than vertical here: these
// tables are dense and wide, and the gutter is what separates one column's
// text from the next.
const CELL_MARGIN_TWIPS = { top: 60, bottom: 60, left: 108, right: 108 };

/**
 * Builds the border set for a themed table.
 *
 * Header/body separation is carried by the header's fill, so the internal
 * grid is drawn in a light tint rather than the full accent — at one line per
 * cell across a 7-column table, a strong grid becomes the loudest thing on the
 * page and the data disappears behind it. `insideHorizontal` is dropped
 * entirely when banding is on, because the row shading already delineates
 * rows and doing both is redundant noise.
 */
function tableBorders(theme: WordTheme) {
  const line = { style: BorderStyle.SINGLE, size: 2, color: theme.table.borderColor };
  const none = { style: BorderStyle.NONE, size: 0, color: 'auto' };
  return {
    top: line,
    bottom: line,
    left: line,
    right: line,
    insideVertical: line,
    insideHorizontal: theme.table.banded ? none : line,
  };
}

function serializeTable(headers: string[], rows: InlineNode[][][], theme: WordTheme): Table {
  const colWidths = calcColumnWidths(headers, rows);

  const headerRow = new TableRow({
    // Repeats the header on every page a long table spills onto. Without this
    // a 200-row column table's headers vanish after page one and the rest of
    // the table is unreadable — the single highest-value fix in this file.
    tableHeader: true,
    cantSplit: true,
    children: headers.map((h, i) =>
      new TableCell({
        width: { size: colWidths[i], type: WidthType.DXA },
        margins: CELL_MARGIN_TWIPS,
        children: [new Paragraph({
          children: [new TextRun({ text: h, bold: true, color: theme.table.headerColor })],
          spacing: { before: 60, after: 60 },
        })],
        shading: { type: ShadingType.SOLID, color: 'auto', fill: theme.table.headerFill },
      })
    ),
  });

  const bodyRows = rows.map((row, rowIdx) => {
    const fill = theme.table.banded && rowIdx % 2 === 1
      ? theme.table.bandFill
      : theme.table.rowFill;

    return new TableRow({
      // Keep a row's cells on one page. A row split across a page boundary is
      // far more disorienting in a reference table than a slightly short page.
      cantSplit: true,
      children: row.map((cell, i) =>
        new TableCell({
          width: { size: colWidths[i], type: WidthType.DXA },
          margins: CELL_MARGIN_TWIPS,
          shading: { type: ShadingType.SOLID, color: 'auto', fill },
          children: [new Paragraph({
            children: inlineRuns(cell, theme),
            spacing: { before: 60, after: 60 },
          })],
        })
      ),
    });
  });

  return new Table({
    // Explicit borders replace the built-in 'TableGrid' style, which hardcodes
    // a black grid the theme has no way to reach.
    borders: tableBorders(theme),
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
function bulletItems(items: BulletItem[], theme: WordTheme): Paragraph[] {
  return items.map(item =>
    new Paragraph({
      children: inlineRuns(item.inlines, theme),
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
  theme: WordTheme = DEFAULT_WORD_THEME,
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
        children: inlineRuns(node.inlines, theme),
        spacing: { after: 120 },
      });

    case 'table':
      // Spacer paragraph after every table for breathing room
      return [serializeTable(node.headers, node.rows, theme), SPACER()];

    case 'bullet_list':
      return bulletItems(node.items, theme);

    case 'mermaid':
      return serializeMermaid(node.code, renderMermaid);

    case 'code_block': {
      // Still one paragraph per line (Word has no multi-line code construct),
      // but each line now carries the shading fill, so the block reads as one
      // continuous panel rather than loose monospace text floating on white.
      // The indent keeps the panel off the margin so its left edge is visible.
      const lines = node.text.split('\n');
      return lines.map((line, idx) =>
        new Paragraph({
          children: [new TextRun({
            text: line || ' ',
            font: theme.code.font,
            size: CODE_SIZE_HALF_POINTS,
            color: theme.code.color,
            italics: false,
          })],
          shading: { type: ShadingType.SOLID, color: 'auto', fill: theme.code.fill },
          indent: { left: convertInchesToTwip(0.15), right: convertInchesToTwip(0.15) },
          spacing: { after: idx === lines.length - 1 ? 120 : 0 },
        })
      );
    }

    case 'blockquote':
      // An accent bar on the left is what makes a quote read as a quote at a
      // glance; indentation alone is ambiguous against nested list content,
      // of which this document has a great deal.
      return new Paragraph({
        children: inlineRuns(node.inlines, theme),
        indent: { left: convertInchesToTwip(0.4) },
        border: {
          left: { style: BorderStyle.SINGLE, size: 12, color: theme.ruleColor, space: 12 },
        },
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
  theme: WordTheme = DEFAULT_WORD_THEME,
): Promise<(Paragraph | Table)[]> {
  const blocks: (Paragraph | Table)[] = [];
  for (const node of nodes) {
    const result = await serializeBlock(node, headingOffset, renderMermaid, theme);
    blocks.push(...(Array.isArray(result) ? result : [result]));
  }
  return blocks;
}

/**
 * Document-level styles.
 *
 * This block did not exist before — `buildDocument` created a bare `Document`,
 * so every heading and paragraph inherited Word's built-in defaults (Calibri
 * 11, the stock blue Office headings). That is the single reason the output
 * looked unstyled, and it is why the fix belongs here rather than in per-run
 * overrides: styling the document's *styles* means the theme reaches content
 * this serializer never explicitly touches — the generated Table of Contents
 * entries included.
 *
 * Heading runs are deliberately left without an explicit font/colour at the
 * call site so they resolve through these styles.
 */
function buildStyles(theme: WordTheme) {
  const headingStyle = (level: 1 | 2 | 3 | 4) => ({
    run: {
      font: theme.headingFont,
      size: theme.headingSizesHalfPoints[level],
      bold: true,
      color: theme.headingColors[level],
    },
    paragraph: {
      spacing: HEADING_SPACING[level],
      // A rule under H1 gives each top-level section a visible start. Sections
      // flow rather than page-break (see the heading case above), so without
      // it a new section can begin mid-page with nothing but a size change to
      // announce it.
      ...(level === 1 && theme.headingRule
        ? {
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: theme.ruleColor, space: 4 },
            },
          }
        : {}),
    },
  });

  return {
    default: {
      document: {
        run: {
          font: theme.bodyFont,
          size: theme.bodySizeHalfPoints,
          color: theme.bodyColor,
        },
      },
      heading1: headingStyle(1),
      heading2: headingStyle(2),
      heading3: headingStyle(3),
      heading4: headingStyle(4),
    },
  };
}

export function buildToc(): TableOfContents {
  return new TableOfContents('Table of Contents', {
    hyperlink: true,
    headingStyleRange: '1-3',
  });
}

export function buildDocument(
  blocks: (Paragraph | Table)[],
  theme: WordTheme = DEFAULT_WORD_THEME,
): Document {
  return new Document({
    features: { updateFields: true },
    styles: buildStyles(theme),
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
              // Muted and a size down: page furniture should be findable when
              // looked for and invisible when not.
              children: [
                new TextRun({ text: 'Page ', color: theme.footerColor, size: 18 }),
                new TextRun({ children: [PageNumber.CURRENT], color: theme.footerColor, size: 18 }),
                new TextRun({ text: ' of ', color: theme.footerColor, size: 18 }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], color: theme.footerColor, size: 18 }),
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
