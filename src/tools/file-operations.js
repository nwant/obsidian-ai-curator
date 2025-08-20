import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

/**
 * File operations class - receives dependencies via constructor
 */
export class FileOperations {
  constructor(config, frontmatterManager) {
    if (!config || !frontmatterManager) {
      throw new Error('FileOperations initialization failed: missing required dependencies (config, frontmatterManager)');
    }
    
    this.config = config;
    this.frontmatterManager = frontmatterManager;
    this.vaultPath = config.vaultPath;
  }

  /**
   * Rename a file and update all links
   */
  async rename_file(args) {
    const { oldPath, newPath } = args;
    
    if (!oldPath || !newPath) {
      throw new Error('Both oldPath and newPath are required');
    }
    
    // Validate paths for security
    if (path.isAbsolute(oldPath) || oldPath.includes('..')) {
      throw new Error(`Invalid path outside vault: ${oldPath}`);
    }
    if (path.isAbsolute(newPath) || newPath.includes('..')) {
      throw new Error(`Invalid path outside vault: ${newPath}`);
    }
    const validatedOldPath = oldPath;
    const validatedNewPath = newPath;
    
    const fullOldPath = path.join(this.vaultPath, validatedOldPath);
    const fullNewPath = path.join(this.vaultPath, validatedNewPath);
    
    // Check if source exists
    try {
      await fs.access(fullOldPath);
    } catch {
      throw new Error(`Source file not found: ${oldPath}`);
    }
    
    // Check if target already exists
    try {
      await fs.access(fullNewPath);
      throw new Error(`Target file already exists: ${newPath}`);
    } catch (error) {
      // Good, target doesn't exist
      if (error.message && error.message.includes('already exists')) {
        throw error;
      }
    }
    
    // Create target directory if needed
    await fs.mkdir(path.dirname(fullNewPath), { recursive: true });
    
    // Rename file
    await fs.rename(fullOldPath, fullNewPath);
    
    // Update all links in vault
    const updatedFiles = await this.updateLinksInVault(oldPath, newPath);
    
    return {
      oldPath,
      newPath,
      success: true,
      linksUpdated: updatedFiles.length,
      filesUpdated: updatedFiles
    };
  }

  /**
   * Move a file to a new location
   */
  async move_file(args) {
    const { sourcePath, targetPath } = args;
    
    if (!sourcePath || !targetPath) {
      throw new Error('Both sourcePath and targetPath are required');
    }
    
    // Move is just rename with different parameter names
    return await this.rename_file({
      oldPath: sourcePath,
      newPath: targetPath
    });
  }

  /**
   * Archive multiple notes
   */
  async archive_notes(args) {
    const { moves } = args;
    
    if (!Array.isArray(moves)) {
      throw new Error('moves must be an array');
    }
    
    // Validate all paths first
    for (const move of moves) {
      if (path.isAbsolute(move.from) || move.from.includes('..')) {
        throw new Error(`Invalid path outside vault: ${move.from}`);
      }
      if (path.isAbsolute(move.to) || move.to.includes('..')) {
        throw new Error(`Invalid path outside vault: ${move.to}`);
      }
    }
    
    const results = {
      successful: 0,
      failed: 0,
      errors: []
    };
    
    // Process each move
    for (const move of moves) {
      try {
        const fullFromPath = path.join(this.vaultPath, move.from);
        const fullToPath = path.join(this.vaultPath, move.to);
        
        // Check if source exists
        await fs.access(fullFromPath);
        
        // Create target directory if needed
        await fs.mkdir(path.dirname(fullToPath), { recursive: true });
        
        // Move the file
        await fs.rename(fullFromPath, fullToPath);
        
        results.successful++;
        
        // Update links for this file
        await this.updateLinksInVault(move.from, move.to);
      } catch (error) {
        results.failed++;
        results.errors.push({
          from: move.from,
          to: move.to,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * Update all links in vault when a file is renamed/moved
   */
  async updateLinksInVault(oldPath, newPath) {
    const files = await glob('**/*.md', {
      cwd: this.vaultPath,
      ignore: ['**/node_modules/**', '**/.git/**', '**/.obsidian/**']
    });
    
    const updatedFiles = [];
    
    // Get the old and new note names (without path and extension)
    const oldNoteName = path.basename(oldPath, '.md');
    const newNoteName = path.basename(newPath, '.md');
    
    // Handle paths for nested folders
    const oldDir = path.dirname(oldPath);
    const newDir = path.dirname(newPath);
    const pathChanged = oldDir !== newDir;
    
    for (const file of files) {
      const fullPath = path.join(this.vaultPath, file);
      let content = await fs.readFile(fullPath, 'utf-8');
      const originalContent = content;
      
      // Update wikilinks [[OldNote]] -> [[NewNote]]
      const wikiLinkRegex = new RegExp(`\\[\\[${escapeRegex(oldNoteName)}(\\|[^\\]]+)?\\]\\]`, 'g');
      content = content.replace(wikiLinkRegex, (match, alias) => {
        return `[[${newNoteName}${alias || ''}]]`;
      });
      
      // Update wikilinks with paths if the directory changed
      if (pathChanged) {
        // Update relative paths in links
        const relativeOldPath = path.relative(path.dirname(file), oldPath).replace(/\\/g, '/');
        const relativeNewPath = path.relative(path.dirname(file), newPath).replace(/\\/g, '/');
        
        // Handle various link formats
        const pathWikiLinkRegex = new RegExp(`\\[\\[${escapeRegex(relativeOldPath.replace('.md', ''))}(\\|[^\\]]+)?\\]\\]`, 'g');
        content = content.replace(pathWikiLinkRegex, (match, alias) => {
          return `[[${relativeNewPath.replace('.md', '')}${alias || ''}]]`;
        });
      }
      
      // Update markdown links [text](oldPath.md) -> [text](newPath.md)
      const mdLinkRegex = new RegExp(`\\]\\(${escapeRegex(oldPath)}\\)`, 'g');
      content = content.replace(mdLinkRegex, `](${newPath})`);
      
      // Also handle relative markdown links
      const currentDir = path.dirname(file);
      const relativeOld = path.relative(currentDir, oldPath).replace(/\\/g, '/');
      const relativeNew = path.relative(currentDir, newPath).replace(/\\/g, '/');
      
      if (relativeOld !== oldPath) {
        const relativeMdLinkRegex = new RegExp(`\\]\\(${escapeRegex(relativeOld)}\\)`, 'g');
        content = content.replace(relativeMdLinkRegex, `](${relativeNew})`);
      }
      
      // If content changed, write it back
      if (content !== originalContent) {
        // Parse frontmatter to update modified date
        const parsed = this.frontmatterManager.extractFrontmatter(content);
        
        // Update modified date if frontmatter exists
        if (Object.keys(parsed.frontmatter).length > 0) {
          parsed.frontmatter.modified = new Date().toISOString();
          content = this.frontmatterManager.buildContentWithFrontmatter(parsed.content, parsed.frontmatter);
        }
        
        await fs.writeFile(fullPath, content);
        updatedFiles.push(file);
      }
    }
    
    return updatedFiles;
  }

  /**
   * Get all links from a note
   */
  async get_links(args) {
    const { path: filePath } = args;
    
    if (!filePath) {
      throw new Error('path is required');
    }
    
    const fullPath = path.join(this.vaultPath, filePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    const parsed = this.frontmatterManager.extractFrontmatter(content);
    
    const links = [];
    
    // Extract wikilinks [[Note Name]]
    const wikiLinks = parsed.content.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g) || [];
    wikiLinks.forEach(link => {
      const match = link.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
      if (match) {
        links.push({
          type: 'wikilink',
          target: match[1],
          alias: match[2] || null,
          raw: link
        });
      }
    });
    
    // Extract markdown links [text](target.md)
    const mdLinks = parsed.content.match(/\[([^\]]*)\]\(([^)]+\.md)\)/g) || [];
    mdLinks.forEach(link => {
      const match = link.match(/\[([^\]]*)\]\(([^)]+\.md)\)/);
      if (match) {
        links.push({
          type: 'markdown',
          target: match[2],
          text: match[1],
          raw: link
        });
      }
    });
    
    return {
      path: filePath,
      links,
      totalLinks: links.length
    };
  }

  /**
   * Get all backlinks to a note
   */
  async get_backlinks(args) {
    const { path: targetPath } = args;
    
    if (!targetPath) {
      throw new Error('path is required');
    }
    
    const targetName = path.basename(targetPath, '.md');
    const backlinks = [];
    
    const files = await glob('**/*.md', {
      cwd: this.vaultPath,
      ignore: ['**/node_modules/**', '**/.git/**', '**/.obsidian/**']
    });
    
    for (const file of files) {
      // Skip the target file itself
      if (file === targetPath) continue;
      
      const fullPath = path.join(this.vaultPath, file);
      const content = await fs.readFile(fullPath, 'utf-8');
      
      // Check for wikilinks to target
      const wikiLinkRegex = new RegExp(`\\[\\[${escapeRegex(targetName)}(?:\\|[^\\]]+)?\\]\\]`, 'g');
      const wikiMatches = content.match(wikiLinkRegex) || [];
      
      // Check for markdown links to target
      const mdLinkRegex = new RegExp(`\\]\\(${escapeRegex(targetPath)}\\)`, 'g');
      const mdMatches = content.match(mdLinkRegex) || [];
      
      // Check for relative path links
      const relativeTarget = path.relative(path.dirname(file), targetPath).replace(/\\/g, '/');
      const relativeLinkRegex = new RegExp(`\\]\\(${escapeRegex(relativeTarget)}\\)`, 'g');
      const relativeMatches = relativeTarget !== targetPath ? (content.match(relativeLinkRegex) || []) : [];
      
      const totalMatches = wikiMatches.length + mdMatches.length + relativeMatches.length;
      
      if (totalMatches > 0) {
        backlinks.push({
          source: file,
          count: totalMatches,
          links: [
            ...wikiMatches.map(l => ({ type: 'wikilink', raw: l })),
            ...mdMatches.map(l => ({ type: 'markdown', raw: l })),
            ...relativeMatches.map(l => ({ type: 'markdown-relative', raw: l }))
          ]
        });
      }
    }
    
    return {
      target: targetPath,
      backlinks,
      totalBacklinks: backlinks.length,
      totalReferences: backlinks.reduce((sum, bl) => sum + bl.count, 0)
    };
  }
}

/**
 * Helper function to escape regex special characters
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Legacy singleton instance for backward compatibility
let fileOperationsInstance = null;

/**
 * Initialize file operations with dependencies
 * For backward compatibility with existing MCP server
 */
export function initFileOperations(config, frontmatterManager) {
  fileOperationsInstance = new FileOperations(config, frontmatterManager);
}

/**
 * Legacy function exports for backward compatibility
 */
export async function rename_file(args) {
  if (!fileOperationsInstance) {
    throw new Error('File operations not initialized. Call initFileOperations first.');
  }
  return fileOperationsInstance.rename_file(args);
}

export async function move_file(args) {
  if (!fileOperationsInstance) {
    throw new Error('File operations not initialized. Call initFileOperations first.');
  }
  return fileOperationsInstance.move_file(args);
}

export async function archive_notes(args) {
  if (!fileOperationsInstance) {
    throw new Error('File operations not initialized. Call initFileOperations first.');
  }
  return fileOperationsInstance.archive_notes(args);
}

export async function get_links(args) {
  if (!fileOperationsInstance) {
    throw new Error('File operations not initialized. Call initFileOperations first.');
  }
  return fileOperationsInstance.get_links(args);
}

export async function get_backlinks(args) {
  if (!fileOperationsInstance) {
    throw new Error('File operations not initialized. Call initFileOperations first.');
  }
  return fileOperationsInstance.get_backlinks(args);
}