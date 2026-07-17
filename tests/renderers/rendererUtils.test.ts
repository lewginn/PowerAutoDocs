import { describe, it, expect } from 'vitest';
import { toADOWikiLink, aiSummaryBlock } from '../../src/renderers/rendererUtils.js';

describe('toADOWikiLink', () => {
  it('converts spaces to hyphens', () => {
    expect(toADOWikiLink('/Tables/Order Line')).toBe('/Tables/Order-Line');
  });

  it('escapes real hyphens before converting spaces', () => {
    // Order matters: spaces become hyphens, so a pre-existing hyphen has to be
    // encoded first or the two are indistinguishable in the resulting link.
    expect(toADOWikiLink('Order-Line Detail')).toBe('Order%2DLine-Detail');
  });

  it('backslash-escapes parentheses', () => {
    expect(toADOWikiLink('Flow (v2)')).toBe('Flow-\\(v2\\)');
  });

  it('leaves a plain path untouched', () => {
    expect(toADOWikiLink('/Tables/Widget')).toBe('/Tables/Widget');
  });
});

describe('aiSummaryBlock', () => {
  it('returns a heading and blockquote when a summary exists', () => {
    expect(aiSummaryBlock('Creates a widget.')).toEqual([
      { type: 'heading', level: 2, text: 'Summary' },
      { type: 'blockquote', inlines: [{ type: 'text', value: 'Creates a widget.' }] },
    ]);
  });

  it('returns nothing when the summary is absent or empty', () => {
    // The section disappears entirely rather than rendering an empty "Summary"
    // heading — this is what makes aiEnrichment: false produce clean pages.
    expect(aiSummaryBlock(undefined)).toEqual([]);
    expect(aiSummaryBlock('')).toEqual([]);
  });
});
