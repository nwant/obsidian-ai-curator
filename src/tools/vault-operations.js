import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { getTagTaxonomy } from './tag-taxonomy.js';
import { getVaultPath } from '../utils/config-loader.js';

/**
 * Vault operations class - receives dependencies via constructor
 */
export class VaultOperations {
  constructor(config, frontmatterManager) {
    if (!config || !frontmatterManager) {
      throw new Error('VaultOperations initialization failed: missing required dependencies (config, frontmatterManager)');
    }
    
    this.config = config;
    this.frontmatterManager = frontmatterManager;
    this.vaultPath = config.vaultPath;
  }

  /**
   * Get AI research partner context and interaction guidelines
   */
  async get_research_context(args = {}) {
    return {
      role: "AI Research Partner",
      guidelines: [
        "Proactively find and consolidate scattered knowledge",
        "Suggest connections between related notes", 
        "Maintain proper links and references",
        "Respect existing vault structure and conventions",
        "Track research progress systematically"
      ],
      capabilities: [
        "Search across entire vault for related content",
        "Identify knowledge gaps and overlaps",
        "Suggest note merges and reorganization",
        "Auto-tag based on content analysis",
        "Create project structures from templates"
      ],
      context: {
        description: "I am your AI research partner, designed to actively curate and consolidate your knowledge in Obsidian.",
        approach: "I work like 'Tetris for knowledge' - finding scattered pieces of information and helping them fall into place within your vault."
      }
    };
  }

  /**
   * Load focused context for specific work
   */
  async get_working_context(args = {}) {
    const { 
      scope, 
      identifier, 
      depth = 'preview',
      maxNotes = 10,
      useCache = true
    } = args;
    
    if (!scope) {
      throw new Error('Scope is required (project, topic, recent, or linked)');
    }
    
    let notes = [];
    let context = {};
    
    switch (scope) {
      case 'project':
        // Find project index and related notes
        context.type = 'project';
        context.name = identifier || 'current';
        // Would search for project index and related notes
        break;
        
      case 'topic':
        // Find notes related to a topic
        context.type = 'topic';
        context.topic = identifier || 'general';
        // Would search for notes with matching tags/keywords
        break;
        
      case 'recent':
        // Get recently modified notes
        context.type = 'recent';
        context.days = identifier ? parseInt(identifier) : 7;
        // Would get recently modified files
        break;
        
      case 'linked':
        // Get notes linked to/from a specific note
        context.type = 'linked';
        context.sourcePath = identifier;
        // Would find linked notes
        break;
        
      default:
        throw new Error(`Unknown scope: ${scope}`);
    }
    
    return {
      context,
      notes: notes.slice(0, maxNotes),
      depth,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Scan vault for files with metadata
   */
  async vault_scan(args = {}) {
    const {
      patterns = ['**/*.md'],
      includeStats = false,
      includeFrontmatter = false,
      includePreview = false,
      sortBy = 'modified',
      limit = 100,
      useCache = true
    } = args;

    const files = [];

    // Process each pattern
    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: this.vaultPath,
        nodir: true,
        ignore: ['**/node_modules/**', '**/.git/**', '**/.obsidian/**']
      });

      for (const file of matches) {
        const fullPath = path.join(this.vaultPath, file);
        
        try {
          const stats = await fs.stat(fullPath);
          const fileInfo = {
            path: file,
            name: path.basename(file),
            modified: stats.mtime.toISOString(),
            created: stats.birthtime.toISOString()
          };

          // Add optional fields
          if (includeStats) {
            fileInfo.size = stats.size;
            fileInfo.wordCount = 0; // Would need to count
          }

          if (includeFrontmatter || includePreview) {
            const content = await fs.readFile(fullPath, 'utf-8');
            const parsed = this.frontmatterManager.extractFrontmatter(content);
            
            if (includeFrontmatter) {
              fileInfo.frontmatter = parsed.frontmatter;
              fileInfo.tags = parsed.frontmatter.tags || [];
            }
            
            if (includePreview) {
              fileInfo.preview = parsed.content.substring(0, 200);
            }
          }

          files.push(fileInfo);
        } catch (error) {
          console.error(`Error processing ${file}:`, error.message);
        }
      }
    }

    // Remove duplicates
    const uniqueFiles = Array.from(
      new Map(files.map(f => [f.path, f])).values()
    );

    // Sort files
    const sortedFiles = uniqueFiles.sort((a, b) => {
      switch (sortBy) {
        case 'modified':
          return new Date(b.modified) - new Date(a.modified);
        case 'path':
          return a.path.localeCompare(b.path);
        case 'size':
          return (b.size || 0) - (a.size || 0);
        default:
          return 0;
      }
    });

    // Apply limit
    const limitedFiles = sortedFiles.slice(0, limit);

    return {
      files: limitedFiles,
      total: uniqueFiles.length,
      totalCount: uniqueFiles.length, // Keep for backward compatibility
      patterns,
      sortBy,
      limit
    };
  }

  /**
   * Get frontmatter for a note
   */
  async get_frontmatter(args) {
    const { path: filePath } = args;
    
    const fullPath = path.join(this.vaultPath, filePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    const parsed = this.frontmatterManager.extractFrontmatter(content);
    
    return {
      path: filePath,
      frontmatter: parsed.frontmatter
    };
  }

  /**
   * Update frontmatter for a note
   */
  async update_frontmatter(args) {
    const { path: filePath, updates, merge = true } = args;
    
    const fullPath = path.join(this.vaultPath, filePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    const parsed = this.frontmatterManager.extractFrontmatter(content);
    
    // Update frontmatter
    let newFrontmatter;
    if (merge) {
      newFrontmatter = { ...parsed.frontmatter, ...updates };
    } else {
      newFrontmatter = updates;
    }
    
    // Clean and validate tags if present
    const taxonomy = getTagTaxonomy();
    if (newFrontmatter.tags) {
      const tagsArray = Array.isArray(newFrontmatter.tags) 
        ? newFrontmatter.tags 
        : [newFrontmatter.tags];
      newFrontmatter.tags = taxonomy.cleanAndValidateTags(tagsArray);
      if (newFrontmatter.tags.length === 0) {
        delete newFrontmatter.tags;
      }
    }
    
    // Write back using FrontmatterManager
    const newContent = this.frontmatterManager.buildContentWithFrontmatter(parsed.content, newFrontmatter);
    await fs.writeFile(fullPath, newContent);
    
    return {
      path: filePath,
      frontmatter: newFrontmatter,
      success: true
    };
  }

  /**
   * Read multiple notes with content
   */
  async read_notes(args) {
    const { paths, renderDataview = false, dataviewMode = 'smart' } = args;
    
    if (!paths || !Array.isArray(paths)) {
      throw new Error('paths array is required');
    }
    
    const notes = [];
    
    for (const notePath of paths) {
      try {
        const fullPath = path.join(this.vaultPath, notePath);
        const content = await fs.readFile(fullPath, 'utf-8');
        const parsed = this.frontmatterManager.extractFrontmatter(content);
        
        const note = {
          path: notePath,
          content: parsed.content,
          frontmatter: parsed.frontmatter,
          raw: content
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
  async write_note(args) {
    const { path: notePath, content } = args;
    
    if (!notePath || !content) {
      throw new Error('path and content are required');
    }
    
    const fullPath = path.join(this.vaultPath, notePath);
    
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
    
    // Parse content to handle frontmatter if present
    let finalContent = content;
    if (content.includes('---\n') || content.startsWith('---\n')) {
      const parsed = this.frontmatterManager.extractFrontmatter(content);
      
      // Validate tags if present
      const taxonomy = getTagTaxonomy();
      if (parsed.frontmatter.tags) {
        const tagsArray = Array.isArray(parsed.frontmatter.tags) 
          ? parsed.frontmatter.tags 
          : [parsed.frontmatter.tags];
        parsed.frontmatter.tags = taxonomy.cleanAndValidateTags(tagsArray);
        if (parsed.frontmatter.tags.length === 0) {
          delete parsed.frontmatter.tags;
        }
      }
      
      // Rebuild content with validated frontmatter
      finalContent = this.frontmatterManager.buildContentWithFrontmatter(parsed.content, parsed.frontmatter);
    }
    
    // Write file
    await fs.writeFile(fullPath, finalContent, 'utf-8');
    
    return {
      success: true,
      path: notePath,
      action,
      message: `Note ${action} successfully`
    };
  }
}

// Legacy singleton instance for backward compatibility
let vaultOperationsInstance = null;

/**
 * Initialize vault operations with dependencies
 * For backward compatibility with existing MCP server
 */
export function initVaultOperations(config, frontmatterManager) {
  vaultOperationsInstance = new VaultOperations(config, frontmatterManager);
}

/**
 * Legacy function exports for backward compatibility
 */
export async function get_research_context(args) {
  if (!vaultOperationsInstance) {
    // get_research_context doesn't need frontmatterManager, so we can provide a minimal one
    const minimalFM = { extractFrontmatter: (c) => ({ content: c, frontmatter: {} }) };
    return new VaultOperations({ vaultPath: await getVaultPath() }, minimalFM).get_research_context(args);
  }
  return vaultOperationsInstance.get_research_context(args);
}

export async function get_working_context(args) {
  if (!vaultOperationsInstance) {
    throw new Error('Vault operations not initialized. Call initVaultOperations first.');
  }
  return vaultOperationsInstance.get_working_context(args);
}

export async function vault_scan(args) {
  if (!vaultOperationsInstance) {
    throw new Error('Vault operations not initialized. Call initVaultOperations first.');
  }
  return vaultOperationsInstance.vault_scan(args);
}

export async function get_frontmatter(args) {
  if (!vaultOperationsInstance) {
    throw new Error('Vault operations not initialized. Call initVaultOperations first.');
  }
  return vaultOperationsInstance.get_frontmatter(args);
}

export async function update_frontmatter(args) {
  if (!vaultOperationsInstance) {
    throw new Error('Vault operations not initialized. Call initVaultOperations first.');
  }
  return vaultOperationsInstance.update_frontmatter(args);
}

export async function read_notes(args) {
  if (!vaultOperationsInstance) {
    throw new Error('Vault operations not initialized. Call initVaultOperations first.');
  }
  return vaultOperationsInstance.read_notes(args);
}

export async function write_note(args) {
  if (!vaultOperationsInstance) {
    throw new Error('Vault operations not initialized. Call initVaultOperations first.');
  }
  return vaultOperationsInstance.write_note(args);
}