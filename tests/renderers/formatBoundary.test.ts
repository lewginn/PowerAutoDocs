// tests/renderers/formatBoundary.test.ts
//
// One rule, enforced across every renderer at once:
//
//   Renderers return DocNode[]. Markdown, docx and PDF syntax belong to the
//   serializer that owns that format — including fences, wrappers and escaping.
//   (.claude/docs/constraints.md)
//
// Why a sweep rather than a per-renderer assertion: this rule has been broken
// twice, in different files, by people who knew the rule. The double-fenced ERD
// came from a renderer emitting its own ```mermaid fence. Later, four separate
// renderers baked markdown backticks into heading and paragraph text — which
// looked correct in the wiki and emitted literal backtick characters into the
// .docx, because DocxSerializer writes heading text verbatim.
//
// A rule that relies on everyone remembering it will be broken again. This test
// makes the next instance fail in CI instead of shipping.
//
// HOW IT WORKS: every fixture below is free of markdown metacharacters. So any
// backtick, fence or emphasis marker appearing in renderer-authored prose must
// have been added by the renderer, and is a bug.
//
// ADDING A RENDERER: add it to RENDERED. A renderer absent from this list is
// unguarded, which is the failure mode this file exists to prevent.

import { describe, it, expect } from 'vitest';
import type { DocNode, InlineNode } from '../../src/docmodel/nodes.js';

import { renderFlowSummary, renderSingleFlow } from '../../src/renderers/flowRenderer.js';
import {
  renderTableIndex, renderTableColumns, renderTableViews, renderTableForms,
  renderTableRelationships, renderTableBusinessRules, renderTableUsedByFlows,
  renderSingleBusinessRule,
} from '../../src/renderers/tableRenderer.js';
import { renderPluginSummary, renderAssemblyIndex, renderSinglePluginType } from '../../src/renderers/pluginRenderer.js';
import { renderWebResourceSummary, renderWebResourceDetail } from '../../src/renderers/webResourceRenderer.js';
import { renderSecurityRolesIndex, renderSecurityRolePage } from '../../src/renderers/securityRoleRenderer.js';
import { renderBusinessRule, renderBusinessRulesOverview } from '../../src/renderers/businessRuleRenderer.js';
import { renderClassicWorkflow, renderClassicWorkflowsOverview } from '../../src/renderers/classicWorkflowRenderer.js';
import { renderGlobalChoicesIndex, renderGlobalChoicePage } from '../../src/renderers/globalChoiceRenderer.js';
import { renderEnvironmentVariablesPage } from '../../src/renderers/environmentVariableRenderer.js';
import { renderEmailTemplatesIndex, renderEmailTemplatePage } from '../../src/renderers/emailTemplateRenderer.js';
import { renderConnectionReferencesPage } from '../../src/renderers/connectionReferenceRenderer.js';
import { renderModelDrivenAppsIndex, renderModelDrivenAppPage } from '../../src/renderers/modelDrivenAppRenderer.js';
import { renderPowerPagesIndex, renderPowerPagesSitePage } from '../../src/renderers/powerPagesRenderer.js';
import { renderOverview } from '../../src/renderers/overviewRenderer.js';

import {
  aBusinessRule, aClassicWorkflow, aColumn, aConnectionReference, aFlow, aForm,
  aGlobalChoice, aModelDrivenApp, anAction, anEmailTemplate, anEnvironmentVariable,
  aPluginAssembly, aPluginStep, aPowerPagesSite, aPrivilege, aRelationship,
  aSecurityRole, aSolution, aTable, aView, aWebResource,
} from '../fixtures/ir.js';
import { aConfig } from '../fixtures/config.js';

// -----------------------------------------------
// Fully-populated fixtures — every optional field set, so optional branches are
// swept too, and no value contains a markdown metacharacter.
// -----------------------------------------------

const flow = aFlow({
  connectionReferences: ['acme_dataverse'],
  aiSummary: 'Creates a part when a widget is created.',
  mermaidDiagram: 'graph TD;\n  A-->B;',
  actions: [anAction({ name: 'Check' }), anAction({ name: 'Then', parentName: 'Check (Yes)', depth: 1 })],
});

const table = aTable({
  aiSummary: 'A thing Acme sells.',
  columns: [aColumn({ isCustom: true }), aColumn({ logicalName: 'name', isCustom: false })],
  relationships: [aRelationship({ isCustom: true }), aRelationship({ name: 'std', isCustom: false })],
  forms: [aForm()],
  views: [aView({ filters: [{ attribute: 'statecode', operator: 'eq', value: '0', depth: 0 }] })],
});

const assembly = aPluginAssembly({
  aiSummary: 'Widget plugins.',
  steps: [aPluginStep({
    filteringAttributes: ['acme_widgetname'],
    images: [{ id: 'i1', name: 'PreImage', imageType: 'PreImage', attributes: ['acme_widgetname'] }],
  })],
});

const webResource = aWebResource({
  aiSummary: 'Widget form logic.',
  namespace: 'Acme.Widget',
  dependencies: ['acme_/Scripts/Shared.js'],
  functions: [{ name: 'OnLoad', isAsync: false, params: ['executionContext'], jsDoc: 'Runs on form load.', aiSummary: 'Sets defaults.' }],
});

const classicWorkflow = aClassicWorkflow({
  aiSummary: 'Stamps approval.',
  triggers: { onCreate: true, onUpdate: true, onDelete: false, onDemand: true, updateFields: ['acme_tier'] },
  steps: [{
    name: 'Check tier', type: 'condition', conditionFields: ['acme_tier'],
    thenSteps: [{ name: 'Stamp', type: 'update', entity: 'acme_widget', setFields: ['acme_approved'] }],
  }],
});

const businessRule = aBusinessRule({ aiSummary: 'Requires a serial for premium widgets.' });
const securityRole = aSecurityRole({ privileges: [aPrivilege()] });
const envVar = anEnvironmentVariable({ currentValue: 'https://uat.example.invalid/api' });

/** Every renderer that returns DocNode[], with a realistic call. */
const RENDERED: ReadonlyArray<readonly [string, DocNode[]]> = [
  ['renderFlowSummary',            renderFlowSummary([flow], '/Flows')],
  ['renderSingleFlow',             renderSingleFlow(flow, [table], '/Tables')],
  ['renderTableIndex',             renderTableIndex(table)],
  ['renderTableColumns',           renderTableColumns(table)],
  ['renderTableViews',             renderTableViews(table)],
  ['renderTableForms',             renderTableForms(table, aConfig({ render: { formLayout: 'detailed' } }))],
  ['renderTableRelationships',     renderTableRelationships(table)],
  ['renderTableBusinessRules',     renderTableBusinessRules(table, [businessRule])],
  ['renderTableUsedByFlows',       renderTableUsedByFlows(table, [flow], '/Flows')],
  ['renderSingleBusinessRule',     renderSingleBusinessRule(businessRule)],
  ['renderPluginSummary',          renderPluginSummary([assembly])],
  ['renderAssemblyIndex',          renderAssemblyIndex(assembly, '/Plugins')],
  ['renderSinglePluginType',       renderSinglePluginType(assembly.pluginTypeNames[0], assembly.steps, assembly)],
  ['renderWebResourceSummary',     renderWebResourceSummary([webResource], '/WebResources')],
  ['renderWebResourceDetail',      renderWebResourceDetail(webResource)],
  ['renderSecurityRolesIndex',     renderSecurityRolesIndex([securityRole], '/Roles')],
  ['renderSecurityRolePage',       renderSecurityRolePage(securityRole)],
  ['renderBusinessRule',           renderBusinessRule(businessRule)],
  ['renderBusinessRulesOverview',  renderBusinessRulesOverview([businessRule])],
  ['renderClassicWorkflow',        renderClassicWorkflow(classicWorkflow)],
  ['renderClassicWorkflowsOverview', renderClassicWorkflowsOverview([classicWorkflow], '/Workflows')],
  ['renderGlobalChoicesIndex',     renderGlobalChoicesIndex([aGlobalChoice()], '/Choices')],
  ['renderGlobalChoicePage',       renderGlobalChoicePage(aGlobalChoice())],
  ['renderEnvironmentVariablesPage', renderEnvironmentVariablesPage([envVar])],
  ['renderEmailTemplatesIndex',    renderEmailTemplatesIndex([anEmailTemplate()], '/Templates')],
  ['renderEmailTemplatePage',      renderEmailTemplatePage(anEmailTemplate())],
  ['renderConnectionReferencesPage', renderConnectionReferencesPage([aConnectionReference()])],
  ['renderModelDrivenAppsIndex',   renderModelDrivenAppsIndex([aModelDrivenApp()], '/Apps')],
  ['renderModelDrivenAppPage',     renderModelDrivenAppPage(aModelDrivenApp())],
  ['renderPowerPagesIndex',        renderPowerPagesIndex([aPowerPagesSite()], '/PowerPages')],
  ['renderPowerPagesSitePage',     renderPowerPagesSitePage(aPowerPagesSite())],
  ['renderOverview',               renderOverview(
    [aSolution({ tables: [table] })], [flow], [assembly], [webResource], [classicWorkflow],
    [businessRule], [securityRole], [envVar], [aGlobalChoice()], [anEmailTemplate()],
    [aModelDrivenApp()], [aConnectionReference()],
  )],
];

// -----------------------------------------------
// Collecting renderer-authored prose
// -----------------------------------------------
//
// Only prose the renderer wrote is checked. Deliberately excluded:
//   code inline values  — the serializer wraps these; the value is the payload
//   code_block.text     — verbatim content (an email body may contain anything)
//   mermaid.code        — Mermaid DSL, not markdown
//   link.href           — a raw path
// Those carry data, so a metacharacter in them says nothing about the renderer.

const proseFromInlines = (inlines: InlineNode[]): string[] =>
  inlines.flatMap(inline =>
    inline.type === 'text' || inline.type === 'bold' || inline.type === 'italic' ? [inline.value]
      : inline.type === 'link' ? [inline.text]
      : [],
  );

function prose(nodes: DocNode[]): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case 'heading':    out.push(node.text); break;
      case 'paragraph':
      case 'blockquote': out.push(...proseFromInlines(node.inlines)); break;
      case 'bullet_list': out.push(...node.items.flatMap(i => proseFromInlines(i.inlines))); break;
      case 'table':
        out.push(...node.headers);
        out.push(...node.rows.flatMap(row => row.flatMap(proseFromInlines)));
        break;
    }
  }
  return out;
}

// -----------------------------------------------
// The guard
// -----------------------------------------------

const MARKDOWN_SYNTAX: ReadonlyArray<readonly [string, RegExp]> = [
  ['a code fence',        /```/],
  ['an inline code span', /`/],
  ['bold emphasis',       /\*\*/],
  ['underscore emphasis', /__/],
];

describe('renderers never emit format strings', () => {
  it.each(RENDERED.map(([name]) => name))('%s emits no markdown syntax in its prose', name => {
    const [, nodes] = RENDERED.find(([n]) => n === name)!;
    for (const text of prose(nodes)) {
      for (const [label, pattern] of MARKDOWN_SYNTAX) {
        expect(
          pattern.test(text),
          `${name} emitted ${label} in DocNode prose: ${JSON.stringify(text)}\n` +
          `Markdown syntax belongs to the serializer. Use a code/bold/italic InlineNode instead — ` +
          `or, for a heading (whose text is a plain string), plain text.`,
        ).toBe(false);
      }
    }
  });

  it('guards every renderer that returns DocNode[]', () => {
    // Fails when a renderer is added without a RENDERED entry — an unguarded
    // renderer is exactly how this bug got in twice.
    expect(RENDERED).toHaveLength(32);
  });

  it('actually detects a violation when one is present', () => {
    // Guards the guard: if prose() stopped collecting, every check above would
    // vacuously pass and the file would be worthless.
    const bad: DocNode[] = [{ type: 'heading', level: 1, text: 'Update of `acme_widget`' }];
    expect(prose(bad)).toEqual(['Update of `acme_widget`']);
    expect(MARKDOWN_SYNTAX.some(([, p]) => p.test(prose(bad)[0]))).toBe(true);
  });

  it('collects prose from every node type that carries it', () => {
    // A second guard on prose(): a node type silently skipped is an unguarded gap.
    const sample: DocNode[] = [
      { type: 'heading', level: 1, text: 'H' },
      { type: 'paragraph', inlines: [{ type: 'text', value: 'P' }] },
      { type: 'blockquote', inlines: [{ type: 'text', value: 'Q' }] },
      { type: 'bullet_list', items: [{ depth: 0, inlines: [{ type: 'bold', value: 'B' }] }] },
      { type: 'table', headers: ['TH'], rows: [[[{ type: 'italic', value: 'TD' }]]] },
      { type: 'code_block', text: 'ignored `code`' },
      { type: 'mermaid', code: 'graph TD;' },
    ];
    expect(prose(sample).sort()).toEqual(['B', 'H', 'P', 'Q', 'TD', 'TH']);
  });
});
