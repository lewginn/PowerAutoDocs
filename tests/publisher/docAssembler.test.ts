// tests/publisher/docAssembler.test.ts
//
// buildWordDocument() assembles every section of the Word document. Nothing has
// ever tested a full assembly, so this asserts on the real artifact: IR in ->
// .docx on disk -> unzip -> word/document.xml, the same unzip-and-read approach
// DocxSerializer.test.ts established. Asserting on the block array instead would
// pin the docx library's builder objects rather than what Word opens.
//
// BROWSER SAFETY. buildWordDocument calls resolveChromeExecutable() and, when it
// succeeds, wires a renderer that launches a real Chrome and writes PNGs into
// .powerautodocs-diagram-cache/ — a real client-data path that exists in this
// repo. Chrome IS installed on a dev machine, so "the test didn't ask for
// diagrams" is not on its own a guarantee. Two independent belts here:
//
//   1. POWERAUTODOCS_CHROME_PATH is stubbed to a path that does not exist for
//      EVERY test, which makes resolveChromeExecutable() throw before any launch.
//   2. The default config used by these tests sets output.wordDiagrams: false,
//      so the resolve is not even attempted.
//
// Either alone suffices; both together mean no test in this file can launch a
// browser even if it is edited carelessly later. afterEach then proves it by
// checking the cache directory was not touched. It deliberately compares against
// a snapshot rather than asserting absence — the directory already exists here
// and holds real client renders, so this file must never create OR delete it.
//
// Everything on disk goes to an mkdtemp dir. Nothing is written into the repo.

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildWordDocument } from '../../src/publisher/docAssembler.js';
import type { DocGenConfig } from '../../src/config/index.js';
import type {
  SolutionModel, FlowModel, PluginAssemblyModel, WebResourceModel,
  SecurityRoleModel, ClassicWorkflowModel, BusinessRuleModel,
  EnvironmentVariableModel, GlobalChoiceModel, EmailTemplateModel,
  ModelDrivenAppModel, ConnectionReferenceModel, PowerPagesModel,
} from '../../src/ir/index.js';
import { aConfig } from '../fixtures/config.js';
import {
  aTable, aColumn, aView, aForm, aRelationship, aFlow, aPluginAssembly,
  aWebResource, aSecurityRole, aBusinessRule, aClassicWorkflow, aGlobalChoice,
  anEmailTemplate, aConnectionReference, anEnvironmentVariable, aModelDrivenApp,
  aSolution,
} from '../fixtures/ir.js';

const DIAGRAM_CACHE = path.join(process.cwd(), '.powerautodocs-diagram-cache');

let dir: string;
let cacheSnapshot: string[] | null;

/** Entry names of the diagram cache, or null when it does not exist. */
const readCache = (): string[] | null =>
  fs.existsSync(DIAGRAM_CACHE) ? fs.readdirSync(DIAGRAM_CACHE).sort() : null;

beforeAll(() => {
  cacheSnapshot = readCache();
});

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'padocs-docassembler-'));
  // Belt 1: no browser can be resolved, so none can be launched.
  vi.stubEnv('POWERAUTODOCS_CHROME_PATH', path.join(dir, 'no-such-chrome'));
});

afterEach(() => {
  // Proof that nothing launched a browser or rendered a diagram: the real
  // client-data cache directory is byte-for-byte the same set of entries it was
  // before this file ran. Never rm it — it is not ours.
  expect(readCache()).toEqual(cacheSnapshot);

  fs.rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// -----------------------------------------------
// Harness
// -----------------------------------------------

interface Args {
  config?: DocGenConfig;
  solutions?: SolutionModel[];
  mergedSolution?: SolutionModel;
  flows?: FlowModel[];
  pluginAssemblies?: PluginAssemblyModel[];
  webResources?: WebResourceModel[];
  classicWorkflows?: ClassicWorkflowModel[];
  businessRules?: BusinessRuleModel[];
  securityRoles?: SecurityRoleModel[];
  envVars?: EnvironmentVariableModel[];
  connectionRefs?: ConnectionReferenceModel[];
  globalChoices?: GlobalChoiceModel[];
  emailTemplates?: EmailTemplateModel[];
  modelDrivenApps?: ModelDrivenAppModel[];
  powerPages?: PowerPagesModel[];
  outputPath?: string;
}

/** Belt 2: diagrams off unless a test is deliberately exercising the warn path. */
const noDiagrams = () => aConfig({ output: { wordDiagrams: false } });

async function build(args: Args = {}): Promise<string> {
  const solutions = args.solutions ?? [aSolution()];
  const outputPath = args.outputPath ?? path.join(dir, 'out.docx');
  await buildWordDocument(
    args.config ?? noDiagrams(),
    solutions,
    args.mergedSolution ?? solutions[0],
    args.flows ?? [],
    args.pluginAssemblies ?? [],
    args.webResources ?? [],
    args.classicWorkflows ?? [],
    args.businessRules ?? [],
    args.securityRoles ?? [],
    args.envVars ?? [],
    args.connectionRefs ?? [],
    args.globalChoices ?? [],
    args.emailTemplates ?? [],
    args.modelDrivenApps ?? [],
    args.powerPages ?? [],
    outputPath,
  );
  return outputPath;
}

/** Read the .docx back off disk — proving the file itself, not an in-memory buffer. */
const openDocx = (file: string): AdmZip => new AdmZip(fs.readFileSync(file));

/** IR -> .docx on disk -> the XML Word actually reads. */
async function buildXml(args: Args = {}): Promise<string> {
  return openDocx(await build(args)).readAsText('word/document.xml');
}

interface Heading { level: number; text: string }

/**
 * Every heading paragraph, in document order, with its Word style level.
 *
 * Walks whole <w:p> elements rather than matching pStyle-then-text across the
 * document: a lazy `.*?` between them would happily run past a heading that has
 * no run of its own and pick up the next paragraph's text. \b after w:p excludes
 * <w:pPr>/<w:pStyle>, since p->P is not a word boundary.
 */
function headings(xml: string): Heading[] {
  const out: Heading[] = [];
  for (const para of xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
    const style = para[1].match(/<w:pStyle w:val="Heading(\d)"\/>/);
    if (!style) continue;
    const text = [...para[1].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('');
    out.push({ level: Number(style[1]), text });
  }
  return out;
}

const headingTexts = (xml: string): string[] => headings(xml).map(h => h.text);

/** Section titles are exactly the Heading1s — everything else is offset below. */
const sectionTitles = (xml: string): string[] =>
  headings(xml).filter(h => h.level === 1).map(h => h.text);

const levelOf = (xml: string, text: string): number | undefined =>
  headings(xml).find(h => h.text === text)?.level;

/**
 * The count Overview's Summary table reports for a component label.
 *
 * Reads whole <w:tc> cells and pairs label->next cell, rather than regexing
 * across the row: the counts are the only place the assembler's own filtering
 * is visible as a number a client reads, so it must not be matched loosely.
 * Returns the FIRST match, and Overview is the first section in the document.
 */
function summaryCount(xml: string, label: string): string | undefined {
  const cells = [...xml.matchAll(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g)].map(tc =>
    [...tc[1].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('')
  );
  const i = cells.indexOf(label);
  return i === -1 ? undefined : cells[i + 1];
}

// -----------------------------------------------
// Fixtures — a small but complete Acme Widgets solution
// -----------------------------------------------

const widget = () => aTable({
  logicalName: 'acme_widget',
  displayName: 'Widget',
  columns: [aColumn()],
  views: [aView()],
  forms: [aForm()],
  relationships: [aRelationship()],
});

const part = () => aTable({
  logicalName: 'acme_part',
  displayName: 'Part',
  pluralDisplayName: 'Parts',
  columns: [aColumn({ logicalName: 'acme_partname', displayName: 'Part Name' })],
  relationships: [aRelationship()],
});

/** Two related custom tables — enough for generateERDiagram to emit an ERD. */
const twoTableSolution = () => aSolution({ tables: [widget(), part()] });

// -----------------------------------------------

describe('buildWordDocument — writing the file', () => {
  it('writes a readable .docx, creating parent directories that do not exist', async () => {
    // The configured output path is client-chosen and routinely nests into a
    // fresh output/ dir on a clean ADO agent. Without recursive mkdir the very
    // last step of the whole run throws ENOENT.
    const out = path.join(dir, 'deep', 'nested', 'Solution.docx');
    await build({ outputPath: out });

    expect(fs.existsSync(out)).toBe(true);
    expect(fs.statSync(out).size).toBeGreaterThan(0);

    const names = openDocx(out).getEntries().map(e => e.entryName);
    expect(names).toContain('word/document.xml');
    expect(names).toContain('word/styles.xml');
    expect(names).toContain('[Content_Types].xml');
  });

  it('opens with a table of contents Word populates on open', async () => {
    const zip = openDocx(await build());
    expect(zip.readAsText('word/document.xml')).toContain('TOC');
    expect(zip.readAsText('word/settings.xml')).toContain('updateFields');
  });

  it('produces a document for a solution with nothing in it rather than throwing', async () => {
    // A brand-new or fully-filtered solution must still yield an openable file.
    const xml = await buildXml({ solutions: [aSolution({ tables: [] })] });
    expect(headingTexts(xml)).toContain('Overview');
  });
});

describe('buildWordDocument — section order', () => {
  it('emits every section once, in the documented order', async () => {
    const xml = await buildXml({
      mergedSolution: twoTableSolution(),
      solutions: [twoTableSolution()],
      flows: [aFlow()],
      pluginAssemblies: [aPluginAssembly()],
      webResources: [aWebResource()],
      classicWorkflows: [aClassicWorkflow()],
      businessRules: [aBusinessRule()],
      securityRoles: [aSecurityRole()],
      envVars: [anEnvironmentVariable()],
      connectionRefs: [aConnectionReference()],
      globalChoices: [aGlobalChoice()],
      emailTemplates: [anEmailTemplate()],
      modelDrivenApps: [aModelDrivenApp()],
    });

    expect(sectionTitles(xml)).toEqual([
      'Overview',
      'Data Model',
      'Automation',
      'Custom Code',
      'Security Roles',
      'Integrations',
      'Global Choices',
      'Email Templates',
      'Model-Driven Apps',
    ]);
  });
});

describe('buildWordDocument — heading offsets', () => {
  // The offsets are the contract this file exists to enforce. Renderers all emit
  // h(1) for their own title because they are shared with the wiki, where each
  // one is its own page. Word is one continuous document, so the offset is the
  // only thing slotting them into a hierarchy — and a wrong one still produces a
  // perfectly valid .docx with a silently wrong TOC.

  it('puts a table one level below Data Model, and its subpages one below that', async () => {
    const xml = await buildXml({ mergedSolution: twoTableSolution(), solutions: [twoTableSolution()] });

    expect(levelOf(xml, 'Data Model')).toBe(1);
    expect(levelOf(xml, 'Widget')).toBe(2);
    expect(levelOf(xml, 'Widget — Columns')).toBe(3);
    expect(levelOf(xml, 'Widget — Views')).toBe(3);
    expect(levelOf(xml, 'Widget — Forms')).toBe(3);
    expect(levelOf(xml, 'Widget — Relationships')).toBe(3);
  });

  it('nests each table under Data Model in order, subpages under their own table', async () => {
    const xml = await buildXml({ mergedSolution: twoTableSolution(), solutions: [twoTableSolution()] });
    const inDataModel = headings(xml)
      .slice(headings(xml).findIndex(h => h.text === 'Data Model'))
      .filter(h => h.level <= 3);

    expect(inDataModel.map(h => `${h.level}:${h.text}`)).toEqual([
      '1:Data Model',
      '2:Widget',
      '3:Widget — Columns',
      '3:Widget — Views',
      '3:Widget — Forms',
      '3:Widget — Relationships',
      '2:Part',
      '3:Part — Columns',
      '3:Part — Views',
      '3:Part — Forms',
      '3:Part — Relationships',
    ]);
  });

  it('puts an individual business rule one level below the table Business Rules page', async () => {
    const xml = await buildXml({
      mergedSolution: aSolution({ tables: [widget()] }),
      businessRules: [aBusinessRule({ name: 'Require Serial' })],
    });

    expect(levelOf(xml, 'Widget — Business Rules')).toBe(3);
    expect(levelOf(xml, 'Require Serial')).toBe(4);
  });

  it('puts flows below Automation and each flow below the flow summary', async () => {
    const xml = await buildXml({ flows: [aFlow({ name: 'Create Part On Widget Create' })] });

    expect(levelOf(xml, 'Automation')).toBe(1);
    expect(levelOf(xml, 'Power Automate Flows')).toBe(2);
    expect(levelOf(xml, 'Create Part On Widget Create')).toBe(3);
    // renderSingleFlow's own h(2) subsections land one deeper again.
    expect(levelOf(xml, 'Trigger')).toBe(4);
    expect(levelOf(xml, 'Actions')).toBe(4);
  });

  it('puts a plugin type below its assembly, below the plugin summary, below Automation', async () => {
    const xml = await buildXml({ pluginAssemblies: [aPluginAssembly()] });

    expect(levelOf(xml, 'Automation')).toBe(1);
    expect(levelOf(xml, 'Plugin Assemblies')).toBe(2);
    expect(levelOf(xml, 'Acme.Widgets.Plugins')).toBe(3);
    // The assembly-name prefix is stripped for the per-type heading.
    expect(levelOf(xml, 'WidgetPostOperation')).toBe(4);
  });

  it('puts a classic workflow below the Classic Workflows subsection, below Automation', async () => {
    const xml = await buildXml({ classicWorkflows: [aClassicWorkflow()] });

    expect(levelOf(xml, 'Automation')).toBe(1);
    // h(1,'Classic Workflows') is pushed at offset 1 by the assembler itself,
    // not by a renderer — so nothing else in the suite pins it.
    expect(levelOf(xml, 'Classic Workflows')).toBe(2);
    expect(levelOf(xml, 'Stamp Widget Approval')).toBe(3);
  });

  it('puts a web resource below the summary, below Custom Code', async () => {
    const xml = await buildXml({ webResources: [aWebResource()] });

    expect(levelOf(xml, 'Custom Code')).toBe(1);
    expect(levelOf(xml, 'Web Resources')).toBe(2);
    // renderWebResourceDetail titles on the basename of resource.name.
    expect(levelOf(xml, 'Widget.js')).toBe(3);
    // Its own h(2) subsection rides one deeper again.
    expect(levelOf(xml, 'Metadata')).toBe(4);
  });

  it('puts a security role below Security Roles, and a global choice below Global Choices', async () => {
    const xml = await buildXml({
      securityRoles: [aSecurityRole({ name: 'Widget Manager' })],
      globalChoices: [aGlobalChoice({ displayName: 'Widget Tier' })],
      emailTemplates: [anEmailTemplate({ title: 'Widget Shipped' })],
      modelDrivenApps: [aModelDrivenApp({ displayName: 'Widget Hub' })],
    });

    expect(levelOf(xml, 'Security Roles')).toBe(1);
    expect(levelOf(xml, 'Widget Manager')).toBe(2);
    expect(levelOf(xml, 'Global Choices')).toBe(1);
    expect(levelOf(xml, 'Widget Tier')).toBe(2);
    expect(levelOf(xml, 'Email Templates')).toBe(1);
    expect(levelOf(xml, 'Widget Shipped')).toBe(2);
    expect(levelOf(xml, 'Model-Driven Apps')).toBe(1);
    expect(levelOf(xml, 'Widget Hub')).toBe(2);
  });

  it('puts environment variables and connection references below Integrations', async () => {
    const xml = await buildXml({
      envVars: [anEnvironmentVariable()],
      connectionRefs: [aConnectionReference()],
    });

    expect(levelOf(xml, 'Integrations')).toBe(1);
    expect(levelOf(xml, 'Environment Variables')).toBe(2);
    expect(levelOf(xml, 'Connection References')).toBe(2);
  });
});

describe('buildWordDocument — empty sections are omitted', () => {
  // A heading with nothing under it is the failure a client sees first: the TOC
  // promises a section and the page is blank.

  it('omits Automation entirely when there are no flows, plugins or workflows', async () => {
    const xml = await buildXml();
    expect(sectionTitles(xml)).not.toContain('Automation');
    expect(headingTexts(xml)).not.toContain('Power Automate Flows');
    expect(headingTexts(xml)).not.toContain('Plugin Assemblies');
  });

  it('emits Automation when any one of the three is present', async () => {
    expect(sectionTitles(await buildXml({ flows: [aFlow()] }))).toContain('Automation');
    expect(sectionTitles(await buildXml({ pluginAssemblies: [aPluginAssembly()] }))).toContain('Automation');
    expect(sectionTitles(await buildXml({ classicWorkflows: [aClassicWorkflow()] }))).toContain('Automation');
  });

  it('omits the Classic Workflows subsection when only flows are present', async () => {
    const xml = await buildXml({ flows: [aFlow()] });
    expect(sectionTitles(xml)).toContain('Automation');
    expect(headingTexts(xml)).not.toContain('Classic Workflows');
  });

  it('omits Custom Code when there are no web resources at all', async () => {
    expect(sectionTitles(await buildXml())).not.toContain('Custom Code');
  });

  it('omits Custom Code when web resources exist but none are JavaScript', async () => {
    // Solutions routinely carry HTML/CSS/image resources with no script at all.
    // The section is JavaScript-only, so it must not appear for them.
    const xml = await buildXml({
      webResources: [
        aWebResource({ name: 'acme_/Styles/site.css', displayName: 'site.css', resourceType: 'CSS' }),
        aWebResource({ name: 'acme_/Html/page.htm', displayName: 'page.htm', resourceType: 'HTML' }),
      ],
    });
    expect(sectionTitles(xml)).not.toContain('Custom Code');
    expect(headingTexts(xml)).not.toContain('site.css');
  });

  it('omits Security Roles, Global Choices, Email Templates and Model-Driven Apps when each is empty', async () => {
    const titles = sectionTitles(await buildXml());
    expect(titles).not.toContain('Security Roles');
    expect(titles).not.toContain('Global Choices');
    expect(titles).not.toContain('Email Templates');
    expect(titles).not.toContain('Model-Driven Apps');
  });

  it('omits Integrations when there are neither env vars nor connection references', async () => {
    expect(sectionTitles(await buildXml())).not.toContain('Integrations');
  });

  it('emits Integrations with only connection references, and only env vars', async () => {
    const connOnly = await buildXml({ connectionRefs: [aConnectionReference()] });
    expect(sectionTitles(connOnly)).toContain('Integrations');
    expect(headingTexts(connOnly)).toContain('Connection References');
    expect(headingTexts(connOnly)).not.toContain('Environment Variables');

    const varsOnly = await buildXml({ envVars: [anEnvironmentVariable()] });
    expect(headingTexts(varsOnly)).toContain('Environment Variables');
    expect(headingTexts(varsOnly)).not.toContain('Connection References');
  });

  it('omits a table Business Rules page when no rule targets that table', async () => {
    const xml = await buildXml({
      mergedSolution: aSolution({ tables: [widget()] }),
      businessRules: [aBusinessRule({ entity: 'acme_part', name: 'Part Rule' })],
    });
    expect(headingTexts(xml)).not.toContain('Widget — Business Rules');
    expect(headingTexts(xml)).not.toContain('Part Rule');
  });

  it('omits the Used By Flows page for a table no flow touches', async () => {
    const xml = await buildXml({
      mergedSolution: aSolution({ tables: [widget()] }),
      flows: [aFlow({
        trigger: { name: 'Manual', type: 'Manual', description: 'Runs on demand.' },
        actions: [],
      })],
    });
    expect(headingTexts(xml)).not.toContain('Widget — Used By Flows');
  });

  it('emits the Used By Flows page for a table a flow triggers on', async () => {
    const xml = await buildXml({
      mergedSolution: aSolution({ tables: [widget()] }),
      flows: [aFlow()],
    });
    expect(levelOf(xml, 'Widget — Used By Flows')).toBe(3);
  });

  it('omits Data Model entirely when there are no tables and no ERD', async () => {
    // Was pinned: every other section guards on its IR being non-empty; Data
    // Model was pushed unconditionally. A solution with zero tables shipped a
    // "Data Model" TOC entry pointing at a heading with nothing beneath it —
    // exactly the empty-section defect every other guard in this file exists
    // to prevent.
    const xml = await buildXml({ solutions: [aSolution({ tables: [] })] });
    expect(sectionTitles(xml)).not.toContain('Data Model');
    expect(sectionTitles(xml)).toEqual(['Overview']);
  });

  it('still emits Data Model when there are tables, even with no qualifying ERD relationships', async () => {
    // The guard must not over-fire: tables alone are reason enough for the
    // section to exist, independent of whether an ERD diagram qualifies.
    const xml = await buildXml({
      mergedSolution: aSolution({ tables: [widget()] }),
    });
    expect(sectionTitles(xml)).toContain('Data Model');
  });
});

describe('buildWordDocument — plugin assemblies', () => {
  it('filters out an assembly whose name is blank', async () => {
    // Unpacked solutions carry placeholder <PluginAssembly> entries with an empty
    // name; rendering one produces a heading that is literally blank in the TOC.
    // No tables, so the only Heading3s in the document are assembly names.
    const xml = await buildXml({
      mergedSolution: aSolution({ tables: [] }),
      solutions: [aSolution({ tables: [] })],
      pluginAssemblies: [
        aPluginAssembly(),
        aPluginAssembly({ assemblyName: '   ', pluginTypeNames: [], steps: [] }),
      ],
    });

    const assemblyHeadings = headings(xml).filter(h => h.level === 3);
    expect(assemblyHeadings.map(h => h.text)).toEqual(['Acme.Widgets.Plugins']);
    expect(headingTexts(xml).some(t => t.trim() === '')).toBe(false);
  });

  it('does not count a blank-named assembly in the Overview summary', async () => {
    // The Overview count is the one place the blank-name filtering is visible to
    // a client as a NUMBER rather than a missing heading — "Plugin Assemblies: 2"
    // above a section listing one is the report contradicting itself.
    //
    // Note the assembler filters at docAssembler.ts:122 AND renderOverview
    // filters again at overviewRenderer.ts:50, so either layer alone satisfies
    // this. It pins the composed guarantee, which is what the client reads.
    const xml = await buildXml({
      pluginAssemblies: [
        aPluginAssembly(),
        aPluginAssembly({ assemblyName: '  ', pluginTypeNames: [], steps: [] }),
      ],
    });

    expect(summaryCount(xml, 'Plugin Assemblies')).toBe('1');
  });

  it('omits Automation when the only assembly present has a blank name', async () => {
    // The blank one is filtered before hasPlugins is computed, so there is
    // nothing to put under an Automation heading.
    const xml = await buildXml({
      pluginAssemblies: [aPluginAssembly({ assemblyName: '', pluginTypeNames: [], steps: [] })],
    });
    expect(sectionTitles(xml)).not.toContain('Automation');
  });
});

describe('buildWordDocument — component toggles', () => {
  it('includes views, forms and relationships when all three are on', async () => {
    const xml = await buildXml({
      config: aConfig({ output: { wordDiagrams: false } }),
      mergedSolution: aSolution({ tables: [widget()] }),
    });
    expect(headingTexts(xml)).toContain('Widget — Views');
    expect(headingTexts(xml)).toContain('Widget — Forms');
    expect(headingTexts(xml)).toContain('Widget — Relationships');
  });

  it('drops each subpage when its component toggle is off', async () => {
    const cases: [keyof DocGenConfig['components'], string][] = [
      ['views', 'Widget — Views'],
      ['forms', 'Widget — Forms'],
      ['relationships', 'Widget — Relationships'],
    ];

    for (const [component, heading] of cases) {
      const xml = await buildXml({
        config: aConfig({ output: { wordDiagrams: false }, components: { [component]: false } }),
        mergedSolution: aSolution({ tables: [widget()] }),
      });
      expect(headingTexts(xml), `${component}: false`).not.toContain(heading);
      // The columns page is not gated, so this is a targeted drop, not a wipe.
      expect(headingTexts(xml)).toContain('Widget — Columns');
    }
  });

  it('still emits the table itself when every optional component is off', async () => {
    const xml = await buildXml({
      config: aConfig({
        output: { wordDiagrams: false },
        components: { views: false, forms: false, relationships: false },
      }),
      mergedSolution: aSolution({ tables: [widget()] }),
    });
    // From Data Model onwards: the table and its columns page survive, and
    // 'Custom Columns' is renderTableColumns' own h(2) riding along at offset 2.
    const fromDataModel = headingTexts(xml).slice(headingTexts(xml).indexOf('Data Model'));
    expect(fromDataModel).toEqual(['Data Model', 'Widget', 'Widget — Columns', 'Custom Columns']);
  });
});

describe('buildWordDocument — business rules matched to tables', () => {
  it('matches a rule to its table case-insensitively on entity vs logicalName', async () => {
    // Parsers read the entity name straight out of XML, where casing is not
    // guaranteed to match the table's logicalName. A case-sensitive compare would
    // silently drop every rule for that table — no error, just a missing page.
    const xml = await buildXml({
      mergedSolution: aSolution({ tables: [aTable({ logicalName: 'ACME_Widget', displayName: 'Widget' })] }),
      businessRules: [aBusinessRule({ entity: 'acme_widget', name: 'Require Serial' })],
    });

    expect(headingTexts(xml)).toContain('Widget — Business Rules');
    expect(levelOf(xml, 'Require Serial')).toBe(4);
  });

  it('files each rule under only its own table', async () => {
    const xml = await buildXml({
      mergedSolution: twoTableSolution(),
      businessRules: [
        aBusinessRule({ entity: 'acme_widget', name: 'Widget Rule' }),
        aBusinessRule({ entity: 'acme_part', name: 'Part Rule' }),
      ],
    });

    const order = headingTexts(xml);
    // Widget Rule sits between the Widget business-rules page and the Part heading.
    expect(order.indexOf('Widget Rule')).toBeGreaterThan(order.indexOf('Widget — Business Rules'));
    expect(order.indexOf('Widget Rule')).toBeLessThan(order.indexOf('Part'));
    expect(order.indexOf('Part Rule')).toBeGreaterThan(order.indexOf('Part — Business Rules'));
  });
});

describe('buildWordDocument — mermaid degradation', () => {
  // These are the only tests that let resolveChromeExecutable() be called at all.
  // POWERAUTODOCS_CHROME_PATH points at a nonexistent file (stubbed in beforeEach),
  // so it throws and the degraded path runs. No browser is reachable.

  it('warns once and still produces a document when no browser can be found', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const xml = await buildXml({
      config: aConfig({ output: { wordDiagrams: true } }),
      mergedSolution: twoTableSolution(),
      solutions: [twoTableSolution()],
    });

    // "Once" is the contract, not just "at least once": the check is hoisted out
    // of the per-diagram loop precisely so a solution with 50 diagrams does not
    // print 50 identical warnings. Asserting only toContain would not notice.
    const skipped = warn.mock.calls
      .map(c => String(c[0]))
      .filter(m => m.includes('Mermaid diagrams skipped'));
    expect(skipped).toHaveLength(1);
    expect(sectionTitles(xml)).toContain('Data Model');
    expect(xml).not.toContain('<w:drawing>');
  });

  it('does not warn when diagrams are switched off in config', async () => {
    // wordDiagrams: false is a deliberate choice, not a degradation — telling the
    // client their diagrams were "skipped" would read as a failure.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await buildXml({ config: aConfig({ output: { wordDiagrams: false } }) });
    expect(warn.mock.calls.map(c => String(c[0])).join('\n')).not.toContain('Mermaid diagrams skipped');
  });

  it('drops the orphaned Diagram heading a skipped flow diagram would leave behind', async () => {
    // dropOrphanedDiagramHeadings exists for exactly this. renderSingleFlow emits
    // h(2,'Diagram') immediately followed by the mermaid node; with no renderer the
    // node vanishes in the serializer, so without the drop the client gets a
    // "Diagram" heading and TOC entry with nothing under it.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const xml = await buildXml({
      config: aConfig({ output: { wordDiagrams: true } }),
      flows: [aFlow({ mermaidDiagram: 'graph TD;\n  A-->B;' })],
    });

    expect(headingTexts(xml)).not.toContain('Diagram');
    expect(xml).not.toContain('<w:drawing>');
    // The rest of the flow page is untouched — this drops one heading, not a section.
    expect(headingTexts(xml)).toContain('Trigger');
    expect(headingTexts(xml)).toContain('Actions');
  });

  it('drops the Diagram heading on the wordDiagrams: false path too', async () => {
    const xml = await buildXml({
      config: aConfig({ output: { wordDiagrams: false } }),
      flows: [aFlow({ mermaidDiagram: 'graph TD;\n  A-->B;' })],
    });
    expect(headingTexts(xml)).not.toContain('Diagram');
  });

  it('keeps a heading that is not followed by a diagram', async () => {
    // The drop is positional — only a heading immediately before a mermaid node
    // goes. A flow with no diagram must keep every heading it has.
    const xml = await buildXml({ flows: [aFlow({ mermaidDiagram: undefined })] });
    expect(headingTexts(xml)).toContain('Trigger');
    expect(headingTexts(xml)).toContain('Actions');
    expect(headingTexts(xml)).not.toContain('Diagram');
  });

  it('emits no diagram image anywhere in a full degraded assembly', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const xml = await buildXml({
      config: aConfig({ output: { wordDiagrams: true } }),
      mergedSolution: twoTableSolution(),
      solutions: [twoTableSolution()],
      flows: [aFlow({ mermaidDiagram: 'graph TD;\n  A-->B;' })],
    });
    expect(xml).not.toContain('<w:drawing>');
    expect(xml).not.toContain('graph TD;');
    // Content still assembled — degradation is not a failure.
    expect(sectionTitles(xml)).toEqual(['Overview', 'Data Model', 'Automation']);
  });
});

describe('buildWordDocument — content reaches the document', () => {
  it('carries table, flow and role detail through to the XML, not just headings', async () => {
    // Headings alone would pass even if every renderer returned only its title.
    const xml = await buildXml({
      mergedSolution: aSolution({ tables: [widget()] }),
      flows: [aFlow()],
      securityRoles: [aSecurityRole()],
    });

    expect(xml).toContain('acme_widget');
    expect(xml).toContain('Widget Name');
    expect(xml).toContain('Active Widgets');
    expect(xml).toContain('Create a part');
    expect(xml).toContain('Widget Manager');
    expect(xml).toContain('<w:tbl>');
  });

  it('leaves no toc_placeholder marker in the Word output', async () => {
    // renderTableIndex emits toc() for the wiki's subpage table; in Word the
    // subpages follow inline, so the marker must leave no trace.
    //
    // HONEST LIMIT: this cannot fail on any single-layer regression, and does not
    // guard the assembler's own filter. '[[_TOSP_]]' is a MarkdownSerializer
    // string (MarkdownSerializer.ts:93); DocxSerializer returns [] for
    // toc_placeholder unconditionally (DocxSerializer.ts:572), so deleting the
    // assembler's .filter(n => n.type !== 'toc_placeholder') keeps this green —
    // verified by mutation. It is kept as a cheap end-to-end guard against a
    // future serializer that renders the marker as text, not as a filter test.
    // The filter itself is genuinely redundant; that is a source observation, not
    // a test gap, so it is reported rather than fixed here.
    const xml = await buildXml({ mergedSolution: aSolution({ tables: [widget()] }) });
    expect(xml).not.toContain('TOSP');
    // Non-vacuous half: the index's inline content really did survive the filter,
    // so the filter is not silently eating the table index along with the marker.
    expect(headingTexts(xml)).toContain('Widget — Columns');
  });
});
