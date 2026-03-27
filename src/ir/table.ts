import type { FormModel } from './form.js';
import type { ViewModel } from './view.js';
import type { RelationshipModel } from './relationship.js';

export type ColumnType =
  | 'string'
  | 'integer'
  | 'decimal'
  | 'boolean'
  | 'datetime'
  | 'lookup'
  | 'optionset'
  | 'money'
  | 'memo'
  | 'uniqueidentifier'
  | 'unknown';

export interface ColumnModel {
  logicalName: string;
  displayName: string;
  description: string;
  type: ColumnType;
  isRequired: boolean;
  isCustom: boolean;
  maxLength?: number;
  targets?: string[];
}

export interface TableModel {
  logicalName: string;
  displayName: string;
  pluralDisplayName: string;
  description: string;
  isCustom: boolean;
  isActivity: boolean;
  columns: ColumnModel[];
  relationships: RelationshipModel[];
  forms: FormModel[];
  views: ViewModel[];
  aiSummary?: string;
}