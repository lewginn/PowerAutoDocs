import type { DocNode } from '../docmodel/nodes.js';
import { h, bqt } from '../docmodel/nodes.js';

/**
 * Encodes a full ADO wiki page path for use in markdown links.
 * - Existing hyphens → %2D (must be done before space conversion)
 * - Parentheses → escaped with backslash
 * - Spaces → hyphens
 */
export function toADOWikiLink(fullPath: string): string {
  return fullPath
    .replace(/-/g, '%2D')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/ /g, '-');
}

/**
 * Sanitises a name for use as an ADO wiki page path segment: '/' becomes '-'
 * (it implies hierarchy, so dashing preserves the distinction a plain strip
 * would lose); '?', '#', '%' and the other ADO-reserved characters
 * (':', '<', '>', '*', '|', '"', '\') are stripped outright, since they have
 * no obvious "becomes a dash" reading; and the result is trimmed.
 *
 * This is the single source of truth for that transform. It is exported here
 * — not left private to wikiAssembler.ts, where it originated — because a
 * renderer building an `lnk()` href to a page has to compute the exact same
 * path wikiAssembler will compute, or the link 404s. Before this existed,
 * four renderers built hrefs from the raw, unsanitised name while
 * wikiAssembler sanitised the actual path: a flow, global choice, email
 * template or model-driven app whose name needed sanitising got a page at
 * one path and every link to it pointing at another.
 */
export function encodePageSegment(name: string): string {
  return name
    .replace(/\//g, '-')
    .replace(/[?#%:<>*|"\\]/g, '')
    .trim();
}

/**
 * Renders a "Summary" callout (AI-generated) for a component detail page.
 *
 * Returns an empty array when no summary is present — the section simply
 * doesn't appear (output layer decision: no summary section is emitted
 * when aiEnrichment is disabled or a summary couldn't be generated/cached).
 * Centralising this here keeps the hide-when-absent behaviour consistent
 * across every renderer that supports AI summaries.
 */
export function aiSummaryBlock(aiSummary?: string): DocNode[] {
  if (!aiSummary) return [];
  return [
    h(2, 'Summary'),
    bqt(aiSummary),
  ];
}

/**
 * Inserts a space before each interior capital in a PascalCase enum value,
 * e.g. "DataverseCreateOrUpdate" → "Dataverse Create Or Update".
 *
 * Several IR enums (flow trigger types, and similar) come straight from
 * connector/message metadata as unspaced PascalCase, which is fine as a
 * type identifier but reads badly and wraps awkwardly in a table cell.
 * This is a plain-text transform, not format syntax, so it belongs here in
 * the renderer layer rather than in the IR (which shouldn't pre-mangle raw
 * field values) or duplicated per-serializer (constraints.md: renderers own
 * DocNode text, serializers own format syntax).
 */
export function humanizeEnumValue(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}