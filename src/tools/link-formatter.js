import path from 'path';

export class LinkFormatter {
  /**
   * Convert various link formats to Obsidian wikilinks
   */
  static formatLinks(content, currentNotePath = '') {
    // Pattern to match various link formats
    // 1. Full paths: [text](/full/path/to/note.md)
    // 2. Relative paths: [text](../path/to/note.md)
    // 3. Already correct wikilinks: [[note]]
    
    // Convert markdown links with paths to wikilinks
    content = content.replace(/\[([^\]]+)\]\(([^)]+\.md)\)/g, (match, linkText, linkPath) => {
      // Skip external URLs
      if (linkPath.startsWith('http://') || linkPath.startsWith('https://')) {
        return match;
      }
      
      // Extract just the note name without path and extension
      const noteName = path.basename(linkPath, '.md');
      
      // If link text is different from note name, use alias syntax
      if (linkText.trim() !== noteName) {
        return `[[${noteName}|${linkText}]]`;
      } else {
        return `[[${noteName}]]`;
      }
    });
    
    // Convert any remaining full paths to wikilinks
    // Pattern: /any/path/to/SomeNote.md -> [[SomeNote]]
    content = content.replace(/(?<!\[)\/?[\w\/-]+\/([\w\s-]+)\.md/g, (match, noteName) => {
      // Skip if already in a link
      if (match.includes('](') || match.includes('[[')) {
        return match;
      }
      return `[[${noteName}]]`;
    });
    
    return content;
  }
  
  /**
   * Validate that links use proper Obsidian format
   */
  static validateLinks(content) {
    const issues = [];
    
    // Find markdown links with .md paths
    const markdownLinks = content.match(/\[([^\]]+)\]\(([^)]+\.md)\)/g) || [];
    markdownLinks.forEach(link => {
      if (!link.includes('http://') && !link.includes('https://')) {
        issues.push({
          type: 'incorrect-format',
          link: link,
          suggestion: link.replace(/\[([^\]]+)\]\(([^)]+)\.md\)/, (m, text, path) => {
            const noteName = path.split('/').pop();
            return text !== noteName ? `[[${noteName}|${text}]]` : `[[${noteName}]]`;
          })
        });
      }
    });
    
    // Find bare paths that should be wikilinks
    const barePaths = content.match(/(?<!\[)\/?[\w\/-]+\/[\w\s-]+\.md/g) || [];
    barePaths.forEach(path => {
      issues.push({
        type: 'bare-path',
        link: path,
        suggestion: `[[${path.split('/').pop().replace('.md', '')}]]`
      });
    });
    
    return {
      valid: issues.length === 0,
      issues
    };
  }
  
  /**
   * Extract all wikilinks from content
   */
  static extractWikilinks(content) {
    const wikilinks = [];
    
    // Match [[Note Name]] or [[Note Name|Alias]]
    const matches = content.match(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g) || [];
    
    matches.forEach(match => {
      const parts = match.slice(2, -2).split('|');
      wikilinks.push({
        link: match,
        target: parts[0].trim(),
        alias: parts[1]?.trim() || null
      });
    });
    
    return wikilinks;
  }
  
  /**
   * Convert wikilinks to relative paths (for compatibility)
   */
  static wikilinksToPaths(content, vaultStructure = {}) {
    return content.replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, (match, target, alias) => {
      // If we have vault structure, try to find the actual path
      const actualPath = vaultStructure[target] || `${target}.md`;
      const linkText = alias ? alias.slice(1) : target;
      return `[${linkText}](${actualPath})`;
    });
  }
  
  /**
   * Format a single link
   */
  static formatLink(target, alias = null) {
    // Remove .md extension if present
    target = target.replace(/\.md$/, '');
    
    // Remove path if present
    if (target.includes('/')) {
      target = target.split('/').pop();
    }
    
    if (alias && alias !== target) {
      return `[[${target}|${alias}]]`;
    } else {
      return `[[${target}]]`;
    }
  }
}