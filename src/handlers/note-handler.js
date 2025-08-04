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
    try {
      // Validate path
      validatePath(notePath, this.config.vaultPath);
      
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
      
      // Parse content to handle frontmatter
      const parsed = matter(content);
      
      // Format tags if present
      if (parsed.data.tags) {
        parsed.data.tags = this.tagFormatter.formatTags(parsed.data.tags);
      }
      
      // Add modified date
      parsed.data.modified = format(new Date(), this.config.dateFormat || 'yyyy-MM-dd');
      
      // Convert markdown links to wikilinks
      parsed.content = this.linkFormatter.convertToWikilinks(parsed.content);
      
      // Reconstruct content with frontmatter
      const finalContent = matter.stringify(parsed.content, parsed.data);
      
      // Write file
      await fs.writeFile(fullPath, finalContent, 'utf-8');
      
      // Invalidate cache
      await this.cache.invalidateFile(notePath);
      
      return {
        success: true,
        path: notePath,
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
        headings.push({
          level: match[1].length,
          text: match[2],
          raw: line
        });
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
    
    // Extract wikilinks
    const wikilinks = content.match(/\[\[([^\]]+)\]\]/g) || [];
    wikilinks.forEach(link => {
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
    
    // Extract markdown links
    const mdLinks = content.match(/\[([^\]]+)\]\(([^)]+)\)/g) || [];
    mdLinks.forEach(link => {
      const match = link.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (match) {
        links.push({
          type: 'markdown',
          text: match[1],
          url: match[2],
          raw: link
        });
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
      
      const newFrontmatter = merge 
        ? { ...parsed.data, ...updates }
        : updates;
      
      const newContent = matter.stringify(parsed.content, newFrontmatter);
      
      return this.writeNote({ 
        path: notePath, 
        content: newContent 
      });
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
  async getDailyNote({ date = 'today', createIfMissing = true }) {
    const dateStr = date === 'today' 
      ? new Date().toISOString().split('T')[0]
      : date;
    
    const dailyNotePath = `Daily/${dateStr}.md`;
    
    try {
      const content = await this.cache.getFileContent(dailyNotePath);
      return {
        exists: true,
        path: dailyNotePath,
        content
      };
    } catch (error) {
      if (createIfMissing) {
        const template = `# ${dateStr}\n\n## Tasks\n- [ ] \n\n## Notes\n\n`;
        await this.writeNote({
          path: dailyNotePath,
          content: template
        });
        return {
          exists: false,
          created: true,
          path: dailyNotePath,
          content: template
        };
      }
      
      return {
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
    const dailyNote = await this.getDailyNote({ date, createIfMissing: true });
    
    let noteContent = dailyNote.content;
    const sectionHeader = `## ${section}`;
    
    if (noteContent.includes(sectionHeader)) {
      // Insert after section header
      const lines = noteContent.split('\n');
      const sectionIndex = lines.findIndex(l => l === sectionHeader);
      lines.splice(sectionIndex + 1, 0, `- ${content}`);
      noteContent = lines.join('\n');
    } else {
      // Add section at end
      noteContent += `\n${sectionHeader}\n- ${content}\n`;
    }
    
    return this.writeNote({
      path: dailyNote.path,
      content: noteContent
    });
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