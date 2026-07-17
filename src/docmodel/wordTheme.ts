// src/docmodel/wordTheme.ts
//
// Visual theme for the Word (.docx) output.
//
// Two types, deliberately kept apart:
//
//   WordThemeConfig — the *user-facing* shape (output.wordTheme in
//     doc-gen.config.yml). Every field optional, colours accepted the way a
//     human writes them ('#0F62FE' or '0f62fe').
//
//   WordTheme — the *resolved* shape the serializer consumes. Every field
//     present, every colour a bare uppercase 6-digit hex, because that is what
//     the docx library wants and no caller should have to think about it.
//
// resolveWordTheme() is the only bridge between them. The serializer never
// sees a WordThemeConfig, so it never branches on "did the user set this?" —
// it just reads a fully-populated theme.
//
// Why a resolver rather than a plain deep-merge of defaults: most users want
// "make it look like our brand" and have exactly one input for that — a brand
// colour. Deriving heading colours, table header fill and rule colours from a
// single `accentColor` means one config line produces a coherent document,
// while every derived value stays individually overridable for the minority
// who need exact control.

import type { WordThemeConfig } from '../config/schema.js';

// -----------------------------------------------
// Resolved theme — what the serializer consumes
// -----------------------------------------------

export interface WordTableTheme {
  /** Header row background fill */
  headerFill: string;
  /** Header row text colour */
  headerColor: string;
  /** Fill for every other body row. Equal to `rowFill` when banding is off. */
  bandFill: string;
  /** Fill for non-banded body rows (normally white) */
  rowFill: string;
  /** Colour of the table's grid lines */
  borderColor: string;
  /** Body-cell text colour */
  color: string;
  /** Alternate body row shading on/off */
  banded: boolean;
}

export interface WordCodeTheme {
  font: string;
  /** Background fill of inline code chips and code blocks */
  fill: string;
  /** Code text colour */
  color: string;
}

export interface WordTheme {
  bodyFont: string;
  headingFont: string;
  /** Body text size in half-points (docx's unit) — 22 = 11pt */
  bodySizeHalfPoints: number;
  /** Body text colour */
  bodyColor: string;
  /** Heading colour by absolute level (1-4) */
  headingColors: Record<number, string>;
  /** Heading size in half-points by absolute level (1-4) */
  headingSizesHalfPoints: Record<number, number>;
  /** Colour of the rule drawn under H1 (and the H1 accent). Empty = no rule. */
  ruleColor: string;
  /** Draw a horizontal rule under level-1 headings */
  headingRule: boolean;
  table: WordTableTheme;
  code: WordCodeTheme;
  /** Footer text colour */
  footerColor: string;
}

// -----------------------------------------------
// Colour handling
// -----------------------------------------------

const HEX_RE = /^#?([0-9a-fA-F]{6})$/;

/**
 * Normalises a user-supplied colour to the bare uppercase 6-digit hex the docx
 * library expects. Returns `fallback` for anything unparseable.
 *
 * Deliberately lenient rather than fail-fast: a typo'd brand colour is a
 * cosmetic problem, and this tool runs unattended in an ADO pipeline at the
 * end of a long parse. Throwing here would fail an entire documentation run
 * over a missing '#'. The warning is enough — the run still produces a
 * readable document in the default colour.
 */
export function normaliseHex(input: string | undefined, fallback: string, fieldName: string): string {
  if (input === undefined) return fallback;
  const match = HEX_RE.exec(input.trim());
  if (!match) {
    console.warn(
      `  ✗ output.wordTheme.${fieldName}: '${input}' is not a 6-digit hex colour ` +
      `(e.g. '#0F62FE') — falling back to '#${fallback}'.`
    );
    return fallback;
  }
  return match[1].toUpperCase();
}

/** Mix a hex colour towards white. amount 0 = unchanged, 1 = white. */
function tint(hex: string, amount: number): string {
  const n = parseInt(hex, 16);
  const channels = [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  return channels
    .map(c => Math.round(c + (255 - c) * amount).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/** Mix a hex colour towards black. amount 0 = unchanged, 1 = black. */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex, 16);
  const channels = [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  return channels
    .map(c => Math.round(c * (1 - amount)).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * Relative luminance (WCAG 2.x). Used only to decide whether text on the
 * accent-filled table header should be white or near-black — a brand colour
 * can be anything from navy to a pale yellow, and hardcoding white text turns
 * the latter's header illegible.
 */
function luminance(hex: string): number {
  const n = parseInt(hex, 16);
  const srgb = [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

/** Pick white or near-black text for a given background, whichever contrasts more. */
function readableTextOn(background: string): string {
  return luminance(background) > 0.45 ? INK : 'FFFFFF';
}

// -----------------------------------------------
// Defaults
// -----------------------------------------------

/**
 * Near-black rather than pure black. Pure #000 on white is a harsh contrast
 * that reads as heavier than it is in long body copy; a dark neutral is the
 * standard typographic choice and matches how the wiki renders in a browser.
 */
const INK = '1A1A1A';

const DEFAULT_ACCENT = '2A6099';

/**
 * Calibri/Cambria are Word's own bundled fonts. That matters more than taste
 * here: this document is generated on an ephemeral ADO agent and opened on an
 * unknown client machine. A font that isn't installed is silently substituted
 * by Word, so anything fashionable (Inter, Segoe UI Variable) is a coin flip.
 * These two ship with every Word install on every platform.
 */
const DEFAULT_BODY_FONT = 'Calibri';
const DEFAULT_HEADING_FONT = 'Calibri Light';

/**
 * Courier New for code, for the same reason — it is the universally present
 * monospace. Consolas is nicer but is not guaranteed outside Windows.
 */
const DEFAULT_CODE_FONT = 'Courier New';

const DEFAULT_BODY_SIZE_PT = 10.5;

/**
 * Heading scale in points, by absolute level. A ~1.25 ratio between steps:
 * enough that the hierarchy is unambiguous when skimming a 200-page document,
 * without H1 dominating the page. H4 sits at body size and leans on weight and
 * colour instead of size, because four visibly distinct sizes plus body text
 * is more gradations than a reader can hold.
 */
const HEADING_SIZES_PT: Record<number, number> = {
  1: 22,
  2: 16,
  3: 13,
  4: 11,
};

/** docx measures font size in half-points. */
function halfPoints(pt: number): number {
  return Math.round(pt * 2);
}

// -----------------------------------------------
// Resolution
// -----------------------------------------------

/**
 * Builds a fully-populated WordTheme from the optional user config.
 *
 * Everything derives from `accentColor` unless explicitly overridden:
 *   H1/H2         → the accent itself
 *   H3/H4         → the accent shaded towards black, so deeper headings recede
 *                   rather than competing with their parent
 *   table header  → the accent, with text colour chosen for contrast
 *   banding       → a very light tint of the accent, which ties the tables to
 *                   the brand without the stripe fighting the text on top of it
 */
export function resolveWordTheme(config?: WordThemeConfig): WordTheme {
  const cfg = config ?? {};

  const accent = normaliseHex(cfg.accentColor, DEFAULT_ACCENT, 'accentColor');
  const bodyColor = normaliseHex(cfg.bodyColor, INK, 'bodyColor');

  const headingColor = cfg.headingColor !== undefined
    ? normaliseHex(cfg.headingColor, accent, 'headingColor')
    : accent;

  const tableHeaderFill = cfg.tableHeaderFill !== undefined
    ? normaliseHex(cfg.tableHeaderFill, accent, 'tableHeaderFill')
    : accent;

  const tableHeaderColor = cfg.tableHeaderColor !== undefined
    ? normaliseHex(cfg.tableHeaderColor, readableTextOn(tableHeaderFill), 'tableHeaderColor')
    : readableTextOn(tableHeaderFill);

  // 0.92 towards white: present enough to guide the eye across a wide row,
  // faint enough that body text on top keeps its contrast.
  const bandFill = cfg.tableBandFill !== undefined
    ? normaliseHex(cfg.tableBandFill, tint(accent, 0.92), 'tableBandFill')
    : tint(accent, 0.92);

  const bodySizePt = cfg.bodyFontSize ?? DEFAULT_BODY_SIZE_PT;

  return {
    bodyFont: cfg.bodyFont ?? DEFAULT_BODY_FONT,
    headingFont: cfg.headingFont ?? cfg.bodyFont ?? DEFAULT_HEADING_FONT,
    bodySizeHalfPoints: halfPoints(bodySizePt),
    bodyColor,
    headingColors: {
      1: headingColor,
      2: headingColor,
      3: shade(headingColor, 0.25),
      4: shade(headingColor, 0.4),
    },
    headingSizesHalfPoints: {
      1: halfPoints(HEADING_SIZES_PT[1]),
      2: halfPoints(HEADING_SIZES_PT[2]),
      3: halfPoints(HEADING_SIZES_PT[3]),
      4: halfPoints(HEADING_SIZES_PT[4]),
    },
    ruleColor: accent,
    headingRule: cfg.headingRule ?? true,
    table: {
      headerFill: tableHeaderFill,
      headerColor: tableHeaderColor,
      bandFill,
      rowFill: 'FFFFFF',
      borderColor: cfg.tableBorderColor !== undefined
        ? normaliseHex(cfg.tableBorderColor, tint(accent, 0.7), 'tableBorderColor')
        : tint(accent, 0.7),
      color: bodyColor,
      banded: cfg.tableBanding ?? true,
    },
    code: {
      font: cfg.codeFont ?? DEFAULT_CODE_FONT,
      fill: normaliseHex(cfg.codeFill, 'F2F2F2', 'codeFill'),
      color: normaliseHex(cfg.codeColor, shade(accent, 0.35), 'codeColor'),
    },
    footerColor: '767676',
  };
}

/** The theme used when no `output.wordTheme` block is present. */
export const DEFAULT_WORD_THEME: WordTheme = resolveWordTheme();
