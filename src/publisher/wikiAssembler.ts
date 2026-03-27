import type { DocGenConfig } from '../config/index.js';
import type {
  SolutionModel, FlowModel, PluginAssemblyModel, WebResourceModel,
  SecurityRoleModel, ClassicWorkflowModel, BusinessRuleModel, EnvironmentVariableModel,
  GlobalChoiceModel, EmailTemplateModel, ModelDrivenAppModel, ConnectionReferenceModel,
} from '../ir/index.js';
import type { WikiPage } from './wikiPublisher.js';
import { generateERDiagram } from '../enrichment/erdGenerator.js';
import {
  renderOverviewMarkdown,
  renderTableIndexMarkdown, renderTableColumnsMarkdown, renderTableViewsMarkdown,
  renderTableFormsMarkdown, renderTableRelationshipsMarkdown,
  renderTableBusinessRulesMarkdown, renderSingleBusinessRuleMarkdown,
  renderFlowSummaryMarkdown, renderSingleFlowMarkdown,
  renderPluginSummaryMarkdown, renderAssemblyIndexMarkdown, renderSinglePluginTypeMarkdown,
  renderWebResourceSummaryMarkdown, renderWebResourceDetailMarkdown,
  renderClassicWorkflowMarkdown, renderClassicWorkflowsOverview,
  renderSecurityRolesIndex, renderSecurityRolePage, encodeRoleName,
  renderEnvironmentVariablesPage,
  renderConnectionReferencesPage,
  renderGlobalChoicesIndex, renderGlobalChoicePage, encodeChoiceName,
  renderEmailTemplatesIndex, renderEmailTemplatePage,
  renderModelDrivenAppsIndex, renderModelDrivenAppPage,
} from '../renderers/index.js';

/**
 * Sanitise a string for use as an ADO Wiki page path segment.
 * ADO interprets '/' as a path separator and '?' as a query string.
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
    content: renderOverviewMarkdown(
      solutions, flows, pluginAssemblies.filter(a => a.assemblyName.trim() !== ''),
      webResources, classicWorkflows, businessRules,
      securityRoles, envVars, globalChoices,
      emailTemplates, modelDrivenApps, connectionRefs
    ),
  });

  // ---- Data Model ----
  const erdDiagram = config.parse.excludeStandardRelationships
    ? generateERDiagram(mergedSolution.tables, solutions[0]?.publisher?.prefix ?? '', config.erd)
    : generateERDiagram(mergedSolution.tables, undefined, config.erd);

  pages.push({
    path: `${base}/Data Model`,
    content: erdDiagram
      ? `# Data Model\n\n${erdDiagram}\n\n[[_TOSP_]]\n`
      : `# Data Model\n\n[[_TOSP_]]\n`,
  });

  for (const table of mergedSolution.tables) {
    const tablePath = `${base}/Data Model/${s(table.displayName)}`;
    const tableRules = businessRules.filter(
      r => r.entity.toLowerCase() === table.logicalName.toLowerCase()
    );

    // Table index page — overview metadata + [[_TOSP_]]
    pages.push({
      path: tablePath,
      content: renderTableIndexMarkdown(table),
    });

    // Columns — always shown
    pages.push({
      path: `${tablePath}/Columns`,
      content: renderTableColumnsMarkdown(table),
    });

    // Views
    if (config.components.views) {
      pages.push({
        path: `${tablePath}/Views`,
        content: renderTableViewsMarkdown(table),
      });
    }

    // Forms
    if (config.components.forms) {
      pages.push({
        path: `${tablePath}/Forms`,
        content: renderTableFormsMarkdown(table, config),
      });
    }

    // Relationships
    if (config.components.relationships) {
      pages.push({
        path: `${tablePath}/Relationships`,
        content: renderTableRelationshipsMarkdown(table),
      });
    }

    // Business Rules — index + one subpage per rule
    const brBasePath = `${tablePath}/Business Rules`;
    pages.push({
      path: brBasePath,
      content: renderTableBusinessRulesMarkdown(table, tableRules),
    });

    for (const rule of tableRules) {
      pages.push({
        path: `${brBasePath}/${s(rule.name)}`,
        content: renderSingleBusinessRuleMarkdown(rule),
      });
    }
  }

  // ---- Automation ----
  const hasFlows = flows.length > 0;
  const validAssemblies = pluginAssemblies.filter(a => a.assemblyName.trim() !== '');
  const hasPlugins = validAssemblies.length > 0;
  const hasClassicWorkflows = classicWorkflows.length > 0;

  if (hasFlows || hasPlugins || hasClassicWorkflows) {
    pages.push({
      path: `${base}/Automation`,
      content: `# Automation\n\nPower Automate flows, classic workflows and plugins in this solution.\n`,
    });

    // ---- Modern Flows ----
    if (hasFlows) {
      const flowsBasePath = `${base}/Automation/Flows`;
      pages.push({
        path: flowsBasePath,
        content: renderFlowSummaryMarkdown(flows, flowsBasePath),
      });

      for (const flow of flows) {
        pages.push({
          path: `${flowsBasePath}/${s(flow.name)}`,
          content: renderSingleFlowMarkdown(flow),
        });
      }
    }

    // ---- Classic Workflows ----
    if (hasClassicWorkflows) {
      const cwBasePath = `${base}/Automation/Classic Workflows`;
      pages.push({
        path: cwBasePath,
        content: renderClassicWorkflowsOverview(classicWorkflows),
      });

      for (const wf of classicWorkflows) {
        pages.push({
          path: `${cwBasePath}/${s(wf.name)}`,
          content: renderClassicWorkflowMarkdown(wf),
        });
      }
    }

    // ---- Plugins ----
    if (hasPlugins) {
      const pluginsBasePath = `${base}/Automation/Plugins`;

      pages.push({
        path: pluginsBasePath,
        content: renderPluginSummaryMarkdown(validAssemblies),
      });

      for (const assembly of validAssemblies) {
        const safeAssemblyName = s(assembly.assemblyName.replace(/\./g, '-'));
        const assemblyBasePath = `${pluginsBasePath}/${safeAssemblyName}`;

        pages.push({
          path: assemblyBasePath,
          content: renderAssemblyIndexMarkdown(assembly, assemblyBasePath),
        });

        for (const fullName of assembly.pluginTypeNames) {
          const shortName = fullName.startsWith(assembly.assemblyName + '.')
            ? fullName.slice(assembly.assemblyName.length + 1)
            : fullName;
          const steps = assembly.steps.filter(st => st.className === shortName);

          pages.push({
            path: `${assemblyBasePath}/${s(shortName)}`,
            content: renderSinglePluginTypeMarkdown(shortName, steps, assembly),
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
      content: `# Custom Code\n\n[[_TOSP_]]\n`,
    });

    pages.push({
      path: wrBasePath,
      content: renderWebResourceSummaryMarkdown(jsResources),
    });

    for (const resource of jsResources) {
      const title = resource.name.split('/').pop() ?? resource.name;
      pages.push({
        path: `${wrBasePath}/${s(title)}`,
        content: renderWebResourceDetailMarkdown(resource),
      });
    }
  }

  // ---- Security Roles----
  if (securityRoles.length > 0) {
    const secBasePath = `${base}/Security`;

    pages.push({
      path: secBasePath,
      content: renderSecurityRolesIndex(securityRoles, secBasePath),
    });

    for (const role of securityRoles) {
      pages.push({
        path: `${secBasePath}/${s(encodeRoleName(role.name))}`,
        content: renderSecurityRolePage(role),
      });
    }
  }

  // ---- Integrations ----
  if (envVars.length > 0 || connectionRefs.length > 0) {
    pages.push({
      path: `${base}/Integrations`,
      content: `# Integrations\n\n[[_TOSP_]]\n`,
    });

    if (envVars.length > 0) {
      pages.push({
        path: `${base}/Integrations/Environment Variables`,
        content: renderEnvironmentVariablesPage(envVars),
      });
    }

    if (connectionRefs.length > 0) {
      pages.push({
        path: `${base}/Integrations/Connection References`,
        content: renderConnectionReferencesPage(connectionRefs),
      });
    }
  }

  // ---- Global Choices ----
  if (globalChoices.length > 0) {
    const choicesBasePath = `${base}/Global Choices`;
    pages.push({
      path: choicesBasePath,
      content: renderGlobalChoicesIndex(globalChoices, choicesBasePath),
    });
    for (const choice of globalChoices) {
      pages.push({
        path: `${choicesBasePath}/${s(encodeChoiceName(choice.displayName))}`,
        content: renderGlobalChoicePage(choice),
      });
    }
  }

  // ---- Email Templates ----
  if (emailTemplates.length > 0) {
    const emailBasePath = `${base}/Email Templates`;
    pages.push({
      path: emailBasePath,
      content: renderEmailTemplatesIndex(emailTemplates, emailBasePath),
    });
    for (const template of emailTemplates) {
      pages.push({
        path: `${emailBasePath}/${s(template.title)}`,
        content: renderEmailTemplatePage(template),
      });
    }
  }

  // ---- Model-Driven Apps ----
  if (modelDrivenApps.length > 0) {
    const appsBasePath = `${base}/Model-Driven Apps`;
    pages.push({
      path: appsBasePath,
      content: renderModelDrivenAppsIndex(modelDrivenApps, appsBasePath),
    });
    for (const app of modelDrivenApps) {
      pages.push({
        path: `${appsBasePath}/${s(app.displayName)}`,
        content: renderModelDrivenAppPage(app),
      });
    }
  }
  return pages;
}