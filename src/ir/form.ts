export interface FormSectionModel {
  label: string;
  columns: string[];
}

export interface FormTabModel {
  label: string;
  sections: FormSectionModel[];
}

export interface FormModel {
  name: string;
  type: 'Main' | 'Quick Create' | 'Quick View' | 'Card' | 'Other';
  tabs: FormTabModel[];
}