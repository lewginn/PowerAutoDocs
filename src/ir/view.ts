export interface ViewFilterCondition {
  attribute: string;
  operator: string;
  value?: string;
  isJoin?: boolean;
  joinType?: string;
  joinField?: string;
  filterType?: string;
  depth: number;
}

export interface ViewModel {
  name: string;
  type: 'Public' | 'System' | 'Associated' | 'Other' | 'Quick Find' | 'Lookup' | 'SubGrid';
  columns: string[];
  description: string;
  isDefault: boolean;
  isQuickFind: boolean;
  filters: ViewFilterCondition[];
}