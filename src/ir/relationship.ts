export interface RelationshipModel {
  name: string;
  type: 'OneToMany' | 'ManyToOne' | 'ManyToMany';
  referencingEntity: string;
  referencedEntity: string;
  referencingAttribute: string;
  description: string;
  isCustom: boolean;
}