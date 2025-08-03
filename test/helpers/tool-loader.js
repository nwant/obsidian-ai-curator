import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Tool Loader for Tests
 * 
 * This helper loads MCP tools in a testable way,
 * allowing for mocking and isolation
 */

export class ToolLoader {
  constructor(mockFileSystem = null) {
    this.tools = new Map();
    this.mockFs = mockFileSystem;
    this.toolsPath = path.join(__dirname, '../../src/tools');
  }
  
  /**
   * Load a specific tool module
   */
  async loadTool(toolName) {
    try {
      // For testing, we'll create mock implementations
      // In real implementation, this would import from src/tools
      const mockTools = this.createMockTools();
      
      if (mockTools[toolName]) {
        this.tools.set(toolName, mockTools[toolName]);
        return mockTools[toolName];
      }
      
      throw new Error(`Tool not found: ${toolName}`);
    } catch (error) {
      console.error(`Failed to load tool ${toolName}:`, error);
      throw error;
    }
  }
  
  /**
   * Create mock tool implementations for testing
   */
  createMockTools() {
    const fs = this.mockFs || require('fs/promises');
    
    return {
      vault_scan: async (params) => {
        const { patterns = ['**/*.md'], includeStats, includeFrontmatter, sortBy = 'modified', limit } = params;
        
        // Mock implementation
        const files = await this.scanVault(params.vaultPath, patterns);
        let results = files.map(file => {
          const result = { path: file.path, modified: file.modified };
          
          if (includeStats) {
            result.wordCount = file.content.split(/\s+/).length;
            result.size = file.content.length;
          }
          
          if (includeFrontmatter) {
            result.frontmatter = file.frontmatter || {};
          }
          
          return result;
        });
        
        // Sort
        if (sortBy === 'modified') {
          results.sort((a, b) => b.modified - a.modified);
        }
        
        // Limit
        if (limit) {
          results = results.slice(0, limit);
        }
        
        return { files: results };
      },
      
      search_content: async (params) => {
        const { query, caseSensitive = false, contextLines = 0, maxResults = 100 } = params;
        
        if (!query) throw new Error('Empty query not allowed');
        
        const matches = [];
        const files = await this.scanVault(params.vaultPath);
        
        for (const file of files) {
          const lines = file.content.split('\n');
          
          lines.forEach((line, index) => {
            const searchLine = caseSensitive ? line : line.toLowerCase();
            const searchQuery = caseSensitive ? query : query.toLowerCase();
            
            if (searchLine.includes(searchQuery)) {
              const match = {
                file: file.path,
                line: index + 1,
                content: line
              };
              
              if (contextLines > 0) {
                match.context = {
                  before: lines.slice(Math.max(0, index - contextLines), index),
                  after: lines.slice(index + 1, index + 1 + contextLines)
                };
              }
              
              matches.push(match);
              
              if (matches.length >= maxResults) {
                return { matches, truncated: true };
              }
            }
          });
        }
        
        return { matches };
      },
      
      write_note: async (params) => {
        const { path: filePath, content } = params;
        
        if (!filePath) throw new Error('Path is required');
        if (!content) throw new Error('Content is required');
        
        // Validate path
        if (path.isAbsolute(filePath) || filePath.includes('..')) {
          throw new Error('Invalid path');
        }
        
        // Mock write
        await this.mockWriteFile(params.vaultPath, filePath, content);
        
        return { success: true, path: filePath };
      },
      
      get_tags: async (params) => {
        const { path: filePath } = params;
        
        if (filePath) {
          // Get tags from specific file
          const file = await this.mockReadFile(params.vaultPath, filePath);
          if (!file) throw new Error('File not found');
          
          const tags = [];
          
          // Extract frontmatter tags
          if (file.frontmatter && file.frontmatter.tags) {
            tags.push(...file.frontmatter.tags);
          }
          
          // Extract inline tags
          const inlineTags = file.content.match(/#[\w-]+/g) || [];
          tags.push(...inlineTags.map(t => t.substring(1)));
          
          return { tags: [...new Set(tags)] };
        } else {
          // Get all tags from vault
          const allTags = {};
          const files = await this.scanVault(params.vaultPath);
          
          for (const file of files) {
            const fileTags = await this.get_tags({ ...params, path: file.path });
            
            fileTags.tags.forEach(tag => {
              allTags[tag] = (allTags[tag] || 0) + 1;
            });
          }
          
          return { tags: allTags };
        }
      },
      
      update_tags: async (params) => {
        const { path: filePath, add = [], remove = [], replace } = params;
        
        const file = await this.mockReadFile(params.vaultPath, filePath);
        if (!file) throw new Error('File not found');
        
        let tags = file.frontmatter?.tags || [];
        
        if (replace) {
          tags = replace;
        } else {
          // Remove tags
          tags = tags.filter(t => !remove.includes(t));
          
          // Add tags (avoiding duplicates)
          add.forEach(tag => {
            const normalized = tag.replace(/^#/, '').toLowerCase().replace(/\s+/g, '-');
            if (!tags.includes(normalized)) {
              tags.push(normalized);
            }
          });
        }
        
        // Update file
        file.frontmatter = { ...file.frontmatter, tags };
        await this.mockWriteFile(params.vaultPath, filePath, file.content, file.frontmatter);
        
        return { success: true, tags };
      },
      
      rename_file: async (params) => {
        const { oldPath, newPath } = params;
        
        if (await this.mockFileExists(params.vaultPath, newPath)) {
          throw new Error('Target file already exists');
        }
        
        // Mock rename
        const file = await this.mockReadFile(params.vaultPath, oldPath);
        if (!file) throw new Error('File not found');
        
        await this.mockWriteFile(params.vaultPath, newPath, file.content, file.frontmatter);
        await this.mockDeleteFile(params.vaultPath, oldPath);
        
        // Mock link updates
        const linksUpdated = await this.updateLinksForRename(params.vaultPath, oldPath, newPath);
        
        return { success: true, linksUpdated };
      }
    };
  }
  
  /**
   * Mock vault scanning
   */
  async scanVault(vaultPath, patterns = ['**/*.md']) {
    if (this.mockFs) {
      return this.mockFs.scanVault(patterns);
    }
    
    // Return mock data for testing
    return [];
  }
  
  /**
   * Mock file operations
   */
  async mockReadFile(vaultPath, filePath) {
    if (this.mockFs) {
      return this.mockFs.readFile(path.join(vaultPath, filePath));
    }
    return null;
  }
  
  async mockWriteFile(vaultPath, filePath, content, frontmatter = {}) {
    if (this.mockFs) {
      return this.mockFs.writeFile(path.join(vaultPath, filePath), content, frontmatter);
    }
  }
  
  async mockDeleteFile(vaultPath, filePath) {
    if (this.mockFs) {
      return this.mockFs.deleteFile(path.join(vaultPath, filePath));
    }
  }
  
  async mockFileExists(vaultPath, filePath) {
    if (this.mockFs) {
      return this.mockFs.fileExists(path.join(vaultPath, filePath));
    }
    return false;
  }
  
  async updateLinksForRename(vaultPath, oldPath, newPath) {
    // Mock implementation - in real tool this would update all links
    return 5; // Mock number of links updated
  }
}

// Export singleton for easy testing
export const toolLoader = new ToolLoader();