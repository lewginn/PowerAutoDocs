import { describe, it, expect, vi } from 'vitest';
import { buildWikiPages } from '../../src/publisher/wikiAssembler.js';
import { toADOWikiLink } from '../../src/renderers/rendererUtils.js';
import type { WikiPage } from '../../src/publisher/wikiPublisher.js';
import type { DocGenConfig } from '../../src/config/index.js';
import type {
  BusinessRuleModel, ClassicWorkflowModel, ConnectionReferenceModel,
  EmailTemplateModel, EnvironmentVariableModel, FlowModel, GlobalChoiceModel,
  ModelDrivenAppModel, PluginAssemblyModel, SecurityRoleModel, SolutionModel,
  WebResourceModel,
} from '../../src/ir/index.js';
import {
  aBusinessRule, aClassicWorkflow, aConnectionReference, aFlow, aGlobalChoice,
  aModelDrivenApp, aPluginAssembly, aPluginStep, aRelationship, aSecurityRole,
  aSolution, aTable, aTrigger, aWebResource, anAction, anEmailTemplate,
  anEnvironmentVariable,
} from '../fixtures/ir.js';
import { aConfig } from '../fixtures/config.js';

// -----------------------------------------------
// Helpers
// -----------------------------------------------

// CONFIG_DEFAULTS has no `wiki` key at all (wiki config only exists once a client
// supplies one), so every test that expects pages must opt in explicitly.
const withWiki = (parentPath = '/Docs', over: Parameters<typeof aConfig>[0] = {}): DocGenConfig =>
  aConfig({
    ...over,
    wiki: {
      organisation: 'acme-org',
      project: 'Widgets',
      wikiIdentifier: 'Widgets.wiki',
      parentPath,
      pat: 'fake-pat-for-tests',
    },
  });

interface BuildArgs {
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
}

/** buildWikiPages takes 14 positional args; naming them keeps the tests readable. */
const build = (a: BuildArgs = {}): WikiPage[] => buildWikiPages(
  a.config ?? withWiki(),
  a.solutions ?? [aSolution()],
  a.mergedSolution ?? aSolution({ tables: [] }),
  a.flows ?? [],
  a.pluginAssemblies ?? [],
  a.webResources ?? [],
  a.classicWorkflows ?? [],
  a.businessRules ?? [],
  a.securityRoles ?? [],
  a.envVars ?? [],
  a.connectionRefs ?? [],
  a.globalChoices ?? [],
  a.emailTemplates ?? [],
  a.modelDrivenApps ?? [],
);

const paths = (pages: WikiPage[]): string[] => pages.map(p => p.path);
const contentAt = (pages: WikiPage[], path: string): string | undefined =>
  pages.find(p => p.path === path)?.content;

// -----------------------------------------------

describe('buildWikiPages — wiki config gate', () => {
  it('produces nothing at all when no wiki is configured', () => {
    // Not "an empty Overview" — the whole publisher must be a no-op, because the
    // caller uses the returned array to decide whether to hit the ADO API.
    expect(build({ config: aConfig(), mergedSolution: aSolution() })).toEqual([]);
  });
});

describe('buildWikiPages — parentPath normalisation', () => {
  it('strips a single trailing slash so paths never double up', () => {
    expect(paths(build({ config: withWiki('/Docs/') }))[0]).toBe('/Docs/Overview');
  });

  it('leaves a parentPath without a trailing slash alone', () => {
    expect(paths(build({ config: withWiki('/Docs') }))[0]).toBe('/Docs/Overview');
  });

  it('treats a root parentPath of "/" as the wiki root', () => {
    expect(paths(build({ config: withWiki('/') }))[0]).toBe('/Overview');
  });

  it('only strips the last slash, so a trailing "//" leaves one behind', () => {
    // BUG: pinned rather than specced. The normaliser is `.replace(/\/$/, '')`,
    // a single-character strip. '/Docs//' therefore yields '/Docs//Overview'. Not
    // reported as a defect — '//' is a config typo, and ADO tolerates it.
    expect(paths(build({ config: withWiki('/Docs//') }))[0]).toBe('/Docs//Overview');
  });
});

describe('buildWikiPages — path sanitiser', () => {
  it('replaces slashes with dashes and strips ?, # and % from a table name', () => {
    // ADO wiki path segments cannot contain these. A single name exercising all
    // four rules at once, plus the trailing trim.
    const pages = build({
      mergedSolution: aSolution({ tables: [aTable({ displayName: 'Profit/Loss ?Q1# 50% ' })] }),
    });
    expect(paths(pages)).toContain('/Docs/Data Model/Profit-Loss Q1 50');
  });

  it('sanitises flow page names the same way', () => {
    const pages = build({ flows: [aFlow({ name: 'Sync A/B ?Test# 10%' })] });
    expect(paths(pages)).toContain('/Docs/Automation/Flows/Sync A-B Test 10');
  });

  it('sanitises business rule page names the same way', () => {
    const pages = build({
      mergedSolution: aSolution({ tables: [aTable({ logicalName: 'acme_widget', displayName: 'Widget' })] }),
      businessRules: [aBusinessRule({ entity: 'acme_widget', name: 'Require Serial %/# Premium?' })],
    });
    expect(paths(pages)).toContain('/Docs/Data Model/Widget/Business Rules/Require Serial - Premium');
  });

  it('trims only the ends, so interior spacing from a stripped char survives', () => {
    // '#' is removed, not replaced — 'A # B' collapses to 'A  B' (two spaces).
    const pages = build({ mergedSolution: aSolution({ tables: [aTable({ displayName: 'A # B' })] }) });
    expect(paths(pages)).toContain('/Docs/Data Model/A  B');
  });

  it('disambiguates two tables whose names sanitise to the same page path', () => {
    // Was pinned as the worst defect in this file: s() is many-to-one — 'A/B'
    // and 'A-B' are distinct Dataverse tables that both sanitise to 'A-B' — and
    // buildWikiPages emitted both page sets at identical paths with no collision
    // check, so the publisher's last-write-wins semantics deleted one table's
    // entire documentation from the client's wiki with no error and a green
    // pipeline. displayName is not unique in Dataverse; only logicalName is, and
    // logicalName is never used in the page path.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pages = build({
      mergedSolution: aSolution({
        tables: [
          aTable({ logicalName: 'acme_ab1', displayName: 'A/B' }),
          aTable({ logicalName: 'acme_ab2', displayName: 'A-B' }),
        ],
      }),
    });
    const all = paths(pages);

    // No duplicates: both tables' full page sets survive at distinct paths.
    const dupes = all.filter((v, i) => all.indexOf(v) !== i);
    expect(dupes).toEqual([]);
    expect(all).toContain('/Docs/Data Model/A-B');
    expect(all).toContain('/Docs/Data Model/A-B (2)');
    // The second table's whole subtree follows it to the disambiguated path.
    expect(all).toContain('/Docs/Data Model/A-B (2)/Columns');
    expect(all).toContain('/Docs/Data Model/A-B (2)/Views');
    expect(all).toContain('/Docs/Data Model/A-B (2)/Forms');
    expect(all).toContain('/Docs/Data Model/A-B (2)/Relationships');

    // The collision is surfaced, not silent — a client can see it in pipeline logs.
    expect(warn.mock.calls.map(c => c.join(' ')).join('\n')).toContain('collision');
    warn.mockRestore();
  });

  it('disambiguates a collision from ? / # / % stripping too, not just slash-dashing', () => {
    // The same many-to-one mapping, via a different rule: 'Q1?' and 'Q1' both
    // strip to 'Q1'. Proves the fix is general, not special-cased to slashes.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pages = build({
      mergedSolution: aSolution({
        tables: [
          aTable({ logicalName: 'acme_q1a', displayName: 'Q1?' }),
          aTable({ logicalName: 'acme_q1b', displayName: 'Q1' }),
        ],
      }),
    });
    const all = paths(pages);
    expect(all.filter((v, i) => all.indexOf(v) !== i)).toEqual([]);
    expect(all).toContain('/Docs/Data Model/Q1');
    expect(all).toContain('/Docs/Data Model/Q1 (2)');
    vi.restoreAllMocks();
  });

  it('sanitises the ADO-reserved characters beyond / ? # % too', () => {
    // Was pinned: s() handled exactly four characters. ADO wiki page paths also
    // reject ':', '<', '>', '*', '|', '"' and '\'. A table named 'Ops: Q1
    // <draft>' used to reach the ADO API verbatim and fail the page write at
    // publish time — on a name the tool had every chance to sanitise up front.
    const pages = build({
      mergedSolution: aSolution({ tables: [aTable({ displayName: 'Ops: Q1 <draft>' })] }),
    });
    expect(paths(pages)).toContain('/Docs/Data Model/Ops Q1 draft');
    expect(paths(pages)).not.toContain('/Docs/Data Model/Ops: Q1 <draft>');
  });
});

describe('buildWikiPages — full page tree', () => {
  const fullSolution = (): BuildArgs => ({
    mergedSolution: aSolution({ tables: [aTable({ logicalName: 'acme_widget', displayName: 'Widget' })] }),
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

  it('lays out the exact page tree for a solution with one of everything', () => {
    // The full contract in one assertion: which pages exist, and in what order.
    // Order matters — it is the order the publisher writes pages to ADO, and a
    // child written before its parent orphans in the wiki tree.
    expect(paths(build(fullSolution()))).toEqual([
      '/Docs/Overview',
      '/Docs/Data Model',
      '/Docs/Data Model/Widget',
      '/Docs/Data Model/Widget/Columns',
      '/Docs/Data Model/Widget/Views',
      '/Docs/Data Model/Widget/Forms',
      '/Docs/Data Model/Widget/Relationships',
      '/Docs/Data Model/Widget/Used By Flows',
      '/Docs/Data Model/Widget/Business Rules',
      '/Docs/Data Model/Widget/Business Rules/Require Serial For Premium Widgets',
      '/Docs/Automation',
      '/Docs/Automation/Flows',
      '/Docs/Automation/Flows/Create Part On Widget Create',
      '/Docs/Automation/Classic Workflows',
      '/Docs/Automation/Classic Workflows/Stamp Widget Approval',
      '/Docs/Automation/Plugins',
      '/Docs/Automation/Plugins/Acme-Widgets-Plugins',
      '/Docs/Automation/Plugins/Acme-Widgets-Plugins/WidgetPostOperation',
      '/Docs/Custom Code',
      '/Docs/Custom Code/Web Resources',
      '/Docs/Custom Code/Web Resources/Widget.js',
      '/Docs/Security',
      '/Docs/Security/Widget Manager',
      '/Docs/Integrations',
      '/Docs/Integrations/Environment Variables',
      '/Docs/Integrations/Connection References',
      '/Docs/Global Choices',
      '/Docs/Global Choices/Widget Tier',
      '/Docs/Email Templates',
      '/Docs/Email Templates/Widget Shipped',
      '/Docs/Model-Driven Apps',
      '/Docs/Model-Driven Apps/Widget Hub',
    ]);
  });

  it('emits only Overview and Data Model for a solution with no components', () => {
    // The floor: an empty solution must not produce section landing pages for
    // sections that have nothing under them.
    expect(paths(build())).toEqual(['/Docs/Overview', '/Docs/Data Model']);
  });
});

describe('buildWikiPages — section guards', () => {
  it('omits the Automation landing page entirely when there is no automation', () => {
    expect(paths(build({ webResources: [aWebResource()] }))).not.toContain('/Docs/Automation');
  });

  it('creates the Automation landing page when only classic workflows exist', () => {
    // Each of the three automation kinds must be able to justify the parent page
    // on its own, or the child pages orphan.
    const p = paths(build({ classicWorkflows: [aClassicWorkflow()] }));
    expect(p).toContain('/Docs/Automation');
    expect(p).not.toContain('/Docs/Automation/Flows');
    expect(p).toContain('/Docs/Automation/Classic Workflows');
  });

  it('creates the Automation landing page when only plugins exist', () => {
    const p = paths(build({ pluginAssemblies: [aPluginAssembly()] }));
    expect(p).toContain('/Docs/Automation');
    expect(p).toContain('/Docs/Automation/Plugins');
  });

  it('omits the Custom Code landing page when no JavaScript resources exist', () => {
    const p = paths(build({ webResources: [aWebResource({ resourceType: 'HTML' })] }));
    expect(p).not.toContain('/Docs/Custom Code');
    expect(p).not.toContain('/Docs/Custom Code/Web Resources');
  });

  it('creates the Integrations landing page for env vars alone', () => {
    const p = paths(build({ envVars: [anEnvironmentVariable()] }));
    expect(p).toContain('/Docs/Integrations');
    expect(p).toContain('/Docs/Integrations/Environment Variables');
    expect(p).not.toContain('/Docs/Integrations/Connection References');
  });

  it('creates the Integrations landing page for connection references alone', () => {
    const p = paths(build({ connectionRefs: [aConnectionReference()] }));
    expect(p).toContain('/Docs/Integrations');
    expect(p).not.toContain('/Docs/Integrations/Environment Variables');
    expect(p).toContain('/Docs/Integrations/Connection References');
  });
});

describe('buildWikiPages — component toggles', () => {
  const oneTable = { mergedSolution: aSolution({ tables: [aTable({ displayName: 'Widget' })] }) };

  it('drops exactly the Views page when views are disabled', () => {
    const p = paths(build({ ...oneTable, config: withWiki('/Docs', { components: { views: false } }) }));
    expect(p).not.toContain('/Docs/Data Model/Widget/Views');
    expect(p).toContain('/Docs/Data Model/Widget/Forms');
    expect(p).toContain('/Docs/Data Model/Widget/Relationships');
    expect(p).toContain('/Docs/Data Model/Widget/Columns');
  });

  it('drops exactly the Forms page when forms are disabled', () => {
    const p = paths(build({ ...oneTable, config: withWiki('/Docs', { components: { forms: false } }) }));
    expect(p).toContain('/Docs/Data Model/Widget/Views');
    expect(p).not.toContain('/Docs/Data Model/Widget/Forms');
    expect(p).toContain('/Docs/Data Model/Widget/Relationships');
  });

  it('drops exactly the Relationships page when relationships are disabled', () => {
    const p = paths(build({ ...oneTable, config: withWiki('/Docs', { components: { relationships: false } }) }));
    expect(p).toContain('/Docs/Data Model/Widget/Views');
    expect(p).toContain('/Docs/Data Model/Widget/Forms');
    expect(p).not.toContain('/Docs/Data Model/Widget/Relationships');
  });

  it('keeps the table index and Columns pages regardless of every sub-toggle', () => {
    const p = paths(build({
      ...oneTable,
      config: withWiki('/Docs', { components: { views: false, forms: false, relationships: false } }),
    }));
    expect(p).toContain('/Docs/Data Model/Widget');
    expect(p).toContain('/Docs/Data Model/Widget/Columns');
  });
});

describe('buildWikiPages — Business Rules page', () => {
  it('creates a rule sub-page per rule under its own table only', () => {
    const pages = build({
      mergedSolution: aSolution({
        tables: [
          aTable({ logicalName: 'acme_widget', displayName: 'Widget' }),
          aTable({ logicalName: 'acme_part', displayName: 'Part' }),
        ],
      }),
      businessRules: [aBusinessRule({ entity: 'acme_widget', name: 'Require Serial' })],
    });
    expect(paths(pages)).toContain('/Docs/Data Model/Widget/Business Rules/Require Serial');
    expect(paths(pages)).not.toContain('/Docs/Data Model/Part/Business Rules/Require Serial');
  });

  it('matches a rule to its table case-insensitively', () => {
    // Solution XML is not consistent about entity-name casing.
    const pages = build({
      mergedSolution: aSolution({ tables: [aTable({ logicalName: 'acme_widget', displayName: 'Widget' })] }),
      businessRules: [aBusinessRule({ entity: 'ACME_Widget', name: 'Require Serial' })],
    });
    expect(paths(pages)).toContain('/Docs/Data Model/Widget/Business Rules/Require Serial');
  });

  it('omits the Business Rules page entirely for a table with no rules', () => {
    // Was pinned: every other content-derived section is guarded by a length
    // check ('Used By Flows' right above it is guarded by
    // tableFlows.length > 0); the Business Rules base page was pushed
    // unconditionally. A solution with no business rules got one empty
    // "No business rules found for this table." page per table — for a
    // 60-table solution, 60 empty pages and 60 wasted ADO writes per run.
    const pages = build({
      mergedSolution: aSolution({
        tables: [aTable({ logicalName: 'acme_widget', displayName: 'Widget' }), aTable({ logicalName: 'acme_part', displayName: 'Part' })],
      }),
      businessRules: [],
    });
    expect(paths(pages)).not.toContain('/Docs/Data Model/Widget/Business Rules');
    expect(paths(pages)).not.toContain('/Docs/Data Model/Part/Business Rules');
  });

  it('still creates the Business Rules page for a table that has rules, and only that table', () => {
    const pages = build({
      mergedSolution: aSolution({
        tables: [aTable({ logicalName: 'acme_widget', displayName: 'Widget' }), aTable({ logicalName: 'acme_part', displayName: 'Part' })],
      }),
      businessRules: [aBusinessRule({ entity: 'acme_widget', name: 'Require Serial' })],
    });
    expect(paths(pages)).toContain('/Docs/Data Model/Widget/Business Rules');
    expect(paths(pages)).not.toContain('/Docs/Data Model/Part/Business Rules');
  });
});

describe('buildWikiPages — plugins', () => {
  it('turns dots in the assembly name into dashes for the page path', () => {
    const pages = build({ pluginAssemblies: [aPluginAssembly({ assemblyName: 'Acme.Widgets.Plugins' })] });
    expect(paths(pages)).toContain('/Docs/Automation/Plugins/Acme-Widgets-Plugins');
  });

  it('strips the assembly namespace off a plugin type name', () => {
    const pages = build({
      pluginAssemblies: [aPluginAssembly({
        assemblyName: 'Acme.Widgets.Plugins',
        pluginTypeNames: ['Acme.Widgets.Plugins.WidgetPostOperation'],
      })],
    });
    expect(paths(pages)).toContain('/Docs/Automation/Plugins/Acme-Widgets-Plugins/WidgetPostOperation');
  });

  it('keeps the full type name when it is not under the assembly namespace', () => {
    // Assembly name and root namespace need not agree — the type name is then
    // used whole rather than blindly slicing off a prefix length that isn't there.
    const pages = build({
      pluginAssemblies: [aPluginAssembly({
        assemblyName: 'Acme.Widgets.Plugins',
        pluginTypeNames: ['Contoso.Other.OrphanPlugin'],
      })],
    });
    expect(paths(pages)).toContain('/Docs/Automation/Plugins/Acme-Widgets-Plugins/Contoso.Other.OrphanPlugin');
  });

  it('does not strip a prefix that merely shares a leading substring', () => {
    // 'Acme.Widgets.PluginsExtra.Foo' starts with 'Acme.Widgets.Plugins' but not
    // with 'Acme.Widgets.Plugins.' — slicing on the shorter match would produce
    // the mangled 'Extra.Foo'.
    const pages = build({
      pluginAssemblies: [aPluginAssembly({
        assemblyName: 'Acme.Widgets.Plugins',
        pluginTypeNames: ['Acme.Widgets.PluginsExtra.Foo'],
      })],
    });
    expect(paths(pages)).toContain('/Docs/Automation/Plugins/Acme-Widgets-Plugins/Acme.Widgets.PluginsExtra.Foo');
  });

  it('filters out assemblies whose name is blank or whitespace', () => {
    const p = paths(build({
      pluginAssemblies: [
        aPluginAssembly({ assemblyName: '' }),
        aPluginAssembly({ assemblyName: '   ' }),
      ],
    }));
    // Nothing to document, so not even the Automation/Plugins landing pages.
    expect(p).not.toContain('/Docs/Automation');
    expect(p).not.toContain('/Docs/Automation/Plugins');
    expect(p).toEqual(['/Docs/Overview', '/Docs/Data Model']);
  });

  it('keeps the valid assemblies when a blank one sits alongside them', () => {
    const p = paths(build({
      pluginAssemblies: [
        aPluginAssembly({ assemblyName: '' }),
        aPluginAssembly({ assemblyName: 'Acme.Real.Plugins', pluginTypeNames: [], steps: [] }),
      ],
    }));
    expect(p).toContain('/Docs/Automation/Plugins/Acme-Real-Plugins');
    expect(p.filter(x => x.startsWith('/Docs/Automation/Plugins/'))).toHaveLength(1);
  });

  it('routes each step to the plugin type page matching its class name', () => {
    const pages = build({
      pluginAssemblies: [aPluginAssembly({
        assemblyName: 'Acme.Widgets.Plugins',
        pluginTypeNames: ['Acme.Widgets.Plugins.Alpha', 'Acme.Widgets.Plugins.Beta'],
        steps: [
          aPluginStep({ className: 'Alpha', message: 'Create' }),
          aPluginStep({ className: 'Beta', message: 'Delete' }),
        ],
      })],
    });
    const alpha = contentAt(pages, '/Docs/Automation/Plugins/Acme-Widgets-Plugins/Alpha') ?? '';
    expect(alpha).toContain('Create');
    expect(alpha).not.toContain('Delete');
  });
});

describe('buildWikiPages — web resources', () => {
  it('documents only JavaScript resources', () => {
    const p = paths(build({
      webResources: [
        aWebResource({ name: 'acme_/Scripts/Widget.js', resourceType: 'JavaScript' }),
        aWebResource({ name: 'acme_/Styles/site.css', resourceType: 'CSS' }),
        aWebResource({ name: 'acme_/Pages/page.html', resourceType: 'HTML' }),
      ],
    }));
    expect(p).toContain('/Docs/Custom Code/Web Resources/Widget.js');
    expect(p).not.toContain('/Docs/Custom Code/Web Resources/site.css');
    expect(p).not.toContain('/Docs/Custom Code/Web Resources/page.html');
  });

  it('titles the page with the last segment of the resource name, not the whole path', () => {
    // Web resource names are virtual paths ('acme_/Scripts/nested/Thing.js').
    // Using the raw name would nest pages under a bogus Scripts/nested tree.
    const p = paths(build({
      webResources: [aWebResource({ name: 'acme_/Scripts/nested/Thing.js' })],
    }));
    expect(p).toContain('/Docs/Custom Code/Web Resources/Thing.js');
  });

  it('falls back to the whole name when it has no slash', () => {
    const p = paths(build({ webResources: [aWebResource({ name: 'Widget.js' })] }));
    expect(p).toContain('/Docs/Custom Code/Web Resources/Widget.js');
  });
});

describe('buildWikiPages — flow/table cross-links', () => {
  it('adds a Used By Flows page only to tables a flow actually touches', () => {
    const pages = build({
      mergedSolution: aSolution({
        tables: [
          aTable({ logicalName: 'acme_widget', displayName: 'Widget' }),
          aTable({ logicalName: 'acme_gadget', displayName: 'Gadget' }),
        ],
      }),
      flows: [aFlow({ trigger: aTrigger({ entity: 'acme_widget' }), actions: [] })],
    });
    expect(paths(pages)).toContain('/Docs/Data Model/Widget/Used By Flows');
    expect(paths(pages)).not.toContain('/Docs/Data Model/Gadget/Used By Flows');
  });

  it('threads the flows base path into the table page so the link resolves', () => {
    // The renderer cannot know where flow pages live; if this argument stops being
    // passed the table page silently degrades to plain text instead of a link.
    const pages = build({
      mergedSolution: aSolution({ tables: [aTable({ logicalName: 'acme_widget', displayName: 'Widget' })] }),
      flows: [aFlow({ name: 'Ship It', trigger: aTrigger({ entity: 'acme_widget' }), actions: [] })],
    });
    // Links are ADO-encoded on serialise: spaces become dashes.
    expect(contentAt(pages, '/Docs/Data Model/Widget/Used By Flows'))
      .toContain('[Ship It](/Docs/Automation/Flows/Ship-It)');
  });

  it('threads the tables base path into the flow page so the reverse link resolves', () => {
    const pages = build({
      mergedSolution: aSolution({ tables: [aTable({ logicalName: 'acme_widget', displayName: 'Widget' })] }),
      flows: [aFlow({ name: 'Ship It', trigger: aTrigger({ entity: 'acme_widget' }), actions: [] })],
    });
    expect(contentAt(pages, '/Docs/Automation/Flows/Ship It'))
      .toContain('[Widget](/Docs/Data-Model/Widget)');
  });

  it('honours the parentPath in cross-link hrefs rather than hardcoding a root', () => {
    const pages = build({
      config: withWiki('/Team/Docs/'),
      mergedSolution: aSolution({ tables: [aTable({ logicalName: 'acme_widget', displayName: 'Widget' })] }),
      flows: [aFlow({ name: 'Ship It', trigger: aTrigger({ entity: 'acme_widget' }), actions: [] })],
    });
    expect(contentAt(pages, '/Team/Docs/Data Model/Widget/Used By Flows'))
      .toContain('(/Team/Docs/Automation/Flows/Ship-It)');
  });

  it('links a table reached only through a flow action, not just the trigger', () => {
    const pages = build({
      mergedSolution: aSolution({ tables: [aTable({ logicalName: 'acme_part', displayName: 'Part' })] }),
      flows: [aFlow({
        trigger: aTrigger({ entity: 'account' }),
        actions: [anAction({ entityName: 'acme_part' })],
      })],
    });
    expect(paths(pages)).toContain('/Docs/Data Model/Part/Used By Flows');
  });

  it('a flow name needing sanitising still links to the page that actually exists', () => {
    // Was pinned: buildWikiPages sanitised the page path with s() but the
    // renderer built the href from the raw name — the two agreed only when the
    // name had nothing to sanitise. The flow page was written at
    // '.../Flows/Create-Update Widget' while both the Flows index and the
    // table's Used By Flows page linked to '.../Flows/Create/Update Widget' —
    // a 404 on the client's wiki, on every flow name containing / ? # or %.
    const pages = build({
      mergedSolution: aSolution({ tables: [aTable({ logicalName: 'acme_widget', displayName: 'Widget' })] }),
      flows: [aFlow({ name: 'Create/Update Widget', trigger: aTrigger({ entity: 'acme_widget' }), actions: [] })],
    });

    const flowPagePath = '/Docs/Automation/Flows/Create-Update Widget';
    expect(paths(pages)).toContain(flowPagePath);
    expect(paths(pages)).not.toContain('/Docs/Automation/Flows/Create/Update Widget');

    // The link now targets the encoding of the REAL page path — computed with
    // the actual production toADOWikiLink, not a hand-verified string, so this
    // stays correct if that function's escaping ever changes.
    expect(contentAt(pages, '/Docs/Automation/Flows'))
      .toContain(`(${toADOWikiLink(flowPagePath)})`);
  });
});

describe('buildWikiPages — security roles, choices, templates and apps', () => {
  it('strips reserved characters from a role name for both path and link', () => {
    // encodeRoleName removes /?#% (rather than dashing them), and the index link
    // uses the same encoder — so these two agree.
    const pages = build({ securityRoles: [aSecurityRole({ name: 'Sales/Admin' })] });
    expect(paths(pages)).toContain('/Docs/Security/SalesAdmin');
    expect(contentAt(pages, '/Docs/Security')).toContain('(/Docs/Security/SalesAdmin)');
  });

  it('strips reserved characters from a global choice display name', () => {
    const pages = build({ globalChoices: [aGlobalChoice({ displayName: 'Tier/Level' })] });
    expect(paths(pages)).toContain('/Docs/Global Choices/TierLevel');
  });

  it('the global choices index links to the page it just named', () => {
    // Was pinned, and sharper than the flow case above: encodeChoiceName is
    // exported specifically so the path and the link agree, and wikiAssembler
    // called it for the path — but the renderer built the href off the raw
    // displayName and ignored the encoder entirely. securityRoleRenderer got
    // this right (it calls encodeRoleName), which is what made this an
    // oversight rather than a design. The page landed at 'TierLevel'; the
    // index pointed at 'Tier/Level' — a 404, and in ADO a slash in a link also
    // claims a child page that doesn't exist.
    const pages = build({ globalChoices: [aGlobalChoice({ displayName: 'Tier/Level' })] });
    const choicePagePath = '/Docs/Global Choices/TierLevel';
    expect(paths(pages)).toContain(choicePagePath);
    expect(contentAt(pages, '/Docs/Global Choices'))
      .toContain(`(${toADOWikiLink(choicePagePath)})`);
  });

  it('the email template and model-driven app indexes link to their real pages too', () => {
    // Was pinned: same class as the flow and global-choice pins — both
    // renderers built hrefs from the raw name while wikiAssembler wrote the
    // sanitised path.
    const pages = build({
      emailTemplates: [anEmailTemplate({ title: 'Ship/Now' })],
      modelDrivenApps: [aModelDrivenApp({ displayName: 'Hub/Main' })],
    });

    const emailPagePath = '/Docs/Email Templates/Ship-Now';
    expect(paths(pages)).toContain(emailPagePath);
    expect(contentAt(pages, '/Docs/Email Templates'))
      .toContain(`(${toADOWikiLink(emailPagePath)})`);

    const appPagePath = '/Docs/Model-Driven Apps/Hub-Main';
    expect(paths(pages)).toContain(appPagePath);
    expect(contentAt(pages, '/Docs/Model-Driven Apps'))
      .toContain(`(${toADOWikiLink(appPagePath)})`);
  });

  it('gives each email template a page under its title', () => {
    const p = paths(build({
      emailTemplates: [
        anEmailTemplate({ title: 'Widget Shipped' }),
        anEmailTemplate({ title: 'Widget Delayed' }),
      ],
    }));
    expect(p).toContain('/Docs/Email Templates/Widget Shipped');
    expect(p).toContain('/Docs/Email Templates/Widget Delayed');
  });

  it('gives each model-driven app a page under its display name', () => {
    const p = paths(build({ modelDrivenApps: [aModelDrivenApp({ displayName: 'Widget Hub' })] }));
    expect(p).toContain('/Docs/Model-Driven Apps/Widget Hub');
  });
});

describe('buildWikiPages — Data Model ERD', () => {
  // A custom table pointing at a standard one: the relationship survives only if
  // no publisher prefix filter is applied.
  const mixedTables = () => aSolution({
    tables: [
      aTable({
        logicalName: 'acme_widget',
        displayName: 'Widget',
        relationships: [aRelationship({
          name: 'acme_widget_account',
          referencedEntity: 'acme_widget',
          referencingEntity: 'account',
        })],
      }),
      aTable({ logicalName: 'account', displayName: 'Account', relationships: [] }),
    ],
  });

  const customOnlyTables = () => aSolution({
    tables: [
      aTable({
        logicalName: 'acme_widget',
        displayName: 'Widget',
        relationships: [aRelationship({
          name: 'acme_widget_acme_part',
          referencedEntity: 'acme_widget',
          referencingEntity: 'acme_part',
        })],
      }),
      aTable({ logicalName: 'acme_part', displayName: 'Part', relationships: [] }),
    ],
  });

  it('embeds a mermaid diagram on the Data Model page when relationships qualify', () => {
    const pages = build({
      config: withWiki('/Docs', { parse: { excludeStandardRelationships: true } }),
      solutions: [aSolution({ publisher: { uniqueName: 'acme', displayName: 'Acme', prefix: 'acme' } })],
      mergedSolution: customOnlyTables(),
    });
    const dm = contentAt(pages, '/Docs/Data Model') ?? '';
    expect(dm).toContain(':::mermaid');
    expect(dm).toContain('Widget ||--o{ Part');
  });

  it('omits the diagram but keeps the Data Model page when nothing qualifies', () => {
    // The page must still exist — it is the parent of every table page.
    const pages = build({ mergedSolution: aSolution({ tables: [aTable({ relationships: [] })] }) });
    const dm = contentAt(pages, '/Docs/Data Model') ?? '';
    expect(paths(pages)).toContain('/Docs/Data Model');
    expect(dm).not.toContain(':::mermaid');
    expect(dm).toContain('# Data Model');
  });

  it('passes the publisher prefix when excludeStandardRelationships is on', () => {
    // With the prefix threaded through, the widget→account edge is dropped
    // because 'account' is not a custom entity.
    const pages = build({
      config: withWiki('/Docs', { parse: { excludeStandardRelationships: true } }),
      solutions: [aSolution({ publisher: { uniqueName: 'acme', displayName: 'Acme', prefix: 'acme' } })],
      mergedSolution: mixedTables(),
    });
    expect(contentAt(pages, '/Docs/Data Model')).not.toContain(':::mermaid');
  });

  it('withholds the publisher prefix when excludeStandardRelationships is off', () => {
    // Same IR, opposite toggle: no prefix filter, so the standard-table edge stays.
    const pages = build({
      config: withWiki('/Docs', { parse: { excludeStandardRelationships: false } }),
      solutions: [aSolution({ publisher: { uniqueName: 'acme', displayName: 'Acme', prefix: 'acme' } })],
      mergedSolution: mixedTables(),
    });
    const dm = contentAt(pages, '/Docs/Data Model') ?? '';
    expect(dm).toContain(':::mermaid');
    expect(dm).toContain('Widget ||--o{ Account');
  });

  it('honours erd.excludeEntities from config', () => {
    // Proves config.erd is threaded through rather than dropped.
    const pages = build({
      config: withWiki('/Docs', { parse: { excludeStandardRelationships: false }, erd: { excludeEntities: ['acme_part'] } }),
      mergedSolution: customOnlyTables(),
    });
    expect(contentAt(pages, '/Docs/Data Model')).not.toContain(':::mermaid');
  });

  it('uses every solution publisher prefix across a merged multi-solution ERD', () => {
    // Was pinned: wikiAssembler read only solutions[0]?.publisher?.prefix but
    // handed it the tables of the MERGED solution. When a client documents two
    // solutions from different publishers, every relationship belonging to any
    // publisher but the first failed the prefix test and vanished from the ER
    // diagram — silently, with no warning. Here both Contoso tables are custom
    // to their own publisher, but the diagram came out empty because
    // solutions[0] was Acme.
    const pages = build({
      config: withWiki('/Docs', { parse: { excludeStandardRelationships: true } }),
      solutions: [
        aSolution({ uniqueName: 'AcmeWidgets', publisher: { uniqueName: 'acme', displayName: 'Acme', prefix: 'acme' } }),
        aSolution({ uniqueName: 'ContosoOrders', publisher: { uniqueName: 'contoso', displayName: 'Contoso', prefix: 'contoso' } }),
      ],
      mergedSolution: aSolution({
        tables: [
          aTable({
            logicalName: 'contoso_order',
            displayName: 'Order',
            relationships: [aRelationship({
              name: 'contoso_order_line',
              referencedEntity: 'contoso_order',
              referencingEntity: 'contoso_line',
            })],
          }),
          aTable({ logicalName: 'contoso_line', displayName: 'Line', relationships: [] }),
        ],
      }),
    });
    const dm = contentAt(pages, '/Docs/Data Model') ?? '';
    expect(dm).toContain(':::mermaid');
    expect(dm).toContain('Order ||--o{ Line');
  });
});

describe('buildWikiPages — Overview', () => {
  it('advertises an assembly count that matches the assembly pages written', () => {
    // What this DOES guard: the client-visible coupling — the number the Overview
    // advertises equals the number of assembly pages that actually exist. A reader
    // who sees "2" and finds one page has been lied to.
    //
    // What this does NOT guard, despite appearances: the `.filter(a => a.assemblyName
    // .trim() !== '')` at wikiAssembler.ts:66. renderOverview re-filters blanks itself
    // (overviewRenderer.ts:50), so deleting the assembler's filter leaves this test
    // green — verified by mutation. The assembler-side filter is redundant defence,
    // not load-bearing, and no test here can hold it. Do not add a comment claiming
    // otherwise; if you want it held, assert it in overviewRenderer's own tests.
    const pages = build({
      pluginAssemblies: [
        aPluginAssembly({ assemblyName: 'Acme.Real.Plugins', pluginTypeNames: [], steps: [] }),
        aPluginAssembly({ assemblyName: '  ' }),
      ],
    });
    const overview = contentAt(pages, '/Docs/Overview') ?? '';
    // Pinned literal: one named assembly in, so the Overview must say 1, not 2.
    expect(overview).toMatch(/\| Plugin Assemblies\s*\| 1\s*\|/);

    const pluginPages = paths(pages).filter(p => p.startsWith('/Docs/Automation/Plugins/'));
    expect(pluginPages).toEqual(['/Docs/Automation/Plugins/Acme-Real-Plugins']);

    // And tie the two together, so the pair cannot drift apart in either direction.
    const advertised = Number(/\| Plugin Assemblies\s*\|\s*(\d+)\s*\|/.exec(overview)?.[1]);
    expect(advertised).toBe(pluginPages.length);
  });

  it('is always the first page so parents exist before children', () => {
    expect(paths(build({ mergedSolution: aSolution() }))[0]).toBe('/Docs/Overview');
  });
});
