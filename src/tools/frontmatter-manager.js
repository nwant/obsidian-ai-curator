import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

export class FrontmatterManager {
  constructor(config, obsidianAPI) {
    this.config = config || {};
    this.obsidianAPI = obsidianAPI;
    
    // Set expected properties from config
    this.dateFields = this.config.dateFields || ['created', 'modified'];
    this.requiredFields = this.config.requiredFields || [];
    this.defaultValues = this.config.defaultValues || {};
    this.customValidators = [];
  }

  /**
   * Extract frontmatter from content
   * @stub - Basic implementation, needs enhancement
   */
  extractFrontmatter(content) {
    try {
      const parsed = matter(content);
      return {
        frontmatter: parsed.data,
        content: parsed.content,
        raw: content  // Use 'raw' for test compatibility
      };
    } catch (error) {
      // Try to extract partial frontmatter even if malformed
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      let partialFrontmatter = {};
      
      if (frontmatterMatch) {
        const lines = frontmatterMatch[1].split('\n');
        for (const line of lines) {
          const match = line.match(/^([^:]+):\s*(.*)/);
          if (match) {
            const key = match[1].trim();
            const value = match[2].trim();
            // Try to parse simple values
            if (value === 'true') partialFrontmatter[key] = true;
            else if (value === 'false') partialFrontmatter[key] = false;
            else if (!isNaN(value) && value !== '') partialFrontmatter[key] = Number(value);
            else partialFrontmatter[key] = value.replace(/^["']|["']$/g, '');
          }
        }
      }
      
      return {
        frontmatter: partialFrontmatter,
        content: content.replace(/^---\n[\s\S]*?\n---\n?/, ''),
        raw: content,
        error: error.message
      };
    }
  }

  /**
   * Validate frontmatter against rules
   * @stub - Basic implementation, needs enhancement
   */
  validateFrontmatter(frontmatter, rules = {}) {
    const errors = [];
    
    // Check required fields
    const requiredFields = rules.required || this.requiredFields;
    for (const field of requiredFields) {
      if (!frontmatter[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }
    
    // Validate date fields
    const dateFields = rules.dateFields || this.dateFields;
    for (const field of dateFields) {
      if (frontmatter[field] && !Date.parse(frontmatter[field])) {
        errors.push(`Invalid date in field: ${field}`);
      }
    }
    
    // Custom validation rules
    if (rules.custom) {
      for (const [field, validator] of Object.entries(rules.custom)) {
        if (typeof validator === 'function') {
          const result = validator(frontmatter, field);
          if (result !== true) {
            errors.push(result || `Invalid value for field: ${field}`);
          }
        }
      }
    }
    
    // Custom validation function
    if (rules.validate && typeof rules.validate === 'function') {
      const customErrors = rules.validate(frontmatter);
      if (customErrors && Array.isArray(customErrors)) {
        errors.push(...customErrors);
      }
    }
    
    // Check custom validators
    for (const validator of this.customValidators) {
      if (typeof validator === 'function') {
        const error = validator(frontmatter);
        if (error) {
          errors.push(error);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Format frontmatter consistently
   * @stub - Basic implementation, needs enhancement
   */
  formatFrontmatter(frontmatter, options = {}) {
    const formatted = { ...frontmatter };
    
    // Apply default values if specified
    const defaultValues = options.defaults || this.defaultValues;
    if (defaultValues) {
      for (const [key, value] of Object.entries(defaultValues)) {
        if (!(key in formatted)) {
          // Handle dynamic defaults (functions)
          if (typeof value === 'function') {
            formatted[key] = value();
          } else {
            formatted[key] = value;
          }
        }
      }
    }
    
    // Format date fields
    const dateFields = options.dateFields || this.dateFields || [];
    const dateFormat = options.dateFormat || 'iso';
    
    for (const field of dateFields) {
      if (formatted[field]) {
        if (typeof formatted[field] === 'string') {
          const date = new Date(formatted[field]);
          if (!isNaN(date.getTime())) {
            if (dateFormat === 'iso') {
              formatted[field] = date.toISOString().split('T')[0];
            } else if (dateFormat === 'full') {
              formatted[field] = date.toISOString();
            }
          }
        } else if (formatted[field] instanceof Date) {
          if (dateFormat === 'iso') {
            formatted[field] = formatted[field].toISOString().split('T')[0];
          } else if (dateFormat === 'full') {
            formatted[field] = formatted[field].toISOString();
          }
        }
      }
    }
    
    // Always return YAML string for test compatibility
    return this.toYamlString(formatted);
  }
  
  /**
   * Convert frontmatter object to YAML string
   */
  toYamlString(frontmatter) {
    const lines = [];
    
    for (const [key, value] of Object.entries(frontmatter)) {
      if (value === null || value === undefined) {
        continue;
      }
      
      if (Array.isArray(value)) {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${item}`);
        }
      } else if (typeof value === 'object') {
        lines.push(`${key}:`);
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          lines.push(`  ${nestedKey}: ${nestedValue}`);
        }
      } else if (typeof value === 'string' && value.includes(':')) {
        lines.push(`${key}: "${value}"`);
      } else if (typeof value === 'string' && value.includes('\n')) {
        lines.push(`${key}: |`);
        value.split('\n').forEach(line => lines.push(`  ${line}`));
      } else {
        lines.push(`${key}: ${value}`);
      }
    }
    
    return lines.join('\n');
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
   * Batch update frontmatter for multiple files
   */
  async batchUpdate(paths, updates, options = {}) {
    const results = {
      successful: 0,
      failed: 0,
      errors: []
    };
    
    for (const filePath of paths) {
      try {
        const result = await this.updateFrontmatter(filePath, updates, options);
        if (result.success) {
          results.successful++;
        } else {
          results.failed++;
          results.errors.push({
            path: filePath,
            error: result.error
          });
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          path: filePath,
          error: error.message
        });
      }
    }
    
    return results;
  }
  
  /**
   * Find notes by frontmatter criteria
   */
  async findByFrontmatter(criteria) {
    const results = [];
    
    try {
      // Get all markdown files from vault
      const vaultPath = this.config.vaultPath;
      const files = await this.getAllMarkdownFiles(vaultPath);
      
      for (const file of files) {
        const content = await fs.readFile(file, 'utf-8');
        const parsed = matter(content);
        const frontmatter = parsed.data;
        
        // Check if frontmatter matches criteria
        if (this.matchesCriteria(frontmatter, criteria)) {
          results.push({
            path: path.relative(vaultPath, file),
            frontmatter: frontmatter,
            content: parsed.content
          });
        }
      }
    } catch (error) {
      console.error('Error finding by frontmatter:', error);
    }
    
    return results;
  }
  
  /**
   * Check if frontmatter matches search criteria
   */
  matchesCriteria(frontmatter, criteria) {
    for (const [key, value] of Object.entries(criteria)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Handle operators
        const fieldValue = frontmatter[key];
        
        if ('$gte' in value && !(fieldValue >= value.$gte)) return false;
        if ('$gt' in value && !(fieldValue > value.$gt)) return false;
        if ('$lte' in value && !(fieldValue <= value.$lte)) return false;
        if ('$lt' in value && !(fieldValue < value.$lt)) return false;
        if ('$ne' in value && fieldValue === value.$ne) return false;
        if ('$in' in value && !value.$in.includes(fieldValue)) return false;
        if ('$nin' in value && value.$nin.includes(fieldValue)) return false;
        if ('$exists' in value) {
          const exists = key in frontmatter;
          if (value.$exists !== exists) return false;
        }
      } else {
        // Exact match
        if (frontmatter[key] !== value) return false;
      }
    }
    
    return true;
  }
  
  /**
   * Get all markdown files recursively
   */
  async getAllMarkdownFiles(dir, files = []) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await this.getAllMarkdownFiles(fullPath, files);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Silently skip inaccessible directories
    }
    
    return files;
  }
  
  /**
   * Apply default values to frontmatter
   */
  applyDefaults(frontmatter) {
    const result = { ...frontmatter };
    
    for (const [key, value] of Object.entries(this.defaultValues)) {
      if (!(key in result)) {
        // Handle dynamic defaults (functions)
        if (typeof value === 'function') {
          result[key] = value();
        } else {
          result[key] = value;
        }
      }
    }
    
    return result;
  }

  /**
   * Update frontmatter for a note
   */
  async updateFrontmatter(notePath, updates, options = {}) {
    const { merge = true, preserveBody = true } = options;
    
    try {
      const fullPath = path.join(this.config.vaultPath, notePath);
      
      // Read existing content
      let content;
      try {
        content = await fs.readFile(fullPath, 'utf-8');
      } catch (error) {
        return {
          success: false,
          error: `File not found: ${notePath}`
        };
      }
      
      let parsed;
      try {
        parsed = matter(content);
      } catch (error) {
        // Handle invalid YAML - try to preserve content and continue
        parsed = {
          data: {},
          content: content.replace(/^---[\s\S]*?---\n?/, '')
        };
      }
      
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
    
    // Ensure tags DON'T have # prefix (Obsidian frontmatter convention)
    const formattedTags = tagsToAdd.map(tag => 
      tag.startsWith('#') ? tag.substring(1) : tag
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
    
    // Ensure tags DON'T have # prefix for comparison (Obsidian frontmatter convention)
    const formattedTagsToRemove = tagsToRemove.map(tag => 
      tag.startsWith('#') ? tag.substring(1) : tag
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
    // Ensure tags DON'T have # prefix (Obsidian frontmatter convention)
    const formattedTags = newTags.map(tag => 
      tag.startsWith('#') ? tag.substring(1) : tag
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