#!/usr/bin/env node

/**
 * Refactored MCP Server for Obsidian Vault Integration
 * Modularized version with separated handlers
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Import handlers
import { VaultHandler } from './handlers/vault-handler.js';
import { NoteHandler } from './handlers/note-handler.js';
import { SearchHandler } from './handlers/search-handler.js';
import { GitHandler } from './handlers/git-handler.js';
import { TagHandler } from './handlers/tag-handler.js';

// Import existing components
import { VaultCache } from './cache/vault-cache.js';
import { ObsidianAPIClient } from './obsidian-api-client.js';
import { EnhancedMetricsCollector } from './metrics/enhanced-collector.js';

// Import tool modules for remaining functionality
import { get_daily_note, append_to_daily_note, add_daily_task } from './tools/daily-notes.js';
import { rename_file, move_file } from './tools/file-operations.js';
import { init_project, list_project_templates, list_playbooks } from './tools/project-management.js';
import { get_working_context, get_research_context } from './tools/vault-operations.js';
import { run_benchmark, view_search_metrics } from './tools/benchmark.js';
import { ProjectInitializer } from './tools/project-init.js';
import { loadConfig as loadConfigUtil } from './utils/config-loader.js';

// Import GitHub integration and error handling
import { githubTools } from './tools/github/github-integration.js';
import { ErrorReporter, setupGlobalErrorHandlers } from './tools/error-handler.js';
// Claude Code supports headless mode with -p flag for automation
import { claudeCodeTools } from './tools/claude-code-executor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Default config
let config = { vaultPath: '', ignorePatterns: [] };

async function loadConfig() {
  try {
    const loadedConfig = await loadConfigUtil();
    
    if (!loadedConfig.vaultPath) {
      throw new Error('Vault path not configured. Please set vaultPath in config/config.json or OBSIDIAN_VAULT_PATH environment variable.');
    }
    
    // Update global config
    config = loadedConfig;
    return config;
  } catch (error) {
    // Don't log to console in production mode to avoid interfering with MCP protocol
    if (process.env.NODE_ENV === 'development') {
      console.error('Error loading config:', error.message);
    }
    throw error;
  }
}

export class McpServer {
  constructor(configOverride = null) {
    this.config = configOverride || config;
    
    // Initialize error reporter
    this.errorReporter = new ErrorReporter({
      reportableTools: 'all',
      excludeTools: ['test_tool'],
      sessionInfo: {
        serverVersion: this.config.serverVersion || '1.0.0',
        startTime: new Date().toISOString()
      }
    });
    
    // Only create server if not in test mode
    if (!this.config.testMode) {
      this.server = new Server(
        {
          name: this.config.serverName || "obsidian-vault",
          version: this.config.serverVersion || "1.0.0",
        },
        {
          capabilities: {
            tools: {
            "vault_scan": true,
            "read_notes": true,
            "write_note": true,
            "archive_notes": true,
            "search_content": true,
            "find_by_metadata": true,
            "git_checkpoint": true,
            "git_changes": true,
            "git_rollback": true,
            "get_research_context": true,
            "get_working_context": true,
            "run_benchmark": true,
            "view_search_metrics": true,
            "view_performance_metrics": true,
            "query_dataview": true,
            "get_tags": true,
            "get_links": true,
            "get_backlinks": true,
            "analyze_tags": true,
            "suggest_tags": true,
            "get_daily_note": true,
            "append_to_daily_note": true,
            "add_daily_task": true,
            "get_frontmatter": true,
            "update_frontmatter": true,
            "update_tags": true,
            "rename_file": true,
            "create_github_issue": true,
            "create_bug_report": true,
            "create_feature_request": true,
            "document_design_decision": true,
            "check_issue_status": true,
            // Claude Code headless automation tools
            "execute_claude_code_fix": true,
            "execute_claude_code_feature": true,
            "check_claude_code_status": true,
            "cleanup_temp_directories": true,
            "move_file": true,
            "rename_tag": true,
            "init_project": true,
            "list_project_templates": true
          }
        }
      }
      );
    } else {
      // Create a mock server object for tests
      this.server = {
        setRequestHandler: () => {},
        onerror: null
      };
    }
    
    // Initialize cache if enabled
    if (this.config.cacheEnabled !== false) {
      this.cache = new VaultCache(this.config);
    }
    
    this.apiClient = new ObsidianAPIClient(this.config);
    
    // Initialize handlers
    this.vaultHandler = new VaultHandler(this.config, this.cache, this.apiClient);
    this.noteHandler = new NoteHandler(this.config, this.cache, this.apiClient);
    this.searchHandler = new SearchHandler(this.config, this.cache, this.apiClient);
    this.gitHandler = new GitHandler(this.config);
    this.tagHandler = new TagHandler(this.config, this.cache, this.apiClient);
    
    if (!this.config.testMode) {
      this.setupErrorHandlers();
      this.setupHandlers();
    }
  }

  setupErrorHandlers() {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  async cleanup() {
    try {
      await this.metricsCollector?.stop();
      await this.server.close();
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  setupHandlers() {
    // Tools list handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "vault_scan",
          description: "Scan vault for files with basic statistics",
          inputSchema: {
            type: "object",
            properties: {
              patterns: {
                type: "array",
                items: { type: "string" },
                description: 'Glob patterns to match (default: ["**/*.md"])'
              },
              includeFrontmatter: {
                type: "boolean",
                description: "Include frontmatter fields"
              },
              includePreview: {
                type: "boolean",
                description: "Include content preview (first 200 chars)"
              },
              includeStats: {
                type: "boolean",
                description: "Include word count and size stats"
              },
              sortBy: {
                type: "string",
                enum: ["modified", "path", "size"],
                description: 'Sort results by field (default: modified)'
              },
              limit: {
                type: "number",
                description: "Maximum number of results to return"
              },
              useCache: {
                type: "boolean",
                description: 'Use cached results if available (default: true)'
              }
            }
          }
        },
        {
          name: "read_notes",
          description: "Read multiple notes with full content and metadata",
          inputSchema: {
            type: "object",
            properties: {
              paths: {
                type: "array",
                items: { type: "string" },
                description: "Note paths relative to vault"
              },
              renderDataview: {
                type: "boolean",
                description: 'Render Dataview queries to show actual data (default: false)'
              },
              dataviewMode: {
                type: "string",
                enum: ["smart", "summary", "count", "table", "compact"],
                description: 'Dataview rendering mode: smart (auto-decide), summary (grouped counts), count (totals only), table (full), compact (limited rows). Default: smart'
              }
            },
            required: ["paths"]
          }
        },
        {
          name: "write_note",
          description: "Write or update a note. For tag-only updates, use update_tags instead",
          inputSchema: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Note path relative to vault"
              },
              content: {
                type: "string",
                description: "Full note content"
              }
            },
            required: ["path", "content"]
          }
        },
        {
          name: "search_content",
          description: "Search for content across all notes",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search query"
              },
              maxResults: {
                type: "number",
                description: "Maximum results to return"
              },
              contextLines: {
                type: "number",
                description: "Lines of context around match"
              }
            },
            required: ["query"]
          }
        },
        {
          name: "get_tags",
          description: "Get tags from the vault, either all tags or for a specific file",
          inputSchema: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Optional file path to get tags for a specific file"
              }
            }
          }
        },
        {
          name: "init_project",
          description: "Initialize a new project with playbook and optional repository integration",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { 
                type: "string", 
                description: "Name of the project (e.g., 'Email Automation')" 
              },
              description: { 
                type: "string", 
                description: "Brief description of the project" 
              },
              playbook: {
                type: "string",
                description: "Project playbook to use (default: 'default'). Use list_playbooks to see available options"
              },
              repository: {
                type: "string",
                description: "GitHub repository URL (optional, e.g., https://github.com/user/repo)"
              },
              repositories: {
                type: "object",
                description: "Multiple repositories configuration (optional). Keys are repo names, values are repo configs",
                additionalProperties: {
                  type: "object",
                  properties: {
                    url: { type: "string", description: "GitHub repository URL" },
                    local: { type: "string", description: "Local path to repository" },
                    branch: { type: "string", description: "Default branch (default: main)" },
                    visibility: { type: "string", enum: ["public", "private"], description: "Repository visibility" },
                    purpose: { type: "string", description: "Repository purpose/description" }
                  }
                }
              },
              localPath: {
                type: "string",
                description: "Local repository path (optional, will be inferred from repo URL if not provided)"
              },
              targetDate: {
                type: "string",
                description: "Target completion date in yyyy-MM-dd format"
              },
              stakeholders: {
                type: "array",
                items: { type: "string" },
                description: "List of stakeholders in format 'Name (Role)'"
              },
              phase: {
                type: "string",
                enum: ["planning", "active", "review", "completed", "archived"],
                description: "Initial project phase (default: 'planning')"
              }
            },
            required: ["projectName", "description"]
          }
        },
        {
          name: "list_playbooks",
          description: "List available project playbooks and their descriptions",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        // Additional tool definitions for completeness
        {
          name: "analyze_tags",
          description: "Analyze tag usage across the vault",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        {
          name: "suggest_tags",
          description: "Suggest tags based on note content",
          inputSchema: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Note path to analyze"
              },
              content: {
                type: "string",
                description: "Note content to analyze (if path not provided)"
              }
            }
          }
        },
        {
          name: "update_tags",
          description: "Update tags for a note",
          inputSchema: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Note path"
              },
              tags: {
                type: "array",
                items: { type: "string" },
                description: "New tags to set"
              },
              mode: {
                type: "string",
                enum: ["replace", "add", "remove"],
                description: "How to update tags (default: replace)"
              }
            },
            required: ["path", "tags"]
          }
        },
        {
          name: "get_daily_note",
          description: "Get today's daily note",
          inputSchema: {
            type: "object",
            properties: {
              date: {
                type: "string",
                description: "Date in YYYY-MM-DD format (default: today)"
              }
            }
          }
        },
        {
          name: "append_to_daily_note",
          description: "Append content to daily note",
          inputSchema: {
            type: "object",
            properties: {
              content: {
                type: "string",
                description: "Content to append"
              },
              date: {
                type: "string",
                description: "Date in YYYY-MM-DD format (default: today)"
              },
              section: {
                type: "string",
                description: "Section to append to"
              }
            },
            required: ["content"]
          }
        },
        {
          name: "rename_file",
          description: "Rename a file in the vault",
          inputSchema: {
            type: "object",
            properties: {
              sourcePath: {
                type: "string",
                description: "Current file path"
              },
              newName: {
                type: "string",
                description: "New file name (without path)"
              }
            },
            required: ["sourcePath", "newName"]
          }
        },
        {
          name: "move_file",
          description: "Move a file to a different location",
          inputSchema: {
            type: "object",
            properties: {
              sourcePath: {
                type: "string",
                description: "Current file path"
              },
              targetPath: {
                type: "string",
                description: "New file path"
              }
            },
            required: ["sourcePath", "targetPath"]
          }
        },
        // GitHub integration tools
        {
          name: "create_github_issue",
          description: "Create a GitHub issue (can trigger Claude Code)",
          inputSchema: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description: "Issue title"
              },
              body: {
                type: "string",
                description: "Issue body/description"
              },
              labels: {
                type: "array",
                items: { type: "string" },
                description: "Labels to add to the issue"
              },
              assignees: {
                type: "array",
                items: { type: "string" },
                description: "GitHub usernames to assign"
              },
              milestone: {
                type: "string",
                description: "Milestone name"
              }
            },
            required: ["title", "body"]
          }
        },
        {
          name: "create_bug_report",
          description: "Create an automated bug report from an error",
          inputSchema: {
            type: "object",
            properties: {
              error: {
                type: "string",
                description: "Error message or object"
              },
              context: {
                type: "string",
                description: "Additional context about when the error occurred"
              },
              toolName: {
                type: "string",
                description: "Name of the tool that failed"
              },
              args: {
                type: "object",
                description: "Arguments that were passed to the tool"
              },
              stackTrace: {
                type: "string",
                description: "Stack trace if available"
              }
            },
            required: ["error"]
          }
        },
        {
          name: "create_feature_request",
          description: "Create a feature request with design documentation",
          inputSchema: {
            type: "object",
            properties: {
              featureName: {
                type: "string",
                description: "Name of the feature"
              },
              description: {
                type: "string",
                description: "Detailed description of the feature"
              },
              specifications: {
                type: "string",
                description: "Technical specifications"
              },
              designDecisions: {
                type: "array",
                items: { type: "string" },
                description: "Design decisions made"
              },
              acceptanceCriteria: {
                type: "array",
                items: { type: "string" },
                description: "Acceptance criteria for the feature"
              },
              technicalRequirements: {
                type: "array",
                items: { type: "string" },
                description: "Technical requirements"
              },
              userStory: {
                type: "string",
                description: "User story for the feature"
              },
              priority: {
                type: "string",
                enum: ["low", "medium", "high"],
                description: "Priority level"
              }
            },
            required: ["featureName", "description"]
          }
        },
        {
          name: "check_issue_status",
          description: "Check the status of a GitHub issue",
          inputSchema: {
            type: "object",
            properties: {
              issueNumber: {
                type: "number",
                description: "GitHub issue number"
              }
            },
            required: ["issueNumber"]
          }
        },
        // Claude Code headless automation tools
        {
          name: "execute_claude_code_fix",
          description: "Execute Claude Code in headless mode to fix an issue",
          inputSchema: {
            type: "object",
            properties: {
              issueNumber: {
                type: "number",
                description: "GitHub issue number to fix"
              },
              issueTitle: {
                type: "string",
                description: "Title of the issue"
              },
              issueBody: {
                type: "string",
                description: "Body/description of the issue"
              },
              errorDetails: {
                type: "object",
                description: "Additional error details if available"
              },
              customPrompt: {
                type: "string",
                description: "Custom prompt to override default fix instructions"
              },
              skipPermissions: {
                type: "boolean",
                description: "Skip permission checks (use with caution)",
                default: true
              }
            },
            required: ["issueNumber", "issueTitle", "issueBody"]
          }
        },
        {
          name: "execute_claude_code_feature",
          description: "Execute Claude Code in headless mode to implement a feature",
          inputSchema: {
            type: "object",
            properties: {
              featureName: {
                type: "string",
                description: "Name of the feature to implement"
              },
              description: {
                type: "string",
                description: "Detailed description of the feature"
              },
              specifications: {
                type: "string",
                description: "Technical specifications"
              },
              designDecisions: {
                type: "array",
                items: { type: "string" },
                description: "Design decisions for implementation"
              },
              acceptanceCriteria: {
                type: "array",
                items: { type: "string" },
                description: "Acceptance criteria"
              },
              technicalRequirements: {
                type: "array",
                items: { type: "string" },
                description: "Technical requirements"
              },
              customPrompt: {
                type: "string",
                description: "Custom prompt to override default implementation instructions"
              },
              skipPermissions: {
                type: "boolean",
                description: "Skip permission checks (use with caution)",
                default: true
              }
            },
            required: ["featureName", "description"]
          }
        },
        {
          name: "check_claude_code_status",
          description: "Check if Claude Code CLI is installed and configured",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        {
          name: "cleanup_temp_directories",
          description: "Clean up temporary directories created by Claude Code",
          inputSchema: {
            type: "object",
            properties: {}
          }
        }
      ]
    }));

    // Tool call handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      // Initialize handlers on first call
      if (!this.initialized) {
        await this.initialize();
      }

      return this.callTool(request);
    });
  }

  async initialize() {
    // Load configuration
    this.config = await loadConfig();
    
    // Initialize components
    this.cache = new VaultCache(this.config);
    this.apiClient = new ObsidianAPIClient();
    
    // Check API connection
    await this.apiClient.checkConnection();
    
    // Initialize handlers
    this.vaultHandler = new VaultHandler(this.config, this.cache, this.apiClient);
    this.noteHandler = new NoteHandler(this.config, this.cache, this.apiClient);
    this.searchHandler = new SearchHandler(this.config, this.cache, this.apiClient);
    this.gitHandler = new GitHandler(this.config);
    this.tagHandler = new TagHandler(this.config, this.cache, this.apiClient);
    
    // Initialize metrics collector
    this.metricsCollector = new EnhancedMetricsCollector(this.config, this);
    await this.metricsCollector.start();
    
    this.initialized = true;
  }

  async callTool(request) {
    const { name, arguments: args } = request.params;

    // Track tool call with performance monitoring
    return this.metricsCollector.trackToolCall(name, args, async () => {
      let result;
      
      // Route to appropriate handler
      switch (name) {
        // Vault operations
        case 'vault_scan':
          result = await this.vaultHandler.scanVault(args);
          break;
          
        // Note operations
        case 'read_notes':
          result = await this.noteHandler.readNotes(args);
          break;
        case 'write_note':
          result = await this.noteHandler.writeNote(args);
          break;
        case 'archive_notes':
          result = await this.noteHandler.archiveNotes(args);
          break;
        case 'get_frontmatter':
          result = await this.noteHandler.getFrontmatter(args);
          break;
        case 'update_frontmatter':
          result = await this.noteHandler.updateFrontmatter(args);
          break;
          
        // Search operations
        case 'search_content':
          result = await this.searchHandler.searchContent(args);
          break;
        case 'find_by_metadata':
          result = await this.searchHandler.findByMetadata(args);
          break;
        case 'query_dataview':
          result = await this.searchHandler.queryDataview(args);
          break;
          
        // Git operations
        case 'git_checkpoint':
          result = await this.gitHandler.createCheckpoint(args);
          break;
        case 'git_changes':
          result = await this.gitHandler.getChanges(args);
          break;
        case 'git_rollback':
          result = await this.gitHandler.rollback(args);
          break;
          
        // Tag operations
        case 'get_tags':
          result = await this.tagHandler.getTags(args);
          break;
        case 'analyze_tags':
          result = await this.tagHandler.analyzeTags();
          break;
        case 'suggest_tags':
          result = await this.tagHandler.suggestTags(args);
          break;
        case 'update_tags':
          result = await this.tagHandler.updateNoteTags(args);
          break;
        case 'rename_tag':
          result = await this.tagHandler.renameGlobalTag(args);
          break;
          
        // Daily notes (using existing tools)
        case 'get_daily_note':
          result = await get_daily_note(args);
          break;
        case 'append_to_daily_note':
          result = await append_to_daily_note(args);
          break;
        case 'add_daily_task':
          result = await add_daily_task(args);
          break;
          
        // File operations (using existing tools)
        case 'rename_file':
          result = await rename_file(args);
          break;
        case 'move_file':
          result = await move_file(args);
          break;
          
        // Project management (using existing tools)
        case 'init_project':
          result = await init_project(args);
          break;
        case 'list_project_templates':
        case 'list_playbooks':  // Support both names for backward compatibility
          result = await list_project_templates(args);
          break;
          
        // Context and research (using existing tools)
        case 'get_working_context':
          result = await get_working_context(args);
          break;
        case 'get_research_context':
          result = await get_research_context(args);
          break;
          
        // Benchmarks and metrics (using existing tools)
        case 'run_benchmark':
          result = await run_benchmark(args);
          break;
        case 'view_search_metrics':
          result = await view_search_metrics(args);
          break;
        case 'view_performance_metrics':
          result = await this.viewPerformanceMetrics(args);
          break;
          
        // Links operations (TODO: move to link-handler.js)
        case 'get_links':
          result = await this.getLinks(args);
          break;
        case 'get_backlinks':
          result = await this.getBacklinks(args);
          break;
          
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    });
  }

  // Performance metrics viewer
  async viewPerformanceMetrics({ format = 'summary', exportReport = false }) {
    const metrics = this.metricsCollector.getSessionMetrics();
    
    if (exportReport) {
      const report = await this.metricsCollector.generateReport('markdown');
      return {
        metrics,
        report,
        exported: true
      };
    }
    
    return metrics;
  }

  // Temporary methods - to be moved to link-handler.js
  async getLinks({ path: filePath }) {
    // Implementation remains the same as original
    // This will be moved to a LinkHandler in the next iteration
    return { links: [] }; // Placeholder
  }

  async getBacklinks({ path: filePath }) {
    // Implementation remains the same as original
    // This will be moved to a LinkHandler in the next iteration
    return { backlinks: [] }; // Placeholder
  }

  // Test methods for unit testing
  getTools() {
    const tools = [
      { name: 'vault_scan', description: 'Scan vault for files' },
      { name: 'read_notes', description: 'Read notes' },
      { name: 'write_note', description: 'Write a note' },
      { name: 'search_content', description: 'Search content' },
      { name: 'find_by_metadata', description: 'Find by metadata' },
      { name: 'git_checkpoint', description: 'Create git checkpoint' },
      { name: 'git_changes', description: 'Get git changes' },
      { name: 'get_tags', description: 'Get tags' },
      { name: 'analyze_tags', description: 'Analyze tags' },
      { name: 'update_tags', description: 'Update tags' },
      { name: 'get_daily_note', description: 'Get daily note' },
      { name: 'append_to_daily_note', description: 'Append to daily note' },
      { name: 'add_daily_task', description: 'Add daily task' },
      { name: 'update_frontmatter', description: 'Update frontmatter' },
      { name: 'init_project', description: 'Initialize project' },
      { name: 'list_project_templates', description: 'List project templates' },
      { name: 'move_file', description: 'Move file' },
      { name: 'rename_file', description: 'Rename file' },
      { name: 'archive_notes', description: 'Archive notes' },
      // GitHub integration tools
      { name: 'create_github_issue', description: 'Create a GitHub issue (can trigger Claude Code)' },
      { name: 'create_bug_report', description: 'Create an automated bug report from an error' },
      { name: 'create_feature_request', description: 'Create a feature request with design documentation' },
      { name: 'document_design_decision', description: 'Document a design decision in the vault' },
      { name: 'check_issue_status', description: 'Check the status of a GitHub issue' },
      // Claude Code headless automation tools
      { name: 'execute_claude_code_fix', description: 'Execute Claude Code in headless mode to fix an issue' },
      { name: 'execute_claude_code_feature', description: 'Execute Claude Code in headless mode to implement a feature' },
      { name: 'check_claude_code_status', description: 'Check if Claude Code CLI is installed and configured' },
      { name: 'cleanup_temp_directories', description: 'Clean up temporary directories created by Claude Code' }
    ];
    
    // Add performance metrics tool if collector is available
    if (this.metricsCollector) {
      tools.push({ name: 'view_performance_metrics', description: 'View performance metrics' });
    }
    
    return tools;
  }

  async handleToolCall(toolName, args) {
    // Track performance if monitor is available
    const startTime = Date.now();
    
    try {
      let result;
      
      // Wrap the actual tool execution with error reporting
      const executeWithErrorHandling = async () => {
      
      // Route to appropriate handler based on tool name
      switch (toolName) {
        // Vault operations
        case 'vault_scan':
          result = await this.vaultHandler.scanVault(args);
          break;
          
        // Note operations
        case 'read_notes':
          if (!args.paths) throw new Error('paths parameter is required');
          result = await this.noteHandler.readNotes(args);
          break;
          
        case 'write_note':
          if (!args.path || !args.content) {
            throw new Error('path and content parameters are required');
          }
          result = await this.noteHandler.writeNote(args);
          break;
          
        case 'update_frontmatter':
          result = await this.noteHandler.updateFrontmatter(args);
          break;
          
        case 'archive_notes':
          result = await this.noteHandler.archiveNotes(args);
          break;
          
        // Search operations
        case 'search_content':
          result = await this.searchHandler.searchContent(args);
          break;
          
        case 'find_by_metadata':
          result = await this.searchHandler.findByMetadata(args);
          break;
          
        // Git operations
        case 'git_checkpoint':
          result = await this.gitHandler.createCheckpoint(args);
          break;
          
        case 'git_changes':
          result = await this.gitHandler.getChanges(args);
          break;
          
        // Tag operations
        case 'get_tags':
          result = await this.tagHandler.getTags(args);
          break;
          
        case 'analyze_tags':
          result = await this.tagHandler.analyzeTags(args);
          break;
          
        case 'update_tags':
          result = await this.tagHandler.updateTags(args);
          break;
          
        // Daily note operations
        case 'get_daily_note':
          result = await get_daily_note(args);
          break;
          
        case 'append_to_daily_note':
          result = await append_to_daily_note(args);
          break;
          
        case 'add_daily_task':
          result = await add_daily_task(args);
          break;
          
        // Project operations
        case 'init_project':
          result = await init_project(args);
          break;
          
        case 'list_project_templates':
        case 'list_playbooks':
          result = await list_project_templates(args);
          break;
          
        // File operations
        case 'move_file':
          result = await move_file(args);
          break;
          
        case 'rename_file':
          result = await rename_file(args);
          break;
          
        // GitHub integration tools
        case 'create_github_issue':
          result = await githubTools.create_github_issue(args);
          break;
          
        case 'create_bug_report':
          result = await githubTools.create_bug_report(args);
          break;
          
        case 'create_feature_request':
          result = await githubTools.create_feature_request(args);
          break;
          
        case 'document_design_decision':
          result = await githubTools.document_design_decision(args);
          break;
          
        case 'check_issue_status':
          result = await githubTools.check_issue_status(args);
          break;
          
        // Claude Code headless automation tools
        case 'execute_claude_code_fix':
          result = await claudeCodeTools.execute_claude_code_fix(args);
          break;
          
        case 'execute_claude_code_feature':
          result = await claudeCodeTools.execute_claude_code_feature(args);
          break;
          
        case 'check_claude_code_status':
          result = await claudeCodeTools.check_claude_code_status(args);
          break;
          
        case 'cleanup_temp_directories':
          result = await claudeCodeTools.cleanup_temp_directories(args);
          break;
        
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
      };
      
      // Execute with error handling
      try {
        result = await executeWithErrorHandling();
      } catch (error) {
        // Report error if it's significant
        const errorReport = await this.errorReporter.captureAndReport(error, {
          tool: toolName,
          args,
          operation: `Executing ${toolName}`
        });
        
        // Add error report info to the error before re-throwing
        error.githubIssue = errorReport;
        throw error;
      }
      
      // Track performance if available
      if (this.metricsCollector) {
        const duration = Date.now() - startTime;
        this.metricsCollector.trackOperation(toolName, duration, true);
      }
      
      return result;
    } catch (error) {
      // Track error if collector available
      if (this.metricsCollector) {
        const duration = Date.now() - startTime;
        this.metricsCollector.trackOperation(toolName, duration, false, error.message);
      }
      
      throw error;
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }
}

// Main entry point - only run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  // Setup global error handlers for uncaught exceptions
  setupGlobalErrorHandlers();
  
  loadConfig().then(() => {
    const server = new McpServer();
    server.run().catch((error) => {
      // Log errors to stderr only in development
      if (process.env.NODE_ENV === 'development') {
        console.error('Server error:', error);
      }
      process.exit(1);
    });
  }).catch((error) => {
    // Log config errors to stderr only in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Config error:', error);
    }
    process.exit(1);
  });
}