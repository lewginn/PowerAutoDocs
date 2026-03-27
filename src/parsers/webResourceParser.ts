import { XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';
import * as path from 'path';
import type { WebResourceModel, WebResourceFunction } from '../ir/index.js';
import { WEB_RESOURCE_TYPE_MAP } from '../ir/index.js';

const xmlParser = new XMLParser({
  attributeNamePrefix: '@_',
  ignoreAttributes: false,
});

// -----------------------------------------------
// JS function extraction
// -----------------------------------------------

/**
 * Strip block and line comments from JS source so they don't
 * interfere with function signature matching.
 * We keep a pass of JSDoc blocks separately before stripping.
 */
function stripComments(src: string): string {
  // Replace block comments (non-greedy)
  let out = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Replace line comments
  out = out.replace(/\/\/[^\n]*/g, '');
  return out;
}

/**
 * Extract the leading JSDoc comment immediately before a given character offset.
 */
function extractJsDocBefore(src: string, offset: number): string | undefined {
  // Walk backwards past whitespace to find end of a block comment
  const before = src.slice(0, offset).trimEnd();
  if (!before.endsWith('*/')) return undefined;

  const start = before.lastIndexOf('/**');
  if (start === -1) return undefined;

  const block = before.slice(start);
  // Extract @description or the first non-tag line
  const descMatch = block.match(/@description\s+([^\n*@]+)/);
  if (descMatch) return descMatch[1].trim();

  // Fall back to the first substantive line after /**
  const lines = block
    .split('\n')
    .map(l => l.replace(/^\s*\*+\s?/, '').trim())
    .filter(l => l && !l.startsWith('@') && l !== '/');
  return lines[0] ?? undefined;
}

/**
 * Detect the primary JS namespace from patterns like:
 *   AppName.Account = {
 *   var AppName = AppName || {};  AppName.Account = {
 */
function detectNamespace(src: string): string | undefined {
  // Match: AppName.Something = { or AppName.Something.SubThing = {
  const match = src.match(/^\s*([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]+)+)\s*=\s*\{/m);
  return match?.[1];
}

/**
 * Parse clean parameter names from a raw param string.
 * Handles defaults, destructuring (simplified), rest params.
 */
function parseParams(rawParams: string): string[] {
  if (!rawParams.trim()) return [];
  return rawParams
    .split(',')
    .map(p => {
      // Strip default values
      const noDefault = p.split('=')[0].trim();
      // Strip rest operator
      return noDefault.replace(/^\.\.\./, '').trim();
    })
    .filter(Boolean);
}

/**
 * Extract all named functions from a JS source file.
 *
 * Handles the patterns we see in Power Platform web resources:
 *   1. Object literal methods:  FuncName: [async] function(params) { ... }
 *   2. Standalone declarations: [async] function FuncName(params) { ... }
 *   3. Arrow assignments:       [const|let|var] FuncName = [async] (params) => ...
 */
function extractFunctions(src: string): WebResourceFunction[] {
  const functions: WebResourceFunction[] = [];
  const seen = new Set<string>();

  const clean = stripComments(src);

  // Pattern 1 — object literal method: `Name: [async] function [optName](params)`
  const objectMethodRe = /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*(async\s+)?function\s*(?:[A-Za-z_$][A-Za-z0-9_$]*)?\s*\(([^)]*)\)/g;

  // Pattern 2 — named function declaration: `[async] function Name(params)`
  const declRe = /(async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(([^)]*)\)/g;

  // Pattern 3 — arrow / expression: `[const|let|var] Name = [async] (params) =>`
  const arrowRe = /(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(async\s+)?(?:\(([^)]*)\)|([A-Za-z_$][A-Za-z0-9_$]*))\s*=>/g;

  for (const match of clean.matchAll(objectMethodRe)) {
    const name = match[1];
    if (seen.has(name)) continue;
    seen.add(name);

    // Find offset in original source for JSDoc extraction
    const offset = src.indexOf(match[0]);
    functions.push({
      name,
      isAsync: !!match[2],
      params: parseParams(match[3]),
      jsDoc: offset >= 0 ? extractJsDocBefore(src, offset) : undefined,
    });
  }

  for (const match of clean.matchAll(declRe)) {
    const name = match[2];
    if (seen.has(name)) continue;
    seen.add(name);

    const offset = src.indexOf(match[0]);
    functions.push({
      name,
      isAsync: !!match[1],
      params: parseParams(match[3]),
      jsDoc: offset >= 0 ? extractJsDocBefore(src, offset) : undefined,
    });
  }

  for (const match of clean.matchAll(arrowRe)) {
    const name = match[1];
    if (seen.has(name)) continue;
    seen.add(name);

    const offset = src.indexOf(match[0]);
    // params are either group 3 (parenthesised) or group 4 (single ident)
    const rawParams = match[3] ?? match[4] ?? '';
    functions.push({
      name,
      isAsync: !!match[2],
      params: parseParams(rawParams),
      jsDoc: offset >= 0 ? extractJsDocBefore(src, offset) : undefined,
    });
  }

  return functions;
}

// -----------------------------------------------
// _data.xml parsing
// -----------------------------------------------

interface RawWebResourceMeta {
  id: string;
  name: string;
  displayName: string;
  typeCode: number;
  introducedVersion: string;
  dependencies: string[];
  fileName: string;
}

function parseDependencyXml(raw: string): string[] {
  if (!raw) return [];
  try {
    // DependencyXml is HTML-entity encoded inside the XML — decode first
    const decoded = raw
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"');
    const parsed = xmlParser.parse(decoded);
    const deps = parsed?.Dependencies?.Dependency;
    if (!deps) return [];
    const arr = Array.isArray(deps) ? deps : [deps];
    return arr
      .map((d: any) => d?.Library?.['@_name'] ?? d?.Library?.name ?? '')
      .filter(Boolean);
  } catch {
    return [];
  }
}

function parseDataXml(filePath: string): RawWebResourceMeta | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = xmlParser.parse(raw);
    const wr = parsed?.WebResource;
    if (!wr) return null;

    return {
      id: (wr.WebResourceId ?? '').replace(/[{}]/g, ''),
      name: wr.Name ?? wr.n ?? '',
      displayName: wr.DisplayName ?? wr.Name ?? wr.n ?? '',
      typeCode: Number(wr.WebResourceType ?? 0),
      introducedVersion: String(wr.IntroducedVersion ?? '1.0'),
      dependencies: parseDependencyXml(wr.DependencyXml ?? ''),
      fileName: wr.FileName ?? '',
    };
  } catch (err) {
    console.error(`Failed to parse web resource data XML: ${filePath}`, err);
    return null;
  }
}

// -----------------------------------------------
// Main entry point
// -----------------------------------------------

/**
 * Scan the WebResources folder of an unpacked solution and build WebResourceModels.
 * For each *_data.xml file found, we parse the metadata and (for JS type-3 resources)
 * also parse the sibling source file to extract functions.
 */
export function parseAllWebResources(unpackedPath: string): WebResourceModel[] {
  const webResourcesPath = path.join(unpackedPath, 'WebResources');

  if (!fs.existsSync(webResourcesPath)) {
    console.warn(`No WebResources folder found at: ${webResourcesPath}`);
    return [];
  }

  const results: WebResourceModel[] = [];

  // Recursively find all _data.xml files
  const dataFiles = findDataXmlFiles(webResourcesPath);
  console.log(`  Found ${dataFiles.length} web resource data files`);

  for (const dataFile of dataFiles) {
    const meta = parseDataXml(dataFile);
    if (!meta) continue;

    const resourceType = WEB_RESOURCE_TYPE_MAP[meta.typeCode] ?? 'Unknown';

    const model: WebResourceModel = {
      id: meta.id,
      name: meta.name,
      displayName: meta.displayName,
      resourceType,
      introducedVersion: meta.introducedVersion,
      dependencies: meta.dependencies,
      fileName: meta.fileName,
    };

    // For JavaScript resources, parse the source file
    if (resourceType === 'JavaScript') {
      // Sibling source file = data file with '.data.xml' stripped — e.g. Account.js.data.xml → Account.js
      const sourceFile = dataFile.replace(/\.data\.xml$/, '');

      if (fs.existsSync(sourceFile)) {
        try {
          const src = fs.readFileSync(sourceFile, 'utf-8');
          model.namespace = detectNamespace(src);
          model.functions = extractFunctions(src);
        } catch (err) {
          console.warn(`Could not read JS source for ${meta.name}: ${sourceFile}`, err);
        }
      } else {
        console.warn(`JS source file not found for ${meta.name}: ${sourceFile}`);
      }
    }

    results.push(model);
  }

  // Sort: JS files first, then by name
  results.sort((a, b) => {
    if (a.resourceType === 'JavaScript' && b.resourceType !== 'JavaScript') return -1;
    if (a.resourceType !== 'JavaScript' && b.resourceType === 'JavaScript') return 1;
    return a.name.localeCompare(b.name);
  });

  return results;
}

/**
 * Recursively walk a directory and collect all files ending in .data.xml
 * pac solution unpack co-locates each .data.xml alongside its source file.
 */
function findDataXmlFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findDataXmlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.data.xml')) {
      results.push(fullPath);
    }
  }
  return results;
}