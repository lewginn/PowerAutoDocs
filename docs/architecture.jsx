import { useState } from "react";

const moscow = {
  M: { label: "MUST", cls: "fill" },
  S: { label: "SHOULD", cls: "blue" },
  C: { label: "COULD", cls: "teal" },
  W: { label: "WON'T", cls: "grey" },
};

const layers = [
  {
    id: "input",
    label: "01 / INPUT LAYER",
    color: "#2563eb",
    bg: "#eff6ff",
    description: "What we consume from the Git repo",
    components: [
      { name: "Solution ZIPs", icon: "📦", detail: "The exported solution package, unpacked into readable source before the pipeline runs. It holds every component folder, the solution manifest and the relationship definitions.", tags: ["XML", "pac CLI"], done: true, moscow: "M" },
      { name: "Flat XML Exports", icon: "🗂️", detail: "Individual definition files for each component. Tables, forms, views, saved queries and relationships are all read from this structured source.", tags: ["XML", "Structured"], done: true, moscow: "M" },
      { name: "Power Automate Flows", icon: "🔄", detail: "Flow definitions exported with the solution. Triggers, actions and nested logic such as loops, scopes and switches are captured with their structure intact.", tags: ["JSON"], done: true, moscow: "S" },
      { name: "Classic Workflows & Business Rules", icon: "⚡", detail: "Legacy workflows and business rules bundled in the solution, each classified correctly as a business rule, action or standard workflow with no double counting.", tags: ["XAML", "XML"], done: true, moscow: "S" },
      { name: "Plugins & Assemblies", icon: "⚙️", detail: "Registered plugin steps and their assemblies, including the table, message and execution stage each step is bound to.", tags: ["C#", "XML"], done: true, moscow: "S" },
      { name: "Web Resources (JS)", icon: "📜", detail: "JavaScript files shipped with the solution, with documentation comments, function signatures and namespaces extracted from each file.", tags: ["JS", "XML"], done: true, moscow: "S" },
      { name: "Security Role XML", icon: "🔐", detail: "Security role definitions, capturing the access depth each role holds per table. Coverage is limited to the publisher's own custom tables.", tags: ["XML"], done: true, moscow: "S" },
      { name: "Environment Variable Definitions", icon: "🌍", detail: "Definitions for every environment variable in the solution, together with the current value where the export includes one.", tags: ["XML", "JSON"], done: true, moscow: "S" },
      { name: "Global Choices (OptionSets)", icon: "🎛️", detail: "Global choice lists owned by the publisher, captured with each option's value, label and visibility.", tags: ["XML"], done: true, moscow: "S" },
      { name: "Connection References", icon: "🔗", detail: "Connection references embedded in the solution, with each connector resolved to a readable name rather than an internal identifier.", tags: ["XML"], done: true, moscow: "S" },
      { name: "Email Templates", icon: "📧", detail: "Email template definitions, with each subject and body reconstructed as readable text and dynamic field placeholders shown where they appear.", tags: ["XML"], done: true, moscow: "C" },
      { name: "Model-Driven Apps", icon: "📱", detail: "Definitions for each model-driven app: the tables it surfaces, its security role mappings, app settings and display name.", tags: ["XML"], done: true, moscow: "C" },
      { name: "PCF Controls", icon: "🧩", detail: "Custom UI components built on the Power Apps Component Framework, with manifests and component metadata read from the unpacked solution.", tags: ["JSON", "XML"], done: false, moscow: "C" },
      { name: "Business Process Flows", icon: "🔁", detail: "Staged, guided process definitions, including their steps, the table they apply to and whether each is active.", tags: ["XML"], done: false, moscow: "S" },
      { name: "Duplicate Detection Rules", icon: "🔍", detail: "Rules that flag duplicate records, described by the tables compared, the matching conditions and the field comparisons involved.", tags: ["XML"], done: false, moscow: "C" },
      { name: "SLAs", icon: "⏱️", detail: "Service level agreements with their KPIs, warning and failure actions, and the table each applies to.", tags: ["XML"], done: false, moscow: "C" },
      { name: "Dashboards", icon: "📊", detail: "Dashboard definitions, including their layout and the charts and views each one embeds.", tags: ["XML"], done: false, moscow: "C" },
      { name: "Column Security Profiles", icon: "🔒", detail: "Column security profiles, recording which profiles can read, update or create values in each protected column.", tags: ["XML"], done: false, moscow: "S" },
      { name: "Service Endpoints", icon: "🔌", detail: "Outbound integration endpoints defined in the solution, such as Azure Service Bus, webhooks and event hub connections.", tags: ["XML"], done: false, moscow: "C" },
      { name: "Routing Rule Sets", icon: "📨", detail: "Case routing rules, capturing the conditions that direct incoming cases and the queues they are assigned to.", tags: ["XML"], done: false, moscow: "S" },
      { name: "Custom Connectors", icon: "🔗", detail: "Custom connector definitions, including the API they call, how they authenticate, and the actions and triggers they expose.", tags: ["JSON", "XML"], done: false, moscow: "S" },
      { name: "Power Pages", icon: "🌐", detail: "Power Pages site definitions covering pages, web templates, entity forms, entity lists and site settings.", tags: ["XML"], done: true, moscow: "C" },
      { name: "Virtual Tables", icon: "🔌", detail: "Dataverse tables backed by an external system rather than native storage, captured with their provider, connection and source mapping.", tags: ["XML"], done: false, moscow: "S" },
      { name: "Copilot Studio Agents", icon: "🤖", detail: "Agents shipped in the solution export, documented from their topics, knowledge sources and trigger configuration at the fidelity the export carries. Authoring detail beyond that is out of reach.", tags: ["XML"], done: false, moscow: "S" },
      { name: "Settings (org/solution config)", icon: "🛠️", detail: "Configuration records that control platform behaviour, such as default currency, business closures and auto numbering. These sit apart from environment variables.", tags: ["XML"], done: false, moscow: "C" },
      { name: "Masking Rules (Secured/Attribute)", icon: "🎭", detail: "Column-level data masking rules: which column is masked, the masking pattern applied, and which roles or profiles are exempt.", tags: ["XML"], done: false, moscow: "S" },
      { name: "Custom Pages", icon: "🖼️", detail: "Canvas-style pages embedded within a model-driven app, tied to the owning app and the canvas app they embed.", tags: ["XML"], done: false, moscow: "C" },
      { name: "Canvas App Source", icon: "🎨", detail: "Unpacked canvas app source files, read for their screens, controls and formulas.", tags: ["JSON", "Optional"], done: false, moscow: "W" },
    ]
  },
  {
    id: "parser",
    label: "02 / PARSER LAYER",
    color: "#7c3aed",
    bg: "#f5f3ff",
    description: "Typed extractors - one per source type, all emit IR objects",
    components: [
      { name: "Solution Manifest Parser", icon: "🔍", detail: "Establishes each solution's identity: name, version, publisher and whether it is managed. Runs for every solution in scope, whatever its role.", tags: ["Core"], done: true, moscow: "M" },
      { name: "Entity / Table Parser", icon: "🗃️", detail: "Captures each table's schema: columns, data types, required fields, size limits and lookup targets, distinguishing custom columns and filtering out base currency fields.", tags: ["Core"], done: true, moscow: "M" },
      { name: "View Parser", icon: "👁️", detail: "Breaks down each view into its type, columns and filter conditions, including filters that reach across related tables through nested joins.", tags: ["Core"], done: true, moscow: "M" },
      { name: "Form Parser", icon: "📋", detail: "Maps the layout of main, quick create and card forms: tabs, sections, fields and header fields. Inactive forms are excluded.", tags: ["Core"], done: true, moscow: "M" },
      { name: "Relationship Parser", icon: "↔️", detail: "Resolves one-to-many relationships from both sides, so each table's documentation shows its own perspective, and distinguishes custom relationships from standard ones.", tags: ["Core"], done: true, moscow: "M" },
      { name: "Flow / Workflow Parser", icon: "🔄", detail: "Reads modern Power Automate flows: the trigger, whether manual, scheduled, webhook or record-based, plus the complete nested action tree with conditions translated into plain language.", tags: ["Core"], done: true, moscow: "S" },
      { name: "Classic Workflow Parser", icon: "⚡", detail: "Covers classic workflows and actions: their trigger configuration and each condition step with its branch actions, such as field updates, terminations and nested conditions.", tags: ["Core"], done: true, moscow: "S" },
      { name: "Business Rule Parser", icon: "📐", detail: "Translates each business rule into readable if/else logic: the condition tested and, per branch, actions like showing or hiding fields, changing requirement levels and setting values.", tags: ["Core"], done: true, moscow: "S" },
      { name: "Plugin Parser", icon: "🔌", detail: "Records plugin assemblies and their step registrations: the table and message each step responds to, its execution stage and order, and any filters.", tags: ["Core"], done: true, moscow: "S" },
      { name: "Web Resource Analyser", icon: "📜", detail: "Analyses JavaScript web resources, cataloguing each file's namespace and functions with their parameters, and carrying across any developer documentation already written in the code.", tags: ["JS"], done: true, moscow: "S" },
      { name: "Security Role Parser", icon: "🔐", detail: "Turns each security role into documented privileges, mapping every entry to its access level from organisation-wide down to none, limited to the solution's own tables.", tags: ["Core"], done: true, moscow: "S" },
      { name: "Environment Variable Parser", icon: "🌍", detail: "Details each environment variable: data type, default value, whether it is required, and any secret store link, plus the current value when the export includes one.", tags: ["Core"], done: true, moscow: "S" },
      { name: "Global Choice Parser", icon: "🎛️", detail: "Extracts the solution's own global choice lists, recording each option's value, label, visibility and any externally mapped value, along with the type of list.", tags: ["Core"], done: true, moscow: "S" },
      { name: "Connection Reference Parser", icon: "🔗", detail: "Lists connection references, translating raw connector identifiers into friendly names such as Dataverse, SharePoint or Teams, sorted for easy scanning.", tags: ["Core"], done: true, moscow: "S" },
      { name: "Email Template Parser", icon: "📧", detail: "Rebuilds each email template as readable text, interleaving static wording with dynamic field placeholders in their original order, and names the template's language.", tags: ["Core"], done: true, moscow: "C" },
      { name: "Model-Driven App Parser", icon: "📱", detail: "Summarises each model-driven app: name, description, status and form factor, the custom and standard tables it contains, its settings, and how many security roles grant access.", tags: ["Core"], done: true, moscow: "C" },
      { name: "PCF Parser", icon: "🧩", detail: "Documents each code component from its manifest: the component's name, its configurable properties and their data types.", tags: ["XML"], done: false, moscow: "C" },
      { name: "Business Process Flow Parser", icon: "🔁", detail: "Outlines business process flows: their stages and steps, the tables in scope, and whether each flow is activated.", tags: ["XML"], done: false, moscow: "S" },
      { name: "Duplicate Detection Rule Parser", icon: "🔍", detail: "Documents duplicate detection rules: the tables being compared, the matching conditions, and the operators used to compare fields.", tags: ["XML"], done: false, moscow: "C" },
      { name: "SLA Parser", icon: "⏱️", detail: "Sets out each service level agreement: the KPI, warning and failure thresholds with their associated actions, and the table it applies to.", tags: ["XML"], done: false, moscow: "C" },
      { name: "Dashboard Parser", icon: "📊", detail: "Describes each dashboard: its name, layout sections, and the charts and views embedded within it.", tags: ["XML"], done: false, moscow: "C" },
      { name: "Column Security Profile Parser", icon: "🔒", detail: "Captures column security profiles, listing the read, update and create permissions granted for each secured column.", tags: ["XML"], done: false, moscow: "S" },
      { name: "Service Endpoint Parser", icon: "🔌", detail: "Identifies service endpoints: each one's name, its type, whether Service Bus, webhook or event hub, and its connection details.", tags: ["XML"], done: false, moscow: "C" },
      { name: "Routing Rule Set Parser", icon: "📨", detail: "Documents routing rule sets: each rule's conditions, the queue records are assigned to, and the table the rules apply to.", tags: ["XML"], done: false, moscow: "S" },
      { name: "Custom Connector Parser", icon: "🔗", detail: "Profiles each custom connector: its base URL, authentication type, and the operations it exposes.", tags: ["JSON", "XML"], done: false, moscow: "S" },
      { name: "Power Pages Parser", icon: "🌐", detail: "Inventories a Power Pages site: its pages, web templates, entity forms, entity lists and site settings.", tags: ["XML"], done: true, moscow: "C" },
      { name: "Virtual Table Parser", icon: "🔌", detail: "Handles virtual tables, which present external data inside Dataverse: the provider configuration and the mapping back to the source entity.", tags: ["XML"], done: false, moscow: "S" },
      { name: "Agent Parser", icon: "🤖", detail: "Reads Copilot Studio agents at the metadata level: topics, knowledge sources and orchestration triggers, without attempting to rebuild the full conversation design.", tags: ["XML"], done: false, moscow: "S" },
      { name: "Settings Parser", icon: "🛠️", detail: "Picks up organisation and solution level configuration records that sit outside environment variables.", tags: ["XML"], done: false, moscow: "C" },
      { name: "Masking Rule Parser", icon: "🎭", detail: "Extracts data masking rules from the solution export, recording which columns have masking applied.", tags: ["XML"], done: false, moscow: "S" },
      { name: "Custom Page Parser", icon: "🖼️", detail: "Documents custom pages: the page type, the model-driven app that owns each one, and the embedded canvas app it references.", tags: ["XML"], done: false, moscow: "C" },
    ]
  },
  {
    id: "ir",
    label: "03 / IR LAYER",
    color: "#9333ea",
    bg: "#faf5ff",
    description: "Intermediate Representation - domain-split TypeScript interfaces, single source of truth",
    components: [
      { name: "SolutionModel", icon: "🏗️", detail: "The top-level record for a solution: its publisher, version, managed state and customization prefix, with tables attached once parsing completes.", tags: ["ir/solution.ts"], done: true, moscow: "M" },
      { name: "TableModel + ColumnModel", icon: "📊", detail: "Captures tables with their columns and column types, custom versus standard flags, and nested relationships, forms and views.", tags: ["ir/table.ts"], done: true, moscow: "M" },
      { name: "FormModel + ViewModel", icon: "🖼️", detail: "Describes forms down to tabs, sections and fields, and views with typed filter conditions, nested joins, and default and quick-find markers.", tags: ["ir/form.ts", "ir/view.ts"], done: true, moscow: "M" },
      { name: "RelationshipModel", icon: "↔️", detail: "Records one-to-many relationships: the tables on each side, the lookup field linking them, the direction viewed from, and whether the relationship is custom.", tags: ["ir/relationship.ts"], done: true, moscow: "M" },
      { name: "FlowModel", icon: "🔀", detail: "Models each flow: its trigger and filters, a nested action tree with run-order dependencies, and a flowchart diagram attached during parsing.", tags: ["ir/flow.ts"], done: true, moscow: "S" },
      { name: "ClassicWorkflowModel", icon: "⚡", detail: "Represents classic workflows: their triggers, real-time or background mode, scope and run-as identity, along with each step's conditions, field updates and branches.", tags: ["ir/classicWorkflow.ts"], done: true, moscow: "S" },
      { name: "BusinessRuleModel", icon: "📐", detail: "Captures business rules: table, scope and status, plus condition logic and the show, hide, require, optional and clear-value actions taken on each branch.", tags: ["ir/businessRule.ts"], done: true, moscow: "S" },
      { name: "PluginAssemblyModel", icon: "🔌", detail: "Describes plugin assemblies and their types, plus every step registration: which table, which message, at what stage and in what order.", tags: ["ir/plugin.ts"], done: true, moscow: "S" },
      { name: "WebResourceModel", icon: "📜", detail: "Modelled per file: resource type, namespace, and every function with its documentation, parameters and whether it runs asynchronously.", tags: ["ir/webResource.ts"], done: true, moscow: "S" },
      { name: "SecurityRoleModel", icon: "🔐", detail: "Records each security role and its per-table privileges across all eight operations, from create and read through assign and share, each with its granted access level.", tags: ["ir/securityRole.ts"], done: true, moscow: "S" },
      { name: "EnvironmentVariableModel", icon: "🌍", detail: "Holds each environment variable: name, description, data type, default and current values, whether it is required, and any secret store backing.", tags: ["ir/environmentVariable.ts"], done: true, moscow: "S" },
      { name: "GlobalChoiceModel", icon: "🎛️", detail: "Represents shared choice lists with their name, description and type, and each option's value, label, description, visibility and external value.", tags: ["ir/globalChoice.ts"], done: true, moscow: "S" },
      { name: "ConnectionReferenceModel", icon: "🔗", detail: "Records connection references with their display and logical names, plus each connector's full identifier and friendly label.", tags: ["ir/connectionReference.ts"], done: true, moscow: "S" },
      { name: "EmailTemplateModel", icon: "📧", detail: "Models email templates: title, description, target table and language, with subject and body as plain text and the dynamic field placeholders they contain.", tags: ["ir/emailTemplate.ts"], done: true, moscow: "C" },
      { name: "ModelDrivenAppModel", icon: "📱", detail: "Describes each model-driven app: its name, status and form factor, the custom and standard tables it includes, its role count and app settings.", tags: ["ir/modelDrivenApp.ts"], done: true, moscow: "C" },
      { name: "PCFModel", icon: "🧩", detail: "Captures the manifest metadata, property definitions and data types of custom code components.", tags: ["ir/pcf.ts"], done: false, moscow: "C" },
      { name: "BusinessProcessFlowModel", icon: "🔁", detail: "Models business process flows: name, table and activation state, with each stage broken down into its steps and required fields.", tags: ["ir/bpf.ts"], done: false, moscow: "S" },
      { name: "DuplicateDetectionRuleModel", icon: "🔍", detail: "Represents duplicate detection rules: the base and matching tables, plus each match condition's field and comparison operator.", tags: ["ir/duplicateRule.ts"], done: false, moscow: "C" },
      { name: "SLAModel", icon: "⏱️", detail: "Captures service level agreements: name, table and default status, with each KPI's warning and failure durations and the actions they trigger.", tags: ["ir/sla.ts"], done: false, moscow: "C" },
      { name: "DashboardModel", icon: "📊", detail: "Describes each dashboard's layout sections and the charts and views embedded within them.", tags: ["ir/dashboard.ts"], done: false, moscow: "C" },
      { name: "ColumnSecurityProfileModel", icon: "🔒", detail: "Records column security profiles, listing each protected field with its read, update and create permissions.", tags: ["ir/columnSecurityProfile.ts"], done: false, moscow: "S" },
      { name: "ServiceEndpointModel", icon: "🔌", detail: "Models service endpoints such as service bus, webhook and event hub integrations, along with their namespace and contract details.", tags: ["ir/serviceEndpoint.ts"], done: false, moscow: "C" },
      { name: "RoutingRuleSetModel", icon: "📨", detail: "Captures routing rule sets: the table they apply to, and each rule's conditions and target queue.", tags: ["ir/routingRule.ts"], done: false, moscow: "S" },
      { name: "CustomConnectorModel", icon: "🔗", detail: "Describes custom connectors: name, base address, authentication type and the operations they expose.", tags: ["ir/customConnector.ts"], done: false, moscow: "S" },
      { name: "PowerPagesModel", icon: "🌐", detail: "Represents a Power Pages site: its pages, web templates, entity forms and lists, and site settings.", tags: ["ir/powerPages.ts"], done: true, moscow: "C" },
      { name: "VirtualTableModel (or TableModel extension)", icon: "🔌", detail: "Covers virtual tables: provider configuration, the external source entity and custom columns. Whether this stands alone or extends the existing table model remains an open design question.", tags: ["ir/table.ts or ir/virtualTable.ts"], done: false, moscow: "S" },
      { name: "AgentModel", icon: "🤖", detail: "Models a Copilot Studio agent: its topics, knowledge sources, and orchestration and trigger configuration.", tags: ["ir/agent.ts"], done: false, moscow: "S" },
      { name: "SettingsModel", icon: "🛠️", detail: "Captures configured settings by name and value, kept deliberately separate from environment variable definitions.", tags: ["ir/settings.ts"], done: false, moscow: "C" },
      { name: "MaskingRuleModel", icon: "🎭", detail: "Represents data masking rules: which column is masked, the mask type and pattern, and the roles or profiles exempt from it.", tags: ["ir/maskingRule.ts"], done: false, moscow: "S" },
      { name: "CustomPageModel", icon: "🖼️", detail: "Describes custom pages: their type, owning model-driven apps and embedded canvas app, documented alongside the apps that host them rather than as standalone pages.", tags: ["ir/customPage.ts"], done: false, moscow: "C" },
    ]
  },
  {
    id: "enrichment",
    label: "04 / ENRICHMENT LAYER",
    color: "#059669",
    bg: "#ecfdf5",
    description: "Cross-cutting analysis - diagrams, metrics, change detection",
    components: [
      { name: "Mermaid ER Diagram Generator", icon: "🗺️", detail: "Builds an entity relationship diagram from the solution's tables and relationships, filtering out standard platform noise so only the custom data model is shown, with per-solution fine-tuning available.", tags: ["Diagram"], done: true, moscow: "S" },
      { name: "Mermaid Flow Generator", icon: "📈", detail: "Walks each flow's full action tree and draws it as a flowchart, with distinct shapes for conditions, loops and scopes, plus labelled yes/no branches and error paths.", tags: ["Diagram"], done: true, moscow: "S" },
      { name: "Expression Serialiser", icon: "🔣", detail: "Translates raw Power Automate condition logic into plain readable statements, resolving internal references down to actual field names so business logic can be read without decoding expressions.", tags: ["Analysis"], done: true, moscow: "S" },
      { name: "AI Summary Cache Manager", icon: "💾", detail: "Caches AI-generated summaries keyed by each component's content, so unchanged components are never re-summarised and every summary is reviewed in a pull request before it is published.", tags: ["AI", "Cache"], done: true, moscow: "C" },
      { name: "AI Provider Interface", icon: "🤖", detail: "A thin abstraction that keeps the documentation engine independent of any one AI vendor. Claude is supported first, and further providers can be added without touching the enrichment logic.", tags: ["AI", "Pluggable"], done: true, moscow: "C" },
      { name: "Component Summarizer", icon: "✍️", detail: "Writes optional plain-English summaries for flows, plugins, business rules, tables and security roles, tuned to a technical, functional or executive audience and shown alongside the extracted detail.", tags: ["AI", "Enrichment"], done: true, moscow: "C" },
      { name: "Dependency Resolver", icon: "🔗", detail: "Cross-links flows and tables so each table page shows the flows that use it, and each flow page shows the tables it depends on.", tags: ["Analysis"], done: true, moscow: "C" },
      { name: "Complexity Scorer", icon: "📏", detail: "Flags the most complex flows and plugins so a handover reader knows where to focus attention first.", tags: ["Analysis"], done: false, moscow: "C" },
      { name: "Change Detector", icon: "📝", detail: "Uses source control history to work out what changed since the last release and generates change log pages in the wiki.", tags: ["Optional"], done: false, moscow: "C" },
    ]
  },
  {
    id: "output",
    label: "05 / OUTPUT LAYER",
    color: "#e11d48",
    bg: "#fff1f2",
    description: "Pluggable renderers - swap or combine without touching parsers or IR",
    components: [
      { name: "Markdown Renderer", icon: "✍️", detail: "The primary output path. Translates the format-neutral document model into Azure DevOps Wiki markdown, encoding internal links so cross-references between pages resolve correctly.", tags: ["Primary"], done: true, moscow: "M" },
      { name: "ADO Wiki Publisher", icon: "🌐", detail: "Pushes generated pages into an Azure DevOps wiki through its REST API, building the page hierarchy top down and validating credentials before publishing. Publish order keeps the sidebar alphabetical.", tags: ["ADO"], done: true, moscow: "S" },
      { name: "Word Renderer", icon: "📄", detail: "Builds a Word document from the same content that drives the wiki, complete with a table of contents, page numbering and diagrams embedded as images cached between runs.", tags: ["Optional"], done: true, moscow: "C" },
      { name: "Word Theming", icon: "🎨", detail: "The default styling needs no configuration; a single accent colour rebrands headings, tables and borders, each derived value individually overridable. Invalid colours warn and fall back rather than failing an unattended run.", tags: ["Optional"], done: true, moscow: "C" },
      { name: "Company Word Template", icon: "🏢", detail: "Renders the document into your own branded Word template rather than styling one from scratch, so the output arrives with the company logo, headers, footers, fonts and page setup already on it. Mark where the content goes with a {{content}} placeholder and everything around it — a cover page, a back page — is preserved. Works against any Word template, because the heading styles it hooks into are Word built-ins rather than anything specific to one brand.", tags: ["Optional"], done: true, moscow: "S" },
      { name: "PDF Renderer", icon: "📑", detail: "Writes a standalone PDF locally from the same document model, including a table of contents and page numbers, though without diagrams. This output is planned for deprecation.", tags: ["Optional", "Deprecation planned"], done: true, moscow: "C" },
      { name: "Confluence Renderer", icon: "🔵", detail: "Would publish the same structured content to Confluence for clients not using Azure DevOps. Low priority, as most clients are already on Azure DevOps.", tags: ["Optional"], done: false, moscow: "W" },
    ]
  },
  {
    id: "pipeline",
    label: "06 / PIPELINE LAYER",
    color: "#0891b2",
    bg: "#ecfeff",
    description: "Azure DevOps YAML + npm package - reusable across all client projects",
    components: [
      { name: "ADO Pipeline YAML", icon: "🏭", detail: "Ready-made Azure DevOps pipeline definition that runs the documentation tool on demand, with credentials injected from secret variables at runtime. Proven end-to-end against live solutions.", tags: ["ADO YAML"], done: true, moscow: "S" },
      { name: "doc-gen.config.yml", icon: "⚙️", detail: "Per-project configuration covering multiple solutions, output formats, component selection and wiki destination. Credentials never live in the file: they are supplied at runtime, and inline guidance walks users through setup.", tags: ["Config"], done: true, moscow: "M" },
      { name: "npm Package (powerautodocs)", icon: "📦", detail: "Distributed through the public npm registry, so client pipelines fetch the maintained tool on demand with nothing to install or host. A rename onto a clean package removed earlier client data exposure risk.", tags: ["npm"], done: true, moscow: "M" },
      { name: "Run Logger + Summary", icon: "📋", detail: "Structured run logging with per-solution progress and an end-of-run summary of what was processed, published, skipped or failed. Any hard failure marks the pipeline step as failed.", tags: ["DX"], done: true, moscow: "S" },
      { name: "GitHub Actions npm Publish", icon: "🚀", detail: "Cutting a release automatically runs the full checks, builds the package and publishes the new version, replacing manual releases from a developer machine.", tags: ["CI/CD"], done: true, moscow: "S" },
      { name: "CI Pipeline", icon: "✅", detail: "Every pull request and every change to the main branch runs automated verification: type checks, a full build and the complete test suite across the supported runtime versions.", tags: ["CI/CD"], done: true, moscow: "M" },
      { name: "Vitest Test Suite", icon: "🧪", detail: "A fast automated suite covering every parser and renderer, the wiki and Word outputs, and the AI enrichment layer. Fixtures are entirely fictional, so no real client data ever enters the codebase.", tags: ["Testing"], done: true, moscow: "M" },
      { name: "Trigger Strategy", icon: "⚡", detail: "Runs are currently started manually. Automatic triggers, such as running on each commit or on a nightly schedule, are planned.", tags: ["Trigger"], done: false, moscow: "S" },
      { name: "IR Artifact Store", icon: "💾", detail: "Planned: each run would save a snapshot of the extracted solution model as a pipeline artifact, enabling comparison between runs, easier debugging and faster re-runs.", tags: ["Artefact"], done: false, moscow: "C" },
    ]
  }
];

const pages = [
  { emoji: "🏠", name: "Solution Overview", desc: "Publisher, version, managed/unmanaged, component counts per solution, solutions table", done: true, moscow: "M" },
  { emoji: "🗺️", name: "ER Diagram", desc: "Auto-generated Mermaid erDiagram on the Data Model summary page. Custom entities only (publisher prefix filtered). Configurable exclusions via erd.excludeEntities and erd.excludeRelationships.", done: true, moscow: "S" },
  { emoji: "📋", name: "Table Pages", desc: "Index page + subpages: Columns, Views, Forms, Relationships, Business Rules (always emitted, shows empty state if none)", done: true, moscow: "M" },
  { emoji: "🔄", name: "Automation / Flows", desc: "Flow summary + per-flow pages with trigger, nested action list with ✓/✗ branch markers, Mermaid flowchart", done: true, moscow: "S" },
  { emoji: "⚡", name: "Classic Workflows", desc: "Summary index + per-workflow pages with trigger config, condition steps and branch actions", done: true, moscow: "S" },
  { emoji: "📐", name: "Business Rules", desc: "Per-table subpages with if/else branch logic, show/hide/required/clear actions grouped by type. Individual rule per page.", done: true, moscow: "S" },
  { emoji: "🔌", name: "Plugins", desc: "Plugin assemblies, step registrations, entity/message/stage bindings", done: true, moscow: "S" },
  { emoji: "📜", name: "Web Resources", desc: "JS files with function index, namespace, JSDoc, event handlers vs helpers split. Linked summary table. Function 'Description' column is AI-populated (per-function summary) when AI enrichment is enabled, falling back to JSDoc.", done: true, moscow: "S" },
  { emoji: "🔐", name: "Security", desc: "Security container page → Security Roles subpage → per-role privilege matrix with ●○ dot levels. Structured for future additions (column security profiles etc).", done: true, moscow: "S" },
  { emoji: "🌍", name: "Integrations / Env Vars", desc: "Environment variables with type, default value, current value, secret store indicator. Configurable column visibility.", done: true, moscow: "S" },
  { emoji: "🎛️", name: "Global Choices", desc: "Solution-level option sets. Index with option count + per-choice pages with full value/label table.", done: true, moscow: "S" },
  { emoji: "🔗", name: "Integrations / Connection Refs", desc: "Connection references with friendly connector names and logical names. Sits alongside Environment Variables under Integrations.", done: true, moscow: "S" },
  { emoji: "📧", name: "Email Templates", desc: "Index with subject preview + per-template pages with subject, plain text body with {fieldName} placeholders, and dynamic fields list.", done: true, moscow: "C" },
  { emoji: "📱", name: "Model-Driven Apps", desc: "Index + per-app pages with metadata, app settings, custom and standard entity lists in 3-column table.", done: true, moscow: "C" },
  { emoji: "🧩", name: "PCF Controls", desc: "Component manifest, properties, data types", done: false, moscow: "C" },
  { emoji: "📝", name: "Change Log", desc: "What changed per release - git-diff driven, auto-generated", done: false, moscow: "C" },
  { emoji: "🔁", name: "Business Process Flows", desc: "BPF index + per-flow pages with stages, steps and entity scope", done: false, moscow: "S" },
  { emoji: "🔒", name: "Column Security Profiles", desc: "Profile index under Security section + per-profile field permission matrix", done: false, moscow: "S" },
  { emoji: "🔍", name: "Duplicate Detection Rules", desc: "Rules index + per-rule match conditions", done: false, moscow: "C" },
  { emoji: "⏱️", name: "SLAs", desc: "SLA index + per-SLA pages with KPIs and warning/failure actions", done: false, moscow: "C" },
  { emoji: "📊", name: "Dashboards", desc: "Dashboard index + per-dashboard component list", done: false, moscow: "C" },
  { emoji: "🔌", name: "Service Endpoints", desc: "Endpoint index with type and connection details under Integrations", done: false, moscow: "C" },
  { emoji: "📨", name: "Routing Rule Sets", desc: "Rule set index + per-rule conditions and queue assignments", done: false, moscow: "S" },
  { emoji: "🔗", name: "Custom Connectors", desc: "Connector index + per-connector operations list", done: false, moscow: "S" },
  { emoji: "🌐", name: "Power Pages", desc: "Site overview, pages, web templates, entity forms and lists", done: true, moscow: "C" },
  { emoji: "🔌", name: "Virtual Tables", desc: "External provider/data source, source entity mapping, custom columns layered on top", done: false, moscow: "S" },
  { emoji: "🤖", name: "Copilot Studio Agents", desc: "Agent index + per-agent pages: topics, knowledge sources, orchestration/trigger config", done: false, moscow: "S" },
  { emoji: "🛠️", name: "Settings", desc: "Org/solution configuration records beyond Environment Variables - default currency, auto-numbering, duplicate-detection toggles", done: false, moscow: "C" },
  { emoji: "🎭", name: "Masking Rules", desc: "Masked columns, mask type/pattern, and which roles/profiles are exempt", done: false, moscow: "S" },
  { emoji: "🖼️", name: "Custom Pages", desc: "Canvas-style pages surfaced alongside the Model-Driven App they belong to", done: false, moscow: "C" },
  { emoji: "🤖", name: "AI Enrichment", desc: "Optional AI-generated summaries for components. Per-component toggle in config. Cache-first approach with .powerautodocs-ai-cache.json. Pluggable provider interface.", done: true, moscow: "C" },
];

const decisions = [
  { q: "Language / Runtime?", a: "TypeScript / Node.js", reason: "Typed IR interfaces catch errors at compile time. Pure TypeScript string builders mean no templating engine dependency. NodeNext module resolution for ESM compatibility. tsx for fast local iteration without a build step." },
  { q: "Core architecture?", a: "IR-based pipeline", reason: "Parsers only produce IR. Renderers only consume IR. Neither knows about the other. This separation means output formats (markdown, Word, Confluence) can be swapped or added without touching any parser. The IR is the contract between the two halves of the system." },
  { q: "How reusable across clients?", a: "npm package + ADO pipeline template", reason: "powerautodocs published to npmjs.com - clients run npx powerautodocs@latest with no local install. Client projects only need doc-gen.config.yml and a pipeline YAML. GitHub Actions workflow auto-publishes to npm on each GitHub Release, removing manual publish steps." },
  { q: "Multi-solution projects?", a: "Config-driven merge", reason: "doc-gen.config.yml lists multiple solutions. Each is parsed independently then merged into a single IR before rendering. Every solution is scanned for everything - the components config controls what gets rendered, not what gets parsed. Solution role concept was removed as unnecessary complexity." },
  { q: "Flow action rendering?", a: "Nested markdown list", reason: "Flows have a natural tree structure. A flat table format fought against this. Nested bullet list with ✓/✗ branch markers renders the hierarchy naturally. The Mermaid diagram owns the visual representation - the action list owns the detail." },
  { q: "Mermaid in ADO Wiki?", a: ":::mermaid fence, pinned to v8.14", reason: "ADO Wiki uses ::: delimiters, not backtick fences. Pinned to Mermaid v8.14 for compatibility - newer node shapes like {{}} are not supported. Trigger nodes use stadium shape, Terminate uses circle. erDiagram used for ERD with empty entity blocks (no columns by design)." },
  { q: "ERD entity filtering?", a: "Two-tier: prefix + explicit overrides", reason: "excludeStandardRelationships:true automatically filters to custom entities via publisher prefix - eliminates ownerid/systemuser/businessunit noise in one setting. erd.excludeEntities and erd.excludeRelationships in config.yml for per-solution fine-tuning of remaining noise." },
  { q: "Error handling strategy?", a: "Skip-and-continue with run summary", reason: "A single bad solution path should not kill the entire run. Each solution is wrapped in try/catch - failures are recorded and the run continues. End-of-run summary shows processed/skipped counts, parse warnings and publish failures. Exit code 1 on any failure so ADO marks the step red." },
  { q: "File casing on Linux?", a: "Capitalised filenames (Solution.xml)", reason: "pac CLI on Windows produces capitalised filenames (Solution.xml, Customizations.xml). macOS is case-insensitive so lowercase references worked locally. ADO agents run Ubuntu - Linux is case-sensitive and lowercase references failed silently. Standardised all filename references to match pac CLI output." },
  { q: "Package name?", a: "powerautodocs (renamed from powerautodoc)", reason: "Original package powerautodoc was published with client references in source file comments. npm does not allow full package deletion after 72 hours. Renamed to powerautodocs on a clean repository (lewginn/PowerAutoDocs) with no client data in history. Old package deprecated." },
  { q: "Security page structure?", a: "Security container → sublevel pages", reason: "Security is a container page with [[_TOSP_]]. Security Roles is a sublevel - not the top page itself - leaving room for Column Security Profiles and other future additions without restructuring the wiki hierarchy." },
  { q: "Word output?", a: "DocNode layer + DocxSerializer", reason: "Renderers now emit DocNode[] (format-agnostic). MarkdownSerializer converts to ADO Wiki markdown; DocxSerializer converts to docx Paragraph/Table elements. A4 fixed-width tables (TableLayoutType.FIXED + DXA column widths) ensure consistent rendering in Word and Word Online. Output mode controlled by output.word in config.yml or --word CLI flag. Mermaid diagrams are embedded as images (rendered via mermaidRenderer.ts) - see 'Mermaid in Word?' below. PDF (PdfSerializer, the DocNode layer's other consumer) is planned for deprecation - see 'PDF output - deprecation planned?' below." },
  { q: "Company Word template?", a: "patchDocument() into a client-supplied .docx, no new dependency", reason: "The blocker on using the tool internally: the themed output could only ever be a lookalike of a corporate template - no logo, no branded headers or footers, no cover page. The document is now injected into the real template instead, at a {{content}} placeholder, using patchDocument() from the docx library we already ship. That it needs no new dependency is what made it cheap: every dependency is paid on every ephemeral ADO agent run, forever. The inversion is the point - buildDocument() decides fonts, page size, margins and footers, whereas here the template already decided all of them and we contribute only the body. It generalises to any template rather than one we prepared, because Heading1-Heading9, ListParagraph and TableGrid are OOXML built-ins present in every Word file regardless of its design or UI language; only branded style names are template-specific, and those are config (output.wordTemplateStyles.table) with the existing wordTheme as fallback. Content is injected at a placeholder rather than by replacing the document body, so a template's own cover and back pages survive and the section properties carrying the header/footer references never have to be reconstructed. Bullets are the one place this diverges: a Word list is a reference into numbering.xml, which under a template is the template's file, so a native bullet resolves to whatever list that template defines at that id - verified against a real company template whose numId 1 is a decimal list, which turned every bulleted flow action into 1, 1.1, 1.1.1. Under a template the glyph is therefore written directly with an explicit indent, giving up list semantics to be correct against a template nobody has seen. Known gap: the setting that makes Word refresh the table of contents on open lives in settings.xml, which comes from the template, so a TOC reads empty until Ctrl+A then F9 - fixing it needs a zip writer, which would be a new dependency." },
  { q: "Word theming?", a: "Resolved WordTheme threaded into the serializer, applied as docx document styles", reason: "The Word output looked basic for one concrete reason: buildDocument() never set a styles block, and no default font was declared anywhere - so every heading and paragraph fell through to Word's built-in defaults. The fix is applied at the document-styles level rather than per-run, because styles reach content the serializer never explicitly emits runs for, including the generated TOC. The theme is resolved once in docAssembler (config → WordTheme) and passed down as a parameter, mirroring the MermaidRenderer injection - docmodel never imports config, so the serializer stays a pure DocNode → docx function and the IR/renderer boundary is untouched. Config surface is deliberately one field deep: output.wordTheme.accentColor derives heading colours, table header fill, row banding, borders and code colour, so branding is normally one line; each derived value stays individually overridable for the minority who need exact control. Named preset themes were considered and deferred - they are purely additive on top of this type, whereas shipping them now would freeze a palette vocabulary before there is evidence of what people actually want. Defaults are Office-bundled fonts (Calibri/Calibri Light/Courier New) because Word silently substitutes fonts that aren't installed on the reader's machine, which makes anything fashionable a coin flip. Invalid colours warn and fall back rather than throwing - deliberately unlike the fail-fast aiEnrichment validation, since a bad hex is cosmetic and failing an unattended pipeline at the end of a long parse over a missing '#' is the worse outcome." },
  { q: "Mermaid in Word?", a: "@mermaid-js/mermaid-cli against local Chrome/Edge, PNG embed, content-hash cache", reason: "Word has no native Mermaid support, so diagrams have to become images. mermaid-cli's renderMermaid() runs against a real browser instance - but Puppeteer's own bundled Chromium (~250MB) would be a fresh download on every ADO pipeline run, since hosted agents are ephemeral VMs. .puppeteerrc.cjs sets skipDownload: true; mermaidRenderer.ts instead points at the agent's preinstalled Chrome/Edge (or POWERAUTODOCS_CHROME_PATH if it's somewhere non-standard) - zero download, works cold every run. Rendered PNGs are cached to .powerautodocs-diagram-cache/ keyed by a SHA-256 of the diagram's Mermaid source, same 'unchanged input, skip the work' pattern as the AI enrichment cache - unchanged diagrams across runs never re-render, and the browser only launches if at least one diagram actually changed. Availability is checked once up front (no browser launch, just checking known install paths) rather than failing partway through a run; if no browser is found, diagrams are silently omitted with a console warning. Toggle via output.wordDiagrams (default true). This also surfaced and fixed a real bug: erdGenerator.ts was baking the ADO :::mermaid fence directly into the diagram string, which MarkdownSerializer then wrapped a second time - ERD diagrams in the wiki had been double-fenced. Fixed to return raw DSL, matching mermaidGenerator.ts." },
  { q: "PDF output?", a: "DocNode layer + PdfSerializer (pdfmake)", reason: "Reuses the same format-agnostic DocNode[] layer as Word - PdfSerializer converts it to pdfmake content using the standard 14 PDF fonts (Helvetica/Courier), so no font files or native binaries need bundling. Mirrors DocxSerializer's structure and decisions (A4, 1\" margins, proportional column widths, Mermaid skipped) for a self-contained file. pdfAssembler.ts mirrors docAssembler.ts section-by-section with identical heading offsets. Self-contained PDFs have no subpages, so internal links degrade gracefully to plain/code-styled text - same pattern as Word. Output controlled by output.pdf in config.yml or --pdf CLI flag; local file only, not published to the ADO Wiki. Superseded by a deprecation call (Lewis, 2026-07-17) - see 'PDF output - deprecation planned?' below; nothing removed yet and output.pdf still works, but treat this as the settled decision, not a base to build further PDF work on." },
  { q: "PDF output - deprecation planned?", a: "Deprecating; nothing removed yet", reason: "Lewis decided 2026-07-17 to deprecate PDF output, re-confirmed the same day when #109 asked whether pdfAssembler should get test coverage - the answer was no, on this decision. The reasoning: PdfSerializer (pdfmake) lags Word on theming and formatting fidelity - no font embedding, no Mermaid diagrams, no brand theming - and closing that gap would mean building a second theming system to maintain alongside Word's. Word's own Export to PDF already produces a themed, diagram-complete PDF from the same document, making a separate PdfSerializer redundant rather than complementary. PdfSerializer (419 lines) and pdfAssembler (222 lines) are consequently the only untested runtime in the repo while their Word twins are both covered; pdfAssembler mirrors docAssembler section-for-section, so a component added to all three assemblers now has a covered Word path and an uncovered PDF one - the accepted cost of not investing further in a format on its way out. Nothing has been removed yet and output.pdf still works, but do not invest in PDF features, tests or refactors without confirming the plan still holds. If it goes, pdfmake and @types/pdfmake go with it - a further dependency saving on every client run." },
  { q: "AI summaries - stable across runs?", a: "Cache-first: committed JSON file", reason: "A CI documentation pipeline must produce stable, reviewable output. Without a cache every run regenerates different text, creating constant noisy wiki diffs. The cache file (.powerautodocs-ai-cache.json) is committed alongside doc-gen.config.yml so AI-written summaries are reviewed in PRs before they're published - same discipline as any other code change." },
  { q: "AI summary cache invalidation?", a: "SHA-256 hash of component IR + --regenerate-ai flag", reason: "Each cache entry stores a SHA-256 of the serialised IR for that component. If the IR hasn't changed the cached summary is reused - controls API cost and prevents surprise rewrites on unchanged components. --regenerate-ai flag gives a manual escape hatch for a full fresh pass." },
  { q: "Which AI provider(s)?", a: "Anthropic (Claude) + Azure OpenAI day-one; factory-extensible", reason: "Anthropic/Claude is the natural fit given the toolchain. But most D365/Power Platform shops on ADO are deep in Azure and already have Azure OpenAI provisioned - Azure-hosted AI with data residency compliance and no new vendor procurement. Both providers implement the AiProvider interface (summarise(prompt): Promise<string>). The factory pattern in providers/index.ts means new providers (OpenAI direct, Bedrock, etc.) only need a new file - aiSummariser stays completely provider-agnostic." },
  { q: "Azure OpenAI auth - API key or managed identity?", a: "Support both; managed identity is preferred enterprise path", reason: "API key auth works in all Azure scenarios. Managed identity means the ADO agent's identity gets RBAC access to the Azure OpenAI resource via Azure AD - zero API keys to manage or rotate. Enterprise shops prefer this. Both are supported; config can omit apiKey if using managed identity + workload identity federation on the ADO service connection." },
  { q: "Which AI model?", a: "Configurable, defaulting to claude-haiku-4-5", reason: "Haiku is fast and cheap - ideal for batch-summarising many components per run. Clients who want higher quality can bump to Sonnet in their config. Pinning a specific model ID (not 'latest') ensures summaries don't silently change when Anthropic releases a new default." },
  { q: "Which components can be AI-summarised? (v1 scope)", a: "Flows, Classic Workflows, Business Rules, Plugins, Web Resources - opt-in per component", reason: "Deliberately scoped to a subset rather than mirroring all 14 component toggles. These five share one trait: they're complex, code-like or logic-heavy artefacts that are genuinely hard to skim at a glance - exactly where a plain-English summary adds real value. Things like Global Choices or Connection References are already terse lists; an AI summary would be redundant noise. Scope can grow in later phases as the enrichment proves itself." },
  { q: "AI config validation - fail-fast or skip?", a: "Fail-fast at config-load time on misconfiguration", reason: "Distinct from the runtime skip-and-continue strategy. If aiEnrichment.enabled is true but the selected provider's config block (anthropic / azureOpenAI) is missing or incomplete, the run errors immediately before any parsing starts - this is a configuration mistake the user must fix, not a transient runtime failure. Skip-and-continue is reserved for actual API call failures (rate limits, timeouts) once the pipeline is correctly configured and running." },
  { q: "AI call failure handling?", a: "Skip-and-continue - summary omitted, warning logged", reason: "Consistent with the existing error handling strategy. A rate-limit or bad API key should not halt documentation of everything else. The end-of-run summary lists how many AI summaries were skipped so failures are visible without being fatal to the pipeline." },
  { q: "AI API key handling?", a: "apiKeyEnv points to an env var name; key never in the config file", reason: "Same pattern as WIKI_PAT. The committed config contains apiKeyEnv: ANTHROPIC_API_KEY; the actual key is an ADO secret variable injected at pipeline runtime via the pipeline variables. Nothing sensitive ever touches the repo." },
  { q: "AI cache file format and shape?", a: "Single committed JSON file, keyed by {type}:{uniqueName}, SHA-256 of a 'summarisable view'", reason: "JSON needs no new dependency and diffs cleanly in PRs (matches package-lock.json precedent). Keys like flow:cr123_SyncAccounts are human-readable and greppable. Crucially, the hash is computed over a small derived 'summarisable view' per component - meaning-bearing fields only (names, descriptions, trigger info, action list) - not the full IR. This is the same shape fed into the AI prompt, so hash and prompt share one source of truth. Hashing the full IR would over-invalidate: an unrelated Mermaid-diagram tweak or a new bookkeeping field (depth/parentName/runAfter) would force every cached summary across every client to regenerate even though the actual logic hadn't changed - exactly the noisy-diff problem the cache exists to prevent. version: 1 is included for safe future migration; orphaned entries (components no longer present) are pruned each run to keep the committed file accurate. A promptVersion constant is also folded into the hash input - bumping it deliberately forces full regeneration when prompt wording is improved, preventing a mix of old-style and new-style summaries coexisting in the same doc set with no way to tell them apart." },
  { q: "AI summary section - conditional rendering?", a: "Renderer emits no DocNode if aiSummary is absent", reason: "If a component has no cached summary (AI disabled, or skipped due to failure) the renderer simply does not emit the summary section DocNode - no empty heading, no placeholder text. This is a renderer guard before the h() call, not conditional template logic. Output is identical to pre-AI pages when enrichment is off." },
  { q: "AI prompt strategy and structure?", a: "Three-layer prompt: shared system framing + per-component lens + reused 'summarisable view' data, inline in aiSummariser.ts", reason: "Layer 1 is a constant system framing (audience: technical handover documentation for consultants who didn't build the solution; 2-3 sentence length cap; plain prose, no markdown; and a strict hallucination guardrail - only describe what's explicitly in the data, no speculation about business purpose or downstream systems). Layer 2 is a one-line per-component-type 'lens' (e.g. flows: focus on trigger + sequence + branching; business rules: focus on the condition and then/else actions) so the model knows which facts matter for that artefact type rather than producing generically-confused output. Layer 3 reuses the same 'summarisable view' that feeds the cache hash - one function serves both, so there's no drift between what justified regeneration and what the model actually saw. Templates live as inline functions in aiSummariser.ts rather than a separate prompts/ folder - five component types in v1 doesn't yet warrant the per-type file split that parsers/renderers use." },
  { q: "Per-function AI summaries for Web Resources - separate calls or bundled?", a: "Bundled into the existing per-file call via structured JSON output", reason: "The rendered Functions table has a 'Description' column sourced from JSDoc - almost always empty in real client code. Rather than firing one extra AI call per function (could be 5-10x more calls across a typical solution's web resources), the existing per-file webResources prompt was extended to request structured JSON: { fileSummary, functionSummaries: { <name>: <one-liner> } }. One call now produces both the file-level summary (existing aiSummaryBlock) and a short summary per function (WebResourceFunction.aiSummary, falls back to jsDoc, then '-'). Cached and hashed exactly as before - zero extra API cost. promptVersion bumped to 2 to force a one-time regeneration under the new structured format; tryParseJsonObject() strips markdown fences and falls back to treating the raw text as the file summary if parsing fails, so a non-conforming provider response degrades gracefully rather than breaking the run." },
  { q: "Configurable summary tone/length per client?", a: "Deferred - not in v1 scope", reason: "Adding a tone: 'technical' | 'executive' or maxSentences config knob before knowing whether clients actually want it would add config surface and prompt-variation complexity speculatively. The fixed technical-handover tone and 2-3 sentence cap covers the primary use case. Tracked as a backlog candidate - straightforward to bolt on as an optional override once the core feature is proven in real use." },
];

// Mirrors the phase groupings tracked on the PowerAutoDocs Roadmap GitHub
// Project (github.com/users/lewginn/projects/3) - Lewis tracks/updates issue
// status and phase assignment there as the source of truth; this list is kept
// in sync with it (issue numbers noted per item for traceability).
const progress = [
  {
    phase: "Phase 1 / Core Pipeline & Data Model", color: "#2563eb", status: "COMPLETE",
    items: [
      { label: "Solution manifest parser (#71)", done: true },
      { label: "Entity / table parser (#72)", done: true },
      { label: "Column type mapping + filtering (#73)", done: true },
      { label: "Relationship parser (1:N) (#74)", done: true },
      { label: "IR models split by domain (#75)", done: true },
      { label: "Barrel exports - parsers + renderers (#76)", done: true },
      { label: "Config system with defaults (#77)", done: true },
      { label: "Markdown renderer (#78)", done: true },
      { label: "Solution overview page (#79)", done: true },
      { label: "Per-table documentation pages (#80)", done: true },
    ]
  },
  {
    phase: "Phase 2 / Forms, Views & Filters", color: "#7c3aed", status: "COMPLETE",
    items: [
      { label: "Form parser - Main, Quick Create, Card (#81)", done: true },
      { label: "View parser with type detection (#82)", done: true },
      { label: "View filter condition extraction (#83)", done: true },
      { label: "Nested join filter hierarchy + depth (#84)", done: true },
      { label: "Linked entity column prefixing (#85)", done: true },
      { label: "Compact / detailed form layout toggle (#86)", done: true },
      { label: "OOTB column exclusion defaults (#87)", done: true },
      { label: "Base currency field filtering (#88)", done: true },
    ]
  },
  {
    phase: "Phase 3 / Component IR Models & Renderers", color: "#9333ea", status: "COMPLETE",
    items: [
      { label: "Solution Model (#37)", done: true },
      { label: "Table & Column Model (#38)", done: true },
      { label: "Relationship Model (#39)", done: true },
      { label: "Form Model & Parser (#40)", done: true },
      { label: "View Model & Parser (#41)", done: true },
      { label: "Flow Model & Renderer (#42)", done: true },
      { label: "Classic Workflow Model & Renderer (#43)", done: true },
      { label: "Business Rule Model & Renderer (#44)", done: true },
      { label: "Plugin Model & Renderer (#45)", done: true },
      { label: "Web Resource Model & Renderer (#46)", done: true },
      { label: "Security Role Model & Renderer (#47)", done: true },
      { label: "Environment Variable Model & Renderer (#48)", done: true },
      { label: "Global Choice Model & Renderer (#49)", done: true },
      { label: "Connection Reference Model & Renderer (#50)", done: true },
      { label: "Email Template Model & Renderer (#51)", done: true },
      { label: "Model-Driven App Model & Renderer (#52)", done: true },
    ]
  },
  {
    phase: "Phase 4 / AI Enrichment & Delivery Formats", color: "#db2777", status: "COMPLETE",
    items: [
      { label: "Dependency resolver - flow ↔ table cross-links (#69)", done: true },
      { label: "AI Enrichment Layer - summaries, caching, providers (#1)", done: true },
      { label: "Word renderer - DocNode + DocxSerializer + docAssembler (#94)", done: true },
      { label: "ADO Wiki publisher - wikiAssembler + wikiPublisher (#95)", done: true },
      { label: "PDF renderer - retired 2026-07-17, DocNode + PdfSerializer + pdfAssembler (#67)", done: true },
      { label: "Mermaid → PNG conversion - embedded diagrams in Word output (#68)", done: true },
      { label: "Word theming - styled default + configurable brand colour/fonts (#100)", done: true },
      { label: "CI pipeline + Vitest test suite (#102)", done: true },
      { label: "Ragged-table row padding fix (#103)", done: true },
      { label: "Test coverage: publisher, pipeline entry point, enrichment (#109)", done: true },
      { label: "42 defects found by #109's coverage pass - all fixed (#110)", done: true },
    ]
  },
  {
    phase: "Phase 5 / Governance & Admin Configuration Components", color: "#0891b2", status: "PLANNED",
    items: [
      { label: "Business Process Flow Model & Parser & Renderer (#54)", done: false },
      { label: "Column Security Profile Model & Parser & Renderer (#55)", done: false },
      { label: "Routing Rule Set Model & Parser & Renderer (#56)", done: false },
      { label: "Duplicate Detection Rule Model & Parser & Renderer (#58)", done: false },
      { label: "SLA Model & Parser & Renderer (#59)", done: false },
      { label: "Masking Rule Model & Parser & Renderer - Secured/Attribute (#120)", done: false },
      { label: "Settings Model & Parser & Renderer (#119)", done: false },
    ]
  },
  {
    phase: "Phase 6 / Automation, Copilot & Integration Surfaces", color: "#9333ea", status: "PLANNED",
    items: [
      { label: "Scheduled Flow - recurrence metadata on the existing Flow model (#116)", done: false },
      { label: "Agent Model & Parser & Renderer - Copilot Studio (#118)", done: false },
      { label: "Virtual Table Model & Parser & Renderer (#115)", done: false },
      { label: "Custom Connector Model & Parser & Renderer (#57)", done: false },
      { label: "Plugin source code linking - real .cs source, not just metadata (#97)", done: false },
      { label: "Service Endpoint Model & Parser & Renderer (#61)", done: false },
    ]
  },
  {
    phase: "Backlog / Presentation, Tooling & Long-tail", color: "#64748b", status: "BACKLOG",
    items: [
      { label: "Power Pages Model & Parser & Renderer (#62)", done: true },
      { label: "Auto-trigger pipeline - push/scheduled (#64)", done: false },
      { label: "AI Enrichment - configurable summary tone/length per client (#90)", done: false },
      { label: "PCF Control Model & Parser & Renderer (#53)", done: false },
      { label: "Dashboard Model & Parser & Renderer (#60)", done: false },
      { label: "Custom Page Model & Parser & Renderer (#117)", done: false },
      { label: "CLI flags with commander (#63)", done: false },
      { label: "Git-based changelog (#65)", done: false },
      { label: "IR JSON artifact export (#66)", done: false },
      { label: "Complexity scorer (#70)", done: false },
    ]
  },
];

// ---------------------------------------------------------------------------
// Presentation layer - everything below renders the content above.
// Aesthetic: brand spectral console. Dark slate masthead band (brand dark
// slides: grid, glow, ribbon) over a light tinted deck. Spectral pipeline
// ramp (one hue per layer), magenta interaction accent, per-priority MoSCoW
// colours. Motion: scroll reveals, tick boot-up, ribbon draw-in, flowing
// pipeline packets - all disabled under prefers-reduced-motion.
// Space Grotesk display / JetBrains Mono data / Inter body.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState as useStateReact } from "react";

const wikiTree = [
  { indent: 0, kind: "folder", name: "[Solution Name]", done: true },
  { indent: 1, kind: "page", name: "Overview", done: true },
  { indent: 1, kind: "folder", name: "Data Model", done: true },
  { indent: 2, kind: "page", name: "Entity Relationship Diagram", done: true, note: "on Data Model page" },
  { indent: 2, kind: "page", name: "Virtual Tables", done: false },
  { indent: 2, kind: "page", name: "[Table Name] × N", done: true, note: "index page" },
  { indent: 3, kind: "page", name: "Columns", done: true },
  { indent: 3, kind: "page", name: "Views", done: true },
  { indent: 3, kind: "page", name: "Forms", done: true },
  { indent: 3, kind: "page", name: "Relationships", done: true },
  { indent: 3, kind: "page", name: "Business Rules", done: true, note: "index + per-rule pages" },
  { indent: 1, kind: "folder", name: "Automation", done: true },
  { indent: 2, kind: "page", name: "Flows", done: true, note: "summary + per-flow pages with diagrams" },
  { indent: 2, kind: "page", name: "Classic Workflows", done: true, note: "summary + per-workflow pages" },
  { indent: 2, kind: "page", name: "Plugin Assemblies", done: true },
  { indent: 1, kind: "folder", name: "Custom Code", done: true },
  { indent: 2, kind: "page", name: "Web Resources (JS)", done: true, note: "linked summary + per-file pages" },
  { indent: 2, kind: "page", name: "PCF Controls", done: false },
  { indent: 1, kind: "folder", name: "Security", done: true, note: "container page" },
  { indent: 2, kind: "page", name: "Security Roles", done: true, note: "index + per-role matrix pages" },
  { indent: 2, kind: "page", name: "Column Security Profiles", done: false },
  { indent: 2, kind: "page", name: "Masking Rules", done: false },
  { indent: 1, kind: "folder", name: "Integrations", done: true },
  { indent: 2, kind: "page", name: "Environment Variables", done: true },
  { indent: 2, kind: "page", name: "Connection References", done: true },
  { indent: 2, kind: "page", name: "Service Endpoints", done: false },
  { indent: 1, kind: "page", name: "Global Choices", done: true, note: "index + per-choice pages" },
  { indent: 1, kind: "page", name: "Email Templates", done: true, note: "index + per-template pages" },
  { indent: 1, kind: "page", name: "Model-Driven Apps", done: true, note: "index + per-app pages" },
  { indent: 2, kind: "page", name: "Custom Pages", done: false, note: "surfaced alongside owning app" },
  { indent: 1, kind: "page", name: "Copilot Studio Agents", done: false },
  { indent: 1, kind: "page", name: "Change Log", done: false },
  { indent: 1, kind: "page", name: "Business Process Flows", done: false, note: "index + per-BPF pages" },
  { indent: 1, kind: "page", name: "Duplicate Detection Rules", done: false },
  { indent: 1, kind: "page", name: "SLAs", done: false },
  { indent: 1, kind: "page", name: "Dashboards", done: false },
  { indent: 1, kind: "page", name: "Routing Rule Sets", done: false },
  { indent: 1, kind: "page", name: "Custom Connectors", done: false },
  { indent: 1, kind: "page", name: "Power Pages", done: true },
  { indent: 1, kind: "page", name: "Settings", done: false },
];

// Box-drawing prefix for row i: "│  " where an ancestor level continues,
// "├─ " / "└─ " at the row's own depth.
function treePrefix(items, i) {
  const item = items[i];
  let prefix = "";
  for (let d = 1; d <= item.indent; d++) {
    let continues = false;
    for (let j = i + 1; j < items.length; j++) {
      if (items[j].indent < d) break;
      if (items[j].indent === d) { continues = true; break; }
    }
    if (d === item.indent) prefix += continues ? "├─ " : "└─ ";
    else prefix += continues ? "│  " : "   ";
  }
  return prefix;
}

// Spectral pipeline ramp - one hue per layer, in ribbon order.
// `tick`/`text` are tuned for the light deck; `bright` for the dark masthead
// band; `ink` is the numeral colour on a tick-filled chip.
const LAYER_HUES = {
  input:      { tick: "#C78F00", text: "#8A6D00", bright: "#FCC412", ink: "#1A2024" },
  parser:     { tick: "#E07207", text: "#AC5500", bright: "#F4871F", ink: "#1A2024" },
  ir:         { tick: "#CD3292", text: "#B0257E", bright: "#E668B5", ink: "#FFFFFF" },
  enrichment: { tick: "#8D2A90", text: "#8D2A90", bright: "#C36FC6", ink: "#FFFFFF" },
  output:     { tick: "#304D9E", text: "#304D9E", bright: "#7A93DC", ink: "#FFFFFF" },
  pipeline:   { tick: "#0F9089", text: "#0B756F", bright: "#2FD3CC", ink: "#1A2024" },
};

const RIBBON_COLORS = ["#FCC412", "#F37B0B", "#CC238C", "#B44FB7", "#7A93DC", "#08B9B1", "#34B77A"];

// Thin flowing lines, phase-shifted and amplitude-tapered at both ends -
// the brand wave drawn as code rather than pasted as an asset.
function ribbonPath(i, w = 1200, h = 32) {
  const amp = 7 + i * 0.7, freq = 1.7, phase = i * 0.62;
  const pts = [];
  for (let x = 0; x <= w; x += 16) {
    const t = x / w;
    const y = h / 2 + amp * Math.sin(t * Math.PI * 2 * freq + phase) * Math.sin(t * Math.PI);
    pts.push(`${x},${y.toFixed(1)}`);
  }
  return "M" + pts.join(" L");
}

function Ribbon({ height = 32 }) {
  return (
    <svg className="ribbon" viewBox={`0 0 1200 ${height}`} preserveAspectRatio="none" style={{ height }} aria-hidden="true">
      {RIBBON_COLORS.map((c, i) => (
        <path key={c} d={ribbonPath(i, 1200, height)} fill="none" stroke={c} strokeWidth="1.1"
          style={{ "--i": i }} />
      ))}
    </svg>
  );
}

const phaseChip = {
  "COMPLETE": "okfill",
  "IN PROGRESS": "accent",
  "PLANNED": "dim",
  "BACKLOG": "dash",
};

// segments: [{done, hue}] - per-segment colouring (the hero bar renders the
// whole pipeline in layer order, so it reads as the spectral ramp).
function Ticks({ total, done, segments, color = "var(--accent)", empty = "var(--hair)", size = 3, gap = 2, height = 9, boot = false }) {
  const segs = segments || Array.from({ length: total }, (_, i) => ({ done: i < done, hue: color }));
  return (
    <span className={`ticks ${boot ? "boot" : ""}`} style={{ gap }}>
      {segs.map((s, i) => (
        <span key={i} style={{ width: size, height, background: s.done ? s.hue : empty, "--d": i }} />
      ))}
    </span>
  );
}

// Slim proportional bar - replaces the per-phase tick strips, which read as
// noise next to the spectral hero bar. Green when the phase is complete.
function PhaseBar({ done, total }) {
  const pct = total ? Math.round(done / total * 100) : 0;
  return (
    <span className="pbar" role="img" aria-label={`${done} of ${total} complete`}>
      <span className={`pbar-fill ${done === total ? "done" : ""}`} style={{ width: `${pct}%` }} />
    </span>
  );
}

function Chip({ kind, children }) {
  return <span className={`chip ${kind || ""}`}>{children}</span>;
}

function StatusMark({ done }) {
  return done
    ? <span className="stat built">● BUILT</span>
    : <span className="stat">○ PLANNED</span>;
}

// Scroll-reveal: adds .in when the element enters the viewport. No-op under
// prefers-reduced-motion (CSS gates the initial offset, so nothing hides).
function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -40px 0px", threshold: 0 });
    el.querySelectorAll(".reveal:not(.in)").forEach(n => {
      // Only nodes below the fold wait for scroll; anything at or above the
      // viewport reveals immediately (it could otherwise never intersect).
      if (n.getBoundingClientRect().top < window.innerHeight * 0.6) n.classList.add("in");
      else io.observe(n);
    });
    return () => io.disconnect();
  });
  return ref;
}

// Count-up for the hero coverage number.
function CountUp({ value }) {
  const [n, setN] = useStateReact(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ? value : 0
  );
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setN(value); return; }
    let raf;
    const t0 = performance.now(), dur = 900;
    const step = t => {
      const p = Math.min(1, (t - t0) / dur);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{n}</>;
}

// Animated pipeline-flow infographic. Packets travel Git → the six stages →
// the shipped artifacts; clicking a stage selects that layer below.
function FlowDiagram({ activeLayer, onSelect }) {
  const stages = layers.map(l => ({
    id: l.id,
    num: l.label.split(" / ")[0],
    name: l.label.split(" / ")[1].replace(" LAYER", ""),
    hue: LAYER_HUES[l.id],
  }));
  const BOX_W = 88, BOX_H = 44, GAP = 50, X0 = 148, Y = 56;
  const stageX = i => X0 + i * (BOX_W + GAP);
  const lastRight = stageX(5) + BOX_W;
  const mainPath = `M 102 ${Y + BOX_H / 2} L ${lastRight + 4} ${Y + BOX_H / 2}`;
  const wikiPath = `M ${lastRight + 4} ${Y + BOX_H / 2} L ${lastRight + 34} ${Y - 6} L ${lastRight + 60} ${Y - 6}`;
  const docxPath = `M ${lastRight + 4} ${Y + BOX_H / 2} L ${lastRight + 34} ${Y + BOX_H + 6} L ${lastRight + 60} ${Y + BOX_H + 6}`;
  // Packets are "processed" as they travel: they leave the repo grey and take
  // on each layer's colour at the moment they emerge from its stage box. The
  // fill animation shares the motion animation's clock, with discrete colour
  // switches timed to each box's right edge along the path.
  const pathStart = 102, pathEnd = lastRight + 4;
  const fillValues = ["#93A1A8", ...stages.map(s => s.hue.tick)].join(";");
  const fillKeyTimes = ["0", ...stages.map((s, i) =>
    (((stageX(i) + BOX_W) - pathStart) / (pathEnd - pathStart)).toFixed(3)
  )].join(";");
  return (
    <div className="flow-wrap reveal">
      <svg className="flow" viewBox="0 24 1092 108" role="group"
        aria-label="Pipeline flow: solution XML from the Git repo passes through input, parser, IR, enrichment, output and pipeline layers, and ships to the ADO wiki and Word document">
        {/* spine + branches */}
        <path d={mainPath} className="flow-line" />
        <path d={wikiPath} className="flow-line" />
        <path d={docxPath} className="flow-line" />

        {/* main-path packets travel BEHIND the boxes, appearing only in the
            connector gaps; negative begins mean they are mid-path on first
            frame instead of parked at the origin */}
        {[0, 1, 2, 3, 4, 5, 6].map(k => {
          const beg = `${(-k * 18 / 7).toFixed(2)}s`;
          return (
            <circle key={`m${k}`} className="flowdot" r="3" fill="#93A1A8">
              <animateMotion dur="18s" begin={beg} repeatCount="indefinite" path={mainPath} />
              <animate attributeName="fill" dur="18s" begin={beg} repeatCount="indefinite"
                calcMode="discrete" values={fillValues} keyTimes={fillKeyTimes} />
            </circle>
          );
        })}

        {/* source node */}
        <g className="flow-node">
          <rect x="14" y={Y + 5} width="88" height="34" rx="2" />
          <text x="58" y={Y + 20} className="flow-name">GIT REPO</text>
          <text x="58" y={Y + 32} className="flow-cap">solution XML</text>
        </g>

        {/* stage boxes */}
        {stages.map((s, i) => (
          <g key={s.id} className={`flow-stage ${activeLayer === s.id ? "on" : ""}`}
            style={{ "--hue": s.hue.tick, "--hue-text": s.hue.text }}
            onClick={() => onSelect(s.id)} tabIndex={0} role="button"
            aria-label={`Select ${s.num} ${s.name} layer`} aria-pressed={activeLayer === s.id}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(s.id); } }}>
            <rect x={stageX(i)} y={Y} width={BOX_W} height={BOX_H} rx="2" />
            <text x={stageX(i) + BOX_W / 2} y={Y + 18} className="flow-num">{s.num}</text>
            <text x={stageX(i) + BOX_W / 2} y={Y + 33} className="flow-name">{s.name}</text>
          </g>
        ))}

        {/* artifact nodes */}
        <g className="flow-node out">
          <rect x={lastRight + 60} y={Y - 24} width="96" height="34" rx="2" />
          <text x={lastRight + 108} y={Y - 9} className="flow-name">ADO WIKI</text>
          <text x={lastRight + 108} y={Y + 3} className="flow-cap">markdown</text>
        </g>
        <g className="flow-node out">
          <rect x={lastRight + 60} y={Y + BOX_H - 10} width="96" height="34" rx="2" />
          <text x={lastRight + 108} y={Y + BOX_H + 5} className="flow-name">WORD .DOCX</text>
          <text x={lastRight + 108} y={Y + BOX_H + 17} className="flow-cap">themed + diagrams</text>
        </g>

        {/* branch packets carry the final stage's colour: fully processed,
            on their way to the shipped artifacts */}
        <circle className="flowdot" r="3" fill="#0F9089">
          <animateMotion dur="2.4s" begin="-0.7s" repeatCount="indefinite" path={wikiPath} />
        </circle>
        <circle className="flowdot" r="3" fill="#0F9089">
          <animateMotion dur="2.4s" begin="-1.9s" repeatCount="indefinite" path={docxPath} />
        </circle>
      </svg>
    </div>
  );
}

const css = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');

:root {
  --ground: #F2F5F6;
  --bg: #FFFFFF;
  --surface: #FFFFFF;
  --ink: #232E35;
  --soft: #4C5B63;
  --faint-text: #64737B;
  --faint: #93A1A8;
  --hair: #D2DADD;
  --hair2: #E2E8EA;
  --accent: #CD3292;
  --accent-text: #B0257E;
  --ok: #197B4B;
  --m-should: #5246B8;
  --m-could: #0A7DA0;
  --band: #232B30;
  --band-surface: #2B353B;
  --band-ink: #EDF1F2;
  --band-soft: #B9C3C7;
  --band-faint: #93A0A6;
  --band-hair: #3D484E;
  --disp: 'Space Grotesk', 'Inter', system-ui, sans-serif;
  --sans: 'Inter', system-ui, -apple-system, sans-serif;
  --mono: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html { color-scheme: light; }
body { background: #F2F5F6; }

.pad-root { min-height: 100vh; background: var(--ground); color: var(--ink); font-family: var(--sans); -webkit-font-smoothing: antialiased; }
.pad-shell { max-width: 1260px; margin: 0 auto; padding: 0 48px; position: relative; }

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--hair); border-radius: 0; }

:where(.pad-root) a { color: inherit; text-decoration: none; }
:where(.pad-root button) { font: inherit; color: inherit; background: none; border: none; cursor: pointer; border-radius: 0; padding: 0; }
.pad-root button:focus-visible, .pad-root a:focus-visible, .pad-root [tabindex]:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* ---- masthead band (brand dark-slide language: grid, glow, ribbon) ---- */
.mast-band {
  position: relative;
  background: var(--band);
  background-image:
    radial-gradient(720px 340px at 82% -10%, rgba(205,50,146,0.20), transparent 70%),
    radial-gradient(560px 300px at 8% 78%, rgba(141,42,144,0.16), transparent 70%),
    linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
  background-size: auto, auto, 32px 32px, 32px 32px;
  color: var(--band-ink);
}
.masthead { padding: 34px 0 0; }
.eyebrow-row { display: flex; align-items: baseline; gap: 14px; margin-bottom: 26px; }
.brand { font: 600 11px/1 var(--mono); letter-spacing: 0.22em; color: var(--band-ink); }
.brand::before { content: '■ '; color: var(--accent); }
.eyebrow-sub { font: 400 10px/1.5 var(--mono); letter-spacing: 0.18em; color: var(--band-faint); }
.mast-links { margin-left: auto; display: flex; gap: 22px; }
.mast-links a { font: 500 10px/1 var(--mono); letter-spacing: 0.1em; color: var(--band-soft); border-bottom: 1px solid transparent; padding-bottom: 2px; white-space: nowrap; }
.mast-links a:hover { color: #fff; border-bottom-color: var(--accent); }

.mast-grid { display: grid; grid-template-columns: 1fr 300px; gap: 48px; align-items: start; }
.mast-title { font-family: var(--disp); font-weight: 600; font-size: 44px; line-height: 1.06; letter-spacing: -0.02em; margin: 0 0 18px; max-width: 640px; color: #fff; }
.mast-title em {
  font-style: normal;
  background: linear-gradient(100deg, #FCC412, #F37B0B 28%, #E668B5 55%, #C36FC6 80%, #38D6CF);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.mast-desc { font-size: 13px; line-height: 1.75; color: var(--band-soft); max-width: 620px; }
.mast-desc strong { color: var(--band-ink); }

.tblock { border: 1px solid rgba(255,255,255,0.28); background: rgba(43,53,59,0.72); backdrop-filter: blur(2px); }
.tblock-row { display: grid; grid-template-columns: 96px 1fr; border-top: 1px solid var(--band-hair); }
.tblock-row:first-child { border-top: none; }
.tblock-k { font: 500 9px/1 var(--mono); letter-spacing: 0.16em; color: var(--band-faint); padding: 10px 12px 9px; border-right: 1px solid var(--band-hair); }
.tblock-v { font: 500 10px/1.4 var(--mono); letter-spacing: 0.04em; color: var(--band-ink); padding: 8px 12px 7px; }
.tblock-v a { border-bottom: 1px solid var(--band-hair); }
.tblock-v a:hover { color: #fff; border-bottom-color: var(--accent); }

.progress-row { display: flex; align-items: center; gap: 18px; margin: 30px 0 0; flex-wrap: wrap; }
.progress-count { font: 500 11px/1 var(--mono); letter-spacing: 0.06em; color: var(--band-soft); }
.progress-count strong { color: #fff; font-weight: 700; }
.progress-phase { font: 400 10px/1.5 var(--mono); letter-spacing: 0.08em; color: var(--band-faint); }

.ribbon { display: block; width: 100%; margin-top: 26px; -webkit-mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent); mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent); }

.tab-row { display: flex; gap: 34px; border-top: 1px solid rgba(255,255,255,0.25); }
.tab { font: 500 10.5px/1 var(--mono); letter-spacing: 0.14em; color: var(--band-faint); padding: 15px 0 13px; border-bottom: 2px solid transparent; text-transform: uppercase; transition: color 0.15s; white-space: nowrap; }
.tab:hover { color: #fff; }
.tab.active { color: #fff; border-bottom-color: var(--accent); }
.tab .tnum { color: var(--band-faint); margin-right: 7px; }
.tab.active .tnum { color: var(--accent); }

/* ---- deck (light) ---- */
.deck { padding: 40px 0 72px; }
.deck-band { position: relative; }
.deck-band::before {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background-image:
    linear-gradient(rgba(35,46,53,0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(35,46,53,0.05) 1px, transparent 1px);
  background-size: 32px 32px;
  -webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,0.9), rgba(0,0,0,0.35) 55%, transparent 92%);
  mask-image: linear-gradient(180deg, rgba(0,0,0,0.9), rgba(0,0,0,0.35) 55%, transparent 92%);
}
.deck-band > * { position: relative; }
.sec-label { font: 500 9px/1 var(--mono); letter-spacing: 0.2em; color: var(--soft); text-transform: uppercase; margin-bottom: 18px; }

.card { background: var(--surface); border: 1px solid var(--hair); box-shadow: 0 1px 3px rgba(20,30,35,0.05); }

/* ---- shared atoms ---- */
.label { font: 500 9px/1 var(--mono); letter-spacing: 0.18em; color: var(--soft); text-transform: uppercase; }
.chip { display: inline-block; font: 500 9px/1 var(--mono); letter-spacing: 0.1em; padding: 3px 6px 2px; border: 1px solid var(--soft); color: var(--ink); white-space: nowrap; }
.chip.fill { background: var(--accent-text); border-color: var(--accent-text); color: #fff; }
.chip.okfill { background: var(--ok); border-color: var(--ok); color: #fff; }
.chip.blue { background: #E5E3F7; border-color: var(--m-should); color: var(--m-should); }
.chip.teal { background: transparent; border-color: var(--m-could); color: var(--m-could); }
.chip.grey { border-style: dashed; border-color: var(--faint); color: var(--faint-text); }
.chip.mid { border-color: var(--faint); color: var(--soft); }
.chip.dim { border-color: var(--faint); color: var(--faint-text); }
.chip.dash { border-style: dashed; border-color: var(--faint); color: var(--faint-text); }
.chip.accent { border-color: var(--accent); color: var(--accent-text); }
.stat { font: 500 9px/1 var(--mono); letter-spacing: 0.12em; color: var(--faint-text); white-space: nowrap; }
.stat.built { color: var(--ok); background: #DFF2E7; border: 1px solid #B7E0C9; padding: 3px 7px 2px; }
.ticks { display: inline-flex; align-items: center; flex-wrap: wrap; row-gap: 2px; max-width: 100%; min-width: 0; }
.hero-ticks { display: inline-flex; align-items: center; gap: 9px; flex-wrap: wrap; row-gap: 4px; max-width: 100%; min-width: 0; }
.hero-group { position: relative; display: inline-flex; cursor: pointer; }
.hero-group:hover .ticks span, .hero-group:focus-visible .ticks span { filter: brightness(1.3); }
.hero-group::after {
  content: attr(data-tip); position: absolute; bottom: calc(100% + 8px); left: 50%;
  transform: translateX(-50%) translateY(3px);
  background: #10151A; color: var(--band-ink); border: 1px solid var(--band-hair);
  font: 500 9.5px/1.4 var(--mono); letter-spacing: 0.08em; padding: 6px 9px;
  white-space: nowrap; opacity: 0; pointer-events: none;
  transition: opacity 0.15s, transform 0.15s; z-index: 5;
}
.hero-group:hover::after, .hero-group:focus-visible::after { opacity: 1; transform: translateX(-50%) translateY(0); }
.hero-ticks .hero-group:first-child::after { left: 0; transform: translateY(3px); }
.hero-ticks .hero-group:first-child:hover::after, .hero-ticks .hero-group:first-child:focus-visible::after { transform: translateY(0); }
.tag-line { font: 400 10px/1.8 var(--mono); color: var(--faint-text); letter-spacing: 0.02em; }

.pbar { display: inline-block; width: 110px; height: 4px; background: var(--hair2); overflow: hidden; }
.pbar-fill { display: block; height: 100%; background: #C78F00; transition: width 0.6s cubic-bezier(0.2, 0.7, 0.3, 1); }
.pbar-fill.done { background: var(--ok); }

/* ---- pipeline flow infographic ---- */
.flow-wrap { overflow-x: auto; margin-bottom: 30px; background: var(--surface); border: 1px solid var(--hair); padding: 8px 14px; box-shadow: 0 1px 3px rgba(20,30,35,0.05); }
/* Scroll takeover: the flow card is scrubbed directly by page scroll.
   At the top of the page it sits slightly small, dim and flat; over the
   first ~420px of scrolling it expands to full size, brightens and lifts
   onto an elevated shadow, then holds. Scrolling back up reverses it.
   Chrome/Edge (and Safari 26+) only; other browsers keep the reveal fade. */
@supports (animation-timeline: scroll()) {
  @media (prefers-reduced-motion: no-preference) {
    .flow-wrap.reveal { opacity: 1; transform: none; transition: none; }
    .flow-wrap {
      animation: takeover linear both;
      animation-timeline: scroll(root block);
      animation-range: 0px 420px;
      transform-origin: 50% 0;
    }
    @keyframes takeover {
      from { transform: scale(0.94); opacity: 0.55; box-shadow: 0 1px 3px rgba(20,30,35,0.05); }
      to { transform: scale(1); opacity: 1; box-shadow: 0 18px 44px rgba(20,30,35,0.14); }
    }
    /* Cards further down each tab rise into place as they enter the
       scrollport, so the whole page answers to scrolling, not just the top. */
    .deck .card.reveal { opacity: 1; transform: none; transition: none; }
    .deck .card {
      animation: card-rise linear both;
      animation-timeline: view();
      animation-range: entry 0% entry 65%;
    }
    @keyframes card-rise {
      from { transform: translateY(18px) scale(0.985); opacity: 0.55; }
      to { transform: none; opacity: 1; }
    }
  }
}
.flow { display: block; width: 100%; min-width: 1080px; height: auto; }
.flow-line { fill: none; stroke: var(--faint); stroke-width: 1; }
.flow-node rect { fill: var(--surface); stroke: var(--soft); stroke-width: 1; }
.flow-node .flow-name { font: 600 10px var(--mono); letter-spacing: 0.08em; fill: var(--ink); text-anchor: middle; }
.flow-node .flow-cap { font: 400 8.5px var(--mono); letter-spacing: 0.04em; fill: var(--faint-text); text-anchor: middle; }
.flow-stage { cursor: pointer; }
.flow-stage rect { fill: var(--surface); stroke: var(--hue); stroke-width: 1.2; transition: fill 0.15s; }
.flow-stage .flow-num { font: 700 10px var(--mono); fill: var(--hue-text); text-anchor: middle; letter-spacing: 0.08em; }
.flow-stage .flow-name { font: 600 10px var(--mono); fill: var(--ink); text-anchor: middle; letter-spacing: 0.06em; }
.flow-stage:hover rect { fill: color-mix(in srgb, var(--hue) 8%, white); }
.flow-stage.on rect { fill: color-mix(in srgb, var(--hue) 14%, white); stroke-width: 2; }
.flow-stage:focus-visible { outline: none; }
.flow-stage:focus-visible rect { stroke: var(--accent); stroke-width: 2.5; }

/* ---- architecture tab ---- */
.filter-row { display: flex; align-items: center; gap: 8px; margin-bottom: 28px; flex-wrap: wrap; }
.filter-label { font: 500 9px/1 var(--mono); letter-spacing: 0.18em; color: var(--soft); margin-right: 6px; }
.fbtn { font: 500 9.5px/1 var(--mono); letter-spacing: 0.12em; padding: 7px 12px 6px; border: 1px solid var(--faint); color: var(--soft); background: var(--surface); transition: all 0.12s; white-space: nowrap; }
.fbtn:hover { border-color: var(--ink); color: var(--ink); }
.fbtn.active { background: var(--ink); border-color: var(--ink); color: #fff; }
.fbtn.f-m.active { background: var(--accent-text); border-color: var(--accent-text); }
.fbtn.f-s.active { background: var(--m-should); border-color: var(--m-should); }
.fbtn.f-c.active { background: var(--m-could); border-color: var(--m-could); }
.fbtn.f-w.active { background: var(--ink); border-style: dashed; border-color: var(--faint); }
.filter-key .k-m { color: var(--accent-text); font-weight: 600; }
.filter-key .k-s { color: var(--m-should); font-weight: 600; }
.filter-key .k-c { color: var(--m-could); font-weight: 600; }
.filter-key { font: 400 10px/1.5 var(--mono); color: var(--faint-text); margin-left: 10px; letter-spacing: 0.02em; }

.arch-grid { display: grid; grid-template-columns: 330px 1fr; gap: 36px; align-items: start; }

.rail { position: sticky; top: 28px; }
.lbtn { display: grid; grid-template-columns: 32px 1fr; gap: 16px; width: 100%; text-align: left; padding: 0; margin-bottom: 22px; position: relative; }
.lbtn:last-child { margin-bottom: 0; }
.lbtn:not(:last-child)::after { content: ''; position: absolute; left: 15px; top: 36px; bottom: -18px; width: 1px; background: var(--hair); }
.lnum { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font: 600 11px/1 var(--mono); border: 1px solid var(--hair); background: var(--surface); color: var(--soft); transition: all 0.15s; }
.lbtn:hover .lnum { border-color: var(--hue, var(--ink)); color: var(--ink); }
.lbtn.active .lnum { background: var(--hue, var(--accent)); border-color: var(--hue, var(--accent)); color: var(--hue-ink, #fff); font-weight: 700; }
.lbody { padding-top: 2px; }
.lname-row { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; }
.lname { font: 600 11px/1 var(--mono); letter-spacing: 0.12em; color: var(--ink); transition: color 0.15s; }
.lbtn:hover .lname, .lbtn.active .lname { color: var(--hue-text, var(--accent-text)); }
.lcount { font: 400 9.5px/1 var(--mono); color: var(--faint-text); margin-left: auto; letter-spacing: 0.04em; }
.ldesc { font-size: 11.5px; line-height: 1.55; color: var(--soft); margin-bottom: 8px; }

.panel { padding: 28px 32px 20px; min-height: 320px; }
.panel-head { border-bottom: 1px solid var(--ink); padding-bottom: 18px; }
.panel-label { font: 500 9.5px/1 var(--mono); letter-spacing: 0.18em; color: var(--hue-text, var(--accent-text)); margin-bottom: 10px; }
.panel-desc { font-family: var(--disp); font-weight: 500; font-size: 20px; line-height: 1.35; color: var(--ink); letter-spacing: -0.01em; }
.panel-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 160px; gap: 14px; }
.panel-empty .hint { font-family: var(--disp); font-weight: 500; font-size: 18px; color: var(--faint-text); }

.rows { animation: rise 0.3s cubic-bezier(0.2, 0.7, 0.3, 1); }
@keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.crow { display: grid; grid-template-columns: 44px 1fr; gap: 0 14px; padding: 15px 0 14px 12px; border-top: 1px solid var(--hair2); border-left: 3px solid var(--ok); transition: background 0.15s; }
.crow:first-child { border-top: none; }
.crow.planned { border-left: 3px dashed var(--hair); background: repeating-linear-gradient(-45deg, transparent 0 9px, rgba(35,46,53,0.022) 9px 10px); }
.crow:hover { background: color-mix(in srgb, var(--hue, var(--accent)) 3%, transparent); }
.cidx { font: 500 10px/1 var(--mono); color: var(--faint-text); padding-top: 3px; letter-spacing: 0.04em; }
.crow:hover .cidx { color: var(--hue-text, var(--accent-text)); }
.cname-row { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; align-items: start; }
.cname-group { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cname { font-size: 13px; font-weight: 600; color: var(--ink); }
.crow.planned .cname { color: var(--soft); }
.cname-row .stat { padding-top: 3px; }
.cdetail { font-size: 12px; line-height: 1.65; color: var(--soft); margin-top: 5px; max-width: 780px; }
.crow.planned .cdetail { color: var(--faint-text); }

/* ---- progress tab ---- */
.phase-block { margin-bottom: 16px; }
.phase-head { display: flex; align-items: center; gap: 14px; padding: 16px 22px 14px; border-bottom: 1px solid var(--hair2); flex-wrap: wrap; }
.phase-num { font: 600 10px/1 var(--mono); letter-spacing: 0.14em; color: var(--accent-text); }
.phase-name { font-family: var(--disp); font-weight: 500; font-size: 18px; color: var(--ink); letter-spacing: -0.01em; }
.phase-meta { margin-left: auto; display: flex; align-items: center; gap: 14px; }
.phase-count { font: 500 10px/1 var(--mono); color: var(--soft); letter-spacing: 0.04em; }
.phase-items { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 32px; padding: 16px 22px 18px; }
.pitem { display: flex; align-items: baseline; gap: 9px; font-size: 12px; line-height: 1.9; }
.pitem .pmark { font: 400 9px/1 var(--mono); color: var(--ok); flex-shrink: 0; position: relative; top: -1px; }
.pitem.todo .pmark { color: var(--faint); }
.pitem .ptext { color: var(--ink); }
.pitem.todo .ptext { color: var(--faint-text); }

.note-block { border-top: 1px solid var(--ink); padding: 18px 0; margin-top: 28px; }
.note-label { font: 600 9px/1 var(--mono); letter-spacing: 0.2em; color: var(--accent-text); margin-bottom: 10px; }
.note-body { font-size: 12.5px; line-height: 1.75; color: var(--soft); max-width: 64ch; }
.note-body strong { color: var(--ink); font-weight: 600; }

/* ---- wiki tab ---- */
.tree-card { padding: 24px 40px 24px 28px; margin-bottom: 36px; overflow-x: auto; width: fit-content; min-width: min(620px, 100%); max-width: 100%; }
.tree-intro { font-size: 12.5px; line-height: 1.7; color: var(--soft); max-width: 56ch; margin-bottom: 6px; }
.tree-legend { font: 400 9.5px/1.5 var(--mono); letter-spacing: 0.1em; color: var(--faint-text); margin-bottom: 14px; }
.tree-legend .b { color: var(--ok); }
.tree-legend .p { color: var(--faint); }
.tree { font: 400 12px/1.6 var(--mono); white-space: pre; }
.tree .guide { color: var(--hair); }
.tree .tname { color: var(--ink); }
.tree .tname.folder { font-weight: 600; }
.tree .planned-row .tname { color: var(--faint-text); font-weight: 400; }
.tree .tmark { color: var(--ok); }
.tree .planned-row .tmark { color: var(--faint); }
.tree .tnote { font: italic 400 11px/1 var(--mono); color: var(--faint-text); }

.pages-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 40px; }
.pg-row { padding: 13px 0 12px 12px; border-top: 1px solid var(--hair2); border-left: 3px solid var(--ok); }
.pg-row.planned { border-left: 3px dashed var(--hair); background: repeating-linear-gradient(-45deg, transparent 0 9px, rgba(35,46,53,0.022) 9px 10px); }
.pg-name-row { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; align-items: start; margin-bottom: 4px; }
.pg-name { font-size: 12.5px; font-weight: 600; color: var(--ink); }
.pg-row.planned .pg-name { color: var(--soft); }
.pg-name-row .stat { padding-top: 2px; }
.pg-desc { font-size: 11.5px; line-height: 1.6; color: var(--soft); }
.pg-row.planned .pg-desc { color: var(--faint-text); }

/* ---- decisions tab ---- */
.dec-head { display: grid; grid-template-columns: 52px 200px 220px 1fr; gap: 18px; padding: 12px 22px; border-bottom: 1px solid var(--ink); }
.dec-head .label { color: var(--faint-text); }
.dec-row { display: grid; grid-template-columns: 52px 200px 220px 1fr; gap: 18px; padding: 14px 22px 13px; border-bottom: 1px solid var(--hair2); }
.dec-row:last-child { border-bottom: none; }
.dec-idx { font: 500 10px/1.6 var(--mono); color: var(--faint-text); letter-spacing: 0.04em; }
.dec-q { font-size: 12px; font-weight: 600; color: var(--ink); line-height: 1.6; }
.dec-a { font: 500 11px/1.6 var(--mono); color: var(--ink); letter-spacing: 0.01em; }
.dec-r { font-size: 12px; line-height: 1.6; color: var(--soft); max-width: 68ch; }

/* ---- footer ---- */
.colophon { display: flex; align-items: baseline; gap: 14px; margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--hair); flex-wrap: wrap; }
.colophon .label { color: var(--faint-text); }
.colophon .right { margin-left: auto; font: 400 9.5px/1.5 var(--mono); letter-spacing: 0.1em; color: var(--faint-text); }

/* ---- motion (all gated) ---- */
@media (prefers-reduced-motion: no-preference) {
  .reveal { opacity: 0; transform: translateY(14px); transition: opacity 0.55s ease, transform 0.55s cubic-bezier(0.2, 0.7, 0.3, 1); transition-delay: var(--rd, 0ms); }
  .reveal.in { opacity: 1; transform: none; }
  .ticks.boot span { transform-origin: bottom; animation: tickin 0.35s both; animation-delay: calc(var(--d) * 5ms); }
  @keyframes tickin { from { transform: scaleY(0); } }
  .ribbon path { stroke-dasharray: 1300; stroke-dashoffset: 1300; animation: ribdraw 1.5s ease-out forwards; animation-delay: calc(var(--i) * 110ms); }
  @keyframes ribdraw { to { stroke-dashoffset: 0; } }
}
@media (prefers-reduced-motion: reduce) {
  .flowdot { display: none; }
  .rows { animation: none; }
  .pbar-fill { transition: none; }
}

@media (max-width: 980px) {
  .pad-shell { padding: 0 22px; }
  .eyebrow-row { flex-wrap: wrap; row-gap: 10px; }
  .mast-links { margin-left: 0; flex-basis: 100%; }
  .mast-grid { grid-template-columns: 1fr; gap: 26px; }
  .mast-title { font-size: 34px; }
  .progress-row .hero-ticks { flex: 1 1 100%; }
  .arch-grid { grid-template-columns: 1fr; }
  .rail { position: static; }
  .phase-items { grid-template-columns: 1fr; }
  .pages-grid { grid-template-columns: 1fr; }
  .dec-head { display: none; }
  .dec-row { grid-template-columns: 52px 1fr; grid-template-rows: auto auto auto; }
  .dec-a { grid-column: 2; }
  .dec-r { grid-column: 2; }
  .tab-row { flex-wrap: wrap; gap: 8px 20px; }
}
`;

export default function App() {
  const [activeLayer, setActiveLayer] = useState("input");
  const [activeTab, setActiveTab] = useState("architecture");
  const [moscowFilter, setMoscowFilter] = useState(null);
  const revealRoot = useReveal();

  const active = layers.find(l => l.id === activeLayer);
  const totalComponents = layers.flatMap(l => l.components).length;
  const doneComponents = layers.flatMap(l => l.components).filter(c => c.done).length;
  const pct = Math.round(doneComponents / totalComponents * 100);

  const filteredComponents = active
    ? (moscowFilter ? active.components.filter(c => c.moscow === moscowFilter) : active.components)
    : [];

  const layerNum = label => label.split(" / ")[0];
  const layerName = label => label.split(" / ")[1];

  // Hero bar: one mini progress bar per layer, in pipeline order. Within each
  // group the built ticks run first, so every band reads as a solid coloured
  // run with a dim remainder rather than scattered gaps. Bright variants on
  // the dark band.
  const heroGroups = layers.map(l => ({
    id: l.id,
    num: layerNum(l.label),
    name: layerName(l.label),
    total: l.components.length,
    done: l.components.filter(c => c.done).length,
    hue: LAYER_HUES[l.id].bright,
  }));

  // Hero bar click-through: open the layer in the architecture tab and bring
  // the pipeline index into view.
  const goToLayer = id => {
    setActiveTab("architecture");
    setActiveLayer(id);
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => {
      document.querySelector(".arch-grid")?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    }, 60);
  };

  return (
    <div className="pad-root" ref={revealRoot}>
      <style>{css}</style>

      <div className="mast-band">
        <div className="pad-shell">
          <header className="masthead">
            <div className="eyebrow-row">
              <span className="brand">POWERAUTODOCS</span>
              <span className="eyebrow-sub">SYSTEM ARCHITECTURE</span>
              <nav className="mast-links">
                <a href="https://www.npmjs.com/package/powerautodocs">npm ↗</a>
                <a href="https://github.com/lewginn/PowerAutoDocs">GitHub ↗</a>
                <a href="https://github.com/users/lewginn/projects/3">Project board ↗</a>
              </nav>
            </div>

            <div className="mast-grid">
              <div>
                <h1 className="mast-title">Automated <em>as-built</em> documentation for Power Platform</h1>
                <p className="mast-desc">
                  A reusable pipeline that reads Power Platform solution artifacts directly from Git and produces
                  structured, cross-linked wiki documentation in Azure DevOps, including Mermaid flow diagrams,
                  nested action trees, business rules, plugin registrations, web resource indexes, security role
                  matrices, environment variables, global choices, email templates, model-driven apps and
                  auto-generated ER diagrams. Published as <strong>powerautodocs</strong> on npm.
                </p>
              </div>
              <aside className="tblock">
                <div className="tblock-row">
                  <span className="tblock-k">PACKAGE</span>
                  <span className="tblock-v"><a href="https://www.npmjs.com/package/powerautodocs">powerautodocs</a></span>
                </div>
                <div className="tblock-row">
                  <span className="tblock-k">PIPELINE</span>
                  <span className="tblock-v">
                    {layers.map((l, i) => (
                      <span key={l.id}>
                        <span style={{ color: LAYER_HUES[l.id].bright }}>{layerName(l.label).replace(" LAYER", "")}</span>
                        {i < layers.length - 1 ? " → " : ""}
                      </span>
                    ))}
                  </span>
                </div>
                <div className="tblock-row">
                  <span className="tblock-k">STATUS</span>
                  <span className="tblock-v">PHASES 1-4 COMPLETE</span>
                </div>
                <div className="tblock-row">
                  <span className="tblock-k">COVERAGE</span>
                  <span className="tblock-v"><CountUp value={doneComponents} /> / {totalComponents} COMPONENTS · {pct}%</span>
                </div>
              </aside>
            </div>

            <div className="progress-row">
              <span className="hero-ticks">
                {heroGroups.map(g => (
                  <button key={g.id} className="hero-group"
                    data-tip={`${g.num} ${g.name} · ${g.done}/${g.total} BUILT · CLICK TO VIEW`}
                    aria-label={`${g.name}: ${g.done} of ${g.total} components built. View this layer.`}
                    onClick={() => goToLayer(g.id)}>
                    <Ticks total={g.total} done={g.done} color={g.hue} empty="#4A565D" boot />
                  </button>
                ))}
              </span>
              <span className="progress-count"><strong><CountUp value={doneComponents} /></strong> of {totalComponents} components built</span>
              <span className="progress-phase">PHASES 1-4 COMPLETE · PHASE 5, PHASE 6 &amp; BACKLOG PLANNED</span>
            </div>

            <Ribbon />

            <div className="tab-row">
              {["architecture", "progress", "wiki structure", "decisions"].map((tab, i) => (
                <button key={tab} className={`tab ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
                  <span className="tnum">{String(i + 1).padStart(2, "0")}</span>{tab}
                </button>
              ))}
            </div>
          </header>
        </div>
      </div>

      <div className="deck-band">
      <div className="pad-shell">
        <main className="deck">

          {activeTab === "architecture" && (
            <div>
              <div className="sec-label">Pipeline flow · click a stage to inspect it</div>
              <FlowDiagram activeLayer={activeLayer} onSelect={id => setActiveLayer(id)} />

              <div className="filter-row">
                <span className="filter-label">FILTER · PRIORITY</span>
                <button className={`fbtn ${moscowFilter === null ? "active" : ""}`} onClick={() => setMoscowFilter(null)}>ALL</button>
                {Object.entries(moscow).map(([key, val]) => (
                  <button key={key} className={`fbtn f-${key.toLowerCase()} ${moscowFilter === key ? "active" : ""}`}
                    onClick={() => setMoscowFilter(moscowFilter === key ? null : key)}>{val.label}</button>
                ))}
                <span className="filter-key">MoSCoW: <span className="k-m">must</span> · <span className="k-s">should</span> · <span className="k-c">could</span> · won't (for now)</span>
              </div>

              <div className="arch-grid">
                <div className="rail">
                  {layers.map((layer) => {
                    const dc = layer.components.filter(c => c.done).length;
                    const tot = layer.components.length;
                    const visibleCount = moscowFilter ? layer.components.filter(c => c.moscow === moscowFilter).length : tot;
                    const hue = LAYER_HUES[layer.id];
                    return (
                      <button key={layer.id} className={`lbtn ${activeLayer === layer.id ? "active" : ""}`}
                        style={{ "--hue": hue.tick, "--hue-text": hue.text, "--hue-ink": hue.ink }}
                        onClick={() => setActiveLayer(activeLayer === layer.id ? null : layer.id)}>
                        <span className="lnum">{layerNum(layer.label)}</span>
                        <span className="lbody">
                          <span className="lname-row">
                            <span className="lname">{layerName(layer.label)}</span>
                            <span className="lcount">{dc}/{tot} built{moscowFilter && visibleCount !== tot ? ` · ${visibleCount} shown` : ""}</span>
                          </span>
                          <span className="ldesc" style={{ display: "block" }}>{layer.description}</span>
                          <Ticks total={tot} done={dc} color={hue.tick} size={4} height={7} />
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="panel card">
                  {!active && (
                    <div className="panel-empty" style={{ minHeight: 320 }}>
                      <span className="hint">Select a layer from the pipeline index.</span>
                    </div>
                  )}
                  {active && (
                    <div className="rows" key={active.id + (moscowFilter || "")}
                      style={{ "--hue": LAYER_HUES[active.id].tick, "--hue-text": LAYER_HUES[active.id].text }}>
                      <div className="panel-head">
                        <div className="panel-label">
                          {active.label} · {filteredComponents.length} COMPONENT{filteredComponents.length !== 1 ? "S" : ""}
                          {moscowFilter ? ` · ${moscow[moscowFilter].label} ONLY` : ""}
                        </div>
                        <div className="panel-desc">{active.description}</div>
                      </div>
                      {filteredComponents.length === 0 && (
                        <div className="panel-empty" style={{ minHeight: 160 }}>
                          <span className="hint">No {moscow[moscowFilter]?.label} components in this layer.</span>
                        </div>
                      )}
                      {filteredComponents.map((comp, i) => {
                        const m = moscow[comp.moscow];
                        return (
                          <div key={comp.name} className={`crow ${comp.done ? "" : "planned"}`}>
                            <span className="cidx">{layerNum(active.label)}·{String(i + 1).padStart(2, "0")}</span>
                            <div>
                              <div className="cname-row">
                                <span className="cname-group">
                                  <span className="cname">{comp.name}</span>
                                  <Chip kind={m.cls}>{m.label}</Chip>
                                </span>
                                <StatusMark done={comp.done} />
                              </div>
                              <div className="cdetail">{comp.detail}</div>
                              <div className="tag-line">{comp.tags.map(t => `[${t}]`).join("  ")}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "progress" && (
            <div style={{ maxWidth: 1000 }}>
              <div className="sec-label">Build progress</div>
              {progress.map((p, pi) => {
                const dc = p.items.filter(i => i.done).length;
                const tot = p.items.length;
                const [pnum, pname] = p.phase.split(" / ");
                return (
                  <div key={p.phase} className="phase-block card reveal" style={{ "--rd": `${Math.min(pi, 3) * 60}ms` }}>
                    <div className="phase-head">
                      <span className="phase-num">{pnum.toUpperCase()}</span>
                      <span className="phase-name">{pname}</span>
                      <span className="phase-meta">
                        <PhaseBar done={dc} total={tot} />
                        <span className="phase-count">{dc}/{tot}</span>
                        <Chip kind={phaseChip[p.status] || "dim"}>{p.status}</Chip>
                      </span>
                    </div>
                    <div className="phase-items">
                      {p.items.map(item => (
                        <div key={item.label} className={`pitem ${item.done ? "" : "todo"}`}>
                          <span className="pmark">{item.done ? "■" : "□"}</span>
                          <span className="ptext">{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div className="note-block reveal">
                <div className="note-label">NOTE · CURRENT STATE</div>
                <div className="note-body">
                  <strong>Phases 1-4 are complete and producing real output on live client solutions.</strong> The full pipeline
                  - data model, flows, classic workflows, business rules, plugins, web resources, security roles,
                  environment variables, global choices, email templates, model-driven apps and ER diagrams - publishes end-to-end via ADO pipeline.
                  AI enrichment and Word (.docx) output are both shipped and current. PDF output also shipped, but is planned for deprecation
                  (Lewis, 2026-07-17) - see the "PDF output - deprecation planned?" decision on the Decisions tab.
                  Phase 5 adds Dataverse governance/admin-configuration components (BPF, column security, routing rules, SLAs,
                  masking rules, settings); Phase 6 adds automation, Copilot and integration surfaces (scheduled flow metadata,
                  Copilot Studio agents, virtual tables, custom connectors, plugin source linking, service endpoints).
                </div>
              </div>
            </div>
          )}

          {activeTab === "wiki structure" && (
            <div style={{ maxWidth: 1000 }}>
              <div className="sec-label">ADO wiki page hierarchy</div>
              <div className="tree-card card reveal">
                <p className="tree-intro">
                  Each solution gets its own top-level wiki section. Pages are generated from the IR layer and published via ADO REST API.
                </p>
                <div className="tree-legend"><span className="b">●</span> BUILT &nbsp;·&nbsp; <span className="p">○</span> PLANNED</div>
                <div className="tree">
                  {wikiTree.map((item, i) => (
                    <div key={i} className={item.done ? "" : "planned-row"}>
                      <span className="guide">{treePrefix(wikiTree, i)}</span>
                      <span className="tmark">{item.done ? "● " : "○ "}</span>
                      <span className={`tname ${item.kind === "folder" ? "folder" : ""}`}>{item.name}</span>
                      {item.note && <span className="tnote">{"  "}- {item.note}</span>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="sec-label">Pages built so far</div>
              <div className="pages-grid">
                {pages.map(page => {
                  const m = moscow[page.moscow];
                  return (
                    <div key={page.name} className={`pg-row ${page.done ? "" : "planned"}`}>
                      <div className="pg-name-row">
                        <span className="cname-group">
                          <span className="pg-name">{page.name}</span>
                          <Chip kind={m.cls}>{m.label}</Chip>
                        </span>
                        <StatusMark done={page.done} />
                      </div>
                      <div className="pg-desc">{page.desc}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "decisions" && (
            <div>
              <div className="sec-label">Key architectural decisions, confirmed in build</div>
              <div className="dec-card card reveal">
                <div className="dec-head">
                  <span className="label">No.</span>
                  <span className="label">Decision</span>
                  <span className="label">Choice</span>
                  <span className="label">Rationale</span>
                </div>
                {decisions.map((d, i) => (
                  <div key={d.q} className="dec-row">
                    <span className="dec-idx">D{String(i + 1).padStart(2, "0")}</span>
                    <span className="dec-q">{d.q}</span>
                    <span className="dec-a">{d.a}</span>
                    <span className="dec-r">{d.reason}</span>
                  </div>
                ))}
              </div>
              <div className="note-block reveal">
                <div className="note-label">NOTE · THE CONTRACT</div>
                <div className="note-body">
                  <strong>IR is the contract.</strong> Parsers only produce IR. Renderers only consume IR.
                  Neither knows about the other. Renderers emit DocNode[] (format-agnostic); MarkdownSerializer converts to ADO Wiki markdown,
                  DocxSerializer converts to Word (.docx) via the docx library. New output formats only need a new serializer.
                </div>
              </div>
            </div>
          )}

        </main>

        <footer className="colophon" style={{ marginTop: 0, paddingBottom: 40 }}>
          <span className="label">POWERAUTODOCS · SYSTEM ARCHITECTURE</span>
          <span className="right">MAINTAINED IN docs/architecture.jsx · DEPLOYED VIA GITHUB PAGES</span>
        </footer>
      </div>
      </div>
    </div>
  );
}
