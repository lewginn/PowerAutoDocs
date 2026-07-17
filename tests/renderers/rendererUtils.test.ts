import { describe, it, expect } from 'vitest';
import { toADOWikiLink, aiSummaryBlock, encodePageSegment } from '../../src/renderers/rendererUtils.js';

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

describe('encodePageSegment', () => {
  // #110: this is the single source of truth for the ADO page-path transform.
  // wikiAssembler.ts uses it to build the real page path; every renderer that
  // links to that page must apply it identically to the href, or the link
  // 404s the moment a name needs sanitising. Direct unit coverage here is what
  // stops a future edit to this function from being verified only indirectly,
  // through a dozen renderer integration tests.

  it('dashes a slash rather than stripping it — it implies hierarchy', () => {
    expect(encodePageSegment('Profit/Loss')).toBe('Profit-Loss');
  });

  it('strips ? # % outright, with no dash', () => {
    expect(encodePageSegment('Q1? #tag 50%')).toBe('Q1 tag 50');
  });

  it('strips every other ADO-reserved character: : < > * | " \\', () => {
    expect(encodePageSegment('Ops: <draft> *final* "v1" \\old\\ a|b')).toBe('Ops draft final v1 old ab');
  });

  it('trims the result, but only at the ends', () => {
    // A stripped character in the interior leaves its surrounding spaces behind.
    expect(encodePageSegment(' A # B ')).toBe('A  B');
  });

  it('leaves a name with nothing to sanitise unchanged', () => {
    expect(encodePageSegment('Widget')).toBe('Widget');
  });

  it('is idempotent — encoding an already-encoded segment is a no-op', () => {
    // wikiAssembler composes this with encodeRoleName/encodeChoiceName
    // (s(encodeRoleName(name))); the outer call must not mangle output the
    // inner call already produced.
    const once = encodePageSegment('Sales/Admin?');
    expect(encodePageSegment(once)).toBe(once);
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
