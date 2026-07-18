import type { DocGenConfig } from '../config/index.js';
import type {
  SolutionModel, FlowModel, PluginAssemblyModel, WebResourceModel,
  SecurityRoleModel, ClassicWorkflowModel, BusinessRuleModel, EnvironmentVariableModel,
  GlobalChoiceModel, EmailTemplateModel, ModelDrivenAppModel, ConnectionReferenceModel,
  PowerPagesModel,
} from '../ir/index.js';
import type { WikiPage } from './wikiPublisher.js';
import { generateERDiagram } from '../enrichment/erdGenerator.js';
import { resolveFlowTableDependencies } from '../enrichment/dependencyResolver.js';
import { serialize } from '../docmodel/MarkdownSerializer.js';
import { h, toc, mermaid, pt } from '../docmodel/nodes.js';
import {
  renderOverview,
  renderTableIndex, renderTableColumns, renderTableViews,
  renderTableForms, renderTableRelationships,
  renderTableBusinessRules, renderSingleBusinessRule,
  renderFlowSummary, renderSingleFlow,
  renderTableUsedByFlows,
  renderPluginSummary, renderAssemblyIndex, renderSinglePluginType,
  renderWebResourceSummary, renderWebResourceDetail,
  renderClassicWorkflow, renderClassicWorkflowsOverview,
  renderSecurityRolesIndex, renderSecurityRolePage, encodeRoleName,
  renderEnvironmentVariablesPage,
  renderConnectionReferencesPage,
  renderGlobalChoicesIndex, renderGlobalChoicePage, encodeChoiceName,
  renderEmailTemplatesIndex, renderEmailTemplatePage,
  renderModelDrivenAppsIndex, renderModelDrivenAppPage,
  renderPowerPagesIndex, renderPowerPagesSitePage,
} from '../renderers/index.js';
import { encodePageSegment as s } from '../renderers/rendererUtils.js';

/**
 * Disambiguates colliding page paths after the full tree is built.
 *
 * s() (and encodeRoleName/encodeChoiceName) are many-to-one — 'A/B' and
 * 'A-B' both sanitise to 'A-B' — so two distinct components can compute the
 * identical page path. displayName is not unique in Dataverse; only
 * logicalName is, and logicalName is never used in a page path. Without this
 * pass, wikiPublisher's last-write-wins semantics mean the second one
 * silently overwrites the first's pages on publish: no error, no warning, a
 * whole component's documentation gone from the client's wiki.
 *
 * Runs once, after the full tree is built, rather than at each of the ~10
 * call sites that derive a path from a sanitised name — one pass catches
 * every entity type uniformly, and cascades to a renamed entity's own
 * sub-pages automatically because it rewrites by PATH PREFIX, not just an
 * exact match. This relies on the pre-existing invariant that a parent page
 * is always pushed before its children — the publish ordering already
 * depends on it (see the "full page tree" test).
 *
 * Accepted limitation: a handful of renderers build a cross-link to a page
 * from the entity's own name, independent of this pass (e.g. a flow's
 * "related tables" link — see rendererUtils.ts). If the table on the far end
 * of that link happens to ALSO be the one disambiguated here, the link still
 * points at the pre-rename path. That is a rare compound case, and a strictly
 * better failure mode than the silent overwrite this pass exists to prevent
 * — the page is not lost, only a stray cross-link might 404 — so it is left
 * as a known gap rather than threading the rename map into the renderer
 * layer, which would break the IR/renderer separation for one edge case.
 */
function dedupePagePaths(pages: WikiPage[]): WikiPage[] {
  const seen = new Set<string>();
  const renames: [string, string][] = [];

  return pages.map(page => {
    let path = page.path;

    for (const [oldPrefix, newPrefix] of renames) {
      if (path === oldPrefix || path.startsWith(`${oldPrefix}/`)) {
        path = newPrefix + path.slice(oldPrefix.length);
        break;
      }
    }

    if (seen.has(path)) {
      const original = path;
      let n = 2;
      while (seen.has(`${original} (${n})`)) n++;
      path = `${original} (${n})`;
      renames.push([original, path]);
      console.warn(
        `  ⚠ Wiki page path collision: two components both sanitise to "${original}" — ` +
        `publishing the second as "${path}" instead of silently overwriting the first.`
      );
    }

    seen.add(path);
    return path === page.path ? page : { ...page, path };
  });
}

export function buildWikiPages(
  config: DocGenConfig,
  solutions: SolutionModel[],
  mergedSolution: SolutionModel,
  flows: FlowModel[],
  pluginAssemblies: PluginAssemblyModel[] = [],
  webResources: WebResourceModel[] = [],
  classicWorkflows: ClassicWorkflowModel[] = [],
  businessRules: BusinessRuleModel[] = [],
  securityRoles: SecurityRoleModel[] = [],
  envVars: EnvironmentVariableModel[] = [],
  connectionRefs: ConnectionReferenceModel[] = [],
  globalChoices: GlobalChoiceModel[] = [],
  emailTemplates: EmailTemplateModel[] = [],
  modelDrivenApps: ModelDrivenAppModel[] = [],
  powerPages: PowerPagesModel[] = [],
): WikiPage[] {
  if (!config.wiki) return [];

  const base = config.wiki.parentPath.replace(/\/$/, '');
  const pages: WikiPage[] = [];

  // ---- Overview ----
  pages.push({
    path: `${base}/Overview`,
    content: serialize(renderOverview(
      solutions, flows, pluginAssemblies.filter(a => a.assemblyName.trim() !== ''),
      webResources, classicWorkflows, businessRules,
      securityRoles, envVars, globalChoices,
      emailTemplates, modelDrivenApps, connectionRefs
    )),
  });

  // ---- Data Model ----
  // Every solution's own publisher prefix, not just solutions[0]'s — a merged
  // multi-solution ERD used to test every table against a single prefix, so
  // every relationship belonging to a solution other than the first failed
  // the custom-entity check and silently vanished from the diagram.
  const publisherPrefixes = solutions.map(sol => sol.publisher?.prefix).filter((p): p is string => !!p);
  const erdDiagram = config.parse.excludeStandardRelationships
    ? generateERDiagram(mergedSolution.tables, publisherPrefixes, config.erd)
    : generateERDiagram(mergedSolution.tables, undefined, config.erd);

  pages.push({
    path: `${base}/Data Model`,
    content: erdDiagram
      ? serialize([h(1, 'Data Model'), mermaid(erdDiagram), toc()])
      : serialize([h(1, 'Data Model'), toc()]),
  });

  const flowsBasePath = `${base}/Automation/Flows`;
  const flowDeps = resolveFlowTableDependencies(flows, mergedSolution.tables);

  for (const table of mergedSolution.tables) {
    const tablePath = `${base}/Data Model/${s(table.displayName)}`;
    const tableRules = businessRules.filter(
      r => r.entity.toLowerCase() === table.logicalName.toLowerCase()
    );
    const tableFlows = flowDeps.tableToFlows.get(table.logicalName.toLowerCase()) ?? [];

    pages.push({ path: tablePath,                   content: serialize(renderTableIndex(table)) });
    pages.push({ path: `${tablePath}/Columns`,      content: serialize(renderTableColumns(table)) });

    if (config.components.views) {
      pages.push({ path: `${tablePath}/Views`,      content: serialize(renderTableViews(table)) });
    }
    if (config.components.forms) {
      pages.push({ path: `${tablePath}/Forms`,      content: serialize(renderTableForms(table, config)) });
    }
    if (config.components.relationships) {
      pages.push({ path: `${tablePath}/Relationships`, content: serialize(renderTableRelationships(table)) });
    }
    if (tableFlows.length > 0) {
      pages.push({ path: `${tablePath}/Used By Flows`, content: serialize(renderTableUsedByFlows(table, tableFlows, flowsBasePath)) });
    }

    // Guarded like every other content-derived section ('Used By Flows' right
    // above it is guarded by tableFlows.length > 0). This page used to be
    // pushed unconditionally — for a solution with no business rules that was
    // one empty "No business rules found for this table." page per table, and
    // one wasted ADO write per table on every pipeline run.
    if (tableRules.length > 0) {
      const brBasePath = `${tablePath}/Business Rules`;
      pages.push({ path: brBasePath, content: serialize(renderTableBusinessRules(table, tableRules)) });
      for (const rule of tableRules) {
        pages.push({ path: `${brBasePath}/${s(rule.name)}`, content: serialize(renderSingleBusinessRule(rule)) });
      }
    }
  }

  // ---- Automation ----
  const hasFlows           = flows.length > 0;
  const validAssemblies    = pluginAssemblies.filter(a => a.assemblyName.trim() !== '');
  const hasPlugins         = validAssemblies.length > 0;
  const hasClassicWorkflows = classicWorkflows.length > 0;

  if (hasFlows || hasPlugins || hasClassicWorkflows) {
    pages.push({
      path: `${base}/Automation`,
      content: serialize([h(1, 'Automation'), pt('Power Automate flows, classic workflows and plugins in this solution.')]),
    });

    if (hasFlows) {
      pages.push({ path: flowsBasePath, content: serialize(renderFlowSummary(flows, flowsBasePath)) });
      for (const flow of flows) {
        const relatedTables = flowDeps.flowToTables.get(flow.id) ?? [];
        pages.push({ path: `${flowsBasePath}/${s(flow.name)}`, content: serialize(renderSingleFlow(flow, relatedTables, `${base}/Data Model`)) });
      }
    }

    if (hasClassicWorkflows) {
      const cwBasePath = `${base}/Automation/Classic Workflows`;
      pages.push({ path: cwBasePath, content: serialize(renderClassicWorkflowsOverview(classicWorkflows, cwBasePath)) });
      for (const wf of classicWorkflows) {
        pages.push({ path: `${cwBasePath}/${s(wf.name)}`, content: serialize(renderClassicWorkflow(wf)) });
      }
    }

    if (hasPlugins) {
      const pluginsBasePath = `${base}/Automation/Plugins`;
      pages.push({ path: pluginsBasePath, content: serialize(renderPluginSummary(validAssemblies)) });

      for (const assembly of validAssemblies) {
        const safeAssemblyName = s(assembly.assemblyName.replace(/\./g, '-'));
        const assemblyBasePath = `${pluginsBasePath}/${safeAssemblyName}`;

        pages.push({ path: assemblyBasePath, content: serialize(renderAssemblyIndex(assembly, assemblyBasePath)) });

        for (const fullName of assembly.pluginTypeNames) {
          const shortName = fullName.startsWith(assembly.assemblyName + '.')
            ? fullName.slice(assembly.assemblyName.length + 1)
            : fullName;
          const steps = assembly.steps.filter(st => st.className === shortName);
          pages.push({
            path: `${assemblyBasePath}/${s(shortName)}`,
            content: serialize(renderSinglePluginType(shortName, steps, assembly)),
          });
        }
      }
    }
  }

  // ---- Custom Code / Web Resources ----
  const jsResources = webResources.filter(r => r.resourceType === 'JavaScript');
  if (jsResources.length > 0) {
    const wrBasePath = `${base}/Custom Code/Web Resources`;

    pages.push({
      path: `${base}/Custom Code`,
      content: serialize([h(1, 'Custom Code'), toc()]),
    });
    pages.push({ path: wrBasePath, content: serialize(renderWebResourceSummary(jsResources)) });
    for (const resource of jsResources) {
      const title = resource.name.split('/').pop() ?? resource.name;
      pages.push({ path: `${wrBasePath}/${s(title)}`, content: serialize(renderWebResourceDetail(resource)) });
    }
  }

  // ---- Security Roles ----
  if (securityRoles.length > 0) {
    const secBasePath = `${base}/Security`;
    pages.push({ path: secBasePath, content: serialize(renderSecurityRolesIndex(securityRoles, secBasePath)) });
    for (const role of securityRoles) {
      pages.push({ path: `${secBasePath}/${s(encodeRoleName(role.name))}`, content: serialize(renderSecurityRolePage(role)) });
    }
  }

  // ---- Integrations ----
  if (envVars.length > 0 || connectionRefs.length > 0) {
    pages.push({
      path: `${base}/Integrations`,
      content: serialize([h(1, 'Integrations'), toc()]),
    });
    if (envVars.length > 0) {
      pages.push({ path: `${base}/Integrations/Environment Variables`, content: serialize(renderEnvironmentVariablesPage(envVars)) });
    }
    if (connectionRefs.length > 0) {
      pages.push({ path: `${base}/Integrations/Connection References`, content: serialize(renderConnectionReferencesPage(connectionRefs)) });
    }
  }

  // ---- Global Choices ----
  if (globalChoices.length > 0) {
    const choicesBasePath = `${base}/Global Choices`;
    pages.push({ path: choicesBasePath, content: serialize(renderGlobalChoicesIndex(globalChoices, choicesBasePath)) });
    for (const choice of globalChoices) {
      pages.push({ path: `${choicesBasePath}/${s(encodeChoiceName(choice.displayName))}`, content: serialize(renderGlobalChoicePage(choice)) });
    }
  }

  // ---- Email Templates ----
  if (emailTemplates.length > 0) {
    const emailBasePath = `${base}/Email Templates`;
    pages.push({ path: emailBasePath, content: serialize(renderEmailTemplatesIndex(emailTemplates, emailBasePath)) });
    for (const template of emailTemplates) {
      pages.push({ path: `${emailBasePath}/${s(template.title)}`, content: serialize(renderEmailTemplatePage(template)) });
    }
  }

  // ---- Model-Driven Apps ----
  if (modelDrivenApps.length > 0) {
    const appsBasePath = `${base}/Model-Driven Apps`;
    pages.push({ path: appsBasePath, content: serialize(renderModelDrivenAppsIndex(modelDrivenApps, appsBasePath)) });
    for (const app of modelDrivenApps) {
      pages.push({ path: `${appsBasePath}/${s(app.displayName)}`, content: serialize(renderModelDrivenAppPage(app)) });
    }
  }

  // ---- Power Pages ----
  if (powerPages.length > 0) {
    const ppBasePath = `${base}/Power Pages`;
    pages.push({ path: ppBasePath, content: serialize(renderPowerPagesIndex(powerPages, ppBasePath)) });
    for (const site of powerPages) {
      pages.push({ path: `${ppBasePath}/${s(site.name)}`, content: serialize(renderPowerPagesSitePage(site)) });
    }
  }

  return dedupePagePaths(pages);
}
