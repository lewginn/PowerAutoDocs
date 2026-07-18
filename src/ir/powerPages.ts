/**
 * IR model for Power Pages (Portal) sites.
 *
 * One PowerPagesModel per site (decision D1). A site owns flat, typed arrays of
 * its components; the renderer derives the page tree, the role→rule→page joins
 * and the template chain from these arrays (decision D5) — the parser never
 * builds them.
 *
 * Structural only (decision D4): this IR deliberately stores the *length* and
 * *metadata* of large/opaque payloads — web-template Liquid source, content-
 * snippet values, web-file bytes, and the double-encoded List settings/views and
 * Bot Consumer config blobs — never the payload itself.
 *
 * These field names are a public contract: additive only, never renamed or
 * removed (see .claude/docs/constraints.md).
 */

/** A site language record (from powerpagesitelanguages.xml). */
export interface PowerPagesLanguageModel {
  /** powerpagesitelanguageid */
  id: string;
  /** Outer <name> */
  name: string;
  /** Human-readable display name */
  displayName: string;
  /** Language code string e.g. 'en-US' */
  languageCode: string;
  /** Numeric LCID, or null when absent */
  lcid: number | null;
}

/** Type 1 — Publishing State (Draft/Published style). */
export interface PublishingStateModel {
  id: string;
  name: string;
  displayOrder: number | null;
  isDefault: boolean;
  isVisible: boolean;
}

/**
 * Type 2 — Web Page. Two variants share this type:
 *   root/master (isRoot=true, no rootWebPageId) and
 *   language-specific content (isRoot=false, has languageId + rootWebPageId).
 */
export interface WebPageModel {
  id: string;
  name: string;
  partialUrl: string;
  isRoot: boolean;
  /** Parent page (self-ref); null on a top-of-hierarchy root page. */
  parentPageId: string | null;
  /** Master page (self-ref); present only on language-specific content pages. */
  rootWebPageId: string | null;
  pageTemplateId: string | null;
  publishingStateId: string | null;
  /** Outer powerpagesitelanguageid — present on language variants only. */
  languageId: string | null;
  displayOrder: number | null;
}

/** Type 6 — Page Template (web-template-backed or rewrite/legacy flavor). */
export interface PageTemplateModel {
  id: string;
  name: string;
  isDefault: boolean;
  usesWebsiteHeaderAndFooter: boolean;
  /** Set on the web-template-backed flavor. */
  webTemplateId: string | null;
  /** Set on the rewrite/legacy flavor (path to an aspx template). */
  rewriteUrl: string | null;
  /** A Dataverse table logical name the template is bound to, when present. */
  entityName: string | null;
}

/** Type 8 — Web Template. Structural only: the Liquid/HTML source length, not the body. */
export interface WebTemplateModel {
  id: string;
  name: string;
  /** Character length of the Liquid + HTML source (never the source itself — D4). */
  sourceLength: number;
}

/** Type 7 — Content Snippet. Structural only: the value length, not the body. */
export interface ContentSnippetModel {
  id: string;
  /** Outer <name> — the snippet key. */
  name: string;
  displayName: string;
  /** Rendering-type option-set integer, or null when absent (platform default). */
  snippetType: number | null;
  /** Character length of the snippet value (never the value itself — D4). */
  valueLength: number;
  languageId: string | null;
}

/** Type 9 — Site Setting. The name is the (slash-delimited) key; value may be absent. */
export interface SiteSettingModel {
  id: string;
  name: string;
  /** Always a string when present; null when the record carries no value. */
  value: string | null;
  description: string | null;
}

/** Type 11 — Web Role. */
export interface WebRoleModel {
  id: string;
  name: string;
  anonymousUsersRole: boolean;
  authenticatedUsersRole: boolean;
}

/** Type 10 — Web Page Access Control Rule. */
export interface PageAccessRuleModel {
  id: string;
  name: string;
  /** Access-right option-set integer, or null. */
  right: number | null;
  /** Scoped page (Web Page ref); null on the minimal {right}-only shape. */
  webPageId: string | null;
  /** Web Role component GUIDs the rule applies to. */
  webRoleIds: string[];
}

/** Type 12 — Website Access. */
export interface WebsiteAccessModel {
  id: string;
  name: string;
  manageContentSnippets: boolean;
  manageSiteMarkers: boolean;
  manageWebLinkSets: boolean;
  previewUnpublishedEntities: boolean;
  /** Associated Web Role component GUIDs. */
  webRoleIds: string[];
}

/** Type 13 — Site Marker (named alias/pointer to a Web Page). */
export interface SiteMarkerModel {
  id: string;
  /** Outer <name> — the marker lookup key. */
  name: string;
  /** Target Web Page ref. */
  pageId: string | null;
}

/** Type 4 — Web Link Set (a nav menu). Child Web Links point back via weblinksetid. */
export interface WebLinkSetModel {
  id: string;
  name: string;
  displayName: string;
  publishingStateId: string | null;
  languageId: string | null;
}

/** Type 5 — Web Link (joins a Web Link Set to a Web Page). */
export interface WebLinkModel {
  id: string;
  name: string;
  webLinkSetId: string | null;
  pageId: string | null;
  displayOrder: number | null;
  openInNewWindow: boolean;
}

/** Type 15 — Basic Form. Dataverse form/table referenced by NAME (strings, not GUIDs). */
export interface BasicFormModel {
  id: string;
  name: string;
  /** Dataverse form name reference. */
  formName: string;
  /** Dataverse table logical name. */
  entityName: string;
  /** Tab name. */
  tabName: string;
  /** create/edit/view option-set integer, or null. */
  mode: number | null;
}

/**
 * Type 17 — List. entityName is a name reference; view is a Dataverse saved-query
 * GUID. The double-encoded settings/views blobs are stored as lengths only (D4).
 */
export interface ListModel {
  id: string;
  name: string;
  entityName: string;
  /** Top-level Dataverse saved-query (view) GUID. */
  viewId: string;
  pageSize: number | null;
  /** Character length of the opaque serialized settings blob (never the blob — D4). */
  settingsLength: number;
  /** Character length of the opaque serialized views blob (never the blob — D4). */
  viewsLength: number;
}

/** Type 3 — Web File. The base64 bytes live outside <content>; stored as a size only (D4). */
export interface WebFileModel {
  id: string;
  name: string;
  partialUrl: string;
  parentPageId: string | null;
  publishingStateId: string | null;
  displayOrder: number | null;
  /** MIME type from the sibling <filecontent mimetype="…"> attribute, or null. */
  mimeType: string | null;
  /** Approximate decoded byte size of the file payload (never the bytes — D4). */
  fileSizeBytes: number;
}

/** Type 27 — Bot Consumer. The bot is identified by a schema-name string. */
export interface BotConsumerModel {
  id: string;
  name: string;
  /** Publisher-prefixed schema-name identifier of the bot/Copilot. */
  botSchemaName: string;
  /** Character length of the opaque serialized config blob (never the blob — D4). */
  configLength: number;
}

/** One Power Pages site with all of its components. */
export interface PowerPagesModel {
  /** powerpagesiteid (the site's own id). */
  id: string;
  /** Site name (from powerpagesites.xml). */
  name: string;
  /** Data model version integer, or null. */
  dataModelVersion: number | null;
  /** Site Language id the site defaults to (from content.defaultlanguage). */
  defaultLanguageId: string | null;
  /** Numeric LCID for the site language (from content.website_language). */
  websiteLanguageLcid: number | null;
  /** Header Web Template ref. */
  headerWebTemplateId: string | null;
  /** Footer Web Template ref. */
  footerWebTemplateId: string | null;
  /** Default Bot Consumer ref. */
  defaultBotConsumerId: string | null;

  languages: PowerPagesLanguageModel[];
  publishingStates: PublishingStateModel[];
  webPages: WebPageModel[];
  pageTemplates: PageTemplateModel[];
  webTemplates: WebTemplateModel[];
  contentSnippets: ContentSnippetModel[];
  siteSettings: SiteSettingModel[];
  webRoles: WebRoleModel[];
  pageAccessRules: PageAccessRuleModel[];
  websiteAccess: WebsiteAccessModel[];
  siteMarkers: SiteMarkerModel[];
  webLinkSets: WebLinkSetModel[];
  webLinks: WebLinkModel[];
  basicForms: BasicFormModel[];
  lists: ListModel[];
  webFiles: WebFileModel[];
  botConsumers: BotConsumerModel[];

  /** Count of components carrying an unmapped/unknown type code — tolerated, not dropped silently. */
  otherComponentCount: number;
}
