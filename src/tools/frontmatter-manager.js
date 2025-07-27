import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

export class FrontmatterManager {
  constructor(config, obsidianAPI) {
    this.config = config;
    this.obsidianAPI = obsidianAPI;
  }

  /**
   * Get frontmatter for a note
   */
  async getFrontmatter(notePath) {
    try {
      // Try Obsidian API first for cached metadata
      if (this.obsidianAPI && this.obsidianAPI.isAvailable()) {
        const metadata = await this.obsidianAPI.request('/api/metadata', { paths: notePath });
        if (metadata && metadata.success && metadata.data && metadata.data.length > 0) {
          return {
            success: true,
            frontmatter: metadata.data[0].frontmatter || {},
            tags: metadata.data[0].tags || [],
            source: 'obsidian-api'
          };
        }
      }

      // Fallback to file system
      const fullPath = path.join(this.config.vaultPath, notePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      const parsed = matter(content);
      
      return {
        success: true,
        frontmatter: parsed.data || {},
        source: 'file-system'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update frontmatter for a note
   */
  async updateFrontmatter(notePath, updates, options = {}) {
    const { merge = true, preserveBody = true } = options;
    
    try {
      const fullPath = path.join(this.config.vaultPath, notePath);
      
      // Read existing content
      const content = await fs.readFile(fullPath, 'utf-8');
      const parsed = matter(content);
      
      // Update frontmatter
      let newFrontmatter;
      if (merge) {
        // Merge with existing frontmatter
        newFrontmatter = { ...parsed.data, ...updates };
        
        // Handle special cases like arrays
        for (const [key, value] of Object.entries(updates)) {
          if (value === null || value === undefined) {
            // Allow deletion of fields
            delete newFrontmatter[key];
          } else if (Array.isArray(value) && !options.replaceArrays) {
            // For arrays, merge unique values by default
            const existing = parsed.data[key];
            if (Array.isArray(existing)) {
              newFrontmatter[key] = [...new Set([...existing, ...value])];
            } else {
              newFrontmatter[key] = value;
            }
          } else {
            // Direct replacement
            newFrontmatter[key] = value;
          }
        }
      } else {
        // Replace entirely
        newFrontmatter = updates;
      }
      
      // Reconstruct the file
      const newContent = matter.stringify(
        preserveBody ? parsed.content : '', 
        newFrontmatter
      );
      
      // Write back
      await fs.writeFile(fullPath, newContent, 'utf-8');
      
      // Notify Obsidian API if available (for cache invalidation)
      if (this.obsidianAPI && this.obsidianAPI.isAvailable()) {
        try {
          // This would trigger Obsidian to refresh its metadata cache
          // The endpoint might not exist yet, so we catch any errors
          await this.obsidianAPI.request('/api/refresh', { path: notePath });
        } catch (error) {
          // Silently ignore if refresh endpoint doesn't exist
        }
      }
      
      return {
        success: true,
        frontmatter: newFrontmatter,
        path: notePath
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: notePath
      };
    }
  }

  /**
   * Update frontmatter for multiple notes
   */
  async batchUpdateFrontmatter(updates, options = {}) {
    const results = await Promise.all(
      updates.map(({ path: notePath, frontmatter }) => 
        this.updateFrontmatter(notePath, frontmatter, options)
      )
    );
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    return {
      success: failed.length === 0,
      updated: successful.length,
      failed: failed.length,
      results
    };
  }

  /**
   * Add tags to a note
   */
  async addTags(notePath, tagsToAdd) {
    const current = await this.getFrontmatter(notePath);
    if (!current.success) return current;
    
    const existingTags = current.frontmatter.tags || [];
    const existingTagsArray = Array.isArray(existingTags) ? existingTags : [existingTags];
    
    // Ensure tags have # prefix
    const formattedTags = tagsToAdd.map(tag => 
      tag.startsWith('#') ? tag : `#${tag}`
    );
    
    // Merge with existing, avoiding duplicates
    const newTags = [...new Set([...existingTagsArray, ...formattedTags])];
    
    return await this.updateFrontmatter(notePath, { tags: newTags });
  }

  /**
   * Remove tags from a note
   */
  async removeTags(notePath, tagsToRemove) {
    const current = await this.getFrontmatter(notePath);
    if (!current.success) return current;
    
    const existingTags = current.frontmatter.tags || [];
    const existingTagsArray = Array.isArray(existingTags) ? existingTags : [existingTags];
    
    // Ensure tags have # prefix for comparison
    const formattedTagsToRemove = tagsToRemove.map(tag => 
      tag.startsWith('#') ? tag : `#${tag}`
    );
    
    // Filter out tags to remove
    const newTags = existingTagsArray.filter(tag => 
      !formattedTagsToRemove.includes(tag)
    );
    
    return await this.updateFrontmatter(notePath, { tags: newTags });
  }

  /**
   * Replace all tags for a note
   */
  async replaceTags(notePath, newTags) {
    // Ensure tags have # prefix
    const formattedTags = newTags.map(tag => 
      tag.startsWith('#') ? tag : `#${tag}`
    );
    
    // Use replaceArrays option to ensure tags are replaced, not merged
    return await this.updateFrontmatter(notePath, { tags: formattedTags }, { replaceArrays: true });
  }

  /**
   * Update a specific frontmatter field
   */
  async updateField(notePath, fieldName, value) {
    return await this.updateFrontmatter(notePath, { [fieldName]: value });
  }

  /**
   * Remove a frontmatter field
   */
  async removeField(notePath, fieldName) {
    return await this.updateFrontmatter(notePath, { [fieldName]: null });
  }

  /**
   * Check if a note has specific frontmatter fields
   */
  async hasFields(notePath, fields) {
    const current = await this.getFrontmatter(notePath);
    if (!current.success) return current;
    
    const results = {};
    for (const field of fields) {
      results[field] = field in current.frontmatter;
    }
    
    return {
      success: true,
      fields: results,
      frontmatter: current.frontmatter
    };
  }
}