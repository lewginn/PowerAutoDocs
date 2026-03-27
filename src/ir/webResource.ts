export type WebResourceType =
  | 'HTML'
  | 'CSS'
  | 'JavaScript'
  | 'XML'
  | 'PNG'
  | 'JPG'
  | 'GIF'
  | 'XAP'
  | 'XSL'
  | 'ICO'
  | 'SVG'
  | 'RESX'
  | 'Unknown';

// CRM WebResourceType codes → readable labels
export const WEB_RESOURCE_TYPE_MAP: Record<number, WebResourceType> = {
  1:  'HTML',
  2:  'CSS',
  3:  'JavaScript',
  4:  'XML',
  5:  'PNG',
  6:  'JPG',
  7:  'GIF',
  8:  'XAP',
  9:  'XSL',
  10: 'ICO',
  11: 'SVG',
  12: 'RESX',
};

export interface WebResourceFunction {
  /** e.g. "OnLoad", "HandleFormSpecificLogic" */
  name: string;
  isAsync: boolean;
  /** Parameter names extracted from the function signature */
  params: string[];
  /** JSDoc description if present (first @description or leading comment) */
  jsDoc?: string;
}

export interface WebResourceModel {
  id: string;
  /** Logical name / schema name — e.g. "myprefix_/Scripts/Account.js" */
  name: string;
  displayName: string;
  resourceType: WebResourceType;
  introducedVersion: string;
  /** Logical names of other web resources this file depends on */
  dependencies: string[];
  /** Physical file path inside the unpacked solution */
  fileName: string;
  /** Top-level JS namespace/object, if detected — e.g. "AppName.Account" */
  namespace?: string;
  /** Populated only for JavaScript resources */
  functions?: WebResourceFunction[];
}