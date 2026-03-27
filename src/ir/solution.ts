import type { TableModel } from './table.js';

export interface PublisherModel {
  uniqueName: string;
  displayName: string;
  prefix: string;
}

export interface SolutionModel {
  uniqueName: string;
  displayName: string;
  version: string;
  isManaged: boolean;
  publisher: PublisherModel;
  tables: TableModel[];
}