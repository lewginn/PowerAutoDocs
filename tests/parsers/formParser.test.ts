import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseEntityForms, parseFormXml } from '../../src/parsers/formParser.js';
import type { FormModel } from '../../src/ir/index.js';

const ENTITIES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'fixtures', 'solutions', 'ContosoDemo', 'Entities',
);

const WIDGET = path.join(ENTITIES, 'contoso_widget');
const formFile = (...parts: string[]) => path.join(WIDGET, 'FormXml', ...parts);
const mainForm = () => parseFormXml(formFile('main', 'WidgetMainForm.xml'), 'Main')!;

describe('parseFormXml', () => {
  it('maps a main form onto the IR', () => {
    const form = mainForm();

    expect(form.name).toBe('Widget');
    expect(form.type).toBe('Main');
    expect(form.tabs.map(t => t.label)).toEqual(['Header', 'General', 'Untitled Tab']);
  });

  it('flattens the columns of a tab into a single ordered list of sections', () => {
    // A tab holds columns, each holding sections. The column is pure layout — a
    // reader cares about the sections and their order, not the two-up split.
    const general = mainForm().tabs.find(t => t.label === 'General')!;

    expect(general.sections).toEqual([
      { label: 'Identity', columns: ['contoso_name', 'contoso_partid'] },
      { label: 'Stock',    columns: ['contoso_quantity'] },
    ]);
  });

  it('reads fields across every row of a section, in layout order', () => {
    const identity = mainForm().tabs.find(t => t.label === 'General')!.sections[0];
    // contoso_name and contoso_partid live on separate rows; taking only the first
    // row would silently halve every documented form.
    expect(identity.columns).toEqual(['contoso_name', 'contoso_partid']);
  });

  it('ignores cells that bind to no field', () => {
    // Forms are padded with spacer cells (no <control>) and unbound controls
    // (datafieldname=""). Neither is a column, and both would render as blanks.
    const sections = mainForm().tabs.flatMap(t => t.sections);
    for (const section of sections) {
      expect(section.columns).not.toContain('');
    }
    expect(sections.find(s => s.label === 'Stock')!.columns).toEqual(['contoso_quantity']);
  });

  it('names unlabelled tabs and sections rather than leaving them blank', () => {
    // Form designers routinely leave showlabel=false containers unnamed. A blank
    // heading in the docs reads as a rendering bug, so the parser supplies one.
    const tab = mainForm().tabs.find(t => t.label === 'Untitled Tab')!;
    expect(tab.sections).toEqual([
      { label: 'Untitled Section', columns: ['contoso_notes'] },
    ]);
  });

  it('promotes header fields to a leading pseudo-tab', () => {
    // The header is not a tab in the XML, but it is the first thing a user sees on
    // the form, so it has to be the first thing in the docs.
    const [header] = mainForm().tabs;
    expect(header).toEqual({
      label: 'Header',
      sections: [{ label: 'Header Fields', columns: ['ownerid', 'statecode'] }],
    });
  });

  it('adds no header tab to a form without one', () => {
    // The quick create form has no <header>; an empty "Header" tab would be a lie.
    const quick = parseFormXml(formFile('quick', 'WidgetQuickCreate.xml'), 'Quick Create')!;
    expect(quick.tabs.map(t => t.label)).toEqual(['Quick Create']);
  });

  it('takes the English form name', () => {
    expect(mainForm().name).toBe('Widget');
    expect(parseFormXml(formFile('card', 'WidgetCard.xml'), 'Card')!.name).toBe('Widget Card');
  });

  it('skips a deactivated form', () => {
    // FormActivationState=0 means no user can open it. Documenting it would send
    // readers looking for a form that is not there.
    expect(parseFormXml(formFile('main', 'RetiredWidgetForm.xml'), 'Main')).toBeNull();
  });

  it('returns null when the file holds no systemform', () => {
    expect(parseFormXml(formFile('main', 'NoSystemForm.xml'), 'Main')).toBeNull();
  });
});

describe('parseEntityForms', () => {
  it('maps the FormXml subfolder name to a form type', () => {
    const types = Object.fromEntries(
      parseEntityForms(WIDGET).map(f => [f.name, f.type] as [string, FormModel['type']]),
    );

    expect(types).toEqual({
      'Widget':              'Main',          // FormXml/main
      'Widget Quick Create': 'Quick Create',  // FormXml/quick
      'Widget Card':         'Card',          // FormXml/card
      'Widget Dialog':       'Other',         // FormXml/dialog — folder we do not know
    });
  });

  it('orders forms by importance, not by folder name', () => {
    // Folders are read alphabetically (card, dialog, main, quick), so this order
    // can only come from the type sort. Main forms are what people mean by "the form".
    expect(parseEntityForms(WIDGET).map(f => f.type))
      .toEqual(['Main', 'Quick Create', 'Card', 'Other']);
  });

  it('drops inactive and unparseable forms without losing the rest', () => {
    // FormXml/main holds one good form, one deactivated one and one junk file.
    const names = parseEntityForms(WIDGET).map(f => f.name);
    expect(names).toContain('Widget');
    expect(names).not.toContain('Retired Widget Form');
    expect(names).not.toContain('NoSystemForm.xml');
  });

  it('returns empty for an entity with no FormXml folder', () => {
    // Plenty of tables carry no forms; an absent folder is normal, not an error.
    expect(parseEntityForms(path.join(ENTITIES, 'contoso_part'))).toEqual([]);
  });
});
