import { describe, it, expect } from 'vitest';
import { serialize } from '../../src/docmodel/MarkdownSerializer.js';
import {
  h, p, pt, bqt, toc, mermaid, codeBlock, table, ct, cc, cell,
  bulletList, bullet, t, c, b, i, lnk,
} from '../../src/docmodel/nodes.js';

describe('inline serialisation', () => {
  it('wraps each inline type in its markdown syntax', () => {
    expect(serialize([p(t('plain '), c('code'), b('bold'), i('italic'))]))
      .toBe('plain `code`**bold**_italic_\n');
  });

  it('encodes link hrefs as ADO wiki paths', () => {
    // Spaces become hyphens and real hyphens become %2D — otherwise the two are
    // indistinguishable once the path is a link.
    expect(serialize([p(lnk('Sub Grid', '/Tables/Order-Line/Sub Grid'))]))
      .toBe('[Sub Grid](/Tables/Order%2DLine/Sub-Grid)\n');
  });
});

describe('block serialisation', () => {
  it('emits headings at their level and separates blocks with a blank line', () => {
    expect(serialize([h(1, 'Tables'), pt('Body.')])).toBe('# Tables\n\nBody.\n');
    expect(serialize([h(4, 'Deep')])).toBe('#### Deep\n');
  });

  it('emits a blockquote, a fenced code block and the TOC placeholder', () => {
    expect(serialize([bqt('Summary text.')])).toBe('> Summary text.\n');
    expect(serialize([codeBlock('line 1\nline 2')])).toBe('```\nline 1\nline 2\n```\n');
    expect(serialize([toc()])).toBe('[[_TOSP_]]\n');
  });

  it('indents bullets two spaces per depth level', () => {
    const nodes = [bulletList([
      bullet(0, t('Trigger')),
      bullet(1, t('Condition')),
      bullet(2, c('contoso_status')),
    ])];
    expect(serialize(nodes)).toBe('- Trigger\n  - Condition\n    - `contoso_status`\n');
  });
});

describe('mermaid nodes', () => {
  // Regression guard for a7c803d: erdGenerator baked the ::: fence into the diagram
  // string *and* the serializer added its own, so every ERD in every client wiki
  // shipped double-fenced and rendered as literal text. The fence belongs here and
  // only here — MermaidNode.code is raw DSL.
  it('wraps raw DSL in exactly one ADO ::: fence', () => {
    const out = serialize([mermaid('graph TD\n  A-->B')]);
    expect(out).toBe(':::mermaid\ngraph TD\n  A-->B\n:::\n');
    expect(out.match(/:::mermaid/g)).toHaveLength(1);
  });
});

describe('table serialisation', () => {
  it('pads every column to its widest cell, including the header', () => {
    const out = serialize([table(
      ['Name', 'Type'],
      [
        [ct('contoso_widget'), cc('String')],
        [ct('id'), cc('Guid')],
      ],
    )]);

    expect(out).toBe([
      '| Name           | Type     |',
      '| -------------- | -------- |',
      '| contoso_widget | `String` |',
      '| id             | `Guid`   |',
      '',
    ].join('\n'));
  });

  it('measures width on serialised text, so markdown syntax counts toward it', () => {
    // `String` is 6 chars of content but 8 once fenced. A width computed from the
    // raw value would under-pad and misalign the column.
    const out = serialize([table(['T'], [[cc('String')]])]);
    const [, , row] = out.split('\n');
    expect(row).toBe('| `String` |');
  });

  // Characterisation, NOT endorsement: a row with fewer cells than headers emits a
  // short row, which is malformed markdown. serializeTable is half-guarded against
  // this — the width calc handles a missing cell via `r[i] ?? ''`, but the body map
  // iterates the row, so the cell never gets emitted. No renderer builds a ragged
  // table today, so this is latent. Tracked in #103; update this test when it's fixed.
  it('BUG: emits a short row when a row has fewer cells than headers (#103)', () => {
    const out = serialize([table(['A', 'B'], [[ct('x')]])]);
    expect(out.split('\n')[2]).toBe('| x |');
  });

  it('renders multi-inline cells', () => {
    const out = serialize([table(['Col'], [[cell(b('Yes'), t(' — '), c('flag'))]])]);
    expect(out.split('\n')[2]).toBe('| **Yes** — `flag` |');
  });
});

describe('document assembly', () => {
  it('joins blocks with one blank line and terminates with a newline', () => {
    expect(serialize([h(1, 'A'), pt('b'), h(2, 'C')])).toBe('# A\n\nb\n\n## C\n');
  });

  it('returns just a newline for an empty document', () => {
    expect(serialize([])).toBe('\n');
  });
});
