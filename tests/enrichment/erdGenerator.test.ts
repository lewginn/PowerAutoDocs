import { describe, it, expect } from 'vitest';
import { generateERDiagram } from '../../src/enrichment/erdGenerator.js';
import type { TableModel, RelationshipModel } from '../../src/ir/index.js';

function rel(over: Partial<RelationshipModel> = {}): RelationshipModel {
  return {
    name: 'contoso_widget_contoso_order',
    type: 'ManyToOne',
    referencingEntity: 'contoso_order',
    referencedEntity: 'contoso_widget',
    referencingAttribute: 'contoso_widgetid',
    description: '',
    isCustom: true,
    ...over,
  };
}

function tbl(logicalName: string, over: Partial<TableModel> = {}): TableModel {
  return {
    logicalName,
    displayName: logicalName,
    pluralDisplayName: `${logicalName}s`,
    description: '',
    isCustom: true,
    isActivity: false,
    columns: [],
    relationships: [],
    forms: [],
    views: [],
    ...over,
  };
}

const TABLES = [
  tbl('contoso_widget', { relationships: [rel()] }),
  tbl('contoso_order'),
];

describe('generateERDiagram', () => {
  it('emits raw Mermaid DSL with no fence', () => {
    // The scar this guards (a7c803d): the generator used to bake in the ::: fence,
    // MarkdownSerializer added a second one, and every client ERD shipped
    // double-fenced as literal text. A fence here also corrupts the PNG render
    // input for Word, which feeds node.code straight to Mermaid.
    const dsl = generateERDiagram(TABLES, 'contoso');

    expect(dsl).not.toContain(':::');
    expect(dsl).not.toContain('```');
    expect(dsl.startsWith('erDiagram')).toBe(true);
  });

  it('returns an empty string when nothing qualifies', () => {
    expect(generateERDiagram([tbl('contoso_widget')], 'contoso')).toBe('');
  });

  it('honours erd.excludeEntities case-insensitively', () => {
    const dsl = generateERDiagram(TABLES, 'contoso', { excludeEntities: ['CONTOSO_ORDER'] });
    expect(dsl).not.toContain('contoso_order');
  });

  it('honours erd.excludeRelationships case-insensitively', () => {
    const dsl = generateERDiagram(TABLES, 'contoso', {
      excludeRelationships: ['CONTOSO_WIDGET_CONTOSO_ORDER'],
    });
    expect(dsl).toBe('');
  });

  it('labels relationships with an empty string, never a blank space', () => {
    // Not cosmetic. A space is a non-empty text node with no glyphs: Mermaid 11
    // lays out a label for it, measures a zero-width box, and emits
    //   <g> attribute transform: Expected number, "translate(undefined, NaN)"
    // twice per relationship while rendering the ERD into the Word document. On a
    // real client solution that is a wall of console errors in the pipeline log,
    // in the middle of a run that otherwise reports success — which reads as a
    // broken build. "" produces no label element at all.
    //
    // Both forms parse under Mermaid 8.14 (verified against that version), which
    // is what the ADO Wiki renders this same DSL with, so the wiki is unaffected
    // either way. This assertion exists to stop " " coming back as a "harmless"
    // tidy-up of the empty label.
    const dsl = generateERDiagram(TABLES, 'contoso');

    expect(dsl).toContain('||--o{');
    expect(dsl).not.toMatch(/:\s*" "/);
    for (const line of dsl.split('\n').filter(l => l.includes('||--o{'))) {
      expect(line).toMatch(/: ""$/);
    }
  });
});
