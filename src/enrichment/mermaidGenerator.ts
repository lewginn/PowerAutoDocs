import type { FlowTriggerModel } from '../ir/flow.js';

// -----------------------------------------------
// Mermaid flowchart generator
// Walks the raw Power Automate action tree and
// produces a flowchart TD diagram string.
// -----------------------------------------------

// Node shape definitions — using Mermaid 8.14 compatible shapes only
// ADO Wiki is pinned to Mermaid 8.14
function nodeDef(id: string, label: string, type: string): string {
    const l = label.replace(/"/g, "'");
    switch (type) {
        case 'If': return `${id}{"${l}"}`;           // diamond
        case 'Scope': return `${id}[["${l}"]]`;         // subroutine (double bracket)
        case 'Foreach':
        case 'Until': return `${id}["↺ ${l}"]`;        // rectangle with loop symbol (cylinder not in 8.14) — Until loops the same as Foreach
        case 'Terminate': return `${id}(("${l}"))`;         // circle (hexagon not in 8.14)
        default: return `${id}["${l}"]`;
    }
}

function humanLabel(key: string): string {
    return key.replace(/_/g, ' ');
}

export function generateMermaidDiagram(
    trigger: FlowTriggerModel,
    actions: Record<string, any>
): string {
    let counter = 0;
    const lines: string[] = ['flowchart TD'];
    // Map of dotted path key → mermaid node ID
    // e.g. "root.Try.inner.Get_User_ID" → "N3"
    const allIds = new Map<string, string>();

    function freshId(): string {
        return `N${counter++}`;
    }

    // Find root actions at a level (those with no runAfter dependencies)
    function findRoots(
        actionsAtLevel: Record<string, any>,
        pathPrefix: string
    ): string[] {
        return Object.entries(actionsAtLevel)
            .filter(([, a]) => Object.keys((a as any).runAfter ?? {}).length === 0)
            .map(([key]) => allIds.get(`${pathPrefix}.${key}`))
            .filter((id): id is string => id !== undefined);
    }

    // Recursively process a level of actions
    // Returns the node IDs created at this level (not children)
    function processLevel(
        actionsAtLevel: Record<string, any>,
        pathPrefix: string
    ): string[] {
        const levelIds: string[] = [];

        // --- Step 1: Register and define nodes ---
        for (const [key, action] of Object.entries(actionsAtLevel)) {
            const id = freshId();
            allIds.set(`${pathPrefix}.${key}`, id);
            levelIds.push(id);
            lines.push(`  ${nodeDef(id, humanLabel(key), (action as any)?.type ?? '')}`);
        }

        // --- Step 2: Draw runAfter edges between siblings ---
        for (const [key, action] of Object.entries(actionsAtLevel)) {
            const toId = allIds.get(`${pathPrefix}.${key}`)!;
            const runAfter = (action as any).runAfter ?? {};

            for (const [depKey, statuses] of Object.entries(runAfter)) {
                const fromId = allIds.get(`${pathPrefix}.${depKey}`);
                if (!fromId) continue;

                const arr = statuses as string[];
                const isErrorPath = arr.length > 0 && arr.every(s => s !== 'Succeeded');
                const isMixedPath = arr.includes('Succeeded') && arr.length > 1;

                if (isErrorPath) {
                    lines.push(`  ${fromId} -->|"⚠ Error"| ${toId}`);
                } else if (isMixedPath) {
                    lines.push(`  ${fromId} -->|"Any"| ${toId}`);
                } else {
                    lines.push(`  ${fromId} --> ${toId}`);
                }
            }
        }

        // --- Step 3: Recurse into container actions ---
        for (const [key, action] of Object.entries(actionsAtLevel)) {
            const nodeId = allIds.get(`${pathPrefix}.${key}`)!;
            const a = action as any;

            if (a.type === 'If') {
                // True (yes) branch
                const trueActs: Record<string, any> = a.actions ?? {};
                if (Object.keys(trueActs).length > 0) {
                    const truePrefix = `${pathPrefix}.${key}.true`;
                    processLevel(trueActs, truePrefix);
                    for (const r of findRoots(trueActs, truePrefix)) {
                        lines.push(`  ${nodeId} -->|"Yes"| ${r}`);
                    }
                }

                // False (no) branch
                const falseActs: Record<string, any> = a.else?.actions ?? {};
                if (Object.keys(falseActs).length > 0) {
                    const falsePrefix = `${pathPrefix}.${key}.false`;
                    processLevel(falseActs, falsePrefix);
                    for (const r of findRoots(falseActs, falsePrefix)) {
                        lines.push(`  ${nodeId} -->|"No"| ${r}`);
                    }
                }
            }

            if (a.type === 'Scope' || a.type === 'Foreach' || a.type === 'Until') {
                const inner: Record<string, any> = a.actions ?? {};
                if (Object.keys(inner).length > 0) {
                    const innerPrefix = `${pathPrefix}.${key}.inner`;
                    processLevel(inner, innerPrefix);
                    for (const r of findRoots(inner, innerPrefix)) {
                        lines.push(`  ${nodeId} --> ${r}`);
                    }
                }
            }

            // Switch cases + default — same shape as If's Yes/No branches, just
            // N-way instead of 2-way. flowParser.ts recurses into these already
            // (the action TABLE has always listed them); the diagram silently
            // omitted them, so a reader saw a dead-end box for a Switch and
            // concluded the flow does less than it does.
            if (a.type === 'Switch') {
                const cases: Record<string, any> = a.cases ?? {};
                for (const [caseKey, caseObj] of Object.entries(cases)) {
                    const caseActs: Record<string, any> = (caseObj as any)?.actions ?? {};
                    if (Object.keys(caseActs).length === 0) continue;
                    const casePrefix = `${pathPrefix}.${key}.case.${caseKey}`;
                    processLevel(caseActs, casePrefix);
                    for (const r of findRoots(caseActs, casePrefix)) {
                        lines.push(`  ${nodeId} -->|"${humanLabel(caseKey)}"| ${r}`);
                    }
                }

                const defaultActs: Record<string, any> = a.default?.actions ?? {};
                if (Object.keys(defaultActs).length > 0) {
                    const defaultPrefix = `${pathPrefix}.${key}.default`;
                    processLevel(defaultActs, defaultPrefix);
                    for (const r of findRoots(defaultActs, defaultPrefix)) {
                        lines.push(`  ${nodeId} -->|"Default"| ${r}`);
                    }
                }
            }
        }

        return levelIds;
    }

    // --- Trigger node ---
    const triggerId = freshId();
    const rawTriggerLabel = trigger.entity
        ? `${humanLabel(trigger.type)}: ${trigger.entity}`
        : humanLabel(trigger.type);
    // Same " -> ' escape nodeDef() applies to every action label. This node is
    // built inline rather than through nodeDef(), so it used to skip the
    // escape — trigger.entity comes straight from unvalidated flow JSON, and a
    // single quote in it terminated the Mermaid string literal early, making
    // the ENTIRE diagram fail to parse, not just the trigger node.
    const triggerLabel = rawTriggerLabel.replace(/"/g, "'");
    lines.push(`  ${triggerId}(["${triggerLabel}"])`);

    // --- Process top-level actions ---
    if (Object.keys(actions).length > 0) {
        processLevel(actions, 'root');

        // Connect trigger to top-level roots
        for (const r of findRoots(actions, 'root')) {
            lines.push(`  ${triggerId} --> ${r}`);
        }
    }

    return lines.join('\n');
}