/**
 * Encodes a full ADO wiki page path for use in markdown links.
 * - Existing hyphens → %2D (must be done before space conversion)
 * - Parentheses → escaped with backslash
 * - Spaces → hyphens
 */
export function toADOWikiLink(fullPath: string): string {
  return fullPath
    .replace(/-/g, '%2D')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/ /g, '-');
}