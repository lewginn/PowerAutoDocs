import type { DocGenConfig } from '../config/index.js';
import type {
  SolutionModel, FlowModel, PluginAssemblyModel, WebResourceModel,
  SecurityRoleModel, ClassicWorkflowModel, BusinessRuleModel, EnvironmentVariableModel,
  GlobalChoiceModel, EmailTemplateModel, ModelDrivenAppModel, ConnectionReferenceModel,
} from '../ir/index.js';
import type { WikiPage } from './wikiPublisher.js';
import { generateERDiagram } from '../enrichment/erdGenerator.js';
import { serialize } from '../docmodel/MarkdownSerializer.js';
import { h, toc, mermaid, pt } from '../docmodel/nodes.js';
import {
  renderOverview,
  renderTableIndex, renderTableColumns, renderTableViews,
  renderTableForms, renderTableRelationships,
  renderTableBusinessRules, renderSingleBusinessRule,
  renderFlowSummary, renderSingleFlow,
  renderPluginSummary, renderAssemblyIndex, renderSinglePluginType,
  renderWebResourceSummary, renderWebResourceDetail,
  renderClassicWorkflow, renderClassicWorkflowsOverview,
  renderSecurityRolesIndex, renderSecurityRolePage, encodeRoleName,
  renderEnvironmentVariablesPage,
  renderConnectionReferencesPage,
  renderGlobalChoicesIndex, renderGlobalChoicePage, encodeChoiceName,
  renderEmailTemplatesIndex, renderEmailTemplatePage,
  renderModelDrivenAppsIndex, renderModelDrivenAppPage,
} from '../renderers/index.js';

/**
 * Sanitise a string for use as an ADO Wiki page path segment.
 */
function s(name: string): string {
  return name
    .replace(/\//g, '-')
    .replace(/\?/g, '')
    .replace(/[#%]/g, '')
    .trim();
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
  const erdDiagram = config.parse.excludeStandardRelationships
    ? generateERDiagram(mergedSolution.tables, solutions[0]?.publisher?.prefix ?? '', config.erd)
    : generateERDiagram(mergedSolution.tables, undefined, config.erd);

  pages.push({
    path: `${base}/Data Model`,
    content: erdDiagram
      ? serialize([h(1, 'Data Model'), mermaid(erdDiagram), toc()])
      : serialize([h(1, 'Data Model'), toc()]),
  });

  for (const table of mergedSolution.tables) {
    const tablePath = `${base}/Data Model/${s(table.displayName)}`;
    const tableRules = businessRules.filter(
      r => r.entity.toLowerCase() === table.logicalName.toLowerCase()
    );

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

    const brBasePath = `${tablePath}/Business Rules`;
    pages.push({ path: brBasePath, content: serialize(renderTableBusinessRules(table, tableRules)) });
    for (const rule of tableRules) {
      pages.push({ path: `${brBasePath}/${s(rule.name)}`, content: serialize(renderSingleBusinessRule(rule)) });
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
      const flowsBasePath = `${base}/Automation/Flows`;
      pages.push({ path: flowsBasePath, content: serialize(renderFlowSummary(flows, flowsBasePath)) });
      for (const flow of flows) {
        pages.push({ path: `${flowsBasePath}/${s(flow.name)}`, content: serialize(renderSingleFlow(flow)) });
      }
    }

    if (hasClassicWorkflows) {
      const cwBasePath = `${base}/Automation/Classic Workflows`;
      pages.push({ path: cwBasePath, content: serialize(renderClassicWorkflowsOverview(classicWorkflows)) });
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

  return pages;
}
