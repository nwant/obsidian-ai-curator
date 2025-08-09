import fs from 'fs/promises';
import { getVaultPath } from '../utils/config-loader.js';
import path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';

/**
 * Vault operations tools
 */

/**
 * Get AI research partner context and interaction guidelines
 */
export async function get_research_context(args = {}) {
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
export async function get_working_context(args = {}) {
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
  
  // Get vault path from config
  const vaultPath = await getVaultPath();
  
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

export async function vault_scan(args) {
  const {
    patterns = ['**/*.md'],
    includeStats = false,
    includeFrontmatter = false,
    includePreview = false,
    sortBy = 'modified',
    limit = 100,
    useCache = true
  } = args;

  // Get vault path from config
  const vaultPath = await getVaultPath();

  // Find files matching patterns
  const files = [];
  for (const pattern of patterns) {
    try {
      const matches = await glob(pattern, {
        cwd: vaultPath,
        ignore: config.ignorePatterns || ['.obsidian/**', '.git/**', '.trash/**']
      });
      files.push(...matches);
    } catch (error) {
      throw new Error(`Invalid pattern: ${pattern}`);
    }
  }

  // Remove duplicates
  const uniqueFiles = [...new Set(files)];

  // Get file details
  const fileDetails = await Promise.all(
    uniqueFiles.map(async (file) => {
      const fullPath = path.join(vaultPath, file);
      const stats = await fs.stat(fullPath);
      
      let result = {
        path: file,
        modified: stats.mtime.toISOString(),
        created: stats.ctime.toISOString()
      };

      if (includeStats) {
        const content = await fs.readFile(fullPath, 'utf-8');
        result.size = stats.size;
        result.wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
      }

      if (includeFrontmatter) {
        const content = await fs.readFile(fullPath, 'utf-8');
        const { data } = matter(content);
        result.frontmatter = data;
      }

      if (includePreview) {
        const content = await fs.readFile(fullPath, 'utf-8');
        const { content: body } = matter(content);
        result.preview = body.substring(0, 200);
      }

      return result;
    })
  );

  // Sort files
  const sortedFiles = fileDetails.sort((a, b) => {
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

export async function get_frontmatter(args) {
  const { path: filePath } = args;
  
  // Get vault path from config
  const vaultPath = await getVaultPath();
  
  const fullPath = path.join(vaultPath, filePath);
  const content = await fs.readFile(fullPath, 'utf-8');
  const { data } = matter(content);
  
  return {
    path: filePath,
    frontmatter: data
  };
}

export async function update_frontmatter(args) {
  const { path: filePath, updates, merge = true } = args;
  
  // Get vault path from config
  const vaultPath = await getVaultPath();
  
  const fullPath = path.join(vaultPath, filePath);
  const content = await fs.readFile(fullPath, 'utf-8');
  const parsed = matter(content);
  
  // Update frontmatter
  if (merge) {
    parsed.data = { ...parsed.data, ...updates };
  } else {
    parsed.data = updates;
  }
  
  // Write back
  const newContent = matter.stringify(parsed.content, parsed.data);
  await fs.writeFile(fullPath, newContent);
  
  return {
    path: filePath,
    frontmatter: parsed.data,
    success: true
  };
}

export async function read_notes(args) {
  const { paths, renderDataview = false, dataviewMode = 'smart' } = args;
  
  if (!paths || !Array.isArray(paths)) {
    throw new Error('paths parameter is required and must be an array');
  }
  
  // Get vault path from config
  const vaultPath = await getVaultPath();
  
  const notes = await Promise.all(paths.map(async (notePath) => {
    const fullPath = path.join(vaultPath, notePath);
    
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      
      // Try to parse frontmatter, but handle errors gracefully
      let frontmatter = {};
      let body = content;
      
      try {
        const parsed = matter(content);
        frontmatter = parsed.data;
        body = parsed.content;
      } catch (parseError) {
        // If frontmatter parsing fails, treat entire content as body
        console.error(`Failed to parse frontmatter for ${notePath}:`, parseError.message);
        // Try to extract content after the frontmatter delimiters
        const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
        if (match) {
          body = match[1];
        }
      }
      
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
        content: body,
        frontmatter,
        headings,
        links,
        raw: content
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Return empty note for missing files
        return {
          path: notePath,
          exists: false,
          content: '',
          frontmatter: {},
          headings: [],
          links: [],
          raw: '',
          error: `Note not found: ${notePath}`
        };
      }
      throw error;
    }
  }));
  
  return {
    notes,
    count: notes.length
  };
}