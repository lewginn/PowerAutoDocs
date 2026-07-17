// src/docmodel/nodes.ts
//
// Format-agnostic document model.
// Renderers emit DocNode[] — no markdown syntax, no docx objects.
// Serialisers (MarkdownSerializer, DocxSerializer) consume DocNode[]
// and produce format-specific output.

// -----------------------------------------------
// Inline nodes — appear inside paragraphs, table cells, list items
// -----------------------------------------------

export type InlineNode =
  | { type: 'text';   value: string }
  | { type: 'code';   value: string }   // monospace / inline code
  | { type: 'bold';   value: string }
  | { type: 'italic'; value: string }
  | { type: 'link';   text: string; href: string };  // href is a raw path; serialisers encode as needed

// -----------------------------------------------
// Block nodes — top-level document structure
// -----------------------------------------------

/** Heading. level is relative to the renderer's own section (1 = section title). */
export type HeadingNode = {
  type:  'heading';
  level: 1 | 2 | 3 | 4;
  text:  string;
};

/** A paragraph of inline content. */
export type ParagraphNode = {
  type:    'paragraph';
  inlines: InlineNode[];
};

/**
 * A data table.
 * headers: plain strings (column labels).
 * rows: each row is an array of cells; each cell is InlineNode[].
 */
export type TableNode = {
  type:    'table';
  headers: string[];
  rows:    InlineNode[][][];
};

/**
 * A flat bullet list with per-item depth.
 * depth 0 = top-level, depth 1 = one indent, etc.
 */
export type BulletListNode = {
  type:  'bullet_list';
  items: BulletItem[];
};

export type BulletItem = {
  depth:   number;
  inlines: InlineNode[];
};

/** A Mermaid diagram block. code is the raw Mermaid DSL (no fence markers). */
export type MermaidNode = {
  type: 'mermaid';
  code: string;
};

/**
 * A verbatim code block (e.g. email template body).
 * Rendered as a fenced code block in markdown, styled paragraph in docx.
 */
export type CodeBlockNode = {
  type: 'code_block';
  text: string;
};

/**
 * A callout / blockquote paragraph.
 * Rendered as > blockquote in markdown, highlighted paragraph in docx.
 */
export type BlockquoteNode = {
  type:    'blockquote';
  inlines: InlineNode[];
};

/**
 * Marks the position where a table-of-sub-pages should appear.
 * MarkdownSerializer emits [[_TOSP_]].
 * DocxSerializer skips it entirely (content follows inline in the doc).
 */
export type TocPlaceholderNode = {
  type: 'toc_placeholder';
};

export type DocNode =
  | HeadingNode
  | ParagraphNode
  | TableNode
  | BulletListNode
  | MermaidNode
  | CodeBlockNode
  | BlockquoteNode
  | TocPlaceholderNode;

// -----------------------------------------------
// Inline helper functions
// Renderers use these to build InlineNode arrays concisely.
// -----------------------------------------------

/** Plain text inline. */
export const t = (value: string): InlineNode => ({ type: 'text', value });

/** Inline code span. */
export const c = (value: string): InlineNode => ({ type: 'code', value });

/** Bold inline. */
export const b = (value: string): InlineNode => ({ type: 'bold', value });

/** Italic inline. */
export const i = (value: string): InlineNode => ({ type: 'italic', value });

/** Link inline. href is the raw path — serialisers handle encoding. */
export const lnk = (text: string, href: string): InlineNode => ({ type: 'link', text, href });

// -----------------------------------------------
// Block helper functions
// -----------------------------------------------

/** Heading block. */
export const h = (level: 1 | 2 | 3 | 4, text: string): HeadingNode =>
  ({ type: 'heading', level, text });

/** Paragraph from one or more inline nodes. */
export const p = (...inlines: InlineNode[]): ParagraphNode =>
  ({ type: 'paragraph', inlines });

/** Plain-text paragraph shorthand. */
export const pt = (text: string): ParagraphNode =>
  ({ type: 'paragraph', inlines: [t(text)] });

/** Blockquote from one or more inline nodes. */
export const bq = (...inlines: InlineNode[]): BlockquoteNode =>
  ({ type: 'blockquote', inlines });

/** Blockquote from a plain string. */
export const bqt = (text: string): BlockquoteNode =>
  ({ type: 'blockquote', inlines: [t(text)] });

/** TOC placeholder (for index/summary pages). */
export const toc = (): TocPlaceholderNode => ({ type: 'toc_placeholder' });

/** Mermaid diagram block. */
export const mermaid = (code: string): MermaidNode => ({ type: 'mermaid', code });

/** Verbatim code block. */
export const codeBlock = (text: string): CodeBlockNode => ({ type: 'code_block', text });

/**
 * Build a table node.
 * cell() helpers make it easy to construct InlineNode[][] rows.
 */
export const table = (headers: string[], rows: InlineNode[][][]): TableNode =>
  ({ type: 'table', headers, rows });

/** A table cell containing a single text value. */
export const cell = (...inlines: InlineNode[]): InlineNode[] => inlines;

/** A table cell with plain text. */
export const ct = (value: string): InlineNode[] => [t(value)];

/** A table cell with a single code span. */
export const cc = (value: string): InlineNode[] => [c(value)];

/** Bullet list from BulletItem array. */
export const bulletList = (items: BulletItem[]): BulletListNode =>
  ({ type: 'bullet_list', items });

/** A single bullet item at a given depth. */
export const bullet = (depth: number, ...inlines: InlineNode[]): BulletItem =>
  ({ depth, inlines });
