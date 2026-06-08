// src/docmodel/PdfSerializer.ts
//
// Converts DocNode[] → pdfmake document content.
// headingOffset is added to every heading level (used by pdfAssembler).
// Mirrors DocxSerializer's structure and decisions (A4, 1" margins,
// proportional column widths, Mermaid skipped) for a self-contained PDF.

import PdfPrinter from 'pdfmake';
import type { Content, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces.js';
import type { DocNode, InlineNode, BulletItem } from './nodes.js';

// -----------------------------------------------
// Page geometry — A4, 1" margins (matches DocxSerializer)
// -----------------------------------------------

const PT_PER_INCH      = 72;
const PAGE_MARGIN_PT   = PT_PER_INCH;                  // 1"
const PAGE_WIDTH_PT    = 595.28;                       // A4 width in pt
const CONTENT_WIDTH_PT = PAGE_WIDTH_PT - PAGE_MARGIN_PT * 2;

// Standard 14 PDF fonts — no font files to bundle.
const FONTS = {
  Helvetica: {
    normal:      'Helvetica',
    bold:        'Helvetica-Bold',
    italics:     'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
  Courier: {
    normal:      'Courier',
    bold:        'Courier-Bold',
    italics:     'Courier-Oblique',
    bolditalics: 'Courier-BoldOblique',
  },
};

// -----------------------------------------------
// Inline serialisation
// -----------------------------------------------

/**
 * The standard 14 PDF fonts (Helvetica/Courier) only support WinAnsi-encoded
 * glyphs — no font files are bundled with the package (see "How pdfmake was
 * chosen" in PR discussion: avoids shipping TTFs / native binaries). Renderers
 * occasionally emit Unicode symbols (e.g. the ●○ privilege-level dots in
 * securityRoleRenderer) that fall outside that range and render as garbage
 * glyphs. Substitute the closest WinAnsi-safe equivalents here so the PDF
 * stays self-contained without pulling in a Unicode font.
 */
const GLYPH_FALLBACKS: Record<string, string> = {
  '●': '•', // ● BLACK CIRCLE      → • BULLET
  '○': '°', // ○ WHITE CIRCLE      → ° DEGREE SIGN (closest hollow-circle glyph in WinAnsi)
};

const GLYPH_PATTERN = new RegExp(`[${Object.keys(GLYPH_FALLBACKS).join('')}]`, 'g');

/** Replace Unicode glyphs the standard PDF fonts can't render with WinAnsi-safe equivalents. */
function sanitiseForPdf(text: string): string {
  return GLYPH_PATTERN.test(text)
    ? text.replace(GLYPH_PATTERN, ch => GLYPH_FALLBACKS[ch] ?? ch)
    : text;
}

function inlineRuns(inlines: InlineNode[]): Content[] {
  return inlines.map((node): Content => {
    switch (node.type) {
      case 'text':
        return { text: sanitiseForPdf(node.value) };
      case 'code':
        return { text: sanitiseForPdf(node.value), font: 'Courier', fontSize: 9 };
      case 'bold':
        return { text: sanitiseForPdf(node.value), bold: true };
      case 'italic':
        return { text: sanitiseForPdf(node.value), italics: true };
      case 'link':
        // Render as plain text — no subpage hyperlinks in a self-contained PDF
        return { text: sanitiseForPdf(node.text) };
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
// Heading styles
// -----------------------------------------------

const HEADING_STYLES: Record<number, string> = {
  1: 'h1',
  2: 'h2',
  3: 'h3',
  4: 'h4',
};

function resolveHeadingLevel(level: number, offset: number): number {
  return Math.min(level + offset, 4);
}

// -----------------------------------------------
// Column width calculation — proportional to content (mirrors DocxSerializer)
// -----------------------------------------------

const COL_MAX_CHARS = 35;
// Wide enough that bold 10pt header words like "Managed" or "Version" don't
// wrap mid-word (narrower than DocxSerializer's twips-based minimum because
// Word can shrink column padding further than pdfmake's fixed cell margins).
const COL_MIN_PT    = 60;

// Heuristic average glyph width for 10pt Helvetica — used to estimate how wide
// a column needs to be to fit its longest *unbreakable* word without pdfmake
// hard-breaking it mid-character (e.g. "ShowHideGenerateInvoiceButton",
// "Synchronous", "OpportunityEnrolmentCondition", or "Append" in a bold header).
// pdfmake has no hyphenation for the standard 14 fonts, so this is the only
// lever — slightly generous to account for bold headers being wider than body text.
// Bold table headers are noticeably wider than 10pt regular body text — sized
// generously enough to cover Helvetica-Bold glyph widths so headers like
// "Append" don't wrap mid-word either (a slight over-estimate for body text
// just means a touch more breathing room, which is harmless).
const AVG_CHAR_WIDTH_PT = 6.2;
const CELL_HPADDING_PT  = 8; // matches the [4, 3, 4, 3] cell margin (left + right)

/** Length of the longest contiguous non-whitespace run in a string. */
function longestWordLength(text: string): number {
  let max = 0;
  for (const word of text.split(/\s+/)) {
    if (word.length > max) max = word.length;
  }
  return max;
}

/** Longest unbreakable word across a header + its column's body cells, in points. */
function longestWordWidth(header: string, columnIndex: number, rows: InlineNode[][][]): number {
  let longest = longestWordLength(header);
  for (const row of rows) {
    longest = Math.max(longest, longestWordLength(inlinesToText(row[columnIndex] ?? [])));
  }
  return longest * AVG_CHAR_WIDTH_PT + CELL_HPADDING_PT;
}

function calcColumnWidths(headers: string[], rows: InlineNode[][][]): number[] {
  const rawMax = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(row => inlinesToText(row[i] ?? []).length), 3)
  );
  const clamped  = rawMax.map(w => Math.min(w, COL_MAX_CHARS));
  const total    = clamped.reduce((a, b) => a + b, 0);
  const desired  = clamped.map(w => (w / total) * CONTENT_WIDTH_PT);

  // Wide tables (e.g. the security-role privilege matrix has 9 columns) can't
  // all honour COL_MIN_PT without overflowing the page — shrink the floor
  // proportionally to the number of columns so it never exceeds an equal split.
  // Each column's floor is then raised (up to half the page width) to fit its
  // longest unbreakable word, so identifiers/entity names/headers like
  // "Append To" wrap at word boundaries instead of mid-character.
  const baseMin = Math.min(COL_MIN_PT, CONTENT_WIDTH_PT / headers.length);
  const colMins = headers.map((h, i) =>
    Math.min(Math.max(baseMin, longestWordWidth(h, i, rows)), CONTENT_WIDTH_PT / 2)
  );

  // Never start below a column's own minimum — `target` is what each column
  // would get if space were unlimited.
  const target    = desired.map((d, i) => Math.max(d, colMins[i]));
  const targetSum = target.reduce((a, b) => a + b, 0);

  let widths: number[];
  if (targetSum <= CONTENT_WIDTH_PT) {
    // Room to spare — hand the surplus to columns proportionally to how much
    // content they're carrying (so text-heavy columns benefit most), without
    // ever taking a column below its own minimum (only `desired`-driven
    // columns absorb the surplus split).
    const surplus = CONTENT_WIDTH_PT - targetSum;
    const driverIdx = target.map((t, i) => t === desired[i] && desired[i] > colMins[i] ? i : -1).filter(i => i >= 0);
    const driverSum = driverIdx.reduce((s, i) => s + desired[i], 0);
    widths = target.slice();
    if (driverIdx.length > 0 && driverSum > 0) {
      driverIdx.forEach(i => { widths[i] += surplus * (desired[i] / driverSum); });
    } else {
      // No column has room above its minimum to grow into — split evenly.
      widths = widths.map(w => w + surplus / widths.length);
    }
  } else {
    // Minimums alone don't fit — shrink columns that have headroom above
    // their own minimum first; only scale minimums down (last resort,
    // unavoidable wrapping) if that still isn't enough.
    const minSum = colMins.reduce((a, b) => a + b, 0);
    if (minSum <= CONTENT_WIDTH_PT) {
      const shrinkable = target.map((t, i) => t - colMins[i]);
      const shrinkableSum = shrinkable.reduce((a, b) => a + b, 0);
      const overflow = targetSum - CONTENT_WIDTH_PT;
      widths = target.map((t, i) =>
        shrinkableSum > 0 ? t - overflow * (shrinkable[i] / shrinkableSum) : t
      );
    } else {
      // Even the minimums don't fit (e.g. a 9-column privilege matrix where
      // "Entity" needs real room for long names like "ApplicationStatusHistory").
      // Scaling every column down proportionally would shrink short headers
      // ("Create", "Append") below their own minimum too — wrapping them all.
      // Instead, protect every column's minimum except the single widest one,
      // which absorbs the entire shortfall: it already wraps long entity names
      // onto multiple lines gracefully, so it's the least-bad place to compress.
      const widestIdx = colMins.reduce((best, m, i) => m > colMins[best] ? i : best, 0);
      const othersSum = minSum - colMins[widestIdx];
      widths = colMins.slice();
      widths[widestIdx] = Math.max(CONTENT_WIDTH_PT - othersSum, baseMin);
    }
  }

  const final = widths.map(w => Math.floor(w));
  const allocated = final.reduce((a, b) => a + b, 0);
  final[final.length - 1] += CONTENT_WIDTH_PT - allocated;
  return final;
}

// -----------------------------------------------
// Table serialisation
// -----------------------------------------------

function serializeTable(headers: string[], rows: InlineNode[][][]): Content {
  const colWidths = calcColumnWidths(headers, rows);

  // Some renderers emit borderless N-column "grid" layouts via empty header
  // strings (e.g. modelDrivenAppRenderer's Custom/Standard Entities lists).
  // Markdown/Word simply have no visible header row for these — but pdfmake
  // always shades headerRows, so an all-empty header would render as a bare
  // grey strip. Detect that case and render a plain body-only table instead.
  const hasVisibleHeader = headers.some(h => h.trim() !== '');

  const bodyRows: TableCell[][] = rows.map(row =>
    row.map((cell): TableCell => ({
      stack: [{ text: inlineRuns(cell), margin: [0, 0, 0, 0] }],
      margin: [4, 3, 4, 3],
    }))
  );

  if (!hasVisibleHeader) {
    return {
      table: {
        widths: colWidths,
        body: bodyRows,
      },
      layout: {
        hLineWidth:  () => 0.5,
        vLineWidth:  () => 0.5,
        hLineColor:  () => '#CCCCCC',
        vLineColor:  () => '#CCCCCC',
      },
      margin: [0, 0, 0, 12],
    };
  }

  const headerRow: TableCell[] = headers.map(h => ({
    text: sanitiseForPdf(h),
    bold: true,
    fillColor: '#E8E8E8',
    margin: [4, 3, 4, 3],
  }));

  return {
    table: {
      headerRows: 1,
      widths: colWidths,
      body: [headerRow, ...bodyRows],
    },
    layout: {
      hLineWidth:  () => 0.5,
      vLineWidth:  () => 0.5,
      hLineColor:  () => '#CCCCCC',
      vLineColor:  () => '#CCCCCC',
    },
    margin: [0, 0, 0, 12],
  };
}

// -----------------------------------------------
// Bullet list serialisation
// -----------------------------------------------

/**
 * pdfmake's `ul` only nests via nested `ul` arrays, not a flat depth value —
 * group consecutive items by depth into nested lists.
 */
function nestBulletItems(items: BulletItem[], depth = 0): Content[] {
  const result: Content[] = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i];
    if (item.depth === depth) {
      result.push({ text: inlineRuns(item.inlines) });
      i++;
    } else if (item.depth > depth) {
      const start = i;
      while (i < items.length && items[i].depth > depth) i++;
      result.push({ ul: nestBulletItems(items.slice(start, i), depth + 1) });
    } else {
      break;
    }
  }
  return result;
}

// -----------------------------------------------
// Block serialisation
// -----------------------------------------------

export function serializeBlock(node: DocNode, headingOffset: number): Content | null {
  switch (node.type) {
    case 'heading': {
      const absLevel = resolveHeadingLevel(node.level, headingOffset);
      return {
        text: sanitiseForPdf(node.text),
        style: HEADING_STYLES[absLevel] ?? 'h4',
        // Forcing a page break before every top-level section heading (the old
        // `pageBreak: absLevel === 1 ? 'before' : undefined`) left large dead
        // zones whenever the prior section ended partway down a page — e.g. the
        // Overview's Solutions table finishing a third of the way down, then
        // "Data Model" punting the rest of that page to whitespace. Letting
        // sections flow naturally, same as every other heading level, removes
        // that wasted space.
        tocItem: absLevel <= 3,
        tocStyle: { fontSize: 10 },
      };
    }

    case 'paragraph':
      return { text: inlineRuns(node.inlines), margin: [0, 0, 0, 8] };

    case 'table':
      return serializeTable(node.headers, node.rows);

    case 'bullet_list':
      return { ul: nestBulletItems(node.items), margin: [0, 0, 0, 8] };

    case 'mermaid':
      // Mermaid diagrams are only rendered in ADO Wiki — skip in PDF output (matches Word)
      return null;

    case 'code_block':
      return {
        text: sanitiseForPdf(node.text),
        font: 'Courier',
        fontSize: 9,
        preserveLeadingSpaces: true,
        margin: [0, 0, 0, 8],
      };

    case 'blockquote':
      return {
        text: inlineRuns(node.inlines),
        italics: true,
        margin: [16, 0, 0, 8],
      };

    case 'toc_placeholder':
      return null;
  }
}

// -----------------------------------------------
// Public API
// -----------------------------------------------

export function serializeBlocks(nodes: DocNode[], headingOffset = 0): Content[] {
  return nodes
    .map(node => serializeBlock(node, headingOffset))
    .filter((block): block is Content => block !== null);
}

export function buildToc(): Content {
  return {
    toc: {
      title: { text: 'Table of Contents', style: 'h1' },
    },
    pageBreak: 'after',
  };
}

export function buildDocDefinition(content: Content[]): TDocumentDefinitions {
  return {
    pageSize: 'A4',
    pageMargins: [PAGE_MARGIN_PT, PAGE_MARGIN_PT, PAGE_MARGIN_PT, PAGE_MARGIN_PT],
    defaultStyle: { font: 'Helvetica', fontSize: 10 },
    styles: {
      h1: { fontSize: 20, bold: true, margin: [0, 0, 0, 12] },
      h2: { fontSize: 16, bold: true, margin: [0, 14, 0, 8] },
      h3: { fontSize: 13, bold: true, margin: [0, 10, 0, 6] },
      h4: { fontSize: 11, bold: true, margin: [0, 8, 0, 4] },
    },
    footer: (currentPage: number, pageCount: number) => ({
      text: `Page ${currentPage} of ${pageCount}`,
      alignment: 'center',
      fontSize: 9,
      margin: [0, 8, 0, 0],
    }),
    content,
  };
}

export function toBuffer(docDefinition: TDocumentDefinitions): Promise<Buffer> {
  const printer = new PdfPrinter(FONTS);
  const doc = printer.createPdfKitDocument(docDefinition);

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}
