import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseEntityXml } from '../../src/parsers/tableParser.js';
import type { ColumnModel } from '../../src/ir/index.js';

const ENTITIES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'fixtures', 'solutions', 'ContosoDemo', 'Entities',
);

const entity = (folder: string) => parseEntityXml(path.join(ENTITIES, folder, 'Entity.xml'));
const column = (folder: string, logicalName: string): ColumnModel =>
  entity(folder).columns.find(c => c.logicalName === logicalName)!;

describe('parseEntityXml', () => {
  it('maps an entity onto the IR', () => {
    const widget = entity('contoso_widget');

    expect(widget.logicalName).toBe('contoso_widget');
    expect(widget.displayName).toBe('Widget');
    expect(widget.isActivity).toBe(false);
    // Views, forms and relationships are the sweep's job, not this parser's — it
    // must hand back empty arrays rather than nulls so callers can assign into them.
    expect(widget.views).toEqual([]);
    expect(widget.forms).toEqual([]);
    expect(widget.relationships).toEqual([]);
  });

  it('takes the display name from the Name attribute, not the localised names block', () => {
    // <Name LocalizedName="Widget">contoso_widget</Name> — the element text is the
    // logical name and the attribute is the label; getting these the wrong way round
    // would put publisher prefixes in front of every heading in the document.
    const widget = entity('contoso_widget');
    expect(widget.logicalName).toBe('contoso_widget');
    expect(widget.displayName).toBe('Widget');
  });

  it('falls back to the logical name when Name carries no LocalizedName', () => {
    // contoso_part's <Name> is a bare string, so fast-xml-parser yields a string
    // rather than an object — the attribute lookup must not blow up on it.
    expect(entity('contoso_part').displayName).toBe('contoso_part');
  });

  it('infers isCustom from the publisher prefix in the logical name', () => {
    expect(entity('contoso_widget').isCustom).toBe(true);
    expect(entity('account').isCustom).toBe(false);
  });

  it('reads IsActivity', () => {
    // Activity tables are documented differently, and the flag arrives as XML text
    // that fast-xml-parser turns into a number — not the string the code also allows.
    expect(entity('contoso_inspection').isActivity).toBe(true);
    expect(entity('account').isActivity).toBe(false);
  });

  it('maps every Power Platform column type it knows to an IR type', () => {
    const types = Object.fromEntries(
      entity('contoso_widget').columns.map(c => [c.logicalName, c.type]),
    );

    expect(types).toMatchObject({
      contoso_widgetid:    'uniqueidentifier', // primarykey
      contoso_name:        'string',           // nvarchar
      contoso_notes:       'memo',
      contoso_quantity:    'integer',          // int
      contoso_tolerance:   'decimal',
      contoso_unitprice:   'money',
      contoso_isapproved:  'boolean',          // bit
      contoso_assembledon: 'datetime',
      contoso_partid:      'lookup',
      contoso_category:    'optionset',        // picklist
      statecode:           'optionset',        // state
      ownerid:             'lookup',           // owner
    });
  });

  it('falls back to unknown for an unmapped or missing type rather than throwing', () => {
    // A solution that used one type we had never seen must still document every
    // other column, so an unmapped type degrades to 'unknown'.
    expect(column('contoso_widget', 'versionnumber').type).toBe('unknown'); // bigint: unmapped
    expect(column('contoso_widget', 'contoso_legacycode').type).toBe('unknown'); // no <Type> at all
  });

  it('treats required and systemrequired as required, and nothing else', () => {
    // 'recommended' is the trap: it reads like a requirement but Dataverse will
    // happily save without it, so documenting it as required would be wrong.
    expect(column('contoso_widget', 'contoso_name').isRequired).toBe(true);        // required
    expect(column('contoso_widget', 'statecode').isRequired).toBe(true);           // systemrequired
    expect(column('contoso_widget', 'contoso_quantity').isRequired).toBe(false);   // recommended
    expect(column('contoso_widget', 'contoso_notes').isRequired).toBe(false);      // none
  });

  it('reads IsCustomField as a flag', () => {
    expect(column('contoso_widget', 'contoso_name').isCustom).toBe(true);
    expect(column('contoso_widget', 'statecode').isCustom).toBe(false);
    // No <IsCustomField> element at all — absence is not customness.
    expect(column('contoso_inspection', 'subject').isCustom).toBe(false);
  });

  it('carries maxLength only where the platform emits one', () => {
    expect(column('contoso_widget', 'contoso_name').maxLength).toBe(100);
    expect(column('contoso_widget', 'contoso_notes').maxLength).toBe(2000);
    // Numeric and lookup columns have no length; emitting 0 or NaN here would put
    // a meaningless length column in the docs.
    expect(column('contoso_widget', 'contoso_quantity').maxLength).toBeUndefined();
    expect(column('contoso_widget', 'contoso_partid').maxLength).toBeUndefined();
  });

  it('picks the English label and ignores other locales', () => {
    // contoso_name is labelled in both 1033 and 1036; a find() that took the first
    // entry rather than the 1033 one would pass on most columns and fail on this.
    expect(column('contoso_widget', 'contoso_name').displayName).toBe('Widget Name');
  });

  it('leaves the display name empty when there is no English label', () => {
    expect(column('contoso_widget', 'contoso_legacycode').displayName).toBe('');
  });

  it('forces a single column into an array', () => {
    // fast-xml-parser collapses a lone repeated element into an object. contoso_part
    // has exactly one attribute, which is the shape that catches a missing isArray.
    expect(entity('contoso_part').columns.map(c => c.logicalName)).toEqual(['contoso_partid']);
  });

  it('throws on XML with no entity node', () => {
    // The sweep relies on this throwing — a silently-empty table would be worse
    // than a skipped one, because nobody would notice the missing content.
    expect(() => entity('contoso_broken')).toThrow(/Could not find entity node/);
  });

  // --- Localised label blocks ---------------------------------------------------
  // These three shared one bug: getEnglishLabel() hardcoded a <displayname> child
  // lookup while being handed blocks whose children are <Description> and
  // <LocalizedCollectionName>, so all three came back empty. For a documentation
  // tool, silently blanking every description is about as bad as it gets — hence
  // one test per block rather than one for the helper.

  it('reads a column description from its <Descriptions><Description> block', () => {
    expect(column('contoso_widget', 'contoso_name').description)
      .toBe('The name shown on the widget record.');
  });

  it('reads the entity description', () => {
    expect(entity('contoso_widget').description).toBe('A fictional widget assembled from parts.');
  });

  it('reads the plural display name from <LocalizedCollectionNames>', () => {
    expect(entity('contoso_widget').pluralDisplayName).toBe('Widgets');
  });

  it('still returns empty for a block that is absent or has no 1033 entry', () => {
    // contoso_part is the sparse fixture: no Descriptions block at all. Absent must
    // stay '' rather than throwing — most standard columns carry no description.
    expect(entity('contoso_part').description).toBe('');
    expect(entity('contoso_part').pluralDisplayName).toBe('');
  });

  it('does not yet resolve lookup targets', () => {
    // contoso_partid carries <LookupTypes>; the parser hardcodes targets to undefined
    // and defers this to the relationship parser (see the TODO in tableParser).
    expect(column('contoso_widget', 'contoso_partid').targets).toBeUndefined();
  });
});
