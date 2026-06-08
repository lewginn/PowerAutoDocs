// src/publisher/pdfAssembler.ts
//
// Assembles all IR into a single PDF document.
// Mirrors docAssembler.ts section-by-section — same structure, same heading
// offsets — but emits pdfmake content via PdfSerializer instead of docx blocks.
//
// Heading offsets:
//   depth 0 (section titles: Data Model, Automation, etc.)  → offset 0  → h1 stays h1
//   depth 1 (entity / flow / plugin)                        → offset 1  → h1 becomes h2
//   depth 2 (Columns, Views, Forms, individual flow/rule)   → offset 2  → h1 becomes h3

import * as fs from 'fs';
import * as path from 'path';
import type { DocGenConfig } from '../config/index.js';
import type {
  SolutionModel, FlowModel, PluginAssemblyModel, WebResourceModel,
  SecurityRoleModel, ClassicWorkflowModel, BusinessRuleModel, EnvironmentVariableModel,
  GlobalChoiceModel, EmailTemplateModel, ModelDrivenAppModel, ConnectionReferenceModel,
} from '../ir/index.js';
import { generateERDiagram } from '../enrichment/erdGenerator.js';
import { resolveFlowTableDependencies } from '../enrichment/dependencyResolver.js';
import { serializeBlocks, buildDocDefinition, buildToc, toBuffer } from '../docmodel/PdfSerializer.js';
import { h, mermaid, pt } from '../docmodel/nodes.js';
import type { DocNode } from '../docmodel/nodes.js';
import type { Content } from 'pdfmake/interfaces.js';
import {
  renderOverview,
  renderTableIndex, renderTableColumns, renderTableViews,
  renderTableForms, renderTableRelationships, renderTableUsedByFlows,
  renderTableBusinessRules, renderSingleBusinessRule,
  renderFlowSummary, renderSingleFlow,
  renderPluginSummary, renderAssemblyIndex, renderSinglePluginType,
  renderWebResourceSummary, renderWebResourceDetail,
  renderClassicWorkflow, renderClassicWorkflowsOverview,
  renderSecurityRolesIndex, renderSecurityRolePage,
  renderEnvironmentVariablesPage,
  renderConnectionReferencesPage,
  renderGlobalChoicesIndex, renderGlobalChoicePage,
  renderEmailTemplatesIndex, renderEmailTemplatePage,
  renderModelDrivenAppsIndex, renderModelDrivenAppPage,
} from '../renderers/index.js';

/**
 * Mermaid diagrams are skipped in PDF output (PdfSerializer returns null for
 * `mermaid` nodes, matching Word). Renderers shared with the wiki — e.g.
 * renderSingleFlow's "Diagram" section — emit a heading immediately before
 * the diagram, which would otherwise be left dangling with nothing beneath it.
 * Drop any heading that's directly followed by a mermaid node.
 */
function dropOrphanedDiagramHeadings(nodes: DocNode[]): DocNode[] {
  return nodes.filter((node, i) => !(node.type === 'heading' && nodes[i + 1]?.type === 'mermaid'));
}

/** Add nodes to the content array at a given heading offset. */
function push(content: Content[], nodes: DocNode[], offset: number): void {
  content.push(...serializeBlocks(dropOrphanedDiagramHeadings(nodes), offset));
}

export async function buildPdfDocument(
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
  outputPath: string,
): Promise<void> {
  const content: Content[] = [];

  // ---- Table of Contents ----
  content.push(buildToc());

  // ---- Overview ---- (depth 0)
  push(content, renderOverview(
    solutions, flows, pluginAssemblies.filter(a => a.assemblyName.trim() !== ''),
    webResources, classicWorkflows, businessRules,
    securityRoles, envVars, globalChoices,
    emailTemplates, modelDrivenApps, connectionRefs
  ), 0);

  // ---- Data Model ---- (section at depth 0, tables at depth 1, subpages at depth 2)
  const erdDiagram = config.parse.excludeStandardRelationships
    ? generateERDiagram(mergedSolution.tables, solutions[0]?.publisher?.prefix ?? '', config.erd)
    : generateERDiagram(mergedSolution.tables, undefined, config.erd);

  push(content, [h(1, 'Data Model')], 0);
  if (erdDiagram) push(content, [mermaid(erdDiagram)], 0);

  const flowDeps = resolveFlowTableDependencies(flows, mergedSolution.tables);

  for (const table of mergedSolution.tables) {
    const tableRules = businessRules.filter(
      r => r.entity.toLowerCase() === table.logicalName.toLowerCase()
    );
    const tableFlows = flowDeps.tableToFlows.get(table.logicalName.toLowerCase()) ?? [];

    // Table index (drop toc_placeholder — content follows inline)
    push(content, renderTableIndex(table).filter(n => n.type !== 'toc_placeholder'), 1);
    push(content, renderTableColumns(table), 2);

    if (config.components.views) {
      push(content, renderTableViews(table), 2);
    }
    if (config.components.forms) {
      push(content, renderTableForms(table, config), 2);
    }
    if (config.components.relationships) {
      push(content, renderTableRelationships(table), 2);
    }
    if (tableFlows.length > 0) {
      push(content, renderTableUsedByFlows(table, tableFlows), 2);
    }

    if (tableRules.length > 0) {
      push(content, renderTableBusinessRules(table, tableRules).filter(n => n.type !== 'toc_placeholder'), 2);
      for (const rule of tableRules) {
        push(content, renderSingleBusinessRule(rule), 3);
      }
    }
  }

  // ---- Automation ---- (depth 0 section, depth 1 subsections, depth 2 items)
  const hasFlows            = flows.length > 0;
  const validAssemblies     = pluginAssemblies.filter(a => a.assemblyName.trim() !== '');
  const hasPlugins          = validAssemblies.length > 0;
  const hasClassicWorkflows = classicWorkflows.length > 0;

  if (hasFlows || hasPlugins || hasClassicWorkflows) {
    push(content, [h(1, 'Automation'), pt('Power Automate flows, classic workflows and plugins in this solution.')], 0);

    if (hasFlows) {
      push(content, renderFlowSummary(flows), 1);
      for (const flow of flows) {
        const relatedTables = flowDeps.flowToTables.get(flow.id) ?? [];
        push(content, renderSingleFlow(flow, relatedTables), 2);
      }
    }

    if (hasClassicWorkflows) {
      push(content, [h(1, 'Classic Workflows'), ...renderClassicWorkflowsOverview(classicWorkflows)], 1);
      for (const wf of classicWorkflows) {
        push(content, renderClassicWorkflow(wf), 2);
      }
    }

    if (hasPlugins) {
      push(content, renderPluginSummary(validAssemblies), 1);
      for (const assembly of validAssemblies) {
        push(content, renderAssemblyIndex(assembly, ''), 2);
        for (const fullName of assembly.pluginTypeNames) {
          const shortName = fullName.startsWith(assembly.assemblyName + '.')
            ? fullName.slice(assembly.assemblyName.length + 1)
            : fullName;
          const steps = assembly.steps.filter(st => st.className === shortName);
          push(content, renderSinglePluginType(shortName, steps, assembly), 3);
        }
      }
    }
  }

  // ---- Custom Code / Web Resources ----
  const jsResources = webResources.filter(r => r.resourceType === 'JavaScript');
  if (jsResources.length > 0) {
    push(content, [h(1, 'Custom Code')], 0);
    push(content, renderWebResourceSummary(jsResources), 1);
    for (const resource of jsResources) {
      push(content, renderWebResourceDetail(resource), 2);
    }
  }

  // ---- Security Roles ----
  if (securityRoles.length > 0) {
    push(content, renderSecurityRolesIndex(securityRoles, ''), 0);
    for (const role of securityRoles) {
      push(content, renderSecurityRolePage(role), 1);
    }
  }

  // ---- Integrations ----
  if (envVars.length > 0 || connectionRefs.length > 0) {
    push(content, [h(1, 'Integrations')], 0);
    if (envVars.length > 0)    push(content, renderEnvironmentVariablesPage(envVars), 1);
    if (connectionRefs.length > 0) push(content, renderConnectionReferencesPage(connectionRefs), 1);
  }

  // ---- Global Choices ----
  if (globalChoices.length > 0) {
    push(content, renderGlobalChoicesIndex(globalChoices, ''), 0);
    for (const choice of globalChoices) {
      push(content, renderGlobalChoicePage(choice), 1);
    }
  }

  // ---- Email Templates ----
  if (emailTemplates.length > 0) {
    push(content, renderEmailTemplatesIndex(emailTemplates, ''), 0);
    for (const template of emailTemplates) {
      push(content, renderEmailTemplatePage(template), 1);
    }
  }

  // ---- Model-Driven Apps ----
  if (modelDrivenApps.length > 0) {
    push(content, renderModelDrivenAppsIndex(modelDrivenApps, ''), 0);
    for (const app of modelDrivenApps) {
      push(content, renderModelDrivenAppPage(app), 1);
    }
  }

  // ---- Write to disk ----
  const buffer = await toBuffer(buildDocDefinition(content));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
}
