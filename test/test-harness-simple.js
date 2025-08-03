import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Simplified Test Harness for MCP Tools
 * Uses in-memory mock for fast, isolated tests
 */

export class SimpleTestHarness {
  constructor() {
    this.vault = new Map(); // In-memory vault
    this.tools = new Map();
    this.vaultPath = '/test-vault';
  }

  async setup() {
    this.vault.clear();
    this.tools.clear();
    await this.loadMockTools();
  }

  async teardown() {
    this.vault.clear();
    this.tools.clear();
  }

  /**
   * Create a test note in memory
   */
  async createNote(relativePath, content, frontmatter = {}) {
    let fullContent = content;
    
    if (Object.keys(frontmatter).length > 0) {
      let fm = '---\n';
      Object.entries(frontmatter).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          fm += `${key}:\n`;
          value.forEach(item => fm += `  - ${item}\n`);
        } else {
          fm += `${key}: ${value}\n`;
        }
      });
      fm += '---\n\n';
      fullContent = fm + content;
    }
    
    this.vault.set(relativePath, {
      content: fullContent,
      modified: new Date(),
      frontmatter
    });
  }

  /**
   * Create multiple test notes
   */
  async createTestVault(structure) {
    for (const [path, config] of Object.entries(structure)) {
      if (typeof config === 'string') {
        await this.createNote(path, config);
      } else {
        await this.createNote(path, config.content || '', config.frontmatter || {});
      }
    }
  }

  /**
   * Load mock MCP tools
   */
  async loadMockTools() {
    // Mock vault_scan
    this.tools.set('vault_scan', async (params = {}) => {
      const files = [];
      
      for (const [path, file] of this.vault) {
        if (path.endsWith('.md')) {
          const result = {
            path,
            modified: file.modified
          };
          
          if (params.includeStats) {
            result.wordCount = file.content.split(/\s+/).filter(w => w).length;
            result.size = file.content.length;
          }
          
          if (params.includeFrontmatter) {
            result.frontmatter = file.frontmatter;
          }
          
          files.push(result);
        }
      }
      
      // Sort and limit
      if (params.sortBy === 'modified') {
        files.sort((a, b) => b.modified - a.modified);
      }
      
      if (params.limit) {
        return { files: files.slice(0, params.limit) };
      }
      
      return { files };
    });

    // Mock search_content
    this.tools.set('search_content', async (params) => {
      if (!params.query) throw new Error('Empty query not allowed');
      
      const matches = [];
      const isRegex = params.isRegex;
      const caseSensitive = params.caseSensitive || false;
      
      for (const [filePath, file] of this.vault) {
        const lines = file.content.split('\n');
        
        lines.forEach((line, index) => {
          const searchLine = caseSensitive ? line : line.toLowerCase();
          const searchQuery = caseSensitive ? params.query : params.query.toLowerCase();
          
          if (searchLine.includes(searchQuery)) {
            const match = {
              file: filePath,
              line: index + 1,
              content: line.substring(0, params.maxLineLength || 200)
            };
            
            if (params.contextLines > 0) {
              match.context = {
                before: lines.slice(Math.max(0, index - params.contextLines), index),
                after: lines.slice(index + 1, index + 1 + params.contextLines)
              };
            }
            
            matches.push(match);
          }
        });
      }
      
      if (params.maxResults && matches.length > params.maxResults) {
        return { 
          matches: matches.slice(0, params.maxResults), 
          truncated: true 
        };
      }
      
      return { matches };
    });

    // Mock write_note
    this.tools.set('write_note', async (params) => {
      if (!params.path) throw new Error('Path is required');
      if (!params.content) throw new Error('Content is required');
      
      if (path.isAbsolute(params.path) || params.path.includes('..')) {
        throw new Error('Invalid path');
      }
      
      await this.createNote(params.path, params.content);
      return { success: true, path: params.path };
    });

    // Mock get_tags
    this.tools.set('get_tags', async (params = {}) => {
      if (params.path) {
        const file = this.vault.get(params.path);
        if (!file) throw new Error('File not found');
        
        const tags = [];
        
        // Frontmatter tags
        if (file.frontmatter?.tags) {
          tags.push(...file.frontmatter.tags);
        }
        
        // Inline tags
        const inlineTags = file.content.match(/#[\w-]+/g) || [];
        tags.push(...inlineTags.map(t => t.substring(1)));
        
        return { tags: [...new Set(tags)] };
      } else {
        // All tags from vault
        const allTags = {};
        
        for (const [filePath, file] of this.vault) {
          const result = await this.executeTool('get_tags', { path: filePath });
          result.tags.forEach(tag => {
            allTags[tag] = (allTags[tag] || 0) + 1;
          });
        }
        
        return { tags: allTags };
      }
    });

    // Mock update_tags
    this.tools.set('update_tags', async (params) => {
      const file = this.vault.get(params.path);
      if (!file) throw new Error('File not found');
      
      let tags = file.frontmatter?.tags || [];
      
      if (params.replace) {
        tags = params.replace;
      } else {
        if (params.remove) {
          tags = tags.filter(t => !params.remove.includes(t));
        }
        if (params.add) {
          params.add.forEach(tag => {
            const normalized = tag.replace(/^#/, '').toLowerCase().replace(/\s+/g, '-');
            if (!tags.includes(normalized)) {
              tags.push(normalized);
            }
          });
        }
      }
      
      file.frontmatter = { ...file.frontmatter, tags };
      return { success: true, tags };
    });

    // Mock rename_file
    this.tools.set('rename_file', async (params) => {
      const file = this.vault.get(params.oldPath);
      if (!file) throw new Error('File not found');
      
      if (this.vault.has(params.newPath)) {
        throw new Error('Target file already exists');
      }
      
      // Move file
      this.vault.set(params.newPath, file);
      this.vault.delete(params.oldPath);
      
      // Mock link updates
      let linksUpdated = 0;
      for (const [path, otherFile] of this.vault) {
        if (otherFile.content.includes(`[[${params.oldPath}]]`)) {
          linksUpdated++;
        }
      }
      
      return { success: true, linksUpdated };
    });
  }

  /**
   * Execute a tool
   */
  async executeTool(toolName, params = {}) {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }
    
    return await tool({ ...params, vaultPath: this.vaultPath });
  }

  /**
   * Assertion helpers
   */
  async assertFileExists(relativePath) {
    if (!this.vault.has(relativePath)) {
      throw new Error(`File does not exist: ${relativePath}`);
    }
    return true;
  }

  async assertFileContains(relativePath, expectedText) {
    const file = this.vault.get(relativePath);
    if (!file) {
      throw new Error(`File does not exist: ${relativePath}`);
    }
    
    if (!file.content.includes(expectedText)) {
      throw new Error(`File ${relativePath} does not contain: ${expectedText}`);
    }
    return true;
  }

  async assertFrontmatter(relativePath, field, expectedValue) {
    const file = this.vault.get(relativePath);
    if (!file) {
      throw new Error(`File does not exist: ${relativePath}`);
    }
    
    if (file.frontmatter?.[field] !== expectedValue) {
      throw new Error(`Frontmatter ${field} is "${file.frontmatter?.[field]}", expected "${expectedValue}"`);
    }
    return true;
  }

  async readNote(relativePath) {
    const file = this.vault.get(relativePath);
    return file ? file.content : null;
  }

  async getNoteTags(relativePath) {
    const result = await this.executeTool('get_tags', { path: relativePath });
    return result.tags;
  }

  setFilePermissions(relativePath, permissions) {
    // Mock implementation
  }

  simulateDiskFull() {
    // Mock implementation
  }
}

// Export singleton
export const testHarness = new SimpleTestHarness();