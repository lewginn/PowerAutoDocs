// src/docmodel/MarkdownSerializer.ts
//
// Converts DocNode[] → a markdown string suitable for ADO Wiki pages.
// Output is deliberately identical to what the old string-builder renderers produced.

import type { DocNode, InlineNode, BulletItem } from './nodes.js';
import { toADOWikiLink } from '../renderers/rendererUtils.js';

// -----------------------------------------------
// Inline serialisation
// -----------------------------------------------

function serializeInline(node: InlineNode): string {
  switch (node.type) {
    case 'text':   return node.value;
    case 'code':   return `\`${node.value}\``;
    case 'bold':   return `**${node.value}**`;
    case 'italic': return `_${node.value}_`;
    case 'link':   return `[${node.text}](${toADOWikiLink(node.href)})`;
  }
}

function serializeInlines(inlines: InlineNode[]): string {
  return inlines.map(serializeInline).join('');
}

// -----------------------------------------------
// Table serialisation — padded columns
// -----------------------------------------------

function pad(str: string, length: number): string {
  return str.padEnd(length, ' ');
}

function serializeTable(headers: string[], rows: InlineNode[][][]): string {
  // Flatten each cell to a plain string for width calculation
  const cellStrings: string[][] = rows.map(row =>
    row.map(cell => serializeInlines(cell))
  );

  const widths = headers.map((h, i) =>
    Math.max(h.length, ...cellStrings.map(r => (r[i] ?? '').length))
  );

  const header  = '| ' + headers.map((h, i) => pad(h, widths[i])).join(' | ') + ' |';
  const divider = '| ' + widths.map(w => '-'.repeat(w)).join(' | ') + ' |';
  const body    = cellStrings.map(
    row => '| ' + row.map((cell, i) => pad(cell ?? '', widths[i])).join(' | ') + ' |'
  );

  return [header, divider, ...body].join('\n');
}

// -----------------------------------------------
// Bullet list serialisation
// -----------------------------------------------

function serializeBulletList(items: BulletItem[]): string {
  return items.map(item => {
    const indent = '  '.repeat(item.depth);
    return `${indent}- ${serializeInlines(item.inlines)}`;
  }).join('\n');
}

// -----------------------------------------------
// Block serialisation
// -----------------------------------------------

function serializeBlock(node: DocNode): string {
  switch (node.type) {
    case 'heading':
      return `${'#'.repeat(node.level)} ${node.text}`;

    case 'paragraph':
      return serializeInlines(node.inlines);

    case 'table':
      return serializeTable(node.headers, node.rows);

    case 'bullet_list':
      return serializeBulletList(node.items);

    case 'mermaid':
      return `:::mermaid\n${node.code}\n:::`;

    case 'code_block':
      return `\`\`\`\n${node.text}\n\`\`\``;

    case 'blockquote':
      return `> ${serializeInlines(node.inlines)}`;

    case 'toc_placeholder':
      return '[[_TOSP_]]';
  }
}

// -----------------------------------------------
// Public API
// -----------------------------------------------

/**
 * Serialise an array of DocNodes to a markdown string.
 * Blocks are separated by a single blank line.
 */
export function serialize(nodes: DocNode[]): string {
  return nodes.map(serializeBlock).join('\n\n') + '\n';
}
