/**
 * Vault operations handler for MCP server
 * Handles vault scanning, reading, and basic file operations
 */

import path from 'path';
import fs from 'fs/promises';
import { glob } from 'glob';
import { minimatch } from 'minimatch';
import matter from 'gray-matter';

export class VaultHandler {
  constructor(config, cache, apiClient) {
    this.config = config;
    this.cache = cache;
    this.apiClient = apiClient;
  }

  /**
   * Scan vault for files with statistics
   */
  async scanVault({ 
    patterns = ['**/*.md'], 
    includeFrontmatter = false, 
    includePreview = false,
    includeStats = false,
    sortBy = 'modified',
    limit,
    useCache = true
  }) {
    try {
      // Check if we can use the API for better performance
      if (this.apiClient.isConnected()) {
        try {
          const result = await this.apiClient.request('vault/scan', {
            patterns,
            includeFrontmatter,
            includePreview,
            includeStats,
            sortBy,
            limit
          });
          
          if (result.success) {
            return result.data;
          }
        } catch (apiError) {
          console.error('API scan failed, falling back to file system:', apiError.message);
        }
      }

      // Get vault structure from cache if available
      const vaultStructure = await this.cache.getVaultStructure(!useCache);
      
      // Filter files based on patterns
      let files = vaultStructure.files;
      if (patterns && patterns.length > 0) {
        const matchPatterns = patterns.map(p => {
          // Convert simple extensions to glob patterns
          if (p.startsWith('*.')) {
            return `**/${p}`;
          }
          return p;
        });
        
        files = files.filter(file => {
          return matchPatterns.some(pattern => {
            const globPattern = pattern.replace(/\\/g, '/');
            return minimatch(file.path, globPattern, { nocase: true });
          });
        });
      }
      
      // Sort files
      if (sortBy === 'modified') {
        files.sort((a, b) => b.mtime - a.mtime);
      } else if (sortBy === 'path') {
        files.sort((a, b) => a.path.localeCompare(b.path));
      } else if (sortBy === 'size') {
        files.sort((a, b) => b.size - a.size);
      }
      
      // Apply limit
      if (limit && limit > 0) {
        files = files.slice(0, limit);
      }
      
      // Add optional data
      if (includeFrontmatter || includePreview || includeStats) {
        const enrichedFiles = await Promise.all(files.map(async (file) => {
          const enriched = { ...file };
          
          if (includeFrontmatter || includePreview || includeStats) {
            const fullPath = path.join(this.config.vaultPath, file.path);
            try {
              const content = await fs.readFile(fullPath, 'utf-8');
              const parsed = matter(content);
              
              if (includeFrontmatter) {
                enriched.frontmatter = parsed.data;
              }
              
              if (includePreview) {
                const textContent = parsed.content.trim();
                enriched.preview = textContent.substring(0, 200) + 
                  (textContent.length > 200 ? '...' : '');
              }
              
              if (includeStats) {
                const lines = parsed.content.split('\n');
                const words = parsed.content.split(/\s+/).filter(w => w.length > 0);
                enriched.stats = {
                  lines: lines.length,
                  words: words.length,
                  characters: parsed.content.length
                };
                // Add alias for test compatibility
                enriched.wordCount = words.length;
              }
            } catch (error) {
              console.error(`Error reading file ${file.path}:`, error.message);
            }
          }
          
          return enriched;
        }));
        
        return {
          files: enrichedFiles,
          total: enrichedFiles.length,
          timestamp: new Date().toISOString()
        };
      }
      
      return {
        files,
        total: files.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Vault scan error:', error);
      throw error;
    }
  }

  /**
   * Check if a file exists in the vault
   */
  async fileExists(filePath) {
    const fullPath = path.join(this.config.vaultPath, filePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get vault statistics
   */
  async getVaultStats() {
    const structure = await this.cache.getVaultStructure();
    
    const stats = {
      totalFiles: structure.files.length,
      totalSize: structure.files.reduce((sum, f) => sum + f.size, 0),
      fileTypes: {},
      largestFiles: structure.files
        .sort((a, b) => b.size - a.size)
        .slice(0, 10)
        .map(f => ({ path: f.path, size: f.size })),
      recentlyModified: structure.files
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 10)
        .map(f => ({ path: f.path, modified: new Date(f.mtime).toISOString() }))
    };

    // Count file types
    structure.files.forEach(file => {
      const ext = path.extname(file.path).toLowerCase() || 'no extension';
      stats.fileTypes[ext] = (stats.fileTypes[ext] || 0) + 1;
    });
    
    // Add oldest and newest file for test compatibility
    if (structure.files.length > 0) {
      const sortedByTime = structure.files.sort((a, b) => a.mtime - b.mtime);
      stats.oldestFile = {
        path: sortedByTime[0].path,
        modified: new Date(sortedByTime[0].mtime).toISOString()
      };
      stats.newestFile = {
        path: sortedByTime[sortedByTime.length - 1].path,
        modified: new Date(sortedByTime[sortedByTime.length - 1].mtime).toISOString()
      };
      
      // Also add largestFile for test compatibility
      if (stats.largestFiles.length > 0) {
        stats.largestFile = stats.largestFiles[0];
      }
    }

    return stats;
  }
}