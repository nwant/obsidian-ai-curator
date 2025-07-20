#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import simpleGit from 'simple-git';
import { z } from 'zod';
import { benchmarkTool } from './tools/benchmark.js';
import { AutoMetricsCollector } from './metrics/auto-collector.js';
import { VaultCache } from './cache/vault-cache.js';
import { DataviewRenderer } from './dataview/renderer.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'config.json');
let config = { vaultPath: '', ignorePatterns: [] };

async function loadConfig() {
  try {
    const configData = await fs.readFile(CONFIG_PATH, 'utf-8');
    config = JSON.parse(configData);
  } catch (error) {
    console.warn('Config not found, using environment variables');
    config.vaultPath = process.env.OBSIDIAN_VAULT_PATH || '';
  }
  return config;
}

// Load config initially
await loadConfig();

const git = simpleGit(config.vaultPath);

class SimpleVaultServer {
  constructor() {
    this.server = new Server(
      { name: 'obsidian-vault-simple', version: '2.0.0' },
      { capabilities: { tools: {} } }
    );
    this.metricsCollector = new AutoMetricsCollector(config);
    this.cache = new VaultCache(config);
    this.dataviewRenderer = new DataviewRenderer(config, this.cache);
    this.setupHandlers();
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'vault_scan',
          description: 'Scan vault for files with basic statistics',
          inputSchema: {
            type: 'object',
            properties: {
              patterns: { 
                type: 'array', 
                items: { type: 'string' },
                description: 'Glob patterns to match (default: ["**/*.md"])'
              },
              includeStats: {
                type: 'boolean',
                description: 'Include word count and size stats'
              },
              includePreview: {
                type: 'boolean',
                description: 'Include content preview (first 200 chars)'
              },
              includeFrontmatter: {
                type: 'boolean',
                description: 'Include frontmatter fields'
              },
              sortBy: {
                type: 'string',
                enum: ['modified', 'path', 'size'],
                description: 'Sort results by field (default: modified)'
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results to return'
              },
              useCache: {
                type: 'boolean',
                description: 'Use cached results if available (default: true)'
              }
            }
          }
        },
        {
          name: 'read_notes',
          description: 'Read multiple notes with full content and metadata',
          inputSchema: {
            type: 'object',
            properties: {
              paths: {
                type: 'array',
                items: { type: 'string' },
                description: 'Note paths relative to vault'
              },
              renderDataview: {
                type: 'boolean',
                description: 'Render Dataview queries to show actual data (default: false)'
              },
              dataviewMode: {
                type: 'string',
                enum: ['smart', 'summary', 'count', 'table', 'compact'],
                description: 'Dataview rendering mode: smart (auto-decide), summary (grouped counts), count (totals only), table (full), compact (limited rows). Default: smart'
              }
            },
            required: ['paths']
          }
        },
        {
          name: 'write_note',
          description: 'Write or update a note',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Note path relative to vault' },
              content: { type: 'string', description: 'Full note content' }
            },
            required: ['path', 'content']
          }
        },
        {
          name: 'archive_notes',
          description: 'Move notes to archive locations',
          inputSchema: {
            type: 'object',
            properties: {
              moves: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    from: { type: 'string' },
                    to: { type: 'string' }
                  },
                  required: ['from', 'to']
                }
              }
            },
            required: ['moves']
          }
        },
        {
          name: 'search_content',
          description: 'Search for content across all notes',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              maxResults: { type: 'number', description: 'Maximum results to return' },
              contextLines: { type: 'number', description: 'Lines of context around match' }
            },
            required: ['query']
          }
        },
        {
          name: 'find_by_metadata',
          description: 'Find notes by frontmatter or file properties. Supports advanced queries like missing fields, empty values, regex, and ranges',
          inputSchema: {
            type: 'object',
            properties: {
              frontmatter: { 
                type: 'object', 
                description: 'Frontmatter queries. Special operators: $exists (boolean), $empty (boolean), $regex (string), $not (any), $gt/$gte/$lt/$lte (number/date), $in (array)'
              },
              minWords: { type: 'number', description: 'Minimum word count' },
              maxWords: { type: 'number', description: 'Maximum word count' },
              modifiedAfter: { type: 'string', description: 'ISO date string' },
              modifiedBefore: { type: 'string', description: 'ISO date string' }
            }
          }
        },
        {
          name: 'git_checkpoint',
          description: 'Create a git commit checkpoint',
          inputSchema: {
            type: 'object',
            properties: {
              message: { type: 'string', description: 'Commit message' }
            },
            required: ['message']
          }
        },
        {
          name: 'git_changes',
          description: 'Get changed files since a commit',
          inputSchema: {
            type: 'object',
            properties: {
              since: { type: 'string', description: 'Commit hash or "HEAD"' }
            }
          }
        },
        {
          name: 'git_rollback',
          description: 'Rollback to a previous commit',
          inputSchema: {
            type: 'object',
            properties: {
              commit: { type: 'string', description: 'Commit hash to rollback to' }
            },
            required: ['commit']
          }
        },
        {
          name: 'get_research_context',
          description: 'Get AI research partner context and interaction guidelines',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'get_working_context',
          description: 'Load focused context for specific work (project, topic, or recent files)',
          inputSchema: {
            type: 'object',
            properties: {
              scope: {
                type: 'string',
                enum: ['project', 'topic', 'recent', 'linked'],
                description: 'Type of context to load'
              },
              identifier: {
                type: 'string',
                description: 'Project name, topic, or note path (depends on scope)'
              },
              maxNotes: {
                type: 'number',
                description: 'Maximum number of notes to return (default: 10)'
              },
              depth: {
                type: 'string',
                enum: ['preview', 'summary', 'full'],
                description: 'Level of detail to return (default: preview)'
              },
              useCache: {
                type: 'boolean',
                description: 'Use cached results if available (default: true)'
              }
            },
            required: ['scope']
          }
        },
        {
          name: benchmarkTool.name,
          description: benchmarkTool.description,
          inputSchema: benchmarkTool.parameters
        },
        {
          name: 'view_search_metrics',
          description: 'View automatically collected search performance metrics',
          inputSchema: {
            type: 'object',
            properties: {
              timeWindow: {
                type: 'number',
                description: 'Time window in hours (default: 24)'
              },
              exportReport: {
                type: 'boolean',
                description: 'Export daily report to vault'
              }
            }
          }
        },
        {
          name: 'query_dataview',
          description: 'Execute a Dataview query directly without reading entire notes. Efficient for specific data retrieval.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Dataview query (e.g., TABLE status, created FROM "Records" WHERE type = "decision")'
              },
              renderMode: {
                type: 'string',
                enum: ['smart', 'summary', 'count', 'table', 'compact'],
                description: 'Rendering mode: smart (auto), summary (grouped), count (totals), table (full), compact (limited). Default: smart'
              },
              contextPath: {
                type: 'string',
                description: 'Context path for relative queries (optional)'
              }
            },
            required: ['query']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'vault_scan':
            return await this.metricsCollector.trackSearchOperation(
              'vault_scan', args, () => this.vaultScan(args)
            );
          case 'read_notes':
            return await this.readNotes(args);
          case 'write_note':
            return await this.writeNote(args);
          case 'archive_notes':
            return await this.archiveNotes(args);
          case 'search_content':
            return await this.metricsCollector.trackSearchOperation(
              'search_content', args, () => this.searchContent(args)
            );
          case 'find_by_metadata':
            return await this.metricsCollector.trackSearchOperation(
              'find_by_metadata', args, () => this.findByMetadata(args)
            );
          case 'git_checkpoint':
            return await this.gitCheckpoint(args);
          case 'git_changes':
            return await this.gitChanges(args);
          case 'git_rollback':
            return await this.gitRollback(args);
          case 'get_research_context':
            return await this.getResearchContext(args);
          case 'get_working_context':
            return await this.metricsCollector.trackSearchOperation(
              'get_working_context', args, () => this.getWorkingContext(args)
            );
          case 'run_benchmark':
            return await benchmarkTool.execute(args, this, config);
          case 'view_search_metrics':
            return await this.viewSearchMetrics(args);
          case 'query_dataview':
            return await this.queryDataview(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [{ 
            type: 'text', 
            text: JSON.stringify({ error: error.message }, null, 2) 
          }]
        };
      }
    });
  }

  async vaultScan({ 
    patterns = ['**/*.md'], 
    includeStats = false,
    includePreview = false,
    includeFrontmatter = false,
    sortBy = 'modified',
    limit,
    useCache = true 
  }) {
    const startTime = Date.now();
    
    // Get files from cache or scan
    let files = useCache 
      ? await this.cache.getVaultStructure()
      : await this.cache.getVaultStructure(true);
    
    // Sort files
    files.sort((a, b) => {
      switch (sortBy) {
        case 'modified':
          return new Date(b.modified).getTime() - new Date(a.modified).getTime();
        case 'size':
          return b.size - a.size;
        case 'path':
          return a.path.localeCompare(b.path);
        default:
          return 0;
      }
    });
    
    // Apply limit if specified
    if (limit && limit > 0) {
      files = files.slice(0, limit);
    }
    
    // Enhance with additional data if requested
    const enhancedFiles = await Promise.all(files.map(async (fileInfo) => {
      const result = { ...fileInfo };
      
      if (includeStats || includePreview || includeFrontmatter) {
        try {
          const cached = await this.cache.getFileContent(fileInfo.path);
          const { data: frontmatter, content: body } = matter(cached.content);
          
          if (includeStats) {
            result.wordCount = body.split(/\s+/).filter(w => w.length > 0).length;
          }
          
          if (includePreview) {
            result.preview = cached.preview;
          }
          
          if (includeFrontmatter && Object.keys(frontmatter).length > 0) {
            result.frontmatter = frontmatter;
          }
          
          // Always include basic metadata for better context
          const tagMatches = body.match(/#[\w-]+/g) || [];
          const linkMatches = body.match(/\[\[([^\]]+)\]\]/g) || [];
          
          result.tags = [...new Set(tagMatches)];
          result.linkCount = linkMatches.length;
          
        } catch (error) {
          console.error(`Error processing ${fileInfo.path}:`, error);
        }
      }
      
      return result;
    }));
    
    const duration = Date.now() - startTime;
    const cacheStats = this.cache.getStats();
    
    return { 
      content: [{ 
        type: 'text', 
        text: JSON.stringify({ 
          files: enhancedFiles,
          stats: {
            totalFiles: enhancedFiles.length,
            scanDuration: duration,
            cacheHit: useCache && cacheStats.cacheAge > 0,
            cacheAge: cacheStats.cacheAge
          }
        }, null, 2) 
      }] 
    };
  }

  async readNotes({ paths, renderDataview = false, dataviewMode = 'smart' }) {
    const notes = await Promise.all(paths.map(async (notePath) => {
      const fullPath = path.join(config.vaultPath, notePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      const { data: frontmatter, content: body } = matter(content);
      
      const headings = [];
      const links = [];
      
      // Extract headings
      const headingMatches = body.matchAll(/^#{1,6}\s+(.+)$/gm);
      for (const match of headingMatches) {
        headings.push(match[1]);
      }
      
      // Extract links
      const linkMatches = body.matchAll(/\[\[([^\]]+)\]\]/g);
      for (const match of linkMatches) {
        links.push(match[1]);
      }
      
      // Render Dataview queries if requested
      let processedBody = body;
      if (renderDataview) {
        try {
          processedBody = await this.dataviewRenderer.renderDataviewBlocks(body, notePath, dataviewMode);
        } catch (error) {
          console.error(`Failed to render Dataview for ${notePath}:`, error);
        }
      }
      
      // Reconstruct content with potentially rendered Dataview
      const finalContent = renderDataview && processedBody !== body
        ? matter.stringify(processedBody, frontmatter)
        : content;
      
      return {
        path: notePath,
        content: finalContent,
        frontmatter,
        headings,
        links
      };
    }));
    
    return { content: [{ type: 'text', text: JSON.stringify({ notes }, null, 2) }] };
  }

  async writeNote({ path: notePath, content }) {
    const fullPath = path.join(config.vaultPath, notePath);
    const dir = path.dirname(fullPath);
    
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
    
    return { 
      content: [{ 
        type: 'text', 
        text: JSON.stringify({ success: true, path: notePath }, null, 2) 
      }] 
    };
  }

  async archiveNotes({ moves }) {
    const results = await Promise.all(moves.map(async ({ from, to }) => {
      try {
        const fromPath = path.join(config.vaultPath, from);
        const toPath = path.join(config.vaultPath, to);
        const toDir = path.dirname(toPath);
        
        await fs.mkdir(toDir, { recursive: true });
        await fs.rename(fromPath, toPath);
        
        return { from, to, success: true };
      } catch (error) {
        return { from, to, success: false, error: error.message };
      }
    }));
    
    return { content: [{ type: 'text', text: JSON.stringify({ results }, null, 2) }] };
  }

  async searchContent({ query, maxResults = 50, contextLines = 2 }) {
    const matches = [];
    
    const searchDir = async (dir, baseDir = '') => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (matches.length >= maxResults) break;
        
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.join(baseDir, entry.name);
        
        if (entry.isDirectory() && !this.shouldIgnore(entry.name)) {
          await searchDir(fullPath, relativePath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          const content = await fs.readFile(fullPath, 'utf-8');
          const lines = content.split('\n');
          
          lines.forEach((line, i) => {
            if (line.toLowerCase().includes(query.toLowerCase())) {
              const start = Math.max(0, i - contextLines);
              const end = Math.min(lines.length, i + contextLines + 1);
              
              matches.push({
                path: relativePath,
                line: i + 1,
                match: line,
                context: lines.slice(start, end).join('\n')
              });
            }
          });
        }
      }
    };
    
    await searchDir(config.vaultPath);
    return { content: [{ type: 'text', text: JSON.stringify({ matches }, null, 2) }] };
  }

  async findByMetadata({ frontmatter, minWords, maxWords, modifiedAfter, modifiedBefore }) {
    const matchingPaths = [];
    
    const searchDir = async (dir, baseDir = '') => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.join(baseDir, entry.name);
        
        if (entry.isDirectory() && !this.shouldIgnore(entry.name)) {
          await searchDir(fullPath, relativePath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          const content = await fs.readFile(fullPath, 'utf-8');
          const { data } = matter(content);
          const stats = await fs.stat(fullPath);
          
          let matches = true;
          
          // Check frontmatter
          if (frontmatter) {
            for (const [key, value] of Object.entries(frontmatter)) {
              const dataValue = data[key];
              
              // Handle special operators
              if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                // Check for operator queries
                if ('$exists' in value) {
                  const exists = dataValue !== undefined;
                  if (exists !== value.$exists) {
                    matches = false;
                    break;
                  }
                  continue;
                }
                
                if ('$empty' in value) {
                  const isEmpty = dataValue === '' || dataValue === null || 
                                (Array.isArray(dataValue) && dataValue.length === 0);
                  if (isEmpty !== value.$empty) {
                    matches = false;
                    break;
                  }
                  continue;
                }
                
                if ('$regex' in value && typeof dataValue === 'string') {
                  const regex = new RegExp(value.$regex, value.$flags || 'i');
                  if (!regex.test(dataValue)) {
                    matches = false;
                    break;
                  }
                  continue;
                }
                
                if ('$not' in value) {
                  const notValue = value.$not;
                  if (JSON.stringify(dataValue) === JSON.stringify(notValue)) {
                    matches = false;
                    break;
                  }
                  continue;
                }
                
                if ('$in' in value && Array.isArray(value.$in)) {
                  if (!value.$in.includes(dataValue)) {
                    matches = false;
                    break;
                  }
                  continue;
                }
                
                // Range operators for numbers and dates
                if (typeof dataValue === 'number' || dataValue instanceof Date || 
                    (typeof dataValue === 'string' && !isNaN(Date.parse(dataValue)))) {
                  const numValue = typeof dataValue === 'number' ? dataValue : new Date(dataValue).getTime();
                  
                  if ('$gt' in value && numValue <= (typeof value.$gt === 'number' ? value.$gt : new Date(value.$gt).getTime())) {
                    matches = false;
                    break;
                  }
                  if ('$gte' in value && numValue < (typeof value.$gte === 'number' ? value.$gte : new Date(value.$gte).getTime())) {
                    matches = false;
                    break;
                  }
                  if ('$lt' in value && numValue >= (typeof value.$lt === 'number' ? value.$lt : new Date(value.$lt).getTime())) {
                    matches = false;
                    break;
                  }
                  if ('$lte' in value && numValue > (typeof value.$lte === 'number' ? value.$lte : new Date(value.$lte).getTime())) {
                    matches = false;
                    break;
                  }
                  continue;
                }
              }
              
              // Regular value matching (backward compatibility)
              else {
                // Check if value exists in data
                if (dataValue === undefined) {
                  matches = false;
                  break;
                }
                
                // Handle array includes
                if (Array.isArray(dataValue) && !Array.isArray(value)) {
                  if (!dataValue.includes(value)) {
                    matches = false;
                    break;
                  }
                }
                // Handle string partial matches (case-insensitive)
                else if (typeof dataValue === 'string' && typeof value === 'string') {
                  if (!dataValue.toLowerCase().includes(value.toLowerCase())) {
                    matches = false;
                    break;
                  }
                }
                // Handle exact match for other types
                else if (JSON.stringify(dataValue) !== JSON.stringify(value)) {
                  matches = false;
                  break;
                }
              }
            }
          }
          
          // Check word count
          if (matches && (minWords || maxWords)) {
            const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
            if (minWords && wordCount < minWords) matches = false;
            if (maxWords && wordCount > maxWords) matches = false;
          }
          
          // Check modified date
          if (matches && modifiedAfter) {
            if (stats.mtime < new Date(modifiedAfter)) matches = false;
          }
          
          if (matches && modifiedBefore) {
            if (stats.mtime > new Date(modifiedBefore)) matches = false;
          }
          
          if (matches) {
            matchingPaths.push(relativePath);
          }
        }
      }
    };
    
    await searchDir(config.vaultPath);
    
    // Include more details in response for debugging
    const response = {
      paths: matchingPaths,
      query: {
        frontmatter: frontmatter || null,
        minWords: minWords || null,
        maxWords: maxWords || null,
        modifiedAfter: modifiedAfter || null,
        modifiedBefore: modifiedBefore || null
      },
      totalScanned: 0,
      matched: matchingPaths.length
    };
    
    return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
  }

  async gitCheckpoint({ message }) {
    await git.add('.');
    const commit = await git.commit(message);
    return { 
      content: [{ 
        type: 'text', 
        text: JSON.stringify({ commit: commit.commit }, null, 2) 
      }] 
    };
  }

  async gitChanges({ since = 'HEAD' }) {
    const diff = await git.diff([since, '--name-status']);
    const changes = { added: [], modified: [], deleted: [] };
    
    diff.split('\n').filter(line => line).forEach(line => {
      const [status, file] = line.split('\t');
      if (status === 'A') changes.added.push(file);
      else if (status === 'M') changes.modified.push(file);
      else if (status === 'D') changes.deleted.push(file);
    });
    
    return { content: [{ type: 'text', text: JSON.stringify(changes, null, 2) }] };
  }

  async gitRollback({ commit }) {
    await git.reset(['--hard', commit]);
    return { 
      content: [{ 
        type: 'text', 
        text: JSON.stringify({ success: true }, null, 2) 
      }] 
    };
  }

  async getResearchContext() {
    try {
      // Reload config to get latest changes
      await loadConfig();
      
      // Use configured context or default
      const defaultContext = {
        "description": "Default research context - configure in config.json",
        "context_documents": {},
        "system_capabilities": { 
          "atomic_records": true, 
          "autonomous_operation": false 
        }
      };
      
      const context = config.researchContext || defaultContext;
    
    // If context documents are configured, read their contents
    if (context.contextDocuments) {
      const documents = {};
      
      for (const [key, docPath] of Object.entries(context.contextDocuments)) {
        try {
          // Remove leading slash if present for relative paths
          const cleanPath = docPath.startsWith('/') ? docPath.substring(1) : docPath;
          
          // Build full path
          const fullPath = path.join(config.vaultPath, cleanPath);
          
          // Check if file exists using fs.stat instead of fs.access for better error info
          try {
            await fs.stat(fullPath);
            const content = await fs.readFile(fullPath, 'utf-8');
            documents[key] = {
              path: docPath,
              content: content
            };
          } catch (statError) {
            documents[key] = {
              path: docPath,
              error: `File not found: ${fullPath} (${statError.code})`
            };
          }
        } catch (error) {
          documents[key] = {
            path: docPath,
            error: error.message
          };
        }
      }
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...context,
            contextDocuments: documents,
            vaultPath: config.vaultPath
          }, null, 2)
        }]
      };
    }
    
    return { 
      content: [{ 
        type: 'text', 
        text: JSON.stringify(context, null, 2) 
      }] 
    };
    } catch (error) {
      console.error('Error in getResearchContext:', error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: error.message,
            description: "Failed to load research context"
          }, null, 2)
        }]
      };
    }
  }

  async getWorkingContext({ 
    scope, 
    identifier = '', 
    maxNotes = 10, 
    depth = 'preview',
    useCache = true 
  }) {
    // Use cache if available
    const cacheKey = { scope, identifier, maxNotes, depth };
    
    if (useCache) {
      const cached = await this.cache.getContext(cacheKey, async () => {
        return await this.computeWorkingContext(scope, identifier, maxNotes, depth);
      });
      return cached;
    }
    
    const result = await this.computeWorkingContext(scope, identifier, maxNotes, depth);
    return result;
  }

  async computeWorkingContext(scope, identifier, maxNotes, depth) {
    const files = await this.cache.getVaultStructure();
    let selectedFiles = [];
    
    switch (scope) {
      case 'recent':
        // Get most recently modified files
        selectedFiles = files
          .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())
          .slice(0, maxNotes);
        break;
        
      case 'project':
        // Find all files related to a project
        selectedFiles = await this.findProjectFiles(files, identifier, maxNotes);
        break;
        
      case 'topic':
        // Find files related to a topic
        selectedFiles = await this.findTopicFiles(files, identifier, maxNotes);
        break;
        
      case 'linked':
        // Find files linked from a specific note
        selectedFiles = await this.findLinkedFiles(files, identifier, maxNotes);
        break;
        
      default:
        throw new Error(`Unknown scope: ${scope}`);
    }
    
    // Load content based on depth
    const notes = await Promise.all(selectedFiles.map(async (file) => {
      const cached = await this.cache.getFileContent(file.path);
      const { data: frontmatter, content: body } = matter(cached.content);
      
      let result = {
        path: file.path,
        modified: file.modified,
        frontmatter
      };
      
      switch (depth) {
        case 'preview':
          result.preview = cached.preview;
          break;
        case 'summary':
          // Extract first paragraph and headings
          const headings = body.match(/^#{1,6}\s+(.+)$/gm) || [];
          result.summary = {
            preview: cached.preview,
            headings: headings.map(h => h.replace(/^#+\s+/, '')),
            wordCount: body.split(/\s+/).filter(w => w.length > 0).length
          };
          break;
        case 'full':
          result.content = body;
          break;
      }
      
      return result;
    }));
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          scope,
          identifier,
          notes,
          totalFound: selectedFiles.length,
          returned: notes.length
        }, null, 2)
      }]
    };
  }

  async findProjectFiles(files, projectName, maxNotes) {
    // Find files that mention the project or are in project folder
    const projectPattern = projectName.toLowerCase();
    const matchingFiles = [];
    
    for (const file of files) {
      try {
        const cached = await this.cache.getFileContent(file.path);
        const { data: frontmatter, content: body } = matter(cached.content);
        
        // Check if file is related to project
        const inProjectFolder = file.path.toLowerCase().includes(projectPattern);
        const mentionsProject = body.toLowerCase().includes(projectPattern);
        const taggedWithProject = frontmatter.tags && 
          frontmatter.tags.some(tag => tag.toLowerCase().includes(projectPattern));
        const relatedToProject = frontmatter.related && 
          frontmatter.related.some(rel => rel.toLowerCase().includes(projectPattern));
        
        if (inProjectFolder || mentionsProject || taggedWithProject || relatedToProject) {
          matchingFiles.push({
            ...file,
            relevance: (inProjectFolder ? 3 : 0) + 
                      (taggedWithProject ? 2 : 0) + 
                      (relatedToProject ? 2 : 0) +
                      (mentionsProject ? 1 : 0)
          });
        }
      } catch (error) {
        console.error(`Error checking ${file.path}:`, error);
      }
    }
    
    // Sort by relevance and recency
    return matchingFiles
      .sort((a, b) => {
        if (b.relevance !== a.relevance) return b.relevance - a.relevance;
        return new Date(b.modified).getTime() - new Date(a.modified).getTime();
      })
      .slice(0, maxNotes);
  }

  async findTopicFiles(files, topic, maxNotes) {
    // Similar to project but focuses on content matching
    const topicPattern = topic.toLowerCase();
    const matchingFiles = [];
    
    for (const file of files) {
      try {
        const cached = await this.cache.getFileContent(file.path);
        const { data: frontmatter, content: body } = matter(cached.content);
        
        // Count occurrences of topic
        const contentMatches = (body.toLowerCase().match(new RegExp(topicPattern, 'g')) || []).length;
        
        if (contentMatches > 0) {
          matchingFiles.push({
            ...file,
            relevance: contentMatches
          });
        }
      } catch (error) {
        console.error(`Error checking ${file.path}:`, error);
      }
    }
    
    return matchingFiles
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, maxNotes);
  }

  async findLinkedFiles(files, notePath, maxNotes) {
    // Find files linked from the specified note
    const noteContent = await this.cache.getFileContent(notePath);
    const linkMatches = noteContent.content.matchAll(/\[\[([^\]]+)\]\]/g);
    const linkedPaths = new Set();
    
    for (const match of linkMatches) {
      const linkPath = match[1];
      // Handle both full paths and note names
      const matchingFile = files.find(f => 
        f.path === linkPath + '.md' || 
        f.path.endsWith('/' + linkPath + '.md') ||
        f.path === linkPath
      );
      
      if (matchingFile) {
        linkedPaths.add(matchingFile.path);
      }
    }
    
    return files
      .filter(f => linkedPaths.has(f.path))
      .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())
      .slice(0, maxNotes);
  }

  shouldIgnore(name) {
    const ignorePatterns = ['.git', '.obsidian', '_archived', ...config.ignorePatterns];
    return ignorePatterns.includes(name);
  }

  async callTool(request) {
    // Method to allow benchmark runner to call other tools
    const { name, arguments: args } = request.params;
    
    switch (name) {
      case 'vault_scan':
        return await this.metricsCollector.trackSearchOperation(
          'vault_scan', args, () => this.vaultScan(args)
        );
      case 'read_notes':
        return await this.readNotes(args);
      case 'write_note':
        return await this.writeNote(args);
      case 'archive_notes':
        return await this.archiveNotes(args);
      case 'search_content':
        return await this.metricsCollector.trackSearchOperation(
          'search_content', args, () => this.searchContent(args)
        );
      case 'find_by_metadata':
        return await this.metricsCollector.trackSearchOperation(
          'find_by_metadata', args, () => this.findByMetadata(args)
        );
      case 'git_checkpoint':
        return await this.gitCheckpoint(args);
      case 'git_changes':
        return await this.gitChanges(args);
      case 'git_rollback':
        return await this.gitRollback(args);
      case 'get_research_context':
        return await this.getResearchContext(args);
      case 'view_search_metrics':
        return await this.viewSearchMetrics(args);
      case 'query_dataview':
        return await this.queryDataview(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  async viewSearchMetrics({ timeWindow = 24, exportReport = false }) {
    const timeWindowMs = timeWindow * 60 * 60 * 1000;
    const metrics = this.metricsCollector.getAggregatedMetrics(timeWindowMs);
    
    let result = `# Search Performance Metrics\n\n`;
    result += `## Summary (${metrics.timeWindow})\n`;
    result += `- Total Operations: ${metrics.totalOperations}\n\n`;
    
    if (metrics.totalOperations === 0) {
      result += 'No search operations recorded in this time window.\n';
    } else {
      result += '## Performance by Tool\n';
      for (const [tool, stats] of Object.entries(metrics.byTool)) {
        result += `\n### ${tool}\n`;
        result += `- Total Calls: ${stats.count}\n`;
        result += `- Average Duration: ${stats.avgDuration.toFixed(2)}ms\n`;
        result += `- Success Rate: ${(stats.successRate * 100).toFixed(1)}%\n`;
        result += `- Average Results: ${stats.avgResultCount.toFixed(1)}\n`;
      }
    }
    
    if (exportReport) {
      const reportPath = await this.metricsCollector.exportDailyReport();
      result += `\n✅ Daily report exported to: ${reportPath}`;
    }
    
    return {
      content: [{
        type: 'text',
        text: result
      }]
    };
  }

  async queryDataview({ query, renderMode = 'smart', contextPath = '' }) {
    try {
      // Execute the query directly
      const results = await this.dataviewRenderer.executeQuery(query, contextPath);
      
      // Format results according to render mode
      const formatted = this.dataviewRenderer.formatResults(results, query, renderMode);
      
      return {
        content: [{
          type: 'text',
          text: formatted
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error executing Dataview query: ${error.message}\n\nQuery: ${query}`
        }]
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

const server = new SimpleVaultServer();
server.run().catch(console.error);