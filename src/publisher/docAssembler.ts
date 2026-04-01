// src/publisher/docAssembler.ts
//
// Assembles all IR into a single Word document.
// Mirrors the section structure of wikiAssembler, but instead of WikiPage[]
// it produces one flat array of docx blocks — one continuous document.
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
import { serializeBlocks, buildDocument, buildToc, toBuffer } from '../docmodel/DocxSerializer.js';
import { h, toc, mermaid, pt } from '../docmodel/nodes.js';
import type { DocNode } from '../docmodel/nodes.js';
import type { Paragraph, Table, TableOfContents } from 'docx';
import {
  renderOverview,
  renderTableIndex, renderTableColumns, renderTableViews,
  renderTableForms, renderTableRelationships,
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

type Block = Paragraph | Table | TableOfContents;

/** Add nodes to the block array at a given heading offset. */
function push(blocks: Block[], nodes: DocNode[], offset: number): void {
  blocks.push(...serializeBlocks(nodes, offset));
}

export async function buildWordDocument(
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
  const blocks: Block[] = [];

  // ---- Table of Contents ----
  blocks.push(buildToc());

  // ---- Overview ---- (depth 0)
  push(blocks, renderOverview(
    solutions, flows, pluginAssemblies.filter(a => a.assemblyName.trim() !== ''),
    webResources, classicWorkflows, businessRules,
    securityRoles, envVars, globalChoices,
    emailTemplates, modelDrivenApps, connectionRefs
  ), 0);

  // ---- Data Model ---- (section at depth 0, tables at depth 1, subpages at depth 2)
  const erdDiagram = config.parse.excludeStandardRelationships
    ? generateERDiagram(mergedSolution.tables, solutions[0]?.publisher?.prefix ?? '', config.erd)
    : generateERDiagram(mergedSolution.tables, undefined, config.erd);

  push(blocks, [h(1, 'Data Model')], 0);
  if (erdDiagram) push(blocks, [mermaid(erdDiagram)], 0);

  for (const table of mergedSolution.tables) {
    const tableRules = businessRules.filter(
      r => r.entity.toLowerCase() === table.logicalName.toLowerCase()
    );

    // Table index (drop toc_placeholder — content follows inline)
    push(blocks, renderTableIndex(table).filter(n => n.type !== 'toc_placeholder'), 1);
    push(blocks, renderTableColumns(table), 2);

    if (config.components.views) {
      push(blocks, renderTableViews(table), 2);
    }
    if (config.components.forms) {
      push(blocks, renderTableForms(table, config), 2);
    }
    if (config.components.relationships) {
      push(blocks, renderTableRelationships(table), 2);
    }

    if (tableRules.length > 0) {
      push(blocks, renderTableBusinessRules(table, tableRules).filter(n => n.type !== 'toc_placeholder'), 2);
      for (const rule of tableRules) {
        push(blocks, renderSingleBusinessRule(rule), 3);
      }
    }
  }

  // ---- Automation ---- (depth 0 section, depth 1 subsections, depth 2 items)
  const hasFlows            = flows.length > 0;
  const validAssemblies     = pluginAssemblies.filter(a => a.assemblyName.trim() !== '');
  const hasPlugins          = validAssemblies.length > 0;
  const hasClassicWorkflows = classicWorkflows.length > 0;

  if (hasFlows || hasPlugins || hasClassicWorkflows) {
    push(blocks, [h(1, 'Automation'), pt('Power Automate flows, classic workflows and plugins in this solution.')], 0);

    if (hasFlows) {
      push(blocks, renderFlowSummary(flows), 1);
      for (const flow of flows) {
        push(blocks, renderSingleFlow(flow), 2);
      }
    }

    if (hasClassicWorkflows) {
      push(blocks, [h(1, 'Classic Workflows'), ...renderClassicWorkflowsOverview(classicWorkflows)], 1);
      for (const wf of classicWorkflows) {
        push(blocks, renderClassicWorkflow(wf), 2);
      }
    }

    if (hasPlugins) {
      push(blocks, renderPluginSummary(validAssemblies), 1);
      for (const assembly of validAssemblies) {
        push(blocks, renderAssemblyIndex(assembly, ''), 2);
        for (const fullName of assembly.pluginTypeNames) {
          const shortName = fullName.startsWith(assembly.assemblyName + '.')
            ? fullName.slice(assembly.assemblyName.length + 1)
            : fullName;
          const steps = assembly.steps.filter(st => st.className === shortName);
          push(blocks, renderSinglePluginType(shortName, steps, assembly), 3);
        }
      }
    }
  }

  // ---- Custom Code / Web Resources ----
  const jsResources = webResources.filter(r => r.resourceType === 'JavaScript');
  if (jsResources.length > 0) {
    push(blocks, [h(1, 'Custom Code')], 0);
    push(blocks, renderWebResourceSummary(jsResources), 1);
    for (const resource of jsResources) {
      push(blocks, renderWebResourceDetail(resource), 2);
    }
  }

  // ---- Security Roles ----
  if (securityRoles.length > 0) {
    push(blocks, renderSecurityRolesIndex(securityRoles, ''), 0);
    for (const role of securityRoles) {
      push(blocks, renderSecurityRolePage(role), 1);
    }
  }

  // ---- Integrations ----
  if (envVars.length > 0 || connectionRefs.length > 0) {
    push(blocks, [h(1, 'Integrations')], 0);
    if (envVars.length > 0)    push(blocks, renderEnvironmentVariablesPage(envVars), 1);
    if (connectionRefs.length > 0) push(blocks, renderConnectionReferencesPage(connectionRefs), 1);
  }

  // ---- Global Choices ----
  if (globalChoices.length > 0) {
    push(blocks, renderGlobalChoicesIndex(globalChoices, ''), 0);
    for (const choice of globalChoices) {
      push(blocks, renderGlobalChoicePage(choice), 1);
    }
  }

  // ---- Email Templates ----
  if (emailTemplates.length > 0) {
    push(blocks, renderEmailTemplatesIndex(emailTemplates, ''), 0);
    for (const template of emailTemplates) {
      push(blocks, renderEmailTemplatePage(template), 1);
    }
  }

  // ---- Model-Driven Apps ----
  if (modelDrivenApps.length > 0) {
    push(blocks, renderModelDrivenAppsIndex(modelDrivenApps, ''), 0);
    for (const app of modelDrivenApps) {
      push(blocks, renderModelDrivenAppPage(app), 1);
    }
  }

  // ---- Write to disk ----
  const doc    = buildDocument(blocks);
  const buffer = await toBuffer(doc);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
}
