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

function pad(str: string, length: number): string {
    return str.padEnd(length, ' ');
}

function markdownTable(headers: string[], rows: string[][]): string {
    const widths = headers.map((h, i) =>
        Math.max(h.length, ...rows.map(r => (r[i] ?? '').length))
    );
    const header = '| ' + headers.map((h, i) => pad(h, widths[i])).join(' | ') + ' |';
    const divider = '| ' + widths.map(w => '-'.repeat(w)).join(' | ') + ' |';
    const body = rows.map(
        row => '| ' + row.map((cell, i) => pad(cell ?? '', widths[i])).join(' | ') + ' |'
    );
    return [header, divider, ...body].join('\n');
}

export function renderOverviewMarkdown(
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
): string {
    const lines: string[] = [];

    lines.push('# Overview');
    lines.push('');

    // ---- Aggregate summary across all solutions ----
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
        lines.push('## Summary');
        lines.push('');
        lines.push('| Component | Count |');
        lines.push('| --- | --- |');
        for (const [label, count] of summaryRows) {
            lines.push(`| ${label} | ${count} |`);
        }
        lines.push('');
    }

    // ---- One section per solution ----
    lines.push('## Solutions');
    lines.push('');

    const solutionRows = solutions.map(s => [
        s.displayName,
        `\`${s.uniqueName}\``,
        s.version,
        s.publisher.displayName,
        `\`${s.publisher.prefix}\``,
        s.isManaged ? 'Yes' : 'No',
    ]);

    lines.push(markdownTable(
        ['Name', 'Unique Name', 'Version', 'Publisher', 'Prefix', 'Managed'],
        solutionRows
    ));
    lines.push('');

    return lines.join('\n');
}

// Local file writer
export function writeOverviewMarkdown(solution: SolutionModel, outputDir: string): void {
    fs.mkdirSync(outputDir, { recursive: true });
    const filepath = path.join(outputDir, 'overview.md');
    const content = renderOverviewMarkdown([solution], [], []).replace(/\r\n/g, '\n');
    fs.writeFileSync(filepath, content, 'utf-8');
    console.log(`Written: ${filepath}`);
}