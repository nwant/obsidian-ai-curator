import path from 'path';

export class LinkFormatter {
  constructor(obsidianAPI = null) {
    this.obsidianAPI = obsidianAPI;
  }
  /**
   * Convert various link formats to Obsidian wikilinks
   * Can use instance method for API support or static for basic formatting
   */
  async formatLinks(content, currentNotePath = '') {
    if (!content) return '';
    
    // If we have Obsidian API, use it for better link resolution
    if (this.obsidianAPI && this.obsidianAPI.isAvailable()) {
      return await this.formatLinksWithAPI(content, currentNotePath);
    }
    // Otherwise use static method
    return LinkFormatter.formatLinksStatic(content, currentNotePath);
  }

  /**
   * Format links using Obsidian API for proper resolution
   */
  async formatLinksWithAPI(content, currentNotePath) {
    if (!content) return '';
    // Convert markdown links with paths to wikilinks
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const replacements = [];
    
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      const [fullMatch, linkText, linkPath] = match;
      
      // Skip external URLs
      if (linkPath.startsWith('http://') || linkPath.startsWith('https://')) {
        continue;
      }
      
      // Try to resolve the link
      try {
        const resolved = await this.obsidianAPI.request('/api/resolve-link', {
          linkpath: linkPath.replace(/\.md$/, ''),
          sourcePath: currentNotePath
        });
        
        if (resolved && resolved.success && resolved.data) {
          const target = resolved.data.resolved 
            ? resolved.data.basename 
            : path.basename(linkPath, '.md');
          
          const formatted = await this.obsidianAPI.request('/api/format-link', {
            target,
            alias: linkText !== target ? linkText : null,
            sourcePath: currentNotePath
          });
          
          if (formatted && formatted.success) {
            replacements.push({
              start: match.index,
              end: match.index + fullMatch.length,
              replacement: formatted.data.formatted
            });
          }
        }
      } catch (error) {
        // Fallback to basic formatting
        const noteName = path.basename(linkPath, '.md');
        const replacement = linkText !== noteName 
          ? `[[${noteName}|${linkText}]]` 
          : `[[${noteName}]]`;
        
        replacements.push({
          start: match.index,
          end: match.index + fullMatch.length,
          replacement
        });
      }
    }
    
    // Apply replacements in reverse order to maintain positions
    let result = content;
    for (let i = replacements.length - 1; i >= 0; i--) {
      const { start, end, replacement } = replacements[i];
      result = result.substring(0, start) + replacement + result.substring(end);
    }
    
    return result;
  }

  /**
   * Static method for basic link formatting without API
   */
  static formatLinksStatic(content, currentNotePath = '') {
    if (!content) return '';
    
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
    if (!content) return { valid: true, issues: [] };
    
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
    if (!content) return [];
    
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
    if (!content) return '';
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
    if (!target) return '[[]]';
    
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