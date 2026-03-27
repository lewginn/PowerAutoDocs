/**
 * IR model for Model-Driven Apps (AppModules).
 */

export interface ModelDrivenAppModel {
  /** Unique schema name e.g. "myprefix_AppName" */
  uniqueName: string;
  /** Display name e.g. "AppName" */
  displayName: string;
  /** Description */
  description: string;
  /** Active = true, Inactive = false */
  isActive: boolean;
  /** Form factor label */
  formFactor: 'Web' | 'Tablet' | 'Phone' | 'Unknown';
  /** Custom entity schema names included in the app (publisher prefix filtered) */
  customEntities: string[];
  /** Standard/OOB entity schema names included in the app */
  standardEntities: string[];
  /** Number of security roles mapped to this app */
  roleCount: number;
  /** App settings as key/value pairs */
  appSettings: { key: string; value: string }[];
}