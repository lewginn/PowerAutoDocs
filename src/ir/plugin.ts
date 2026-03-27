export type PluginStage = 'PreValidation' | 'PreOperation' | 'PostOperation';
export type PluginMode = 'Synchronous' | 'Asynchronous';
export type ImageType = 'PreImage' | 'PostImage' | 'Both';

export interface PluginStepImageModel {
    id: string;
    name: string;
    imageType: ImageType;
    attributes: string[];
}

export interface PluginStepModel {
    id: string;
    /** Full display name e.g. "ApplicationPostOperation: Update of myprefix_Application" */
    name: string;
    /** Short class name e.g. "ApplicationPostOperation" */
    className: string;
    /** Fully qualified type name e.g. "AppName.CE.Plugins.ApplicationPostOperation" */
    pluginTypeName: string;
    /** Assembly name e.g. "AppName.CE.Plugins" */
    assemblyName: string;
    /** CRM message e.g. "Update", "Create", "Delete" */
    message: string;
    /** Primary entity logical name e.g. "myprefix_Application" */
    primaryEntity: string;
    stage: PluginStage;
    mode: PluginMode;
    /** Comma-separated attribute names that trigger this step (empty = all) */
    filteringAttributes: string[];
    images: PluginStepImageModel[];
}

export interface PluginAssemblyModel {
    assemblyName: string;
    version: string;
    fileName: string;
    isolationMode: 'Sandbox' | 'None';
    pluginTypeNames: string[];
    steps: PluginStepModel[];
}
