import { XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';
import * as path from 'path';
import type {
    PluginAssemblyModel,
    PluginStepModel,
    PluginStepImageModel,
    PluginStage,
    ImageType,
} from '../ir/index.js';

const parser = new XMLParser({
    attributeNamePrefix: '@_',
    ignoreAttributes: false,
    isArray: (name) => ['PluginType', 'SdkMessageProcessingStepImage'].includes(name)
});

// Stage codes → labels
const STAGE_MAP: Record<number, PluginStage> = {
    10: 'PreValidation',
    20: 'PreOperation',
    40: 'PostOperation',
};

// ImageType codes → labels
const IMAGE_TYPE_MAP: Record<number, ImageType> = {
    0: 'PreImage',
    1: 'PostImage',
    2: 'Both',
};

/**
 * Extract the CRM message verb (Create, Update, Delete, etc.) from the step name.
 * Name format: "AppName.CE.Plugins.ApplicationPostOperation: Update of myprefix_Application"
 */
function extractMessage(stepName: string): string {
    const match = stepName.match(/:\s+(\w+)\s+of\s+/i);
    return match ? match[1] : 'Unknown';
}

/**
 * Extract short class name from fully qualified type name.
 * "AppName.CE.Plugins.ApplicationPostOperation" → "ApplicationPostOperation"
 */
function extractClassName(pluginTypeName: string): string {
    const parts = pluginTypeName.split('.');
    return parts[parts.length - 1] ?? pluginTypeName;
}

/**
 * Extract assembly name from fully qualified type name.
 * "AppName.CE.Plugins.ApplicationPostOperation" → "AppName.CE.Plugins"
 */
/**
 * Best-effort guess at a step's assembly from its plugin type name, by stripping
 * the class name off the end.
 *
 * This is only correct when the type sits directly in the assembly's root
 * namespace — `Contoso.Crm.Plugins.Widgets.WidgetSyncHandler` yields
 * `Contoso.Crm.Plugins.Widgets`, which is a namespace, not an assembly.
 *
 * So it must never be used to decide which assembly owns a step: that is done by
 * longest-prefix match against the real assemblies found on disk (see
 * parseAllPlugins). Using this guess for ownership is what caused nested-namespace
 * types to be listed twice, once under a phantom assembly. It survives only to
 * label a genuinely orphaned step, where there is no assembly file to match and a
 * guess beats nothing.
 */
function extractAssemblyName(pluginTypeName: string): string {
    const parts = pluginTypeName.split('.');
    return parts.slice(0, -1).join('.');
}

function parseStepFile(filePath: string): PluginStepModel | null {
    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = parser.parse(raw);
        const step = parsed?.SdkMessageProcessingStep;
        if (!step) return null;

        const id: string = step['@_SdkMessageProcessingStepId'] ?? '';
        const name: string = step['@_Name'] ?? '';
        const pluginTypeName: string = (step.PluginTypeName ?? '').split(',')[0].trim();
        const primaryEntity: string = step.PrimaryEntity ?? '';
        const stage = STAGE_MAP[Number(step.Stage)] ?? 'PostOperation';
        const mode = Number(step.Mode) === 1 ? 'Asynchronous' : 'Synchronous';
        const filteringAttributes: string[] = step.FilteringAttributes
            ? String(step.FilteringAttributes).split(',').map((s: string) => s.trim()).filter(Boolean)
            : [];

        const rawImages = step.SdkMessageProcessingStepImages?.SdkMessageProcessingStepImage ?? [];
        const images: PluginStepImageModel[] = rawImages.map((img: any) => ({
            id: img.SdkMessageProcessingStepImageId ?? '',
            name: img['@_Name'] ?? img.EntityAlias ?? '',
            imageType: IMAGE_TYPE_MAP[Number(img.ImageType)] ?? 'PreImage',
            attributes: img.Attributes
                ? String(img.Attributes).split(',').map((s: string) => s.trim()).filter(Boolean)
                : [],
        }));

        return {
            id,
            name,
            className: extractClassName(pluginTypeName),
            pluginTypeName,
            assemblyName: extractAssemblyName(pluginTypeName),
            message: extractMessage(name),
            primaryEntity,
            stage,
            mode,
            filteringAttributes,
            images,
        };
    } catch (err) {
        console.error(`Failed to parse step file: ${filePath}`, err);
        return null;
    }
}

function parseAssemblyFile(filePath: string): Partial<PluginAssemblyModel> | null {
    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = parser.parse(raw);
        const assembly = parsed?.PluginAssembly;
        if (!assembly) return null;

        const fullName: string = assembly['@_FullName'] ?? '';
        // FullName: "AppName.CE.Plugins, Version=1.0.0.0, Culture=neutral, PublicKeyToken=..."
        const namePart = fullName.split(',')[0].trim();
        const versionMatch = fullName.match(/Version=([^,]+)/);
        const version = versionMatch ? versionMatch[1] : '1.0.0.0';

        const fileName: string = assembly.FileName ?? '';
        const isolationMode = Number(assembly.IsolationMode) === 2 ? 'Sandbox' : 'None';

        const pluginTypes: any[] = assembly.PluginTypes?.PluginType ?? [];
        const pluginTypeNames: string[] = pluginTypes.map((pt: any) =>
            (pt['@_Name'] ?? '').split(',')[0].trim()
        );

        return {
            assemblyName: namePart,
            version,
            fileName,
            isolationMode,
            pluginTypeNames,
        };
    } catch (err) {
        console.error(`Failed to parse assembly file: ${filePath}`, err);
        return null;
    }
}

export function parseAllPlugins(unpackedPath: string): PluginAssemblyModel[] {
    const assemblies: PluginAssemblyModel[] = [];

    // --- Parse plugin assemblies ---
    const pluginAssembliesPath = path.join(unpackedPath, 'PluginAssemblies');
    if (!fs.existsSync(pluginAssembliesPath)) {
        console.warn(`No PluginAssemblies folder found at: ${pluginAssembliesPath}`);
        return [];
    }

    const assemblyFolders = fs
        .readdirSync(pluginAssembliesPath, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name);

    const assemblyMap = new Map<string, Partial<PluginAssemblyModel>>();

    for (const folder of assemblyFolders) {
        const folderPath = path.join(pluginAssembliesPath, folder);
        const dllDataFile = fs
            .readdirSync(folderPath)
            .find(f => f.endsWith('.dll.data.xml'));

        if (!dllDataFile) {
            console.warn(`No _dll_data.xml found in ${folder}`);
            continue;
        }

        const assemblyData = parseAssemblyFile(path.join(folderPath, dllDataFile));
        if (assemblyData?.assemblyName) {
            assemblyMap.set(assemblyData.assemblyName, assemblyData);
        }
    }

    // --- Parse SDK message processing steps ---
    const stepsPath = path.join(unpackedPath, 'SdkMessageProcessingSteps');
    const allSteps: PluginStepModel[] = [];

    if (fs.existsSync(stepsPath)) {
        const stepFiles = fs.readdirSync(stepsPath).filter(f => f.endsWith('.xml'));
        console.log(`Found ${stepFiles.length} plugin step files`);

        for (const file of stepFiles) {
            const step = parseStepFile(path.join(stepsPath, file));
            if (step) allSteps.push(step);
        }
    } else {
        console.warn(`No SdkMessageProcessingSteps folder found at: ${stepsPath}`);
    }

    // --- Combine assemblies with their steps ---
    //
    // A step belongs to the assembly whose name is the LONGEST prefix of its
    // plugin type name. Two reasons it has to be the longest rather than any
    // match, and each was a real double-count:
    //
    //  - A type may sit in a nested namespace. `Contoso.Crm.Plugins.Widgets
    //    .WidgetSyncHandler` legitimately belongs to assembly
    //    `Contoso.Crm.Plugins`.
    //  - Two assemblies may nest (`Contoso.Crm` and `Contoso.Crm.Plugins`).
    //    Both prefix-match that type, and claiming it twice would list the same
    //    registered step under two assemblies.
    //
    // Ownership is then tracked by step identity, so the orphan pass below can
    // ask "did anything claim this?" rather than re-deriving a name.
    const assemblyNames = [...assemblyMap.keys()];
    const ownerOf = (step: PluginStepModel): string | undefined =>
        assemblyNames
            .filter(name => step.pluginTypeName.startsWith(name + '.'))
            .sort((a, b) => b.length - a.length)[0];

    const claimed = new Set<PluginStepModel>();

    for (const [assemblyName, assemblyData] of assemblyMap.entries()) {
        const steps = allSteps.filter(s => ownerOf(s) === assemblyName);
        steps.forEach(s => claimed.add(s));

        assemblies.push({
            assemblyName,
            version: assemblyData.version ?? '1.0.0.0',
            fileName: assemblyData.fileName ?? '',
            isolationMode: assemblyData.isolationMode ?? 'Sandbox',
            pluginTypeNames: assemblyData.pluginTypeNames ?? [],
            steps,
        });
    }

    // Steps whose assembly has no folder under PluginAssemblies/ — e.g. a step
    // registered against an assembly that ships outside this solution.
    //
    // "Unclaimed" is identity-based on purpose. This used to compare the step's
    // own `assemblyName`, which is *guessed* by lopping the last segment off the
    // type name (see extractAssemblyName) — so a nested-namespace type produced a
    // guess that matched no real assembly, and the step was emitted a second time
    // under a phantom assembly named after its namespace.
    const orphanSteps = allSteps.filter(s => !claimed.has(s));
    if (orphanSteps.length > 0) {
        const orphanAssemblyNames = [...new Set(orphanSteps.map(s => s.assemblyName))];
        for (const name of orphanAssemblyNames) {
            assemblies.push({
                assemblyName: name,
                version: 'Unknown',
                fileName: '',
                isolationMode: 'Sandbox',
                pluginTypeNames: [],
                steps: orphanSteps.filter(s => s.assemblyName === name),
            });
        }
    }

    console.log('Assembly map keys:', [...assemblyMap.keys()]);
    console.log('Step assembly names:', [...new Set(allSteps.map(s => s.assemblyName))]);

    return assemblies;
}
