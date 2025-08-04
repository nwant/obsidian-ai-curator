/**
 * Search operations handler for MCP server
 * Handles content search, metadata queries, and Dataview operations
 */

import path from 'path';
import fs from 'fs/promises';
import matter from 'gray-matter';
import { DataviewRenderer } from '../dataview/renderer.js';

export class SearchHandler {
  constructor(config, cache, apiClient) {
    this.config = config;
    this.cache = cache;
    this.apiClient = apiClient;
    this.dataviewRenderer = new DataviewRenderer(config, cache);
  }

  /**
   * Search for content across all notes
   */
  async searchContent({ query, maxResults = 50, contextLines = 2 }) {
    try {
      // Try API first for better performance
      if (this.apiClient.isConnected()) {
        try {
          const result = await this.apiClient.request('search/content', {
            query,
            maxResults,
            contextLines
          });
          
          if (result.success) {
            return result.data;
          }
        } catch (apiError) {
          console.error('API search failed, falling back to file system:', apiError.message);
        }
      }

      // Fallback to file system search
      const vaultStructure = await this.cache.getVaultStructure();
      const mdFiles = vaultStructure.files.filter(f => f.path.endsWith('.md'));
      
      const matches = [];
      let totalMatches = 0;
      
      // Create regex for search
      const searchRegex = new RegExp(query, 'gi');
      
      for (const file of mdFiles) {
        if (matches.length >= maxResults) break;
        
        try {
          const fileData = await this.cache.getFileContent(file.path);
          const content = fileData.content || fileData;
          const lines = content.split('\n');
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (searchRegex.test(line)) {
              totalMatches++;
              
              if (matches.length < maxResults) {
                // Get context lines
                const contextStart = Math.max(0, i - contextLines);
                const contextEnd = Math.min(lines.length - 1, i + contextLines);
                const context = lines.slice(contextStart, contextEnd + 1);
                
                matches.push({
                  file: file.path,
                  line: i + 1,
                  content: line,
                  context: {
                    before: lines.slice(Math.max(0, i - contextLines), i).join('\n'),
                    after: lines.slice(i + 1, Math.min(lines.length, i + contextLines + 1)).join('\n'),
                    full: context.join('\n')
                  },
                  contextRange: {
                    start: contextStart + 1,
                    end: contextEnd + 1
                  }
                });
              }
            }
          }
        } catch (error) {
          console.error(`Error searching ${file.path}:`, error.message);
        }
      }
      
      return {
        query,
        matches,
        totalMatches,
        searchedFiles: mdFiles.length
      };
    } catch (error) {
      console.error('Search error:', error);
      throw error;
    }
  }

  /**
   * Find notes by metadata criteria
   */
  async findByMetadata({ frontmatter, minWords, maxWords, modifiedAfter, modifiedBefore }) {
    try {
      const vaultStructure = await this.cache.getVaultStructure();
      const mdFiles = vaultStructure.files.filter(f => f.path.endsWith('.md'));
      
      const matchingFiles = [];
      
      for (const file of mdFiles) {
        try {
          // Check date filters first (faster)
          if (modifiedAfter || modifiedBefore) {
            const mtime = new Date(file.mtime);
            if (modifiedAfter && mtime < new Date(modifiedAfter)) continue;
            if (modifiedBefore && mtime > new Date(modifiedBefore)) continue;
          }
          
          const content = await this.cache.getFileContent(file.path);
          const parsed = matter(content);
          
          // Check word count filters
          if (minWords || maxWords) {
            const wordCount = parsed.content.split(/\s+/).filter(w => w.length > 0).length;
            if (minWords && wordCount < minWords) continue;
            if (maxWords && wordCount > maxWords) continue;
          }
          
          // Check frontmatter criteria
          if (frontmatter && !this.matchesFrontmatterCriteria(parsed.data, frontmatter)) {
            continue;
          }
          
          matchingFiles.push({
            path: file.path,
            frontmatter: parsed.data,
            modified: new Date(file.mtime).toISOString(),
            size: file.size
          });
        } catch (error) {
          console.error(`Error checking ${file.path}:`, error.message);
        }
      }
      
      return {
        files: matchingFiles,
        total: matchingFiles.length
      };
    } catch (error) {
      console.error('Metadata search error:', error);
      throw error;
    }
  }

  /**
   * Execute a Dataview query
   */
  async queryDataview({ query, renderMode = 'smart', contextPath = '' }) {
    try {
      // Execute the query directly
      const results = await this.dataviewRenderer.executeQuery(query, contextPath);
      
      return {
        query,
        results,
        renderMode,
        rendered: this.dataviewRenderer.renderResults(results, renderMode),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Dataview query error:', error);
      return {
        query,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Check if frontmatter matches search criteria
   */
  matchesFrontmatterCriteria(data, criteria) {
    for (const [key, value] of Object.entries(criteria)) {
      // Handle special operators
      if (typeof value === 'object' && value !== null) {
        if ('$exists' in value) {
          if (value.$exists && !(key in data)) return false;
          if (!value.$exists && (key in data)) return false;
        }
        if ('$in' in value) {
          const dataValue = data[key];
          if (!dataValue) return false;
          if (Array.isArray(dataValue)) {
            if (!value.$in.some(v => dataValue.includes(v))) return false;
          } else {
            if (!value.$in.includes(dataValue)) return false;
          }
        }
        if ('$regex' in value) {
          const dataValue = data[key];
          if (!dataValue) return false;
          const regex = new RegExp(value.$regex, 'i');
          if (!regex.test(String(dataValue))) return false;
        }
        if ('$gt' in value || '$gte' in value || '$lt' in value || '$lte' in value) {
          const dataValue = data[key];
          if (!dataValue) return false;
          const numValue = typeof dataValue === 'number' ? dataValue : Date.parse(dataValue);
          if (isNaN(numValue)) return false;
          
          if ('$gt' in value && numValue <= value.$gt) return false;
          if ('$gte' in value && numValue < value.$gte) return false;
          if ('$lt' in value && numValue >= value.$lt) return false;
          if ('$lte' in value && numValue > value.$lte) return false;
        }
      } else {
        // Simple equality check
        if (data[key] !== value) return false;
      }
    }
    
    return true;
  }
  
  /**
   * Execute a Dataview query
   */
  async queryDataview({ query, contextPath, renderMode = 'smart' }) {
    try {
      // Parse the query type
      const queryUpper = query.trim().toUpperCase();
      let type = 'unknown';
      
      if (queryUpper.startsWith('TABLE')) {
        type = 'table';
      } else if (queryUpper.startsWith('LIST')) {
        type = 'list';
      } else if (queryUpper.startsWith('TASK')) {
        type = 'task';
      }
      
      // Get all vault files for query
      const vaultStructure = await this.cache.getVaultStructure();
      const files = [];
      
      for (const file of vaultStructure.files) {
        try {
          const content = await this.cache.getFileContent(file.path);
          const parsed = matter(content.content);
          files.push({
            path: file.path,
            frontmatter: parsed.data,
            content: parsed.content
          });
        } catch (error) {
          // Skip files that can't be read
        }
      }
      
      // Execute the query using the dataview renderer
      let result;
      if (type === 'table') {
        result = await this.dataviewRenderer.renderTableQuery(query, files, renderMode);
      } else {
        result = await this.dataviewRenderer.renderQuery(query);
      }
      
      // Format the response
      if (typeof result === 'object' && result.type) {
        // Result is already structured
        return {
          type: result.type,
          renderMode: result.renderMode || renderMode,
          headers: result.headers || [],
          rows: result.rows || [],
          count: result.total || (result.rows ? result.rows.length : 0)
        };
      } else if (typeof result === 'string') {
        // Parse the rendered result to extract structure
        const lines = result.split('\n');
        const headers = [];
        const rows = [];
        
        // Extract headers from table
        if (lines[0] && lines[0].startsWith('|')) {
          const headerLine = lines[0];
          headers.push(...headerLine.split('|').filter(h => h.trim()).map(h => h.trim()));
          
          // Extract rows
          for (let i = 2; i < lines.length; i++) {
            if (lines[i].startsWith('|')) {
              const values = lines[i].split('|').filter(v => v.trim()).map(v => v.trim());
              if (values.length > 0) {
                const row = {};
                headers.forEach((h, idx) => {
                  row[h] = values[idx] || '';
                });
                rows.push(row);
              }
            }
          }
        }
        
        return {
          type,
          renderMode,
          headers,
          rows,
          rendered: result,
          count: rows.length
        };
      }
      
      return {
        type,
        renderMode,
        headers: [],
        rows: [],
        result
      };
    } catch (error) {
      return {
        type: 'error',
        error: error.message
      };
    }
  }
}