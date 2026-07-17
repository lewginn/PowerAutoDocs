import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseEmailTemplates } from '../../src/parsers/emailTemplateParser.js';

const SOLUTION = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'fixtures', 'solutions', 'ContosoDemo',
);

describe('parseEmailTemplates', () => {
  it('sorts by title, not by the order the entries appear in the manifest', () => {
    // EmailTemplates.xml deliberately lists Widget Registry Digest first.
    expect(parseEmailTemplates(SOLUTION).map(t => t.title))
      .toEqual(['Case Acknowledgement', 'Order Shipped', 'Widget Registry Digest']);
  });

  it('strips the braces off the template id', () => {
    // The id is used to build the EmailDocuments path, which re-adds the braces —
    // so the IR must carry the bare guid.
    expect(parseEmailTemplates(SOLUTION).map(t => t.id))
      .toEqual([
        '2b7c1d40-0000-4000-8000-000000000002',
        '2b7c1d40-0000-4000-8000-000000000001',
        '2b7c1d40-0000-4000-8000-000000000003',
      ]);
  });

  it('resolves templatetypecode to a target entity, and degrades on an unknown code', () => {
    // An unmapped code must stay traceable rather than becoming a blank or a lie.
    const byTitle = Object.fromEntries(
      parseEmailTemplates(SOLUTION).map(t => [t.title, t.targetEntity]),
    );
    expect(byTitle['Order Shipped']).toBe('Order');                 // 7
    expect(byTitle['Case Acknowledgement']).toBe('Case');           // 5
    expect(byTitle['Widget Registry Digest']).toBe('Entity (9999)');
  });

  it('reads languageCode per template, not a fixed 1033', () => {
    // The language drives the EmailDocuments/<lang>/ lookup, so getting it wrong
    // silently empties subject and body.
    const digest = parseEmailTemplates(SOLUTION).find(t => t.title === 'Widget Registry Digest')!;
    expect(digest.languageCode).toBe(1031);
  });

  it('extracts a subject from XSL with dynamic fields as {fieldName} placeholders', () => {
    const shipped = parseEmailTemplates(SOLUTION).find(t => t.title === 'Order Shipped')!;
    // The spaces either side of the merge field are meaningful and must survive.
    // Trimming each CDATA run and joining with '' used to yield
    // "order{contoso_ordernumber}has" — mangled text in every client's email docs.
    expect(shipped.subject).toBe('Your Contoso order {contoso_ordernumber} has shipped');
  });

  it('reduces the body XSL to plain text: tags become breaks, entities are decoded', () => {
    const shipped = parseEmailTemplates(SOLUTION).find(t => t.title === 'Order Shipped')!;
    expect(shipped.body).toBe(
      'Hello {firstname},\n\nAccount: {parentcustomerid}Tracking code: CON-4471\n\nThanks,\nThe Contoso&Co team',
    );
    // The body must never reach a renderer with markup still in it — renderers emit
    // DocNodes, and stray HTML would be escaped as literal text in the docx/PDF.
    expect(shipped.body).not.toMatch(/<[^>]+>/);
    expect(shipped.body).not.toContain('&nbsp;');
    expect(shipped.body).not.toContain('&amp;');
    // <li>/<br> runs collapse to at most a blank line rather than a wall of newlines.
    expect(shipped.body).not.toMatch(/\n{3,}/);
  });

  it('strips the entity prefix and the @name selector from placeholder names', () => {
    // "contact/parentcustomerid/@name" is how a lookup's display name is selected;
    // {parentcustomerid/@name} would read as noise in the docs.
    const shipped = parseEmailTemplates(SOLUTION).find(t => t.title === 'Order Shipped')!;
    expect(shipped.body).toContain('{parentcustomerid}');
    expect(shipped.body).toContain('{firstname}');
  });

  it('collects dynamicFields from subject and body, de-duplicated and sorted, in raw select form', () => {
    const shipped = parseEmailTemplates(SOLUTION).find(t => t.title === 'Order Shipped')!;
    expect(shipped.dynamicFields).toEqual([
      'contact/firstname',
      'contact/parentcustomerid/@name',
      'contoso_order/contoso_ordernumber', // from subject.xsl, so both files are walked
    ]);
  });

  it('ignores absolute XSL selects, which address the source document not a field', () => {
    // body.xsl contains <xsl:value-of select="/data/contoso_order/contoso_total" /> inside
    // a for-each. Treating it as a merge field would invent a field that is not one.
    const shipped = parseEmailTemplates(SOLUTION).find(t => t.title === 'Order Shipped')!;
    expect(shipped.dynamicFields).not.toContain('/data/contoso_order/contoso_total');
    expect(shipped.body).not.toContain('contoso_total');
  });

  it('leaves body empty when only subject.xsl exists', () => {
    const ack = parseEmailTemplates(SOLUTION).find(t => t.title === 'Case Acknowledgement')!;
    expect(ack.subject).toBe('Contoso case {ticketnumber} received');
    expect(ack.body).toBe('');
    expect(ack.dynamicFields).toEqual(['incident/ticketnumber']);
  });

  it('survives a template whose EmailDocuments folder is missing entirely', () => {
    // Templates exported without their XSL still belong in the docs — dropping them
    // would understate what the solution contains.
    const digest = parseEmailTemplates(SOLUTION).find(t => t.title === 'Widget Registry Digest')!;
    expect(digest.subject).toBe('');
    expect(digest.body).toBe('');
    expect(digest.dynamicFields).toEqual([]);
  });

  it('drops non-customisable templates and untitled entries', () => {
    const titles = parseEmailTemplates(SOLUTION).map(t => t.title);
    expect(titles).not.toContain('Locked System Notice'); // IsCustomizable 0
    expect(parseEmailTemplates(SOLUTION).every(t => t.isCustomizable && t.title)).toBe(true);
    expect(titles).toHaveLength(3); // the untitled draft is gone too
  });

  it('returns empty for a solution with no Templates folder', () => {
    // Every sweeping parser must tolerate an absent component folder — most real
    // solutions contain only a few component types.
    expect(parseEmailTemplates(path.join(SOLUTION, 'Other'))).toEqual([]);
  });
});
