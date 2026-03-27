/**
 * IR model for Security Roles
 * Privilege levels map directly to Dataverse access levels.
 * "None" is inferred — absent privilege entry in the XML means no access.
 */

export type PrivilegeLevel = 'Global' | 'Deep' | 'Local' | 'Basic' | 'None';

export type PrivilegeOperation =
    | 'create'
    | 'read'
    | 'write'
    | 'delete'
    | 'append'
    | 'appendTo'
    | 'assign'
    | 'share';

export interface EntityPrivileges {
    /** Display name derived from the privilege name, e.g. "Application" */
    entityName: string;
    /** Logical name including publisher prefix, e.g. "myprefix_Application" */
    entityLogicalName: string;
    create: PrivilegeLevel;
    read: PrivilegeLevel;
    write: PrivilegeLevel;
    delete: PrivilegeLevel;
    append: PrivilegeLevel;
    appendTo: PrivilegeLevel;
    assign: PrivilegeLevel;
    share: PrivilegeLevel;
}

export interface SecurityRoleModel {
    id: string;
    name: string;
    isCustomizable: boolean;
    isAutoAssigned: boolean;
    /** Custom entity privileges only (filtered via publisher prefix) */
    privileges: EntityPrivileges[];
}