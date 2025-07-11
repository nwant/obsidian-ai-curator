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

const CONFIG_PATH = path.join(process.cwd(), 'config', 'config.json');
let config = { vaultPath: '', ignorePatterns: [] };

try {
  const configData = await fs.readFile(CONFIG_PATH, 'utf-8');
  config = JSON.parse(configData);
} catch (error) {
  console.warn('Config not found, using environment variables');
  config.vaultPath = process.env.OBSIDIAN_VAULT_PATH || '';
}

const git = simpleGit(config.vaultPath);

class SimpleVaultServer {
  constructor() {
    this.server = new Server(
      { name: 'obsidian-vault-simple', version: '2.0.0' },
      { capabilities: { tools: {} } }
    );
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
          name: benchmarkTool.name,
          description: benchmarkTool.description,
          inputSchema: benchmarkTool.parameters
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'vault_scan':
            return await this.vaultScan(args);
          case 'read_notes':
            return await this.readNotes(args);
          case 'write_note':
            return await this.writeNote(args);
          case 'archive_notes':
            return await this.archiveNotes(args);
          case 'search_content':
            return await this.searchContent(args);
          case 'find_by_metadata':
            return await this.findByMetadata(args);
          case 'git_checkpoint':
            return await this.gitCheckpoint(args);
          case 'git_changes':
            return await this.gitChanges(args);
          case 'git_rollback':
            return await this.gitRollback(args);
          case 'get_research_context':
            return await this.getResearchContext(args);
          case 'run_benchmark':
            return await benchmarkTool.execute(args, this, config);
          default:
            throw new Error(`Unknown tool: ${name}`);
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

  async vaultScan({ patterns = ['**/*.md'], includeStats = false }) {
    const files = [];
    const scanDir = async (dir, baseDir = '') => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.join(baseDir, entry.name);
        
        if (entry.isDirectory() && !this.shouldIgnore(entry.name)) {
          await scanDir(fullPath, relativePath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          const stats = await fs.stat(fullPath);
          const fileInfo = {
            path: relativePath,
            size: stats.size,
            modified: stats.mtime.toISOString()
          };
          
          if (includeStats) {
            const content = await fs.readFile(fullPath, 'utf-8');
            fileInfo.wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
          }
          
          files.push(fileInfo);
        }
      }
    };
    
    await scanDir(config.vaultPath);
    return { content: [{ type: 'text', text: JSON.stringify({ files }, null, 2) }] };
  }

  async readNotes({ paths }) {
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
      
      return {
        path: notePath,
        content,
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
          // Check if it's a relative path within the vault
          const fullPath = path.isAbsolute(docPath) 
            ? docPath 
            : path.join(config.vaultPath, docPath);
          
          if (await fs.access(fullPath).then(() => true).catch(() => false)) {
            const content = await fs.readFile(fullPath, 'utf-8');
            documents[key] = {
              path: docPath,
              content: content
            };
          } else {
            documents[key] = {
              path: docPath,
              error: "File not found"
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
        return await this.vaultScan(args);
      case 'read_notes':
        return await this.readNotes(args);
      case 'write_note':
        return await this.writeNote(args);
      case 'archive_notes':
        return await this.archiveNotes(args);
      case 'search_content':
        return await this.searchContent(args);
      case 'find_by_metadata':
        return await this.findByMetadata(args);
      case 'git_checkpoint':
        return await this.gitCheckpoint(args);
      case 'git_changes':
        return await this.gitChanges(args);
      case 'git_rollback':
        return await this.gitRollback(args);
      case 'get_research_context':
        return await this.getResearchContext(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

const server = new SimpleVaultServer();
server.run().catch(console.error);