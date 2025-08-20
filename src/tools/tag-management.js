import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';
import { getTagTaxonomy } from './tag-taxonomy.js';

/**
 * Tag management class - receives dependencies via constructor
 */
export class TagManagement {
  constructor(config, frontmatterManager, apiClient) {
    if (!config || !frontmatterManager) {
      throw new Error('TagManagement initialization failed: missing required dependencies (config, frontmatterManager)');
    }
    
    this.config = config;
    this.frontmatterManager = frontmatterManager;
    this.apiClient = apiClient; // Optional - will fallback to direct file access if not provided
    this.vaultPath = config.vaultPath;
    this.taxonomy = getTagTaxonomy();
  }

  /**
   * Get tags from vault or specific file
   */
  async get_tags(args = {}) {
    const { path: filePath } = args;
    
    // Try to use Obsidian API if available (but not in test mode)
    if (this.config.useObsidianAPI !== false && process.env.NODE_ENV !== 'test') {
      try {
        const endpoint = filePath ? `/api/tags/file?path=${encodeURIComponent(filePath)}` : '/api/tags';
        const response = await fetch(`http://localhost:3001${endpoint}`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(1000)
        });
        
        if (response.ok) {
          const apiData = await response.json();
          if (apiData.success && apiData.data) {
            // For single file, return the tags array
            if (filePath) {
              return {
                tags: apiData.data.tags || [],
                file: filePath
              };
            }
            
            // For all tags, convert to our format
            // IMPORTANT: Obsidian API returns tags WITH hashtags (e.g., #example)
            // We need to clean them for consistency
            const tags = apiData.data.tags || {};
            const cleanedTags = {};
            const tagList = [];
            
            Object.entries(tags).forEach(([tag, count]) => {
              // Remove hashtag prefix from Obsidian API tags
              const cleanTag = tag.replace(/^#/, '');
              cleanedTags[cleanTag] = count;
              tagList.push({ tag: cleanTag, count });
            });
            
            const tagHierarchy = apiData.data.hierarchy || this.buildHierarchy(tagList);
            
            return {
              tags: Object.keys(cleanedTags),  // Array of clean tag names
              tagCounts: cleanedTags,  // Object mapping clean tag to count
              tagList: tagList,  // Array of {tag, count} with clean tags
              totalTags: tagList.length,
              hierarchy: tagHierarchy,
              tagArray: Object.keys(cleanedTags)  // Array of clean tag names
            };
          }
        }
      } catch (apiError) {
        // Fall back to file-based scanning
        console.error('API not available for getting tags:', apiError.message);
      }
    }
    
    // Get files to scan
    let files = [];
    if (filePath) {
      files = [filePath];
    } else {
      files = await glob('**/*.md', {
        cwd: this.vaultPath,
        ignore: this.config.ignorePatterns || ['.obsidian/**', '.git/**', '.trash/**']
      });
    }
    
    const tagCounts = new Map();
    const fileTagMap = new Map();
    
    for (const file of files) {
      const fullPath = path.join(this.vaultPath, file);
      
      // Check if file exists for single file queries
      if (filePath) {
        try {
          await fs.access(fullPath);
        } catch (error) {
          throw new Error(`File not found: ${filePath}`);
        }
      }
      
      const content = await fs.readFile(fullPath, 'utf-8');
      
      let data = {};
      let noteContent = content;
      
      // Parse frontmatter using FrontmatterManager
      const parsed = this.frontmatterManager.extractFrontmatter(content);
      data = parsed.frontmatter;
      noteContent = parsed.content;
      
      const fileTags = new Set();
      
      // Get frontmatter tags (without # prefix)
      if (data.tags) {
        const tags = Array.isArray(data.tags) ? data.tags : [data.tags];
        tags.forEach(tag => {
          // Ensure no # prefix in frontmatter tags
          const cleanTag = tag.replace(/^#/, '');
          fileTags.add(cleanTag);
          tagCounts.set(cleanTag, (tagCounts.get(cleanTag) || 0) + 1);
        });
      }
      
      // Get inline tags (with # prefix in content)
      const inlineTags = noteContent.match(/#[\w-]+(?:\/[\w-]+)*/g) || [];
      inlineTags.forEach(tag => {
        // Remove # prefix for consistency
        const cleanTag = tag.substring(1);
        fileTags.add(cleanTag);
        tagCounts.set(cleanTag, (tagCounts.get(cleanTag) || 0) + 1);
      });
      
      fileTagMap.set(file, Array.from(fileTags));
    }
    
    // Return early for single file query
    if (filePath) {
      return {
        tags: fileTagMap.get(filePath) || [],
        file: filePath
      };
    }
    
    // Convert to array and sort by count
    const tagList = Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
    
    // Build hierarchy
    const hierarchy = this.buildHierarchy(tagList);
    
    // Create object mapping
    const tagCountsObject = Object.fromEntries(tagCounts);
    
    return {
      tags: tagList.map(t => t.tag),  // Array of tag names
      tagCounts: tagCountsObject,  // Object mapping tag to count
      tagList: tagList,  // Array of {tag, count}
      totalTags: tagList.length,
      hierarchy,
      tagArray: tagList.map(t => t.tag)  // Array of tag names (duplicate for compatibility)
    };
  }

  /**
   * Build tag hierarchy from flat list
   */
  buildHierarchy(tagList) {
    const hierarchy = {};
    
    tagList.forEach(({ tag, count }) => {
      const parts = tag.split('/');
      let current = hierarchy;
      
      parts.forEach((part, index) => {
        if (!current[part]) {
          current[part] = {
            count: 0,
            children: {}
          };
        }
        
        // Only count at leaf level
        if (index === parts.length - 1) {
          current[part].count = count;
        }
        
        current = current[part].children;
      });
    });
    
    return hierarchy;
  }

  /**
   * Suggest tags based on content
   */
  async suggest_tags(args = {}) {
    const { content, path: filePath } = args;
    
    if (!content && !filePath) {
      throw new Error('Either content or path is required');
    }
    
    let textToAnalyze = content;
    if (filePath) {
      const fullPath = path.join(this.vaultPath, filePath);
      const fileContent = await fs.readFile(fullPath, 'utf-8');
      const parsed = this.frontmatterManager.extractFrontmatter(fileContent);
      textToAnalyze = parsed.content;
    }
    
    // Get all existing tags for reference
    const allTagsResult = await this.get_tags({});
    const existingTags = allTagsResult.tags || [];
    
    // Simple keyword-based suggestions
    const suggestions = [];
    const lowerContent = textToAnalyze.toLowerCase();
    
    // Check which existing tags appear in content
    existingTags.forEach(tag => {
      const tagWords = tag.split(/[/-]/).filter(w => w.length > 2);
      const matches = tagWords.filter(word => 
        lowerContent.includes(word.toLowerCase())
      );
      
      if (matches.length > 0) {
        suggestions.push({
          tag,
          confidence: matches.length / tagWords.length,
          reason: `Contains keywords: ${matches.join(', ')}`
        });
      }
    });
    
    // Sort by confidence
    suggestions.sort((a, b) => b.confidence - a.confidence);
    
    return {
      suggestions: suggestions.slice(0, 10),
      basedOn: filePath ? 'file' : 'content'
    };
  }

  /**
   * Update tags for a note
   */
  async update_tags(args = {}) {
    const { 
      path: filePath, 
      add = [], 
      remove = [], 
      replace,
      tags,  // Support both 'tags' and 'replace' parameters
      mode = 'merge'
    } = args;
    
    if (!filePath) {
      throw new Error('path is required');
    }
    
    const fullPath = path.join(this.vaultPath, filePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    const parsed = this.frontmatterManager.extractFrontmatter(content);
    
    // Get current tags
    let currentTags = parsed.frontmatter.tags || [];
    if (!Array.isArray(currentTags)) {
      currentTags = [currentTags];
    }
    
    // Normalize tags (remove # prefix, trim, but PRESERVE case for hierarchical tags)
    const normalizeTag = (tag) => {
      return tag.replace(/^#/, '')  // Remove # prefix
                .trim()              // Trim whitespace
                .replace(/\s+/g, '-');  // Replace spaces with hyphens
                // Note: NOT lowercasing to preserve tag hierarchy structure
    };
    
    currentTags = currentTags.map(normalizeTag).filter(t => t); // Filter out empty tags
    const cleanAdd = add.map(normalizeTag);
    const cleanRemove = remove.map(normalizeTag);
    
    // Apply changes based on mode
    let newTags;
    let actuallyAdded = [];
    let actuallyRemoved = [];
    
    if (mode === 'replace' || replace !== undefined || tags !== undefined) {
      // Replace mode - use 'tags' or 'replace' parameter
      const replaceTags = tags || replace || [];
      newTags = Array.isArray(replaceTags) ? replaceTags.map(normalizeTag) : [];
      actuallyRemoved = currentTags.filter(tag => !newTags.includes(tag));
      actuallyAdded = newTags.filter(tag => !currentTags.includes(tag));
    } else if (mode === 'add') {
      // Add mode - only add tags
      newTags = [...currentTags];
      cleanAdd.forEach(tag => {
        if (!newTags.includes(tag)) {
          newTags.push(tag);
          actuallyAdded.push(tag);
        }
      });
    } else if (mode === 'remove') {
      // Remove mode - only remove tags
      newTags = currentTags.filter(tag => {
        if (cleanRemove.includes(tag)) {
          actuallyRemoved.push(tag);
          return false;
        }
        return true;
      });
    } else {
      // Default merge mode - add and remove as specified
      newTags = [...currentTags];
      
      // Remove tags
      newTags = newTags.filter(tag => {
        if (cleanRemove.includes(tag)) {
          actuallyRemoved.push(tag);
          return false;
        }
        return true;
      });
      
      // Add tags
      cleanAdd.forEach(tag => {
        if (!newTags.includes(tag)) {
          newTags.push(tag);
          actuallyAdded.push(tag);
        }
      });
    }
    
    // Validate tags against taxonomy
    if (newTags.length > 0) {
      newTags = this.taxonomy.cleanAndValidateTags(newTags);
    }
    
    // Update frontmatter
    let newFrontmatter = { ...parsed.frontmatter };
    if (newTags.length > 0) {
      newFrontmatter.tags = newTags;
    } else {
      delete newFrontmatter.tags;
    }
    
    newFrontmatter.modified = new Date().toISOString();
    
    // Write back using FrontmatterManager
    const newContent = this.frontmatterManager.buildContentWithFrontmatter(parsed.content, newFrontmatter);
    await fs.writeFile(fullPath, newContent);
    
    return {
      path: filePath,
      tags: newTags,
      added: actuallyAdded,
      removed: actuallyRemoved,
      success: true
    };
  }

  /**
   * Analyze tag usage across vault
   */
  async analyze_tags() {
    // Try to use Obsidian API if available
    if (this.config.useObsidianAPI !== false && process.env.NODE_ENV !== 'test') {
      try {
        const response = await fetch('http://localhost:3001/api/tags/analysis', {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(2000)
        });
        
        if (response.ok) {
          const apiData = await response.json();
          if (apiData.success && apiData.data) {
            return apiData.data;
          }
        }
      } catch (apiError) {
        console.error('API not available for tag analysis:', apiError.message);
      }
    }
    
    // Fall back to file-based analysis
    const result = await this.get_tags({});
    const { tagList = [], hierarchy = {} } = result;
    
    // Calculate statistics
    const totalFiles = await glob('**/*.md', {
      cwd: this.vaultPath,
      ignore: this.config.ignorePatterns || ['.obsidian/**', '.git/**', '.trash/**']
    }).then(files => files.length);
    
    const avgTagsPerFile = tagList.reduce((sum, t) => sum + t.count, 0) / totalFiles;
    
    // Find orphaned tags (used only once)
    const orphanedTags = tagList.filter(t => t.count === 1).map(t => t.tag);
    
    // Find popular tags (used in >10% of files)
    const popularThreshold = Math.ceil(totalFiles * 0.1);
    const popularTags = tagList.filter(t => t.count >= popularThreshold).map(t => t.tag);
    
    // Taxonomy validation
    const taxonomy = this.taxonomy;
    const definedTags = taxonomy.getAllDefinedTags().map(t => t.tag);
    const usedTags = tagList.map(t => t.tag);
    
    // Find tags used but not defined in taxonomy
    const undefinedTags = usedTags.filter(tag => !definedTags.includes(tag));
    
    // Find tags defined but never used
    const unusedDefinedTags = definedTags.filter(tag => !usedTags.includes(tag));
    
    return {
      totalTags: tagList.length,
      totalFiles,
      avgTagsPerFile: Math.round(avgTagsPerFile * 10) / 10,
      orphanedTags,
      popularTags,
      topTags: tagList.slice(0, 10),
      hierarchy,
      taxonomy: {
        defined: definedTags.length,
        undefined: undefinedTags,
        unused: unusedDefinedTags
      }
    };
  }

  /**
   * Find notes by tags
   */
  async find_by_tags(args = {}) {
    const { tags = [], matchAll = false } = args;
    
    if (tags.length === 0) {
      throw new Error('At least one tag is required');
    }
    
    // Normalize tags
    const searchTags = tags.map(tag => tag.replace(/^#/, '').toLowerCase());
    
    const files = await glob('**/*.md', {
      cwd: this.vaultPath,
      ignore: this.config.ignorePatterns || ['.obsidian/**', '.git/**', '.trash/**']
    });
    
    const matches = [];
    
    for (const file of files) {
      const fullPath = path.join(this.vaultPath, file);
      const content = await fs.readFile(fullPath, 'utf-8');
      const parsed = this.frontmatterManager.extractFrontmatter(content);
      
      // Get all tags from the file
      const fileTags = new Set();
      
      // Frontmatter tags
      if (parsed.frontmatter.tags) {
        const fmTags = Array.isArray(parsed.frontmatter.tags) 
          ? parsed.frontmatter.tags 
          : [parsed.frontmatter.tags];
        fmTags.forEach(tag => fileTags.add(tag.toLowerCase()));
      }
      
      // Inline tags
      const inlineTags = parsed.content.match(/#[\w-]+(?:\/[\w-]+)*/g) || [];
      inlineTags.forEach(tag => fileTags.add(tag.substring(1).toLowerCase()));
      
      // Check if file matches search criteria
      const matchedTags = searchTags.filter(tag => fileTags.has(tag));
      const isMatch = matchAll 
        ? matchedTags.length === searchTags.length
        : matchedTags.length > 0;
      
      if (isMatch) {
        matches.push({
          path: file,
          tags: Array.from(fileTags),
          matchedTags,
          title: parsed.frontmatter.title || path.basename(file, '.md')
        });
      }
    }
    
    return {
      matches,
      searchTags,
      matchAll,
      totalMatches: matches.length
    };
  }

  /**
   * Clean up tags - remove duplicates, fix formatting
   */
  async cleanup_tags(args = {}) {
    const { dryRun = false, removeOrphaned = false } = args;
    
    const files = await glob('**/*.md', {
      cwd: this.vaultPath,
      ignore: this.config.ignorePatterns || ['.obsidian/**', '.git/**', '.trash/**']
    });
    
    const changes = [];
    const taxonomy = this.taxonomy;
    
    for (const file of files) {
      const fullPath = path.join(this.vaultPath, file);
      const content = await fs.readFile(fullPath, 'utf-8');
      const parsed = this.frontmatterManager.extractFrontmatter(content);
      
      if (!parsed.frontmatter.tags) continue;
      
      let tags = Array.isArray(parsed.frontmatter.tags) 
        ? parsed.frontmatter.tags 
        : [parsed.frontmatter.tags];
      
      // Clean and normalize
      const originalLength = tags.length;
      tags = tags.map(tag => tag.replace(/^#/, '').trim().toLowerCase());
      tags = [...new Set(tags)]; // Remove duplicates
      
      // Validate against taxonomy
      let validTags;
      try {
        validTags = taxonomy.cleanAndValidateTags(tags);
      } catch (error) {
        // If validation fails, skip this file
        console.warn(`Skipping ${file}: ${error.message}`);
        continue;
      }
      
      // Check if changes are needed
      const needsUpdate = originalLength !== validTags.length || 
                          !tags.every((tag, i) => tag === validTags[i]);
      
      if (needsUpdate) {
        changes.push({
          path: file,
          before: parsed.frontmatter.tags,
          after: validTags
        });
        
        if (!dryRun) {
          const newFrontmatter = { ...parsed.frontmatter, tags: validTags };
          const newContent = this.frontmatterManager.buildContentWithFrontmatter(parsed.content, newFrontmatter);
          await fs.writeFile(fullPath, newContent);
        }
      }
    }
    
    return {
      changes,
      totalFiles: files.length,
      filesChanged: changes.length,
      dryRun
    };
  }

  /**
   * Rename a tag across all files
   */
  async rename_tag(args = {}) {
    const { 
      oldTag, 
      newTag, 
      preview = false,
      includeInline = true,
      includeFrontmatter = true
    } = args;
    
    if (!oldTag || !newTag) {
      throw new Error('Both oldTag and newTag are required');
    }
    
    // Normalize tags (remove # prefix)
    const normalizedOld = oldTag.replace(/^#/, '').toLowerCase();
    const normalizedNew = newTag.replace(/^#/, '');
    
    const files = await glob('**/*.md', {
      cwd: this.vaultPath,
      ignore: this.config.ignorePatterns || ['.obsidian/**', '.git/**', '.trash/**']
    });
    
    const changes = [];
    let filesUpdated = 0;
    
    for (const file of files) {
      const fullPath = path.join(this.vaultPath, file);
      const content = await fs.readFile(fullPath, 'utf-8');
      const parsed = this.frontmatterManager.extractFrontmatter(content);
      
      let modified = false;
      let newContent = parsed.content;
      let newFrontmatter = { ...parsed.frontmatter };
      
      // Handle frontmatter tags
      if (includeFrontmatter && parsed.frontmatter.tags) {
        let tags = Array.isArray(parsed.frontmatter.tags) 
          ? parsed.frontmatter.tags 
          : [parsed.frontmatter.tags];
        
        const updatedTags = tags.map(tag => {
          const normalized = tag.replace(/^#/, '').toLowerCase();
          if (normalized === normalizedOld) {
            modified = true;
            return normalizedNew;
          }
          return tag;
        });
        
        if (modified) {
          newFrontmatter.tags = updatedTags;
        }
      }
      
      // Handle inline tags
      if (includeInline) {
        const inlineRegex = new RegExp(`#${normalizedOld.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        if (inlineRegex.test(newContent)) {
          newContent = newContent.replace(inlineRegex, `#${normalizedNew}`);
          modified = true;
        }
      }
      
      if (modified) {
        changes.push({
          path: file,
          type: 'rename',
          oldTag: normalizedOld,
          newTag: normalizedNew
        });
        
        if (!preview) {
          const finalContent = this.frontmatterManager.buildContentWithFrontmatter(newContent, newFrontmatter);
          await fs.writeFile(fullPath, finalContent);
          filesUpdated++;
        }
      }
    }
    
    return {
      success: true,
      filesUpdated: preview ? changes.length : filesUpdated,
      changes,
      preview,
      oldTag: normalizedOld,
      newTag: normalizedNew
    };
  }

  /**
   * Replace inline tags with frontmatter tags
   */
  async migrate_inline_tags(args = {}) {
    const { paths, dryRun = false } = args;
    
    let files;
    if (paths && paths.length > 0) {
      files = paths;
    } else {
      files = await glob('**/*.md', {
        cwd: this.vaultPath,
        ignore: this.config.ignorePatterns || ['.obsidian/**', '.git/**', '.trash/**']
      });
    }
    
    const migrations = [];
    
    for (const file of files) {
      const fullPath = path.join(this.vaultPath, file);
      const content = await fs.readFile(fullPath, 'utf-8');
      const parsed = this.frontmatterManager.extractFrontmatter(content);
      
      // Find inline tags
      const inlineTags = parsed.content.match(/#[\w-]+(?:\/[\w-]+)*/g) || [];
      if (inlineTags.length === 0) continue;
      
      // Clean inline tags
      const cleanedInlineTags = inlineTags.map(tag => tag.substring(1).toLowerCase());
      
      // Get existing frontmatter tags
      let frontmatterTags = parsed.frontmatter.tags || [];
      if (!Array.isArray(frontmatterTags)) {
        frontmatterTags = [frontmatterTags];
      }
      
      // Combine and deduplicate
      const allTags = [...new Set([...frontmatterTags, ...cleanedInlineTags])];
      
      // Remove inline tags from content
      const newBody = parsed.content.replace(/#[\w-]+(?:\/[\w-]+)*/g, '');
      
      migrations.push({
        path: file,
        inlineTags: inlineTags,
        frontmatterBefore: frontmatterTags,
        frontmatterAfter: allTags,
        preview: dryRun
      });
      
      if (!dryRun) {
        const newFrontmatter = { ...parsed.frontmatter, tags: allTags, modified: new Date().toISOString() };
        const newContent = this.frontmatterManager.buildContentWithFrontmatter(newBody, newFrontmatter);
        await fs.writeFile(fullPath, newContent);
      }
    }
    
    return {
      migrations,
      totalFiles: files.length,
      filesModified: migrations.length,
      dryRun
    };
  }

  /**
   * Validate tags against the taxonomy - throws if any are invalid
   */
  async validate_tags({ tags }) {
    if (!tags || !Array.isArray(tags)) {
      throw new Error('tags parameter must be an array');
    }

    // Validate all tags - will throw on first invalid one
    this.taxonomy.validateTags(tags);
    
    // If we get here, all tags are valid
    return { valid: true };
  }

  /**
   * Get the full tag taxonomy configuration
   */
  async get_tag_taxonomy() {
    return {
      settings: this.taxonomy.getSettings(),
      tags: this.taxonomy.getAllDefinedTags()
    };
  }
}

// Legacy singleton instance for backward compatibility
let tagManagementInstance = null;

/**
 * Initialize tag management with dependencies
 * For backward compatibility with existing MCP server
 */
export function initTagManagement(config, frontmatterManager, apiClient) {
  tagManagementInstance = new TagManagement(config, frontmatterManager, apiClient);
}

/**
 * Legacy function exports for backward compatibility
 */
export async function get_tags(args) {
  if (!tagManagementInstance) {
    throw new Error('Tag management not initialized. Call initTagManagement first.');
  }
  return tagManagementInstance.get_tags(args);
}

export async function suggest_tags(args) {
  if (!tagManagementInstance) {
    throw new Error('Tag management not initialized. Call initTagManagement first.');
  }
  return tagManagementInstance.suggest_tags(args);
}

export async function update_tags(args) {
  if (!tagManagementInstance) {
    throw new Error('Tag management not initialized. Call initTagManagement first.');
  }
  return tagManagementInstance.update_tags(args);
}

export async function analyze_tags(args) {
  if (!tagManagementInstance) {
    throw new Error('Tag management not initialized. Call initTagManagement first.');
  }
  return tagManagementInstance.analyze_tags(args);
}

export async function find_by_tags(args) {
  if (!tagManagementInstance) {
    throw new Error('Tag management not initialized. Call initTagManagement first.');
  }
  return tagManagementInstance.find_by_tags(args);
}

export async function cleanup_tags(args) {
  if (!tagManagementInstance) {
    throw new Error('Tag management not initialized. Call initTagManagement first.');
  }
  return tagManagementInstance.cleanup_tags(args);
}

export async function rename_tag(args) {
  if (!tagManagementInstance) {
    throw new Error('Tag management not initialized. Call initTagManagement first.');
  }
  return tagManagementInstance.rename_tag(args);
}

export async function migrate_inline_tags(args) {
  if (!tagManagementInstance) {
    throw new Error('Tag management not initialized. Call initTagManagement first.');
  }
  return tagManagementInstance.migrate_inline_tags(args);
}

export async function validate_tags(args) {
  return tagManagementInstance.validate_tags(args);
}

export async function get_tag_taxonomy() {
  return tagManagementInstance.get_tag_taxonomy();
}