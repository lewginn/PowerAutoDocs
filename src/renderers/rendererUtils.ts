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