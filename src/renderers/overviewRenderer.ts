// renderers/overviewRenderer.ts

import * as fs from 'fs';
import * as path from 'path';
import type { ConnectionReferenceModel, SolutionModel } from '../ir/index.js';
import type { FlowModel } from '../ir/index.js';
import type { PluginAssemblyModel } from '../ir/index.js';
import type { WebResourceModel } from '../ir/index.js';
import type { ClassicWorkflowModel } from '../ir/index.js';
import type { BusinessRuleModel } from '../ir/index.js';
import type { SecurityRoleModel } from '../ir/index.js';
import type { EnvironmentVariableModel } from '../ir/index.js';
import type { GlobalChoiceModel } from '../ir/index.js';
import type { EmailTemplateModel } from '../ir/index.js';
import type { ModelDrivenAppModel } from '../ir/index.js';
import type { DocNode } from '../docmodel/nodes.js';
import { h, table, ct, cc } from '../docmodel/nodes.js';
import { serialize } from '../docmodel/MarkdownSerializer.js';

export function renderOverview(
    solutions: SolutionModel[],
    flows: FlowModel[],
    assemblies: PluginAssemblyModel[],
    webResources: WebResourceModel[] = [],
    classicWorkflows: ClassicWorkflowModel[] = [],
    businessRules: BusinessRuleModel[] = [],
    securityRoles: SecurityRoleModel[] = [],
    envVars: EnvironmentVariableModel[] = [],
    globalChoices: GlobalChoiceModel[] = [],
    emailTemplates: EmailTemplateModel[] = [],
    modelDrivenApps: ModelDrivenAppModel[] = [],
    connectionReferences: ConnectionReferenceModel[] = []
): DocNode[] {
    const nodes: DocNode[] = [];

    nodes.push(h(1, 'Overview'));

    // ---- Aggregate summary ----
    const allTables = solutions.flatMap(s => s.tables);
    const customTables = allTables.filter(t => t.isCustom);
    const extendedTables = allTables.filter(t => !t.isCustom);
    const totalColumns = allTables.reduce((acc, t) => acc + t.columns.filter(c => c.isCustom).length, 0);
    const totalRelationships = allTables.reduce(
        (acc, t) => acc + t.relationships.filter(
            r => r.isCustom && r.referencingEntity.toLowerCase() === t.logicalName.toLowerCase()
        ).length, 0
    );
    const totalForms = allTables.reduce((acc, t) => acc + t.forms.length, 0);
    const totalViews = allTables.reduce((acc, t) => acc + t.views.length, 0);
    const validAssemblies = assemblies.filter(a => a.assemblyName.trim() !== '');
    const totalSteps = validAssemblies.reduce((acc, a) => acc + a.steps.length, 0);
    const jsResources = webResources.filter(r => r.resourceType === 'JavaScript');

    const summaryRows: [string, number][] = [
        ['Business Rules', businessRules.length],
        ['Classic Workflows', classicWorkflows.length],
        ['Connection References', connectionReferences.length],
        ['Custom Columns', totalColumns],
        ['Custom Relationships', totalRelationships],
        ['Custom Tables', customTables.length],
        ['Email Templates', emailTemplates.length],
        ['Environment Variables', envVars.length],
        ['Extended Standard Tables', extendedTables.length],
        ['Flows', flows.length],
        ['Forms', totalForms],
        ['Global Choices', globalChoices.length],
        ['Model-Driven Apps', modelDrivenApps.length],
        ['Plugin Assemblies', validAssemblies.length],
        ['Plugin Steps', totalSteps],
        ['Security Roles', securityRoles.length],
        ['Views', totalViews],
        ['Web Resources (JS)', jsResources.length],
    ].filter(([, count]) => (count as number) > 0) as [string, number][];

    if (summaryRows.length > 0) {
        nodes.push(h(2, 'Summary'));
        nodes.push(table(
            ['Component', 'Count'],
            summaryRows.map(([label, count]) => [ct(label), ct(String(count))])
        ));
    }

    // ---- Solutions table ----
    nodes.push(h(2, 'Solutions'));
    nodes.push(table(
        ['Name', 'Unique Name', 'Version', 'Publisher', 'Prefix', 'Managed'],
        solutions.map(s => [
            ct(s.displayName),
            cc(s.uniqueName),
            ct(s.version),
            ct(s.publisher.displayName),
            cc(s.publisher.prefix),
            ct(s.isManaged ? 'Yes' : 'No'),
        ])
    ));

    return nodes;
}

// Local file writer — kept for local dev output
export function writeOverviewMarkdown(solution: SolutionModel, outputDir: string): void {
    fs.mkdirSync(outputDir, { recursive: true });
    const filepath = path.join(outputDir, 'overview.md');
    const content = serialize(renderOverview([solution], [], [])).replace(/\r\n/g, '\n');
    fs.writeFileSync(filepath, content, 'utf-8');
    console.log(`Written: ${filepath}`);
}
