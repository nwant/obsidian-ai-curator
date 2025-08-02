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
import { ObsidianAPIClient } from './obsidian-api-client.js';
import { TagIntelligence } from './tools/tag-intelligence.js';
import { TagValidator } from './tools/tag-validator.js';
import { TagFormatter } from './tools/tag-formatter.js';
import { LinkFormatter } from './tools/link-formatter.js';
import { DateManager } from './tools/date-manager.js';
import { DailyNoteManager } from './tools/daily-note-manager.js';
import { FrontmatterManager } from './tools/frontmatter-manager.js';
import { FileOperations } from './tools/file-operations.js';
import { TagRenamer } from './tools/tag-renamer.js';
import { FrontmatterValidator } from './tools/frontmatter-validator.js';
import { ProjectInitializer } from './tools/project-init.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'config.json');
let config = { vaultPath: '', ignorePatterns: [] };

async function loadConfig() {
  try {
    const configData = await fs.readFile(CONFIG_PATH, 'utf-8');
    config = JSON.parse(configData);
  } catch (error) {
    // Config not found, using environment variables
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
    this.config = config;
    this.metricsCollector = new AutoMetricsCollector(config);
    this.cache = new VaultCache(config);
    this.dataviewRenderer = new DataviewRenderer(config, this.cache);
    this.obsidianAPI = new ObsidianAPIClient();
    this.tagIntelligence = new TagIntelligence(config, this.cache, this.obsidianAPI);
    this.tagValidator = new TagValidator(this.tagIntelligence);
    this.dailyNoteManager = new DailyNoteManager(config, this.cache);
    this.frontmatterManager = new FrontmatterManager(config, this.obsidianAPI);
    this.linkFormatter = new LinkFormatter(this.obsidianAPI);
    this.fileOperations = new FileOperations(config, this.obsidianAPI);
    this.tagRenamer = new TagRenamer(config, this.obsidianAPI);
    this.projectInitializer = new ProjectInitializer(config);
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
          description: 'Write or update a note. For tag-only updates, use update_tags instead',
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
        },
        {
          name: 'get_tags',
          description: 'Get tags from the vault, either all tags or for a specific file',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Optional file path to get tags for a specific file'
              }
            }
          }
        },
        {
          name: 'get_links',
          description: 'Get outgoing links from a specific file',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'File path to get links from'
              }
            },
            required: ['path']
          }
        },
        {
          name: 'get_backlinks',
          description: 'Get backlinks (files that link to) a specific file',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'File path to get backlinks for'
              }
            },
            required: ['path']
          }
        },
        {
          name: 'analyze_tags',
          description: 'Analyze all tags in the vault with statistics, hierarchy, and recommendations',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'suggest_tags',
          description: 'Suggest existing tags based on content analysis',
          inputSchema: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: 'The content to analyze for tag suggestions'
              },
              existingTags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Tags already assigned (to avoid suggesting these)'
              }
            },
            required: ['content']
          }
        },
        {
          name: 'get_daily_note',
          description: 'Get or create daily note for a specific date',
          inputSchema: {
            type: 'object',
            properties: {
              date: {
                type: 'string',
                description: 'Date reference (today, yesterday, tomorrow, or yyyy-MM-dd)'
              }
            }
          }
        },
        {
          name: 'append_to_daily_note',
          description: 'Append content to a daily note section',
          inputSchema: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: 'Content to append'
              },
              date: {
                type: 'string',
                description: 'Date reference (default: today)'
              },
              section: {
                type: 'string',
                description: 'Section to append to (default: Notes)'
              }
            },
            required: ['content']
          }
        },
        {
          name: 'add_daily_task',
          description: 'Add a task to daily note',
          inputSchema: {
            type: 'object',
            properties: {
              task: {
                type: 'string',
                description: 'Task description'
              },
              date: {
                type: 'string',
                description: 'Date reference (default: today)'
              },
              completed: {
                type: 'boolean',
                description: 'Whether task is completed'
              },
              priority: {
                type: 'string',
                enum: ['high', 'medium', 'low'],
                description: 'Task priority'
              }
            },
            required: ['task']
          }
        },
        {
          name: 'get_frontmatter',
          description: 'Get frontmatter metadata for a note',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to the note'
              }
            },
            required: ['path']
          }
        },
        {
          name: 'update_frontmatter',
          description: 'Update frontmatter fields for a note',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to the note'
              },
              updates: {
                type: 'object',
                description: 'Frontmatter fields to update'
              },
              merge: {
                type: 'boolean',
                description: 'Merge with existing frontmatter (default: true)'
              }
            },
            required: ['path', 'updates']
          }
        },
        {
          name: 'update_tags',
          description: 'Efficiently update tags for a note without rewriting the entire file. Use this for retagging, tag cleanup, or tag management tasks',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to the note'
              },
              add: {
                type: 'array',
                items: { type: 'string' },
                description: 'Tags to add'
              },
              remove: {
                type: 'array',
                items: { type: 'string' },
                description: 'Tags to remove'
              },
              replace: {
                type: 'array',
                items: { type: 'string' },
                description: 'Replace all tags with these'
              }
            },
            required: ['path']
          }
        },
        {
          name: 'rename_file',
          description: 'Rename a file and automatically update all links throughout the vault. Uses Obsidian API when available for guaranteed link preservation',
          inputSchema: {
            type: 'object',
            properties: {
              oldPath: {
                type: 'string',
                description: 'Current file path (e.g., "Notes/Old Name.md")'
              },
              newPath: {
                type: 'string',
                description: 'New file path (e.g., "Notes/New Name.md")'
              }
            },
            required: ['oldPath', 'newPath']
          }
        },
        {
          name: 'move_file',
          description: 'Move a file to a new location and automatically update all links throughout the vault. Uses Obsidian API when available for guaranteed link preservation',
          inputSchema: {
            type: 'object',
            properties: {
              sourcePath: {
                type: 'string',
                description: 'Current file path (e.g., "Notes/My Note.md")'
              },
              targetPath: {
                type: 'string',
                description: 'Target file path including filename (e.g., "Archive/My Note.md")'
              }
            },
            required: ['sourcePath', 'targetPath']
          }
        },
        {
          name: 'rename_tag',
          description: 'Rename a tag globally across the entire vault. Handles both frontmatter and inline tags. Uses Obsidian API when available for better performance.',
          inputSchema: {
            type: 'object',
            properties: {
              oldTag: {
                type: 'string',
                description: 'The tag to rename (with or without #, e.g., "old-tag" or "#old-tag")'
              },
              newTag: {
                type: 'string',
                description: 'The new tag name (with or without #, e.g., "new-tag" or "#new-tag")'
              },
              preview: {
                type: 'boolean',
                description: 'If true, only preview changes without applying them (default: false)'
              },
              includeInline: {
                type: 'boolean',
                description: 'Rename inline tags in content (default: true)'
              },
              includeFrontmatter: {
                type: 'boolean',
                description: 'Rename tags in frontmatter (default: true)'
              }
            },
            required: ['oldTag', 'newTag']
          }
        },
        {
          name: 'init_project',
          description: 'Initialize a new project with standardized structure in the Obsidian vault',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project (e.g., "Email Automation")'
              },
              projectType: {
                type: 'string',
                enum: ['ai-agent', 'integration', 'automation', 'other'],
                description: 'Type of project (default: "other")'
              },
              description: {
                type: 'string',
                description: 'Brief description of the project'
              },
              stakeholders: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of stakeholders in format "Name (Role)"'
              },
              targetDate: {
                type: 'string',
                description: 'Target completion date in yyyy-MM-dd format'
              },
              phase: {
                type: 'string',
                description: 'Initial project phase (default: "planning")'
              },
              template: {
                type: 'string',
                description: 'Project template to use (default: "default"). Use list_project_templates to see available templates'
              }
            },
            required: ['projectName', 'description']
          }
        },
        {
          name: 'list_project_templates',
          description: 'List available project templates and their descriptions',
          inputSchema: {
            type: 'object',
            properties: {}
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
          case 'get_tags':
            return await this.getTags(args);
          case 'get_links':
            return await this.getLinks(args);
          case 'get_backlinks':
            return await this.getBacklinks(args);
          case 'analyze_tags':
            return await this.analyzeTags(args);
          case 'suggest_tags':
            return await this.suggestTags(args);
          case 'get_daily_note':
            return await this.getDailyNote(args);
          case 'append_to_daily_note':
            return await this.appendToDailyNote(args);
          case 'add_daily_task':
            return await this.addDailyTask(args);
          case 'get_frontmatter':
            return await this.getFrontmatter(args);
          case 'update_frontmatter':
            return await this.updateFrontmatter(args);
          case 'update_tags':
            return await this.updateTags(args);
          case 'rename_file':
            return await this.renameFile(args);
          case 'move_file':
            return await this.moveFile(args);
          case 'rename_tag':
            return await this.renameTag(args);
          case 'init_project':
            return await this.initProject(args);
          case 'list_project_templates':
            return await this.listProjectTemplates();
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
    // CRITICAL: Clean hashtags from tags BEFORE any parsing occurs
    // This must happen before gray-matter touches the content
    // Otherwise #tags become null and we lose the tag data
    
    // Method 1: Clean tags in frontmatter only (more precise)
    let finalContent = content.replace(
      /^---\s*\n([\s\S]*?)\n---/,
      (match, frontmatter) => {
        const cleanedFrontmatter = frontmatter
          // Clean tags in array format
          .replace(/^(\s*-\s*)["']?#(.+?)["']?\s*$/gm, '$1$2')
          // Clean tags that might be in flow format
          .replace(/tags:\s*\[(.*?)\]/g, (m, tagList) => {
            const cleaned = tagList.replace(/#/g, '');
            return `tags: [${cleaned}]`;
          });
        return `---\n${cleanedFrontmatter}\n---`;
      }
    );
    
    // Method 2: Additional safety - clean any remaining hashtags in tag lines
    finalContent = finalContent.replace(/^(\s*-\s*)#(.+)$/gm, '$1$2');
    
    // Validate tags before writing
    let tagValidation;
    try {
      tagValidation = await this.tagValidator.validateTags(finalContent);
    } catch (error) {
      console.error('Tag validation error:', error);
      // Continue without tag validation if it fails
      tagValidation = { 
        valid: true, 
        tags: [], 
        warnings: [], 
        suggestions: [],
        autoTagsAdded: []
      };
    }
    
    // Apply auto-tags if any were added
    if (tagValidation.autoTagsAdded && tagValidation.autoTagsAdded.length > 0) {
      // Parse content and add auto-tags to frontmatter
      const parsed = matter(finalContent);
      const existingTags = parsed.data.tags || [];
      
      // Strip hashtags from both existing and auto-added tags
      const stripHashtag = tag => tag.startsWith('#') ? tag.substring(1) : tag;
      const existingTagsClean = Array.isArray(existingTags) 
        ? existingTags.map(tag => typeof tag === 'string' ? stripHashtag(tag) : tag).filter(Boolean)
        : [stripHashtag(existingTags)];
      const autoTagsClean = tagValidation.autoTagsAdded.map(stripHashtag);
      
      const allTags = [...new Set([...existingTagsClean, ...autoTagsClean])];
      parsed.data.tags = allTags;
      finalContent = matter.stringify(parsed.content, parsed.data);
    }
    
    // Format content to ensure tags DON'T have # prefix in frontmatter
    finalContent = TagFormatter.formatContentTags(finalContent);
    
    // Format links to use Obsidian wikilink format
    finalContent = await this.linkFormatter.formatLinks(finalContent, notePath);
    
    // Ensure proper timestamps
    const isNewFile = !(await this.fileExists(notePath));
    finalContent = DateManager.ensureTimestamps(finalContent, {
      isNewFile,
      dateFormat: this.config.dateFormat || 'yyyy-MM-dd',
      includeTime: false
    });
    
    // FINAL STEP: Absolute final cleanup to ensure no hashtags in frontmatter tags
    // This is our last defense against any hashtags that might have been added
    // Parse the content one final time
    try {
      const parsed = matter(finalContent);
      let modified = false;
      
      // Check if tags exist and have any hashtags
      if (parsed.data.tags) {
        if (Array.isArray(parsed.data.tags)) {
          const cleanedTags = parsed.data.tags
            .filter(tag => tag !== null && tag !== undefined && tag !== '')
            .map(tag => {
              if (typeof tag === 'string' && tag.startsWith('#')) {
                modified = true;
                return tag.substring(1);
              }
              return tag;
            })
            .filter(tag => tag && tag.trim());
          
          if (modified || cleanedTags.length !== parsed.data.tags.length) {
            parsed.data.tags = cleanedTags;
            finalContent = matter.stringify(parsed.content, parsed.data);
          }
        } else if (typeof parsed.data.tags === 'string' && parsed.data.tags.startsWith('#')) {
          parsed.data.tags = parsed.data.tags.substring(1);
          finalContent = matter.stringify(parsed.content, parsed.data);
        }
      }
    } catch (e) {
      console.error('Failed to do final tag cleanup:', e);
    }
    // Validate links were formatted correctly
    const linkValidation = LinkFormatter.validateLinks(finalContent);
    
    const response = {
      success: true,
      path: notePath,
      tagValidation: {
        warnings: tagValidation.warnings,
        suggestions: tagValidation.suggestions,
        validatedTags: tagValidation.tags,
        autoTagsAdded: tagValidation.autoTagsAdded
      },
      linkFormatting: {
        valid: linkValidation.valid,
        corrections: linkValidation.issues?.length || 0
      }
    };
    
    // If there are tag warnings, include them in the response
    if (tagValidation.warnings.length > 0) {
      response.tagWarnings = tagValidation.warnings.map(w => 
        `${w.severity.toUpperCase()}: ${w.message}${w.suggestion ? ` - ${w.suggestion}` : ''}`
      );
    }
    
    // If there are suggestions, include them
    if (tagValidation.suggestions.length > 0) {
      response.tagSuggestions = tagValidation.suggestions;
    }
    
    // Validate frontmatter for Obsidian compatibility
    const frontmatterValidation = FrontmatterValidator.validateForObsidian(finalContent);
    
    if (!frontmatterValidation.valid || frontmatterValidation.warnings.length > 0) {
      // Check if we should auto-clean
      const shouldAutoClean = frontmatterValidation.issues.some(
        issue => issue.issue.includes('Array of objects')
      );
      
      if (shouldAutoClean) {
        // Auto-clean incompatible structures
        const cleaned = FrontmatterValidator.cleanForObsidian(finalContent);
        if (cleaned.cleaned) {
          finalContent = cleaned.content;
          response.frontmatterCleaned = true;
          response.frontmatterMovedToBody = Object.keys(cleaned.movedData);
        }
      }
      
      // Add validation results to response
      if (frontmatterValidation.issues.length > 0) {
        response.frontmatterIssues = frontmatterValidation.issues.map(
          issue => `${issue.severity}: ${issue.path} - ${issue.issue}`
        );
      }
      
      if (frontmatterValidation.warnings.length > 0) {
        response.frontmatterWarnings = frontmatterValidation.warnings.map(
          warning => `${warning.severity}: ${warning.path} - ${warning.issue}`
        );
      }
      
      if (frontmatterValidation.suggestions.length > 0) {
        response.frontmatterSuggestions = frontmatterValidation.suggestions;
      }
    }
    
    // Write the note
    try {
      const fullPath = path.join(config.vaultPath, notePath);
      const dir = path.dirname(fullPath);
      
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(fullPath, finalContent, 'utf-8');
      
      return { 
        content: [{ 
          type: 'text', 
          text: JSON.stringify(response, null, 2) 
        }] 
      };
    } catch (error) {
      console.error('Write note error:', error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ 
            error: `Failed to write note: ${error.message}`,
            path: notePath 
          }, null, 2)
        }]
      };
    }
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
    // Try Obsidian API first if available
    if (this.obsidianAPI.isAvailable()) {
      const apiResult = await this.obsidianAPI.search(query, { maxResults, contextLines });
      if (apiResult) {
        // Transform API result to match expected format
        const matches = [];
        for (const result of apiResult) {
          for (const match of result.matches || []) {
            matches.push({
              path: result.path,
              line: match.line,
              match: match.text,
              context: result.context
            });
          }
        }
        return { content: [{ type: 'text', text: JSON.stringify({ matches }, null, 2) }] };
      }
    }
    
    // Fallback to file system search
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
    return { content: [{ type: 'text', text: JSON.stringify({ matches: matches.slice(0, maxResults) }, null, 2) }] };
  }

  async findByMetadata({ frontmatter, minWords, maxWords, modifiedAfter, modifiedBefore }) {
    // Note: Could optimize with Obsidian API in the future by adding a bulk metadata endpoint
    
    // Fallback to file system
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
      case 'get_tags':
        return await this.getTags(args);
      case 'get_links':
        return await this.getLinks(args);
      case 'get_backlinks':
        return await this.getBacklinks(args);
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

  async getTags({ path: filePath }) {
    // Try Obsidian API first if available
    if (this.obsidianAPI.isAvailable()) {
      const apiResult = await this.obsidianAPI.getTags(filePath);
      if (apiResult) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(apiResult, null, 2)
          }]
        };
      }
    }

    // Fallback to file system
    const tags = {};
    
    if (filePath) {
      // Get tags for specific file
      const fullPath = path.join(config.vaultPath, filePath);
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        const { data } = matter(content);
        
        // Extract tags from frontmatter
        if (data.tags) {
          const fileTags = Array.isArray(data.tags) ? data.tags : [data.tags];
          fileTags.forEach(tag => {
            const tagName = tag.startsWith('#') ? tag : `#${tag}`;
            tags[tagName] = 1;
          });
        }
        
        // Extract tags from content
        const tagMatches = content.match(/#[\w\-_]+/g);
        if (tagMatches) {
          tagMatches.forEach(tag => {
            tags[tag] = (tags[tag] || 0) + 1;
          });
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: `File not found: ${filePath}` }, null, 2)
          }]
        };
      }
    } else {
      // Get all tags in vault
      const scanDir = async (dir, baseDir = '') => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.join(baseDir, entry.name);
          
          if (entry.isDirectory() && !this.shouldIgnore(entry.name)) {
            await scanDir(fullPath, relativePath);
          } else if (entry.isFile() && entry.name.endsWith('.md')) {
            const content = await fs.readFile(fullPath, 'utf-8');
            const { data } = matter(content);
            
            // Extract tags from frontmatter
            if (data.tags) {
              const fileTags = Array.isArray(data.tags) ? data.tags : [data.tags];
              fileTags.forEach(tag => {
                const tagName = tag.startsWith('#') ? tag : `#${tag}`;
                tags[tagName] = (tags[tagName] || 0) + 1;
              });
            }
            
            // Extract tags from content
            const tagMatches = content.match(/#[\w\-_]+/g);
            if (tagMatches) {
              tagMatches.forEach(tag => {
                tags[tag] = (tags[tag] || 0) + 1;
              });
            }
          }
        }
      };
      
      await scanDir(config.vaultPath);
    }
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ tags }, null, 2)
      }]
    };
  }

  async getLinks({ path: filePath }) {
    // Try Obsidian API first if available
    if (this.obsidianAPI.isAvailable()) {
      const apiResult = await this.obsidianAPI.getLinks(filePath, 'outgoing');
      if (apiResult) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(apiResult, null, 2)
          }]
        };
      }
    }

    // Fallback to file system
    const fullPath = path.join(config.vaultPath, filePath);
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      
      // Extract wiki links
      const wikiLinks = [];
      const wikiLinkRegex = /\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]/g;
      let match;
      
      while ((match = wikiLinkRegex.exec(content)) !== null) {
        const linkPath = match[1].trim();
        if (!wikiLinks.includes(linkPath)) {
          wikiLinks.push(linkPath);
        }
      }
      
      // Extract markdown links
      const mdLinks = [];
      const mdLinkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
      
      while ((match = mdLinkRegex.exec(content)) !== null) {
        const linkUrl = match[2].trim();
        // Only include internal links (not http/https)
        if (!linkUrl.startsWith('http://') && !linkUrl.startsWith('https://')) {
          if (!mdLinks.includes(linkUrl)) {
            mdLinks.push(linkUrl);
          }
        }
      }
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ 
            path: filePath,
            outgoingLinks: [...wikiLinks, ...mdLinks]
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ error: `File not found: ${path}` }, null, 2)
        }]
      };
    }
  }

  async getBacklinks({ path: filePath }) {
    // Try Obsidian API first if available
    if (this.obsidianAPI.isAvailable()) {
      const apiResult = await this.obsidianAPI.getLinks(filePath, 'backlinks');
      if (apiResult) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(apiResult, null, 2)
          }]
        };
      }
    }

    // Fallback to file system - search all files for links to this file
    const backlinks = [];
    const targetName = path.basename(filePath, '.md');
    
    const scanDir = async (dir, baseDir = '') => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.join(baseDir, entry.name);
        
        if (entry.isDirectory() && !this.shouldIgnore(entry.name)) {
          await scanDir(fullPath, relativePath);
        } else if (entry.isFile() && entry.name.endsWith('.md') && relativePath !== filePath) {
          const content = await fs.readFile(fullPath, 'utf-8');
          
          // Check for wiki links
          const wikiLinkRegex = new RegExp(`\\[\\[([^\\]|#]*${targetName}[^\\]|#]*)(?:\\|[^\\]]+)?\\]\\]`, 'g');
          if (wikiLinkRegex.test(content)) {
            backlinks.push(relativePath);
            continue;
          }
          
          // Check for markdown links
          const mdLinkRegex = new RegExp(`\\[[^\\]]*\\]\\([^)]*${targetName}[^)]*\\)`, 'g');
          if (mdLinkRegex.test(content)) {
            backlinks.push(relativePath);
          }
        }
      }
    };
    
    await scanDir(config.vaultPath);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ 
          path: filePath,
          backlinks 
        }, null, 2)
      }]
    };
  }

  async analyzeTags() {
    const startTime = Date.now();
    
    try {
      const analysis = await this.tagIntelligence.analyzeTags();
      
      // Track metrics
      const duration = Date.now() - startTime;
      await this.metricsCollector.trackOperation(
        'analyze_tags',
        {},
        duration,
        analysis.totalTags || 0,
        true,
        false
      );
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(analysis, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ error: error.message }, null, 2)
        }]
      };
    }
  }

  async suggestTags({ content, existingTags = [] }) {
    const startTime = Date.now();
    
    try {
      const suggestions = await this.tagIntelligence.suggestTags(content, existingTags);
      
      // Track metrics
      const duration = Date.now() - startTime;
      await this.metricsCollector.trackOperation(
        'suggest_tags',
        { contentLength: content.length },
        duration,
        suggestions.length,
        true,
        false
      );
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ suggestions }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ error: error.message }, null, 2)
        }]
      };
    }
  }

  async fileExists(filePath) {
    try {
      const fullPath = path.join(this.config.vaultPath, filePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async getDailyNote({ date = 'today' }) {
    try {
      const result = await this.dailyNoteManager.findDailyNote(date);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            ...result
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ 
            success: false,
            error: error.message 
          }, null, 2)
        }]
      };
    }
  }

  async appendToDailyNote({ content, date = 'today', section = 'Notes' }) {
    try {
      const result = await this.dailyNoteManager.appendToDailyNote(content, {
        date: date === 'today' ? new Date() : DateManager.parseDate(date),
        section,
        createIfMissing: true
      });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            ...result
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ 
            success: false,
            error: error.message 
          }, null, 2)
        }]
      };
    }
  }

  async addDailyTask({ task, date = 'today', completed = false, priority = null }) {
    try {
      const result = await this.dailyNoteManager.addTaskToDailyNote(task, {
        date: date === 'today' ? new Date() : DateManager.parseDate(date),
        completed,
        priority
      });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            ...result
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ 
            success: false,
            error: error.message 
          }, null, 2)
        }]
      };
    }
  }

  async getFrontmatter({ path: notePath }) {
    try {
      const result = await this.frontmatterManager.getFrontmatter(notePath);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ 
            success: false,
            error: error.message,
            path: notePath
          }, null, 2)
        }]
      };
    }
  }

  async updateFrontmatter({ path: notePath, updates, merge = true }) {
    try {
      const result = await this.frontmatterManager.updateFrontmatter(
        notePath, 
        updates, 
        { merge }
      );
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ 
            success: false,
            error: error.message,
            path: notePath
          }, null, 2)
        }]
      };
    }
  }

  async updateTags({ path: notePath, add, remove, replace }) {
    try {
      let result;
      
      if (replace && replace.length > 0) {
        // Replace all tags
        result = await this.frontmatterManager.replaceTags(notePath, replace);
      } else {
        // Add and/or remove tags
        if (add && add.length > 0) {
          result = await this.frontmatterManager.addTags(notePath, add);
        }
        if (remove && remove.length > 0) {
          result = await this.frontmatterManager.removeTags(notePath, remove);
        }
      }
      
      if (!result) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ 
              success: false,
              error: 'No tag operations specified',
              path: notePath
            }, null, 2)
          }]
        };
      }
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ 
            success: false,
            error: error.message,
            path: notePath
          }, null, 2)
        }]
      };
    }
  }

  async renameFile({ oldPath, newPath }) {
    try {
      const result = await this.fileOperations.renameFile(oldPath, newPath);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ 
            success: false,
            error: error.message,
            oldPath,
            newPath
          }, null, 2)
        }]
      };
    }
  }

  async moveFile({ sourcePath, targetPath }) {
    try {
      const result = await this.fileOperations.moveFile(sourcePath, targetPath);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ 
            success: false,
            error: error.message,
            sourcePath,
            targetPath
          }, null, 2)
        }]
      };
    }
  }

  async renameTag({ oldTag, newTag, preview = false, includeInline = true, includeFrontmatter = true }) {
    try {
      const result = await this.tagRenamer.renameTag(oldTag, newTag, {
        preview,
        includeInline,
        includeFrontmatter
      });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ 
            success: false,
            error: error.message,
            oldTag,
            newTag
          }, null, 2)
        }]
      };
    }
  }

  async initProject(params) {
    try {
      const result = await this.projectInitializer.initProject(params);
      
      // If successful and git checkpoint is enabled, create one
      if (result.success && this.config.gitCheckpoints !== false) {
        try {
          const gitResult = await this.gitCheckpoint({
            message: `Initialize project: ${params.projectName}`
          });
          result.gitCheckpoint = gitResult.success;
        } catch (gitError) {
          // Don't fail the project init if git checkpoint fails
          console.error('Git checkpoint failed:', gitError);
          result.gitCheckpoint = false;
        }
      }
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ 
            success: false,
            error: error.message,
            params
          }, null, 2)
        }]
      };
    }
  }

  async listProjectTemplates() {
    try {
      const result = await this.projectInitializer.listTemplates();
      
      // Format the output nicely
      let output = "# Available Project Templates\n\n";
      
      for (const template of result.templates) {
        output += `## ${template.name} (${template.key})\n`;
        output += `${template.description}\n`;
        output += `- Directories: ${template.directories}\n`;
        output += `- Files: ${template.files}\n\n`;
      }
      
      output += "\n## Available Project Types\n";
      output += result.projectTypes.map(type => `- ${type}`).join('\n');
      
      output += "\n\n## Available Phases\n";
      output += result.phases.map(phase => `- ${phase}`).join('\n');
      
      output += "\n\n## Usage\n";
      output += "Use the 'template' parameter when calling init_project:\n";
      output += "```\ninit_project({\n  projectName: \"My Project\",\n  description: \"...\",\n  template: \"minimal\"  // or \"default\", \"research\"\n})\n```";
      
      return {
        content: [{
          type: 'text',
          text: output
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error listing templates: ${error.message}`
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