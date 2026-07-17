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
import { resolveFlowTableDependencies } from '../enrichment/dependencyResolver.js';
import { renderDiagramPng, closeMermaidBrowser, resolveChromeExecutable } from '../enrichment/mermaidRenderer.js';
import { serializeBlocks, buildDocument, buildToc, toBuffer } from '../docmodel/DocxSerializer.js';
import type { MermaidRenderer } from '../docmodel/DocxSerializer.js';
import { h, toc, mermaid, pt } from '../docmodel/nodes.js';
import type { DocNode } from '../docmodel/nodes.js';
import type { Paragraph, Table, TableOfContents } from 'docx';
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

type Block = Paragraph | Table | TableOfContents;

// Cache directory for rendered Mermaid PNGs, keyed by content hash — same
// "unchanged input, skip the work" pattern as the AI enrichment cache file.
// Committable: unchanged diagrams across runs/machines never re-render.
const DIAGRAM_CACHE_DIR = '.powerautodocs-diagram-cache';

/**
 * Mermaid diagrams are skipped when rendering is unavailable (no local
 * Chrome/Edge found — see mermaidRenderer.ts). Renderers shared with the
 * wiki — e.g. renderSingleFlow's "Diagram" section — emit a heading
 * immediately before the diagram, which would otherwise be left dangling
 * with nothing beneath it. Drop any heading that's directly followed by a
 * mermaid node in that case only; when rendering succeeds the heading stays.
 */
function dropOrphanedDiagramHeadings(nodes: DocNode[]): DocNode[] {
  return nodes.filter((node, i) => !(node.type === 'heading' && nodes[i + 1]?.type === 'mermaid'));
}

/** Add nodes to the block array at a given heading offset. */
async function push(
  blocks: Block[],
  nodes: DocNode[],
  offset: number,
  renderMermaid: MermaidRenderer | undefined,
): Promise<void> {
  const prepared = renderMermaid ? nodes : dropOrphanedDiagramHeadings(nodes);
  blocks.push(...(await serializeBlocks(prepared, offset, renderMermaid)));
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

  // Diagram rendering needs a local Chrome/Edge (see mermaidRenderer.ts) —
  // checked once up front (no browser launch), same fail-fast-then-degrade
  // shape as AI enrichment config validation, rather than failing per-diagram
  // partway through the run.
  let renderMermaid: MermaidRenderer | undefined;
  if (config.output.wordDiagrams !== false) {
    try {
      resolveChromeExecutable();
      renderMermaid = (code: string) => renderDiagramPng(code, DIAGRAM_CACHE_DIR);
    } catch (err) {
      console.warn(`  ✗ Mermaid diagrams skipped in Word output — ${(err as Error).message}`);
    }
  }

  // ---- Table of Contents ----
  blocks.push(buildToc());

  // ---- Overview ---- (depth 0)
  await push(blocks, renderOverview(
    solutions, flows, pluginAssemblies.filter(a => a.assemblyName.trim() !== ''),
    webResources, classicWorkflows, businessRules,
    securityRoles, envVars, globalChoices,
    emailTemplates, modelDrivenApps, connectionRefs
  ), 0, renderMermaid);

  // ---- Data Model ---- (section at depth 0, tables at depth 1, subpages at depth 2)
  const erdDiagram = config.parse.excludeStandardRelationships
    ? generateERDiagram(mergedSolution.tables, solutions[0]?.publisher?.prefix ?? '', config.erd)
    : generateERDiagram(mergedSolution.tables, undefined, config.erd);

  await push(blocks, [h(1, 'Data Model')], 0, renderMermaid);
  if (erdDiagram) await push(blocks, [mermaid(erdDiagram)], 0, renderMermaid);

  const flowDeps = resolveFlowTableDependencies(flows, mergedSolution.tables);

  for (const table of mergedSolution.tables) {
    const tableRules = businessRules.filter(
      r => r.entity.toLowerCase() === table.logicalName.toLowerCase()
    );
    const tableFlows = flowDeps.tableToFlows.get(table.logicalName.toLowerCase()) ?? [];

    // Table index (drop toc_placeholder — content follows inline)
    await push(blocks, renderTableIndex(table).filter(n => n.type !== 'toc_placeholder'), 1, renderMermaid);
    await push(blocks, renderTableColumns(table), 2, renderMermaid);

    if (config.components.views) {
      await push(blocks, renderTableViews(table), 2, renderMermaid);
    }
    if (config.components.forms) {
      await push(blocks, renderTableForms(table, config), 2, renderMermaid);
    }
    if (config.components.relationships) {
      await push(blocks, renderTableRelationships(table), 2, renderMermaid);
    }
    if (tableFlows.length > 0) {
      await push(blocks, renderTableUsedByFlows(table, tableFlows), 2, renderMermaid);
    }

    if (tableRules.length > 0) {
      await push(blocks, renderTableBusinessRules(table, tableRules).filter(n => n.type !== 'toc_placeholder'), 2, renderMermaid);
      for (const rule of tableRules) {
        await push(blocks, renderSingleBusinessRule(rule), 3, renderMermaid);
      }
    }
  }

  // ---- Automation ---- (depth 0 section, depth 1 subsections, depth 2 items)
  const hasFlows            = flows.length > 0;
  const validAssemblies     = pluginAssemblies.filter(a => a.assemblyName.trim() !== '');
  const hasPlugins          = validAssemblies.length > 0;
  const hasClassicWorkflows = classicWorkflows.length > 0;

  if (hasFlows || hasPlugins || hasClassicWorkflows) {
    await push(blocks, [h(1, 'Automation'), pt('Power Automate flows, classic workflows and plugins in this solution.')], 0, renderMermaid);

    if (hasFlows) {
      await push(blocks, renderFlowSummary(flows), 1, renderMermaid);
      for (const flow of flows) {
        const relatedTables = flowDeps.flowToTables.get(flow.id) ?? [];
        await push(blocks, renderSingleFlow(flow, relatedTables), 2, renderMermaid);
      }
    }

    if (hasClassicWorkflows) {
      await push(blocks, [h(1, 'Classic Workflows'), ...renderClassicWorkflowsOverview(classicWorkflows)], 1, renderMermaid);
      for (const wf of classicWorkflows) {
        await push(blocks, renderClassicWorkflow(wf), 2, renderMermaid);
      }
    }

    if (hasPlugins) {
      await push(blocks, renderPluginSummary(validAssemblies), 1, renderMermaid);
      for (const assembly of validAssemblies) {
        await push(blocks, renderAssemblyIndex(assembly, ''), 2, renderMermaid);
        for (const fullName of assembly.pluginTypeNames) {
          const shortName = fullName.startsWith(assembly.assemblyName + '.')
            ? fullName.slice(assembly.assemblyName.length + 1)
            : fullName;
          const steps = assembly.steps.filter(st => st.className === shortName);
          await push(blocks, renderSinglePluginType(shortName, steps, assembly), 3, renderMermaid);
        }
      }
    }
  }

  // ---- Custom Code / Web Resources ----
  const jsResources = webResources.filter(r => r.resourceType === 'JavaScript');
  if (jsResources.length > 0) {
    await push(blocks, [h(1, 'Custom Code')], 0, renderMermaid);
    await push(blocks, renderWebResourceSummary(jsResources), 1, renderMermaid);
    for (const resource of jsResources) {
      await push(blocks, renderWebResourceDetail(resource), 2, renderMermaid);
    }
  }

  // ---- Security Roles ----
  if (securityRoles.length > 0) {
    await push(blocks, renderSecurityRolesIndex(securityRoles, ''), 0, renderMermaid);
    for (const role of securityRoles) {
      await push(blocks, renderSecurityRolePage(role), 1, renderMermaid);
    }
  }

  // ---- Integrations ----
  if (envVars.length > 0 || connectionRefs.length > 0) {
    await push(blocks, [h(1, 'Integrations')], 0, renderMermaid);
    if (envVars.length > 0)    await push(blocks, renderEnvironmentVariablesPage(envVars), 1, renderMermaid);
    if (connectionRefs.length > 0) await push(blocks, renderConnectionReferencesPage(connectionRefs), 1, renderMermaid);
  }

  // ---- Global Choices ----
  if (globalChoices.length > 0) {
    await push(blocks, renderGlobalChoicesIndex(globalChoices, ''), 0, renderMermaid);
    for (const choice of globalChoices) {
      await push(blocks, renderGlobalChoicePage(choice), 1, renderMermaid);
    }
  }

  // ---- Email Templates ----
  if (emailTemplates.length > 0) {
    await push(blocks, renderEmailTemplatesIndex(emailTemplates, ''), 0, renderMermaid);
    for (const template of emailTemplates) {
      await push(blocks, renderEmailTemplatePage(template), 1, renderMermaid);
    }
  }

  // ---- Model-Driven Apps ----
  if (modelDrivenApps.length > 0) {
    await push(blocks, renderModelDrivenAppsIndex(modelDrivenApps, ''), 0, renderMermaid);
    for (const app of modelDrivenApps) {
      await push(blocks, renderModelDrivenAppPage(app), 1, renderMermaid);
    }
  }

  await closeMermaidBrowser();

  // ---- Write to disk ----
  const doc    = buildDocument(blocks);
  const buffer = await toBuffer(doc);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
}
