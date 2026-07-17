import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveWordTheme, normaliseHex, DEFAULT_WORD_THEME } from '../../src/docmodel/wordTheme.js';

const DEFAULT_ACCENT = '2A6099';

/** Relative luminance (WCAG 2.x) — mirrors the source, used to assert contrast properties. */
const luminance = (hex: string): number => {
  const n = parseInt(hex, 16);
  const srgb = [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
};

afterEach(() => vi.restoreAllMocks());

describe('normaliseHex', () => {
  it('strips the leading hash and uppercases', () => {
    // The docx library wants a bare uppercase hex; humans write '#0f62fe'.
    expect(normaliseHex('#0f62fe', 'FFFFFF', 'accentColor')).toBe('0F62FE');
  });

  it('accepts a hex with no hash and tolerates surrounding whitespace', () => {
    expect(normaliseHex('0f62fe', 'FFFFFF', 'accentColor')).toBe('0F62FE');
    expect(normaliseHex('  #0F62FE  ', 'FFFFFF', 'accentColor')).toBe('0F62FE');
  });

  it('returns the fallback and warns rather than throwing on a bad colour', () => {
    // This tool runs unattended at the end of a long parse in an ADO pipeline.
    // Failing the whole run over a typo'd brand colour would be a worse outcome
    // than a document in the default colour, so the resolver is deliberately lenient.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(normaliseHex('not-a-colour', 'ABCDEF', 'accentColor')).toBe('ABCDEF');
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain('accentColor');
  });

  it('rejects 3-digit shorthand rather than guessing at it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(normaliseHex('#fff', 'ABCDEF', 'codeFill')).toBe('ABCDEF');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('returns the fallback silently when the field is simply unset', () => {
    // Absent is not an error — only a present-but-invalid value warrants a warning.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(normaliseHex(undefined, 'ABCDEF', 'accentColor')).toBe('ABCDEF');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('resolveWordTheme — defaults', () => {
  it('produces a fully-populated theme from no config at all', () => {
    // The serializer never branches on "did the user set this?", so every field
    // must be present after resolution.
    const theme = resolveWordTheme();
    expect(theme.bodyFont).toBe('Calibri');
    expect(theme.headingFont).toBe('Calibri Light');
    expect(theme.code.font).toBe('Courier New');
    expect(theme.ruleColor).toBe(DEFAULT_ACCENT);
    expect(theme.headingRule).toBe(true);
    expect(theme.table.banded).toBe(true);
    expect(theme.table.rowFill).toBe('FFFFFF');
    expect(theme.footerColor).toBe('767676');
  });

  it('exposes the no-config theme as DEFAULT_WORD_THEME', () => {
    expect(DEFAULT_WORD_THEME).toEqual(resolveWordTheme());
  });

  it('treats an empty config object the same as no config', () => {
    expect(resolveWordTheme({})).toEqual(resolveWordTheme());
  });

  it('converts point sizes to the half-points docx measures in', () => {
    expect(resolveWordTheme().bodySizeHalfPoints).toBe(21);        // 10.5pt
    expect(resolveWordTheme({ bodyFontSize: 12 }).bodySizeHalfPoints).toBe(24);
    expect(resolveWordTheme().headingSizesHalfPoints[1]).toBe(44); // 22pt
  });

  it('rounds a fractional point size to a whole half-point', () => {
    // 10.25pt has no exact half-point representation; docx cannot take a fraction.
    expect(resolveWordTheme({ bodyFontSize: 10.25 }).bodySizeHalfPoints).toBe(21);
  });

  it('keeps table text a step below body text', () => {
    // Deliberate: the privilege matrix is 9 columns and wraps mid-word at body size.
    expect(resolveWordTheme().table.fontSizePt).toBeLessThan(10.5);
  });
});

describe('resolveWordTheme — deriving from accentColor', () => {
  it('drives headings, rules and table headers from the single accent', () => {
    // The whole point of the resolver: one config line produces a coherent document.
    const theme = resolveWordTheme({ accentColor: '#0F62FE' });
    expect(theme.headingColors[1]).toBe('0F62FE');
    expect(theme.headingColors[2]).toBe('0F62FE');
    expect(theme.ruleColor).toBe('0F62FE');
    expect(theme.table.headerFill).toBe('0F62FE');
  });

  it('recedes deeper headings by darkening them progressively', () => {
    // H3/H4 must not compete with their parent heading.
    const { headingColors } = resolveWordTheme({ accentColor: '#0F62FE' });
    expect(luminance(headingColors[3])).toBeLessThan(luminance(headingColors[1]));
    expect(luminance(headingColors[4])).toBeLessThan(luminance(headingColors[3]));
  });

  it('makes the band fill far lighter than the accent so text stays legible on it', () => {
    const theme = resolveWordTheme({ accentColor: '#0F62FE' });
    expect(luminance(theme.table.bandFill)).toBeGreaterThan(luminance('0F62FE'));
    // Close to white — a stripe that guides the eye without fighting the text.
    expect(luminance(theme.table.bandFill)).toBeGreaterThan(0.7);
  });

  it('derives the border as a tint of the accent, lighter than the accent itself', () => {
    const theme = resolveWordTheme({ accentColor: '#0F62FE' });
    expect(luminance(theme.table.borderColor)).toBeGreaterThan(luminance('0F62FE'));
  });

  it('derives the code colour as a darkened accent', () => {
    const theme = resolveWordTheme({ accentColor: '#0F62FE' });
    expect(luminance(theme.code.color)).toBeLessThan(luminance('0F62FE'));
  });
});

describe('resolveWordTheme — header text contrast', () => {
  it('uses white header text on a dark accent', () => {
    expect(resolveWordTheme({ accentColor: '#000080' }).table.headerColor).toBe('FFFFFF');
  });

  it('uses near-black header text on a pale accent', () => {
    // A brand colour can be a pale yellow; hardcoding white text would make the
    // table header unreadable. This is why luminance is measured rather than assumed.
    expect(resolveWordTheme({ accentColor: '#FFFF00' }).table.headerColor).toBe('1A1A1A');
  });

  it('measures contrast against an explicit header fill, not the accent', () => {
    // The user overrode the fill to pale yellow while the accent stays navy — the
    // text colour must follow the fill it actually sits on.
    const theme = resolveWordTheme({ accentColor: '#000080', tableHeaderFill: '#FFFF00' });
    expect(theme.table.headerColor).toBe('1A1A1A');
  });
});

describe('resolveWordTheme — explicit overrides', () => {
  it('lets every derived colour be overridden individually', () => {
    const theme = resolveWordTheme({
      accentColor: '#0F62FE',
      headingColor: '#AA0000',
      tableHeaderFill: '#00AA00',
      tableHeaderColor: '#123456',
      tableBandFill: '#EEEEEE',
      tableBorderColor: '#CCCCCC',
      codeFill: '#FAFAFA',
      codeColor: '#333333',
    });
    expect(theme.headingColors[1]).toBe('AA0000');
    expect(theme.table.headerFill).toBe('00AA00');
    expect(theme.table.headerColor).toBe('123456');
    expect(theme.table.bandFill).toBe('EEEEEE');
    expect(theme.table.borderColor).toBe('CCCCCC');
    expect(theme.code.fill).toBe('FAFAFA');
    expect(theme.code.color).toBe('333333');
    // The accent still drives what was not overridden.
    expect(theme.ruleColor).toBe('0F62FE');
  });

  it('darkens an explicit headingColor for H3/H4 rather than the accent', () => {
    const theme = resolveWordTheme({ accentColor: '#0F62FE', headingColor: '#AA0000' });
    expect(theme.headingColors[1]).toBe('AA0000');
    expect(luminance(theme.headingColors[3])).toBeLessThan(luminance('AA0000'));
  });

  it('falls back to the accent when an overridden heading colour is invalid', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const theme = resolveWordTheme({ accentColor: '#0F62FE', headingColor: 'nope' });
    expect(theme.headingColors[1]).toBe('0F62FE');
    expect(warn).toHaveBeenCalled();
  });

  it('uses bodyFont for headings when only bodyFont is set', () => {
    // Setting one font and getting a mismatched default heading font would look
    // like a bug to the user — one font in means one font out.
    const theme = resolveWordTheme({ bodyFont: 'Georgia' });
    expect(theme.bodyFont).toBe('Georgia');
    expect(theme.headingFont).toBe('Georgia');
  });

  it('keeps the fonts distinct when both are set', () => {
    const theme = resolveWordTheme({ bodyFont: 'Georgia', headingFont: 'Verdana' });
    expect(theme.bodyFont).toBe('Georgia');
    expect(theme.headingFont).toBe('Verdana');
  });

  it('honours headingFont even when bodyFont is left default', () => {
    const theme = resolveWordTheme({ headingFont: 'Verdana' });
    expect(theme.bodyFont).toBe('Calibri');
    expect(theme.headingFont).toBe('Verdana');
  });

  it('allows banding and the heading rule to be switched off', () => {
    const theme = resolveWordTheme({ tableBanding: false, headingRule: false });
    expect(theme.table.banded).toBe(false);
    expect(theme.headingRule).toBe(false);
  });

  it('applies bodyColor to table body text so the two cannot drift apart', () => {
    const theme = resolveWordTheme({ bodyColor: '#333333' });
    expect(theme.bodyColor).toBe('333333');
    expect(theme.table.color).toBe('333333');
  });
});
