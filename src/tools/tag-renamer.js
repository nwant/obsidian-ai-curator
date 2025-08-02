/**
 * Global Tag Rename Tool
 * Renames tags across the entire vault, handling both frontmatter and inline tags.
 * Leverages Obsidian API when available for better performance.
 */

import path from 'path';
import { promises as fs } from 'fs';
import { glob } from 'glob';
import matter from 'gray-matter';

export class TagRenamer {
  constructor(config, obsidianAPI = null) {
    this.config = config;
    this.vaultPath = config.vaultPath;
    this.obsidianAPI = obsidianAPI;
  }

  /**
   * Rename a tag globally across the vault
   * @param {string} oldTag - The tag to rename (with or without #)
   * @param {string} newTag - The new tag name (with or without #)
   * @param {Object} options - Options for the rename operation
   * @returns {Object} Result with affected files and changes
   */
  async renameTag(oldTag, newTag, options = {}) {
    const { 
      preview = false,  // If true, only show what would change without applying
      includeInline = true,  // Rename inline tags in content
      includeFrontmatter = true  // Rename tags in frontmatter
    } = options;

    // Normalize tags (remove # for comparison)
    const oldTagClean = oldTag.startsWith('#') ? oldTag.substring(1) : oldTag;
    const newTagClean = newTag.startsWith('#') ? newTag.substring(1) : newTag;

    // Validate tags
    if (!oldTagClean || !newTagClean) {
      throw new Error('Both old and new tag names are required');
    }

    if (oldTagClean === newTagClean) {
      throw new Error('Old and new tags are the same');
    }

    // Create options object with defaults applied
    const processOptions = {
      preview,
      includeInline,
      includeFrontmatter
    };

    // Try Obsidian API first if available
    if (this.obsidianAPI && this.obsidianAPI.isAvailable() && !preview) {
      try {
        return await this.renameTagWithObsidianAPI(oldTagClean, newTagClean, processOptions);
      } catch (error) {
        console.error('Obsidian API tag rename failed, falling back to manual method:', error);
      }
    }

    // Fallback to manual method
    return await this.renameTagManually(oldTagClean, newTagClean, processOptions);
  }

  /**
   * Rename tag using Obsidian API
   */
  async renameTagWithObsidianAPI(oldTag, newTag, options) {
    try {
      const response = await this.obsidianAPI.request('/api/rename-tag', {
        oldTag: `#${oldTag}`,
        newTag: `#${newTag}`,
        includeInline: options.includeInline,
        includeFrontmatter: options.includeFrontmatter
      });

      if (response.success) {
        return {
          success: true,
          oldTag,
          newTag,
          filesModified: response.data.filesModified || 0,
          method: 'obsidian-api',
          details: response.data
        };
      } else {
        throw new Error(response.error || 'Tag rename failed');
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Manually rename tags across all files
   */
  async renameTagManually(oldTag, newTag, options) {
    const { preview, includeInline, includeFrontmatter } = options;
    
    // Find all markdown files
    const pattern = path.join(this.vaultPath, '**/*.md');
    const files = await glob(pattern, {
      ignore: this.config.ignorePatterns?.map(p => path.join(this.vaultPath, p))
    });

    const results = {
      filesScanned: files.length,
      filesModified: 0,
      changes: [],
      oldTag,
      newTag,
      preview
    };

    // Process each file
    for (const filePath of files) {
      const relativePath = path.relative(this.vaultPath, filePath);
      const changes = await this.processFile(filePath, oldTag, newTag, {
        preview,
        includeInline,
        includeFrontmatter
      });

      if (changes.modified) {
        results.filesModified++;
        results.changes.push({
          file: relativePath,
          frontmatterTags: changes.frontmatterTags,
          inlineTags: changes.inlineTags,
          totalChanges: changes.frontmatterTags + changes.inlineTags
        });
      }
    }

    return {
      success: true,
      ...results,
      method: 'manual'
    };
  }

  /**
   * Process a single file for tag renaming
   */
  async processFile(filePath, oldTag, newTag, options) {
    const { preview, includeInline, includeFrontmatter } = options;
    
    let content = await fs.readFile(filePath, 'utf-8');
    const parsed = matter(content);
    
    let frontmatterChanges = 0;
    let inlineChanges = 0;
    let updatedData = { ...parsed.data };
    let updatedContent = parsed.content;

    // Process frontmatter tags
    if (includeFrontmatter && parsed.data.tags) {
      if (Array.isArray(parsed.data.tags)) {
        const newTags = [];
        let changed = false;
        
        parsed.data.tags.forEach(tag => {
          // Clean tag for comparison (remove # if present)
          const cleanTag = tag.startsWith('#') ? tag.substring(1) : tag;
          if (cleanTag === oldTag) {
            newTags.push(newTag);
            frontmatterChanges++;
            changed = true;
          } else {
            newTags.push(tag);
          }
        });
        
        if (changed) {
          updatedData.tags = newTags;
        }
      } else if (typeof parsed.data.tags === 'string') {
        const cleanTag = parsed.data.tags.startsWith('#') ? parsed.data.tags.substring(1) : parsed.data.tags;
        if (cleanTag === oldTag) {
          updatedData.tags = newTag;
          frontmatterChanges++;
        }
      }
    }

    // Process inline tags
    if (includeInline) {
      // Use negative lookahead for better partial match protection
      // This ensures we don't match tags that continue with alphanumeric chars, hyphens, underscores, or slashes
      const inlineTagRegex = new RegExp(`#${this.escapeRegex(oldTag)}(?![a-zA-Z0-9_/-])`, 'g');
      const matches = parsed.content.match(inlineTagRegex);
      inlineChanges = matches ? matches.length : 0;

      if (inlineChanges > 0) {
        // Replace inline tags
        updatedContent = parsed.content.replace(
          inlineTagRegex,
          `#${newTag}`
        );
      }
    }

    // Write file if not in preview mode and there were changes
    const modified = frontmatterChanges > 0 || inlineChanges > 0;
    if (modified && !preview) {
      const finalContent = matter.stringify(updatedContent, updatedData);
      await fs.writeFile(filePath, finalContent, 'utf-8');
    }

    return {
      modified,
      frontmatterTags: frontmatterChanges,
      inlineTags: inlineChanges
    };
  }

  /**
   * Batch rename multiple tags
   */
  async renameTags(renamePairs, options = {}) {
    const results = {
      success: true,
      renames: []
    };

    for (const { oldTag, newTag } of renamePairs) {
      try {
        const result = await this.renameTag(oldTag, newTag, options);
        results.renames.push({
          oldTag,
          newTag,
          success: true,
          ...result
        });
      } catch (error) {
        results.success = false;
        results.renames.push({
          oldTag,
          newTag,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Find all files containing a specific tag
   */
  async findFilesWithTag(tag) {
    const tagClean = tag.startsWith('#') ? tag.substring(1) : tag;
    
    // Try Obsidian API first
    if (this.obsidianAPI && this.obsidianAPI.isAvailable()) {
      try {
        const response = await this.obsidianAPI.request('/api/find-tag', {
          tag: `#${tagClean}`
        });
        
        if (response.success) {
          return response.data.files || [];
        }
      } catch (error) {
        console.error('Obsidian API find tag failed, falling back:', error);
      }
    }

    // Manual search
    const pattern = path.join(this.vaultPath, '**/*.md');
    const files = await glob(pattern, {
      ignore: this.config.ignorePatterns?.map(p => path.join(this.vaultPath, p))
    });

    const filesWithTag = [];

    for (const filePath of files) {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = matter(content);
      
      // Check frontmatter
      let hasTag = false;
      if (parsed.data.tags) {
        if (Array.isArray(parsed.data.tags)) {
          hasTag = parsed.data.tags.some(t => t === tagClean || t === `#${tagClean}`);
        } else if (typeof parsed.data.tags === 'string') {
          hasTag = parsed.data.tags === tagClean || parsed.data.tags === `#${tagClean}`;
        }
      }

      // Check inline tags
      if (!hasTag) {
        const inlineTagRegex = new RegExp(`#${this.escapeRegex(tagClean)}(?![a-zA-Z0-9_/-])`, 'g');
        hasTag = inlineTagRegex.test(parsed.content);
      }

      if (hasTag) {
        filesWithTag.push(path.relative(this.vaultPath, filePath));
      }
    }

    return filesWithTag;
  }

  /**
   * Escape regex special characters
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}