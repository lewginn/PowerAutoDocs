import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderOverview, writeOverviewMarkdown } from '../../src/renderers/overviewRenderer.js';
import type { DocNode, TableNode } from '../../src/docmodel/nodes.js';
import {
  aBusinessRule,
  aClassicWorkflow,
  aColumn,
  aConnectionReference,
  aFlow,
  aForm,
  aGlobalChoice,
  aModelDrivenApp,
  aPluginAssembly,
  aPluginStep,
  aRelationship,
  aSecurityRole,
  aSolution,
  aTable,
  aView,
  aWebResource,
  anEmailTemplate,
  anEnvironmentVariable,
} from '../fixtures/ir.js';

const tables = (nodes: DocNode[]): TableNode[] => nodes.filter(n => n.type === 'table') as TableNode[];

const headings = (nodes: DocNode[]): string[] =>
  nodes.filter(n => n.type === 'heading').map(n => (n as { text: string }).text);

/** The Summary table as { component label -> count } — the shape every count assertion wants. */
const summaryCounts = (nodes: DocNode[]): Record<string, string> => {
  const tbl = tables(nodes)[0];
  if (!tbl || tbl.headers[0] !== 'Component') return {};
  return Object.fromEntries(
    tbl.rows.map(r => [(r[0][0] as { value: string }).value, (r[1][0] as { value: string }).value])
  );
};

/** Render an overview whose only non-empty input is the solutions list. */
const overviewOf = (...solutions: ReturnType<typeof aSolution>[]) =>
  renderOverview(solutions, [], []);

describe('renderOverview — structure', () => {
  it('leads with the Overview heading', () => {
    expect(overviewOf(aSolution())[0]).toEqual({ type: 'heading', level: 1, text: 'Overview' });
  });

  it('always renders the Solutions table', () => {
    const nodes = overviewOf(aSolution());
    expect(headings(nodes)).toContain('Solutions');
    const tbl = tables(nodes)[tables(nodes).length - 1];
    expect(tbl.headers).toEqual(['Name', 'Unique Name', 'Version', 'Publisher', 'Prefix', 'Managed']);
  });

  it('omits the Summary section when every component count is zero', () => {
    // A solution with no tables and no other components has nothing to summarise;
    // a Summary table of zeroes would be noise.
    const nodes = overviewOf(aSolution({ tables: [] }));
    expect(headings(nodes)).toEqual(['Overview', 'Solutions']);
  });

  it('never emits markdown fences from the renderer', () => {
    // constraints.md: format syntax belongs to the serializer. The overview is
    // plain tables today, but that boundary is what the double-fenced ERD bug broke.
    const nodes = renderOverview(
      [aSolution()], [aFlow()], [aPluginAssembly()], [aWebResource()], [aClassicWorkflow()],
      [aBusinessRule()], [aSecurityRole()], [anEnvironmentVariable()], [aGlobalChoice()],
      [anEmailTemplate()], [aModelDrivenApp()], [aConnectionReference()]
    );
    expect(JSON.stringify(nodes)).not.toContain('```');
    expect(nodes.some(n => n.type === 'mermaid')).toBe(false);
  });
});

describe('renderOverview — solutions table', () => {
  it('renders the unique name and prefix as code spans', () => {
    // Both are identifiers that get typed verbatim into config and XML.
    const tbl = tables(overviewOf(aSolution({ tables: [] })))[0];
    expect(tbl.rows[0][1]).toEqual([{ type: 'code', value: 'AcmeWidgets' }]);
    expect(tbl.rows[0][4]).toEqual([{ type: 'code', value: 'acme' }]);
  });

  it('reports managed state as a word, not a boolean', () => {
    const managed = tables(overviewOf(aSolution({ tables: [], isManaged: true })))[0];
    const unmanaged = tables(overviewOf(aSolution({ tables: [], isManaged: false })))[0];
    expect(managed.rows[0][5]).toEqual([{ type: 'text', value: 'Yes' }]);
    expect(unmanaged.rows[0][5]).toEqual([{ type: 'text', value: 'No' }]);
  });

  it('puts one row per solution', () => {
    const tbl = tables(overviewOf(
      aSolution({ uniqueName: 'AcmeWidgets', tables: [] }),
      aSolution({ uniqueName: 'AcmeParts', tables: [] })
    ))[0];
    expect(tbl.rows.map(r => (r[1][0] as { value: string }).value)).toEqual(['AcmeWidgets', 'AcmeParts']);
  });
});

describe('renderOverview — summary counts', () => {
  it('lists only components that are actually present', () => {
    // The overview doubles as a "what's in this solution" answer, so a row for a
    // component the client does not use is worse than no row.
    const counts = summaryCounts(renderOverview([aSolution({ tables: [] })], [aFlow()], []));
    expect(Object.keys(counts)).toEqual(['Flows']);
  });

  it('counts every component type it is given', () => {
    const counts = summaryCounts(renderOverview(
      [aSolution({ tables: [] })],
      [aFlow(), aFlow()],
      [aPluginAssembly({ steps: [aPluginStep(), aPluginStep()] })],
      [aWebResource()],
      [aClassicWorkflow()],
      [aBusinessRule()],
      [aSecurityRole()],
      [anEnvironmentVariable()],
      [aGlobalChoice()],
      [anEmailTemplate()],
      [aModelDrivenApp()],
      [aConnectionReference(), aConnectionReference()]
    ));
    expect(counts).toEqual({
      'Business Rules': '1',
      'Classic Workflows': '1',
      'Connection References': '2',
      'Email Templates': '1',
      'Environment Variables': '1',
      'Flows': '2',
      'Global Choices': '1',
      'Model-Driven Apps': '1',
      'Plugin Assemblies': '1',
      'Plugin Steps': '2',
      'Security Roles': '1',
      'Web Resources (JS)': '1',
    });
  });

  it('lists the summary rows alphabetically', () => {
    // The row order is a fixed alphabetical list rather than parse order, so the
    // page is stable across runs and diffs cleanly in the wiki.
    const counts = summaryCounts(renderOverview(
      [aSolution({ tables: [] })], [aFlow()], [], [], [], [aBusinessRule()], [], [], [], [], [], [aConnectionReference()]
    ));
    expect(Object.keys(counts)).toEqual(['Business Rules', 'Connection References', 'Flows']);
  });

  it('separates custom tables from extended standard ones', () => {
    const counts = summaryCounts(overviewOf(aSolution({
      tables: [
        aTable({ logicalName: 'acme_widget', isCustom: true, columns: [] }),
        aTable({ logicalName: 'acme_part', isCustom: true, columns: [] }),
        aTable({ logicalName: 'account', isCustom: false, columns: [] }),
      ],
    })));
    expect(counts['Custom Tables']).toBe('2');
    expect(counts['Extended Standard Tables']).toBe('1');
  });

  it('counts only custom columns', () => {
    // Every extended standard table drags in its stock columns; counting them
    // would make "Custom Columns" meaningless as a measure of the build.
    const counts = summaryCounts(overviewOf(aSolution({
      tables: [aTable({
        columns: [
          aColumn({ logicalName: 'acme_serial', isCustom: true }),
          aColumn({ logicalName: 'acme_tier', isCustom: true }),
          aColumn({ logicalName: 'name', isCustom: false }),
        ],
      })],
    })));
    expect(counts['Custom Columns']).toBe('2');
  });

  it('counts only custom relationships', () => {
    const counts = summaryCounts(overviewOf(aSolution({
      tables: [aTable({
        logicalName: 'acme_part',
        columns: [],
        relationships: [
          aRelationship({ name: 'acme_widget_acme_part', referencingEntity: 'acme_part', isCustom: true }),
          aRelationship({ name: 'account_acme_part', referencingEntity: 'acme_part', isCustom: false }),
        ],
      })],
    })));
    expect(counts['Custom Relationships']).toBe('1');
  });

  it('counts a relationship once, from the table that holds the lookup', () => {
    // The same relationship appears on both the referencing and referenced
    // table's IR, so counting every occurrence would double the number.
    const rel = aRelationship({ referencingEntity: 'acme_part', referencedEntity: 'acme_widget', isCustom: true });
    const counts = summaryCounts(overviewOf(aSolution({
      tables: [
        aTable({ logicalName: 'acme_widget', columns: [], relationships: [rel] }),
        aTable({ logicalName: 'acme_part', columns: [], relationships: [rel] }),
      ],
    })));
    expect(counts['Custom Relationships']).toBe('1');
  });

  it('matches the owning table case-insensitively when counting relationships', () => {
    // Solution XML is not consistent about casing; a case-sensitive compare would
    // drop the relationship from the count entirely.
    const counts = summaryCounts(overviewOf(aSolution({
      tables: [aTable({
        logicalName: 'acme_part',
        columns: [],
        relationships: [aRelationship({ referencingEntity: 'ACME_Part', isCustom: true })],
      })],
    })));
    expect(counts['Custom Relationships']).toBe('1');
  });

  it('totals forms and views across every table', () => {
    const counts = summaryCounts(overviewOf(aSolution({
      tables: [
        aTable({ logicalName: 'acme_widget', columns: [], forms: [aForm(), aForm()], views: [aView()] }),
        aTable({ logicalName: 'acme_part', columns: [], forms: [aForm()], views: [aView(), aView()] }),
      ],
    })));
    expect(counts['Forms']).toBe('3');
    expect(counts['Views']).toBe('3');
  });

  it('aggregates tables across multiple solutions', () => {
    const counts = summaryCounts(overviewOf(
      aSolution({ uniqueName: 'AcmeWidgets', tables: [aTable({ logicalName: 'acme_widget', columns: [aColumn()] })] }),
      aSolution({ uniqueName: 'AcmeParts', tables: [aTable({ logicalName: 'acme_part', columns: [aColumn()] })] })
    ));
    expect(counts['Custom Tables']).toBe('2');
    expect(counts['Custom Columns']).toBe('2');
  });

  it('ignores plugin assemblies with a blank name and their steps', () => {
    // The plugin parser can emit a placeholder assembly with no name when the
    // solution references one it cannot resolve; counting it would overstate.
    const counts = summaryCounts(renderOverview(
      [aSolution({ tables: [] })],
      [],
      [
        aPluginAssembly({ assemblyName: 'Acme.Widgets.Plugins', steps: [aPluginStep()] }),
        aPluginAssembly({ assemblyName: '   ', steps: [aPluginStep(), aPluginStep()] }),
      ]
    ));
    expect(counts['Plugin Assemblies']).toBe('1');
    expect(counts['Plugin Steps']).toBe('1');
  });

  it('counts only JavaScript web resources', () => {
    // The row is labelled "Web Resources (JS)" — images and CSS are excluded by design.
    const counts = summaryCounts(renderOverview(
      [aSolution({ tables: [] })], [], [],
      [
        aWebResource({ name: 'acme_/Scripts/Widget.js' }),
        aWebResource({ name: 'acme_/Styles/site.css', resourceType: 'CSS' }),
        aWebResource({ name: 'acme_/Images/logo.png', resourceType: 'PNG' }),
      ]
    ));
    expect(counts['Web Resources (JS)']).toBe('1');
  });

  it('defaults every optional component list to empty', () => {
    // The pipeline calls this with a growing argument list; older call sites must
    // not blow up or count undefined.
    const counts = summaryCounts(renderOverview([aSolution({ tables: [] })], [], []));
    expect(counts).toEqual({});
  });
});

describe('writeOverviewMarkdown', () => {
  let outDir: string;

  beforeEach(() => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'padocs-overview-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(outDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('writes overview.md, creating the directory if needed', () => {
    const nested = path.join(outDir, 'deep');
    writeOverviewMarkdown(aSolution(), nested);
    expect(fs.readFileSync(path.join(nested, 'overview.md'), 'utf-8')).toContain('Acme Widgets');
  });

  it('normalises CRLF so the file has consistent line endings on every agent OS', () => {
    writeOverviewMarkdown(aSolution(), outDir);
    expect(fs.readFileSync(path.join(outDir, 'overview.md'), 'utf-8')).not.toContain('\r\n');
  });
});
