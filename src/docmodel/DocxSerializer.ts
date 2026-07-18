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

// A4 page: 8.27" wide x 11.69" tall, 1" margins each side →
// 6.27" content width, 9.69" content height
const PAGE_MARGIN_TWIPS = convertInchesToTwip(1);
const PAGE_WIDTH_TWIPS  = convertInchesToTwip(8.27) - PAGE_MARGIN_TWIPS * 2;
const PAGE_HEIGHT_TWIPS = convertInchesToTwip(11.69) - PAGE_MARGIN_TWIPS * 2;

// Code is set a notch below body text (9pt against a 10.5pt body). Monospace
// faces run optically larger than proportional ones at the same nominal size,
// so matching the numbers would make code chips look bigger than the prose
// around them. Not themeable — it is a relationship to the body size, not a
// brand decision.
const CODE_SIZE_HALF_POINTS = 18;

// -----------------------------------------------
// Inline serialisation
// -----------------------------------------------

/**
 * `sizeHalfPoints` overrides the document default for these runs — used by
 * tables, which are set a step down (see WordTheme.table.fontSizePt). Omitted
 * everywhere else so body text resolves through the document styles.
 */
function inlineRuns(inlines: InlineNode[], theme: WordTheme, sizeHalfPoints?: number): TextRun[] {
  // Code is normally 9pt, but must never end up larger than the surrounding
  // text — inside a 9pt table that would make code chips the biggest thing in
  // the cell.
  const codeSize = sizeHalfPoints === undefined
    ? CODE_SIZE_HALF_POINTS
    : Math.min(CODE_SIZE_HALF_POINTS, sizeHalfPoints);

  return inlines.map(node => {
    switch (node.type) {
      case 'text':
        return new TextRun({ text: node.value, italics: false, size: sizeHalfPoints });
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
          size: codeSize,
          color: theme.code.color,
          italics: false,
          shading: { type: ShadingType.SOLID, color: 'auto', fill: theme.code.fill },
        });
      case 'bold':
        return new TextRun({ text: node.value, bold: true, italics: false, size: sizeHalfPoints });
      case 'italic':
        return new TextRun({ text: node.value, italics: true, size: sizeHalfPoints });
      case 'link':
        // Render as plain text — no subpage hyperlinks in a self-contained Word doc
        return new TextRun({ text: node.text, size: sizeHalfPoints });
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

const TWIPS_PER_POINT = 20;

// Absolute floor for the shortfall-absorbing column (~0.42"). Only reachable
// when even the protected minimums overflow the page, at which point some
// wrapping is unavoidable and this just stops the column vanishing entirely.
const MIN_FALLBACK_TWIPS = 600;

/**
 * Approximate glyph width, in ems, for width estimation.
 *
 * Counting characters — what this file did previously — assumes every glyph is
 * the same width, and that assumption is what broke the security-role
 * privilege matrix. A cell of '●●●●●' counts as 5 characters, identical to
 * 'Write', but renders nearly twice as wide: the column was sized for 'Write'
 * and the dots wrapped onto a second line.
 *
 * These are deliberately rough. The goal is not typographic exactness — that
 * would need real font metrics, which means shipping font files (a dependency,
 * and a large one). It is only to get the *relative* widths right enough that
 * a column asking for room to fit '●●●●●' asks for more than one fitting
 * 'iiiii'. Erring high just yields slightly roomier columns, which is benign;
 * erring low is what causes wrapping, so ambiguous cases round up.
 */
function glyphWidthEm(ch: string): number {
  // Geometric symbols the renderers actually emit — privilege dots (●○),
  // bullets, arrows. Word renders these from a fallback face and they come out
  // close to square; 0.9 matches what the privilege matrix actually measures
  // on the page. Treating them as a full em over-reserves by ~10% per dot,
  // which across five dots and eight columns is enough to make a table that
  // does fit look like one that can't.
  if (/[●○◐◑•▪▫→←↔]/.test(ch)) return 0.9;
  // Genuinely narrow glyphs.
  if (/[iljtfr.,;:!'`|()[\]{}]/.test(ch)) return 0.32;
  if (/[IJ ]/.test(ch)) return 0.36;
  // Wide lowercase.
  if (/[mw]/.test(ch)) return 0.85;
  if (/[MW]/.test(ch)) return 0.95;
  // Uppercase and digits run wider than average lowercase.
  if (/[A-Z0-9]/.test(ch)) return 0.62;
  return 0.5;
}

/** Estimated rendered width of a string at a given point size, in twips. */
function textWidthTwips(text: string, fontPt: number, bold = false): number {
  let em = 0;
  for (const ch of text) em += glyphWidthEm(ch);
  // Bold is roughly 5% wider; headers are bold and are exactly the strings we
  // most need not to wrap ("Create", "Append To").
  return em * fontPt * TWIPS_PER_POINT * (bold ? 1.05 : 1);
}

/** Width of the longest contiguous non-whitespace run — the unbreakable unit. */
function longestWordWidthTwips(text: string, fontPt: number, bold = false): number {
  let max = 0;
  for (const word of text.split(/\s+/)) {
    max = Math.max(max, textWidthTwips(word, fontPt, bold));
  }
  return max;
}

/**
 * The narrowest a column can be without breaking a word mid-character: its
 * longest unbreakable token (header or any body cell) plus cell padding.
 * Capped at half the page so one enormous identifier can't claim everything.
 */
function columnMinTwips(
  header: string,
  columnIndex: number,
  rows: InlineNode[][][],
  fontPt: number,
  padding: number,
): number {
  let longest = longestWordWidthTwips(header, fontPt, true);
  for (const row of rows) {
    longest = Math.max(longest, longestWordWidthTwips(inlinesToText(row[columnIndex] ?? []), fontPt));
  }
  return Math.min(longest + padding, PAGE_WIDTH_TWIPS / 2);
}

/**
 * Allocates column widths against the real page width.
 *
 * Mirrors the algorithm PdfSerializer already uses (`calcColumnWidths` there),
 * which was written for this same privilege-matrix problem. Kept as a parallel
 * implementation rather than shared code because the two work in different
 * units (twips vs points) and against different font metrics — the shared
 * layer between the serializers is DocNode, deliberately, and neither is
 * allowed to know the other exists.
 */
function calcColumnWidths(headers: string[], rows: InlineNode[][][], fontPt: number): number[] {
  const margins = cellMargins(headers.length);
  const padding = margins.left + margins.right;
  // What each column would like: proportional to how much content it carries,
  // measured by estimated width rather than character count.
  const rawMax = headers.map((h, i) =>
    Math.max(
      textWidthTwips(h, fontPt, true),
      ...rows.map(row => textWidthTwips(inlinesToText(row[i] ?? []), fontPt)),
      textWidthTwips('...', fontPt),
    )
  );
  // Cap runaway columns so one long description can't starve the rest.
  const capTwips = textWidthTwips('x'.repeat(COL_MAX_CHARS), fontPt);
  const clamped  = rawMax.map(w => Math.min(w, capTwips));
  const total    = clamped.reduce((a, b) => a + b, 0);
  const desired  = clamped.map(w => (w / total) * PAGE_WIDTH_TWIPS);

  const colMins = headers.map((h, i) => columnMinTwips(h, i, rows, fontPt, padding));

  // Never start a column below its own minimum.
  const target    = desired.map((d, i) => Math.max(d, colMins[i]));
  const targetSum = target.reduce((a, b) => a + b, 0);

  let widths: number[];
  if (targetSum <= PAGE_WIDTH_TWIPS) {
    // Room to spare — give the surplus to the columns carrying the most
    // content, so text-heavy columns benefit rather than the dot columns
    // getting pointlessly wide.
    const surplus   = PAGE_WIDTH_TWIPS - targetSum;
    const driverIdx = target.map((t, i) => t === desired[i] && desired[i] > colMins[i] ? i : -1).filter(i => i >= 0);
    const driverSum = driverIdx.reduce((s, i) => s + desired[i], 0);
    widths = target.slice();
    if (driverIdx.length > 0 && driverSum > 0) {
      driverIdx.forEach(i => { widths[i] += surplus * (desired[i] / driverSum); });
    } else {
      widths = widths.map(w => w + surplus / widths.length);
    }
  } else {
    const minSum = colMins.reduce((a, b) => a + b, 0);
    if (minSum <= PAGE_WIDTH_TWIPS) {
      // Shrink only the headroom above each column's minimum.
      const shrinkable    = target.map((t, i) => t - colMins[i]);
      const shrinkableSum = shrinkable.reduce((a, b) => a + b, 0);
      const overflow      = targetSum - PAGE_WIDTH_TWIPS;
      widths = target.map((t, i) =>
        shrinkableSum > 0 ? t - overflow * (shrinkable[i] / shrinkableSum) : t
      );
    } else {
      // Even the minimums don't fit — the privilege matrix at 9 columns.
      // Scaling everything down proportionally would push the short headers
      // ('Create', 'Append') below their own minimum and wrap every one of
      // them. Instead protect every minimum except the single widest column,
      // which absorbs the whole shortfall: it holds entity names, which wrap
      // onto extra lines gracefully. One column wrapping at word boundaries
      // beats nine wrapping mid-word.
      const widestIdx = colMins.reduce((best, m, i) => m > colMins[best] ? i : best, 0);
      const othersSum = minSum - colMins[widestIdx];
      widths = colMins.slice();
      widths[widestIdx] = Math.max(PAGE_WIDTH_TWIPS - othersSum, MIN_FALLBACK_TWIPS);
    }
  }

  // Normalise to exactly the page width.
  //
  // The branches above can still overshoot — when even the protected minimums
  // don't fit, the widest column bottoms out at MIN_FALLBACK_TWIPS and the sum
  // stays over. Scaling proportionally here spreads that unavoidable overflow
  // across every column instead of letting it land on one.
  //
  // The previous code added the entire remainder to the last column, which is
  // silently wrong when the remainder is negative: on the privilege matrix it
  // shrank 'Share' to 616 twips — well under its own minimum — so the one
  // column that paid for the overflow was simply whichever happened to be last.
  const sum = widths.reduce((a, b) => a + b, 0);
  if (sum > PAGE_WIDTH_TWIPS) {
    widths = widths.map(w => w * (PAGE_WIDTH_TWIPS / sum));
  }

  const final = widths.map(w => Math.floor(w));
  // Correct residual rounding drift (now only ever a few twips, from flooring)
  // on the widest column, which is the least sensitive to a small nudge.
  const allocated = final.reduce((a, b) => a + b, 0);
  const widestIdx = final.reduce((best, w, i) => w > final[best] ? i : best, 0);
  final[widestIdx] += PAGE_WIDTH_TWIPS - allocated;

  return final;
}

// -----------------------------------------------
// Table serialisation
// -----------------------------------------------

const SPACER = () => new Paragraph({ children: [], spacing: { after: 160 } });

// Cell padding. The old table used spacing-only padding and no cell margins,
// so text sat hard against the grid lines — a large part of why the tables
// read as cramped.
//
// Horizontal padding has to scale with column count, and the privilege matrix
// is why: at a comfortable 108 twips per side, nine columns spend 1,944 twips
// — 1.35", over a fifth of the content width — on padding alone, which is more
// than the Entity column ends up with. Padding is the first thing that should
// yield when a table is genuinely too wide; whitespace inside a cell is worth
// less than the text it is pushing onto a second line.
function cellMargins(columnCount: number) {
  const side = columnCount >= 7 ? 40 : columnCount >= 5 ? 72 : 108;
  return { top: 60, bottom: 60, left: side, right: side };
}

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
  const fontPt        = theme.table.fontSizePt;
  // Must match the padding calcColumnWidths reserved, or the measured width
  // and the rendered width disagree and cells wrap.
  const margins       = cellMargins(headers.length);
  // Column widths are measured at the same size the cells are rendered at —
  // measuring at one size and rendering at another is exactly how text ends up
  // wider than the column holding it.
  const cellSize      = Math.round(fontPt * 2);
  const colWidths     = calcColumnWidths(headers, rows, fontPt);

  // Some renderers use a table purely for layout, not data — modelDrivenAppRenderer
  // lays entity names out in three columns via table(['', '', ''], ...). Those
  // pass an all-blank header deliberately, because markdown has no way to
  // express a table without a header row.
  //
  // Word does: it can simply not have one. Emitting the blank row anyway was
  // harmless while headers were pale grey, but the theme now fills the header
  // with the accent colour, which turned every one of these into a solid blue
  // bar containing nothing. Detect the headerless case and drop the row rather
  // than special-casing the shading — an empty header row has no meaning in
  // Word regardless of what colour it is.
  const headerless = headers.every(h => !h.trim());

  const headerRow = new TableRow({
    // Repeats the header on every page a long table spills onto. Without this
    // a 200-row column table's headers vanish after page one and the rest of
    // the table is unreadable — the single highest-value fix in this file.
    tableHeader: true,
    cantSplit: true,
    children: headers.map((h, i) =>
      new TableCell({
        width: { size: colWidths[i], type: WidthType.DXA },
        margins,
        children: [new Paragraph({
          children: [new TextRun({ text: h, bold: true, color: theme.table.headerColor, size: cellSize })],
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
          margins,
          shading: { type: ShadingType.SOLID, color: 'auto', fill },
          children: [new Paragraph({
            children: inlineRuns(cell, theme, cellSize),
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
    rows: headerless ? bodyRows : [headerRow, ...bodyRows],
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
  1: { before: 0,   after: 240 },  // pageBreakBefore handles the before gap
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

// Every diagram in this document is preceded by its own heading (e.g. "Diagram",
// "Data Model") with `keepNext: true` — Word keeps a heading on the same page as
// whatever immediately follows it. A diagram scaled to the *full* page height left
// no room for that heading above it: keepNext then pushed heading + image to a
// fresh page together, leaving a dead gap at the bottom of the previous page. This
// reserves space for a level-2 heading (its own before/after spacing plus one line
// of text) out of the usable page height, so a max-height diagram still leaves the
// heading above it enough room to land on the same page.
const HEADING_RESERVE_TWIPS = 900;

async function serializeMermaid(code: string, renderMermaid?: MermaidRenderer): Promise<DocxBlock[]> {
  if (!renderMermaid) return [];

  const rendered = await renderMermaid(code);
  if (!rendered) return [];

  // Scale to fit both page dimensions — constraining width alone let a tall
  // diagram (e.g. a long flow with many sequential steps) overflow the page
  // height and spill across multiple pages instead of shrinking to fit one.
  const usableHeightTwips = PAGE_HEIGHT_TWIPS - HEADING_RESERVE_TWIPS;
  const widthScale  = Math.min(1, (PAGE_WIDTH_TWIPS / TWIPS_PER_PIXEL) / rendered.width);
  const heightScale = Math.min(1, (usableHeightTwips / TWIPS_PER_PIXEL) / rendered.height);
  const scale    = Math.min(widthScale, heightScale);
  const widthPx  = rendered.width * scale;
  const heightPx = rendered.height * scale;

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

/**
 * Tracks whether the document's first top-level heading has already been
 * emitted, so it can be exempted from the page-break-before-H1 rule below —
 * threaded through as a shared, mutable object because the document is built
 * from many separate `serializeBlocks` calls (one per section), not one.
 */
export interface PageBreakState {
  seenFirstH1: boolean;
}

export async function serializeBlock(
  node: DocNode,
  headingOffset: number,
  renderMermaid?: MermaidRenderer,
  theme: WordTheme = DEFAULT_WORD_THEME,
  pageBreakState: PageBreakState = { seenFirstH1: false },
): Promise<DocxBlock | DocxBlock[]> {
  switch (node.type) {
    case 'heading': {
      const absLevel  = Math.min(node.level + headingOffset, 4);
      const spacing   = HEADING_SPACING[absLevel] ?? HEADING_SPACING[4];
      // A page break before every top-level (absLevel 1) heading was tried
      // and reverted once before because it left dead zones under a short
      // prior section — but no break at all meant a new top-level section
      // could start mid-page, with a shorter one directly beneath it,
      // reading as a single confused section rather than two documents'
      // worth of structure. A per-H1 break is worth that occasional half-page
      // gap; only absLevel — the level after headingOffset is applied — is
      // checked, so a heading that was originally H1 in its own component
      // but gets nested under a higher-level section (headingOffset > 0)
      // does not force a break. The very first H1 in the whole document is
      // exempted — it's already at the top of page 1, so forcing a break
      // there just inserts a leading blank page.
      const pageBreakBefore = absLevel === 1 && pageBreakState.seenFirstH1;
      if (absLevel === 1) pageBreakState.seenFirstH1 = true;
      return new Paragraph({
        heading: resolveHeadingLevel(node.level, headingOffset),
        keepNext: true,
        pageBreakBefore,
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
  pageBreakState: PageBreakState = { seenFirstH1: false },
): Promise<(Paragraph | Table)[]> {
  const blocks: (Paragraph | Table)[] = [];
  for (const node of nodes) {
    const result = await serializeBlock(node, headingOffset, renderMermaid, theme, pageBreakState);
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
