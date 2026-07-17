import { describe, it, expect } from 'vitest';
import {
  renderEmailTemplatesIndex,
  renderEmailTemplatePage,
} from '../../src/renderers/emailTemplateRenderer.js';
import type { BulletListNode, DocNode, TableNode } from '../../src/docmodel/nodes.js';
import { anEmailTemplate } from '../fixtures/ir.js';

const firstTable = (nodes: DocNode[]): TableNode => {
  const tbl = nodes.find(n => n.type === 'table') as TableNode | undefined;
  if (!tbl) throw new Error('expected a table node');
  return tbl;
};

const propLabels = (tbl: TableNode): string[] =>
  tbl.rows.map(r => (r[0][0] as { value: string }).value);

const propValue = (tbl: TableNode, label: string) =>
  tbl.rows.find(r => (r[0][0] as { value: string }).value === label)?.[1];

const headings = (nodes: DocNode[]): string[] =>
  nodes.filter(n => n.type === 'heading').map(n => (n as { text: string }).text);

describe('renderEmailTemplatesIndex', () => {
  it('renders a placeholder instead of an empty table when there are no templates', () => {
    const nodes = renderEmailTemplatesIndex([], '/Email');
    expect(nodes.some(n => n.type === 'table')).toBe(false);
    expect(nodes).toContainEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: 'No custom email templates found in this solution.' }],
    });
  });

  it('puts one row per template under the expected headers', () => {
    const nodes = renderEmailTemplatesIndex(
      [anEmailTemplate({ title: 'A' }), anEmailTemplate({ title: 'B' })],
      '/Email',
    );
    const tbl = firstTable(nodes);
    expect(tbl.headers).toEqual(['Title', 'Target Entity', 'Subject']);
    expect(tbl.rows).toHaveLength(2);
  });

  it('links each template to its own page under the basePath', () => {
    const tbl = firstTable(renderEmailTemplatesIndex([anEmailTemplate({ title: 'Widget Shipped' })], '/Email'));
    expect(tbl.rows[0][0]).toEqual([{ type: 'link', text: 'Widget Shipped', href: '/Email/Widget Shipped' }]);
  });

  it('truncates a long subject with an ellipsis so the index stays readable', () => {
    const subject = 'x'.repeat(100);
    const tbl = firstTable(renderEmailTemplatesIndex([anEmailTemplate({ subject })], '/Email'));
    expect(tbl.rows[0][2]).toEqual([{ type: 'text', value: 'x'.repeat(80) + '…' }]);
  });

  it('leaves a subject of exactly the limit unmarked', () => {
    // Off-by-one here would append an ellipsis to a subject that was not cut.
    const subject = 'x'.repeat(80);
    const tbl = firstTable(renderEmailTemplatesIndex([anEmailTemplate({ subject })], '/Email'));
    expect(tbl.rows[0][2]).toEqual([{ type: 'text', value: subject }]);
  });

  it('marks a template with no subject rather than leaving the cell blank', () => {
    const tbl = firstTable(renderEmailTemplatesIndex([anEmailTemplate({ subject: '' })], '/Email'));
    expect(tbl.rows[0][2]).toEqual([{ type: 'text', value: 'No subject' }]);
  });
});

describe('renderEmailTemplatePage', () => {
  it('leads with the template title as a level-1 heading', () => {
    const nodes = renderEmailTemplatePage(anEmailTemplate({ title: 'Widget Shipped' }));
    expect(nodes[0]).toEqual({ type: 'heading', level: 1, text: 'Widget Shipped' });
  });

  it('omits the Description row when the template has none', () => {
    expect(propLabels(firstTable(renderEmailTemplatePage(anEmailTemplate({ description: '' })))))
      .toEqual(['Target Entity', 'Template ID', 'Language']);
    expect(propLabels(firstTable(renderEmailTemplatePage(anEmailTemplate({ description: 'Sent on ship.' })))))
      .toEqual(['Target Entity', 'Template ID', 'Language', 'Description']);
  });

  it('renders the template id as a code span', () => {
    const tbl = firstTable(renderEmailTemplatePage(anEmailTemplate({ id: '77777777-7777-7777-7777-777777777777' })));
    expect(propValue(tbl, 'Template ID')).toEqual([
      { type: 'code', value: '77777777-7777-7777-7777-777777777777' },
    ]);
  });

  it('names a known language while keeping its LCID', () => {
    const tbl = firstTable(renderEmailTemplatePage(anEmailTemplate({ languageCode: 1033 })));
    expect(propValue(tbl, 'Language')).toEqual([{ type: 'text', value: 'English (United States) (1033)' }]);
  });

  it('falls back to the bare LCID for a language it does not know', () => {
    // The map covers a handful of locales; an unmapped one must not render blank.
    const tbl = firstTable(renderEmailTemplatePage(anEmailTemplate({ languageCode: 1053 })));
    expect(propValue(tbl, 'Language')).toEqual([{ type: 'text', value: '1053' }]);
  });

  it('states when no subject is defined', () => {
    const nodes = renderEmailTemplatePage(anEmailTemplate({ subject: '' }));
    expect(nodes).toContainEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: 'No subject defined.' }],
    });
  });

  it('renders the subject verbatim, placeholders included', () => {
    const nodes = renderEmailTemplatePage(anEmailTemplate({ subject: 'Your widget {acme_widgetname} has shipped' }));
    expect(nodes).toContainEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: 'Your widget {acme_widgetname} has shipped' }],
    });
  });

  it('emits the body as a code block, never as a fenced string', () => {
    // The renderer/serializer boundary from constraints.md: fences belong to the
    // serializer that owns the format. A body containing its own backticks must
    // not tempt the renderer into wrapping it here.
    const body = 'Hello {firstname}, run `npm ci` then check your widget.';
    const nodes = renderEmailTemplatePage(anEmailTemplate({ body }));
    expect(nodes).toContainEqual({ type: 'code_block', text: body });
    expect(JSON.stringify(nodes)).not.toContain('```');
  });

  it('preserves body newlines rather than flattening the template', () => {
    const body = 'Line one.\n\nLine two.';
    const nodes = renderEmailTemplatePage(anEmailTemplate({ body }));
    expect(nodes).toContainEqual({ type: 'code_block', text: body });
  });

  it('states when no body content was found instead of an empty code block', () => {
    const nodes = renderEmailTemplatePage(anEmailTemplate({ body: '' }));
    expect(nodes.some(n => n.type === 'code_block')).toBe(false);
    expect(nodes).toContainEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: 'No body content found.' }],
    });
  });

  it('drops the Dynamic Fields section entirely when the template has none', () => {
    const nodes = renderEmailTemplatePage(anEmailTemplate({ dynamicFields: [] }));
    expect(headings(nodes)).not.toContain('Dynamic Fields');
    expect(nodes.some(n => n.type === 'bullet_list')).toBe(false);
  });

  it('lists each dynamic field as a flat code bullet', () => {
    const nodes = renderEmailTemplatePage(anEmailTemplate({
      dynamicFields: ['acme_widgetname', 'firstname'],
    }));
    expect(headings(nodes)).toEqual(['Widget Shipped', 'Subject', 'Body', 'Dynamic Fields']);
    const list = nodes.find(n => n.type === 'bullet_list') as BulletListNode;
    expect(list.items).toEqual([
      { depth: 0, inlines: [{ type: 'code', value: 'acme_widgetname' }] },
      { depth: 0, inlines: [{ type: 'code', value: 'firstname' }] },
    ]);
  });
});
