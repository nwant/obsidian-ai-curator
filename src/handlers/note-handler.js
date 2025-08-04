/**
 * Note operations handler for MCP server
 * Handles reading, writing, and managing individual notes
 */

import path from 'path';
import fs from 'fs/promises';
import matter from 'gray-matter';
import { format } from 'date-fns';
import { validatePath } from '../tools/path-validator.js';
import { LinkFormatter } from '../tools/link-formatter.js';
import { TagFormatter } from '../tools/tag-formatter.js';
import { FrontmatterManager } from '../tools/frontmatter-manager.js';

export class NoteHandler {
  constructor(config, cache, apiClient) {
    this.config = config;
    this.cache = cache;
    this.apiClient = apiClient;
    this.linkFormatter = new LinkFormatter();
    this.tagFormatter = new TagFormatter();
    this.frontmatterManager = new FrontmatterManager(config, cache, apiClient);
  }

  /**
   * Read multiple notes with full content and metadata
   */
  async readNotes({ paths, renderDataview = false, dataviewMode = 'smart' }) {
    const notes = [];
    
    for (const notePath of paths) {
      try {
        // Validate path
        validatePath(notePath, this.config.vaultPath);
        
        // Cache expects relative path, not full path
        const content = await this.cache.getFileContent(notePath);
        const parsed = matter(content);
        const fullPath = path.join(this.config.vaultPath, notePath);
        
        const note = {
          path: notePath,
          content: parsed.content,
          frontmatter: parsed.data || {},
          raw: content,
          headings: this.extractHeadings(parsed.content),
          links: this.extractLinks(parsed.content)
        };
        
        // Add file stats
        try {
          const stats = await fs.stat(fullPath);
          note.stats = {
            created: stats.birthtime,
            modified: stats.mtime,
            size: stats.size
          };
        } catch (error) {
          console.error(`Could not get stats for ${notePath}:`, error.message);
        }
        
        notes.push(note);
      } catch (error) {
        notes.push({
          path: notePath,
          error: error.message
        });
      }
    }
    
    return { notes };
  }

  /**
   * Write or update a note
   */
  async writeNote({ path: notePath, content }) {
    // Validate path - throw error for test compatibility
    try {
      validatePath(notePath, this.config.vaultPath);
    } catch (error) {
      throw error;  // Re-throw validation errors
    }
    
    try {
      
      // Try API first for better integration
      if (this.apiClient.isConnected()) {
        try {
          const result = await this.apiClient.request('vault/write', {
            path: notePath,
            content: content
          });
          
          if (result.success) {
            // Invalidate cache for this file
            await this.cache.invalidateFile(notePath);
            return {
              success: true,
              path: notePath,
              message: 'Note written successfully via Obsidian API'
            };
          }
        } catch (apiError) {
          console.error('API write failed, falling back to file system:', apiError.message);
        }
      }
      
      // Fallback to file system
      const fullPath = path.join(this.config.vaultPath, notePath);
      
      // Ensure directory exists
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });
      
      // Check if file exists to determine action
      let action = 'created';
      try {
        await fs.access(fullPath);
        action = 'updated';
      } catch {
        // File doesn't exist, will be created
      }
      
      // For simple writes, just write the content as-is
      // unless it contains frontmatter that needs processing
      let finalContent = content;
      
      // Always try to format links even without frontmatter
      if (content.includes('](') && content.includes('.md')) {
        finalContent = this.formatLinks(finalContent);
      }
      
      if (finalContent.includes('---\n') || finalContent.startsWith('---\n')) {
        // Parse content to handle frontmatter
        const parsed = matter(finalContent);
        
        // Format tags if present (remove # from frontmatter)
        if (parsed.data.tags) {
          if (Array.isArray(parsed.data.tags)) {
            parsed.data.tags = parsed.data.tags.map(tag => 
              typeof tag === 'string' ? tag.replace(/^#/, '') : tag
            );
          }
        }
        
        // Add modified date if frontmatter exists
        if (Object.keys(parsed.data).length > 0) {
          parsed.data.modified = new Date().toISOString().split('T')[0];
        }
        
        // Reconstruct content with frontmatter
        finalContent = matter.stringify(parsed.content, parsed.data);
      }
      
      // Write file
      await fs.writeFile(fullPath, finalContent, 'utf-8');
      
      // Invalidate cache
      await this.cache.invalidateFile(notePath);
      
      return {
        success: true,
        path: notePath,
        action,
        message: 'Note written successfully'
      };
    } catch (error) {
      console.error('Write note error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get frontmatter for a note
   */
  async getFrontmatter({ path: notePath }) {
    return this.frontmatterManager.getFrontmatter(notePath);
  }

  /**
   * Update frontmatter for a note
   */
  async updateFrontmatter({ path: notePath, updates, merge = true }) {
    return this.frontmatterManager.updateFrontmatter(notePath, updates, merge);
  }

  /**
   * Archive multiple notes
   */
  /**
   * Extract headings from content
   * @stub - Basic implementation for testing
   */
  extractHeadings(content) {
    const headings = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        // For test compatibility, just return heading text strings
        headings.push(match[2]);
      }
    }
    
    return headings;
  }
  
  /**
   * Extract links from content
   * @stub - Basic implementation for testing
   */
  extractLinks(content) {
    const links = [];
    
    // Extract wikilinks - just return the target strings for test compatibility
    const wikilinks = content.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g) || [];
    wikilinks.forEach(link => {
      const match = link.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
      if (match) {
        links.push(match[1]);
      }
    });
    
    return links;
  }
  
  /**
   * Format links to wikilink format
   * @stub - Basic implementation for testing
   */
  formatLinks(content) {
    // Convert markdown links to wikilinks
    return content.replace(/\[([^\]]+)\]\(([^)]+\.md)\)/g, (match, text, path) => {
      const note = path.replace(/\.md$/, '').replace(/.*\//, '');
      return `[[${note}|${text}]]`;
    });
  }
  
  /**
   * Update frontmatter for a note
   * @stub - Basic implementation for testing
   */
  async updateFrontmatter({ path: notePath, updates, merge = true }) {
    try {
      const content = await this.cache.getFileContent(notePath);
      const parsed = matter(content);
      
      // When merge is false, don't add modified date
      const newFrontmatter = merge 
        ? { ...parsed.data, ...updates, modified: new Date().toISOString().split('T')[0] }
        : updates;
      
      // Temporarily disable auto-modified date for non-merge updates
      const tempContent = matter.stringify(parsed.content, newFrontmatter);
      
      // Write without processing frontmatter again
      const fullPath = path.join(this.config.vaultPath, notePath);
      await fs.writeFile(fullPath, tempContent, 'utf-8');
      await this.cache.invalidateFile(notePath);
      
      return {
        success: true,
        path: notePath,
        message: 'Frontmatter updated'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Get or create daily note
   * @stub - Basic implementation for testing
   */
  async getDailyNote({ date = 'today', create = false, createIfMissing = false }) {
    const createNote = create || createIfMissing;
    const dateStr = date === 'today' 
      ? new Date().toISOString().split('T')[0]
      : date;
    
    const dailyNotePath = `Daily Notes/${dateStr}.md`;
    
    try {
      const content = await this.cache.getFileContent(dailyNotePath);
      return {
        success: true,
        exists: true,
        path: dailyNotePath,
        content
      };
    } catch (error) {
      if (createNote) {
        const template = `# ${dateStr}\n\n## Tasks\n- [ ] \n\n## Notes\n\n`;
        await this.writeNote({
          path: dailyNotePath,
          content: template
        });
        return {
          success: true,
          exists: false,
          created: true,
          path: dailyNotePath,
          content: template
        };
      }
      
      return {
        success: false,
        exists: false,
        path: dailyNotePath,
        error: 'Daily note not found'
      };
    }
  }
  
  /**
   * Append content to daily note
   * @stub - Basic implementation for testing
   */
  async appendToDailyNote({ content, section = 'Notes', date = 'today' }) {
    const dailyNote = await this.getDailyNote({ date, create: true });
    
    let noteContent = dailyNote.content;
    const sectionHeader = `## ${section}`;
    
    if (noteContent.includes(sectionHeader)) {
      // Insert after section header
      const lines = noteContent.split('\n');
      const sectionIndex = lines.findIndex(l => l === sectionHeader);
      lines.splice(sectionIndex + 1, 0, content);
      noteContent = lines.join('\n');
    } else {
      // Add section at end
      noteContent += `\n${sectionHeader}\n${content}\n`;
    }
    
    const result = await this.writeNote({
      path: dailyNote.path,
      content: noteContent
    });
    
    return {
      success: result.success,
      path: dailyNote.path,
      section,
      content: noteContent
    };
  }

  async archiveNotes({ moves }) {
    const results = {
      successful: 0,
      failed: 0,
      errors: []
    };

    // Try API first for batch operations
    if (this.apiClient.isConnected()) {
      try {
        const apiResult = await this.apiClient.request('vault/archive', { moves });
        if (apiResult.success) {
          return apiResult.data;
        }
      } catch (apiError) {
        console.error('API archive failed, falling back to file system:', apiError.message);
      }
    }

    // Fallback to individual moves
    for (const move of moves) {
      try {
        const { from, to } = move;
        
        // Validate paths
        validatePath(from, this.config.vaultPath);
        validatePath(to, this.config.vaultPath);
        
        const sourcePath = path.join(this.config.vaultPath, from);
        const targetPath = path.join(this.config.vaultPath, to);
        
        // Ensure target directory exists
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        
        // Move file
        await fs.rename(sourcePath, targetPath);
        
        // Invalidate cache for both paths
        await this.cache.invalidateFile(from);
        await this.cache.invalidateFile(to);
        
        results.successful++;
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
}