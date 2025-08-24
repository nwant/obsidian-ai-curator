/**
 * Tag Taxonomy System
 * Manages and enforces tag structure and validation rules
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class TagTaxonomy {
  constructor(config = null) {
    this.config = config;
    this.taxonomy = null;
    this.configPath = path.join(__dirname, '../../config/tag-taxonomy.json');
    this.validTagsCache = null; // Cache for processed valid tags
    this.loadTaxonomy();
  }

  /**
   * Load taxonomy configuration from file
   */
  loadTaxonomy() {
    try {
      // Try to load user's taxonomy config
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        this.taxonomy = JSON.parse(data);
      } else {
        // Fall back to minimal taxonomy (no restrictions)
        this.taxonomy = this.getDefaultTaxonomy();
      }
    } catch (error) {
      console.error('Error loading tag taxonomy:', error);
      // Use permissive defaults on error
      this.taxonomy = this.getDefaultTaxonomy();
    }
  }

  /**
   * Get default taxonomy configuration
   */
  getDefaultTaxonomy() {
    return {
      tags: {
        'type': {
          description: 'Document or note types',
          allowCustomChildren: true,
          children: {
            'note': { description: 'Regular note' },
            'moc': { description: 'Map of Content' },
            'index': { description: 'Index or overview' },
            'journal': { description: 'Journal or log entry' },
            'reference': { description: 'Reference material' },
            'meeting-notes': { description: 'Meeting notes' }
          }
        },
        'status': {
          description: 'Status or state',
          allowCustomChildren: false,
          children: {
            'draft': { description: 'Work in progress' },
            'review': { description: 'Needs review' },
            'complete': { description: 'Completed' },
            'archived': { description: 'Archived' }
          }
        },
        'project': {
          description: 'Project-related tags',
          allowCustomChildren: true,
          children: {}
        },
        'area': {
          description: 'Areas of responsibility',
          allowCustomChildren: true,
          children: {}
        }
      },
      settings: {
        allowCustomRootTags: true,
        defaultMaxDepth: 5,
        defaultAllowCustomChildren: true,
        suggestionsEnabled: true,
        autoTagging: {
          enabled: true,
          rules: [
            {
              trigger: { type: 'contains', keywords: ['index'] },
              tags: ['type/index']
            },
            {
              trigger: { type: 'contains', keywords: ['moc', 'map of content'] },
              tags: ['type/moc']
            },
            {
              trigger: { type: 'contains', keywords: ['daily note', 'journal'] },
              tags: ['type/journal']
            },
            {
              trigger: { type: 'contains', keywords: ['meeting', 'notes'] },
              tags: ['type/meeting-notes']
            }
          ]
        }
      }
    };
  }

  /**
   * Reload taxonomy (useful if config changes)
   */
  reload() {
    this.loadTaxonomy();
  }

  /**
   * Clean a tag - removes # prefix, trims whitespace
   * @param {string} tag - Tag to clean
   * @returns {string} Cleaned tag
   */
  cleanTag(tag) {
    if (!tag || typeof tag !== 'string') {
      return '';
    }
    // Remove # prefix and trim
    return tag.replace(/^#/, '').trim();
  }

  /**
   * Clean multiple tags
   * @param {Array<string>} tags - Tags to clean
   * @returns {Array<string>} Cleaned tags (empty tags removed)
   */
  cleanTags(tags) {
    if (!Array.isArray(tags)) {
      return [];
    }
    
    return tags
      .map(tag => this.cleanTag(tag))
      .filter(tag => tag.length > 0);
  }

  /**
   * Validate a single tag against taxonomy - throws error if invalid
   * @param {string} tag - Tag to validate (without # prefix)
   * @throws {Error} If tag is invalid
   */
  validateTag(tag) {
    // Clean the tag first
    tag = this.cleanTag(tag);
    
    // Empty tag is invalid
    if (!tag) {
      throw new Error('Empty tag');
    }

    const parts = tag.split('/');
    let currentLevel = this.taxonomy.tags;
    let currentConfig = this.taxonomy.settings;
    let pathSoFar = [];

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      pathSoFar.push(part);
      const currentDepth = i; // 0-based depth (root tag is at depth 0)

      // Check if this part exists in taxonomy
      if (currentLevel && currentLevel[part]) {
        // Known tag - check depth constraints
        currentConfig = currentLevel[part];
        
        // Get depth constraints using new format
        const minDepth = currentConfig.depth?.min ?? 0;
        const maxDepth = currentConfig.depth?.max ?? null;  // null means unbounded
        
        // If this is the final part, check if depth is valid
        if (i === parts.length - 1) {
          const tagDepth = parts.length - 1; // How deep from the root tag
          if (tagDepth < minDepth) {
            throw new Error(`Tag '${tag}' requires at least ${minDepth} level(s) of children`);
          }
          if (maxDepth !== null && tagDepth > maxDepth) {
            throw new Error(`Tag '${tag}' exceeds maximum depth of ${maxDepth}`);
          }
        }
        
        currentLevel = currentLevel[part].children || {};
      } else {
        // Unknown tag - check if allowed
        
        // If we're at root level
        if (i === 0) {
          if (!this.taxonomy.settings.allowCustomRootTags) {
            throw new Error(`Root tag '${part}' not defined in taxonomy`);
          }
          // Custom root tag allowed, treat rest as custom hierarchy
          currentLevel = {};
          currentConfig = {
            allowCustomChildren: this.taxonomy.settings.defaultAllowCustomChildren,
            depth: { min: 0, max: this.taxonomy.settings.defaultMaxDepth }
          };
        } else {
          // Check if custom children allowed at this level
          // currentConfig holds the parent's config (set when we found the parent in the taxonomy)
          const parentPath = pathSoFar.slice(0, -1).join('/');
          const allowCustom = currentConfig?.allowCustomChildren ?? 
                            this.taxonomy.settings.defaultAllowCustomChildren;
          
          if (!allowCustom) {
            throw new Error(`Custom children not allowed under '${parentPath}'`);
          }

          // Check depth limit from the parent's perspective
          const parentMaxDepth = currentConfig?.depth?.max ?? null;
          
          // Calculate depth from parent (0-based: immediate child is at depth 0)
          const depthFromParent = parts.length - i - 1;
          
          if (parentMaxDepth !== null && depthFromParent > parentMaxDepth) {
            throw new Error(`Tag depth exceeds maximum of ${parentMaxDepth} levels under '${pathSoFar.slice(0, i).join('/')}'`);
          }

          // Rest of path is custom but valid
          break;
        }
      }
    }
  }

  /**
   * Validate multiple tags
   * @param {Array<string>} tags - Array of tags to validate
   * @throws {Error} If any tags are invalid
   */
  validateTags(tags) {
    const errors = [];

    for (const tag of tags) {
      try {
        this.validateTag(tag);
      } catch (error) {
        errors.push(`${tag}: ${error.message}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Invalid tags: ${errors.join('; ')}`);
    }
  }

  /**
   * Clean and validate tags - convenience method
   * @param {Array<string>} tags - Array of tags to clean and validate
   * @returns {Array<string>} Cleaned tags
   * @throws {Error} If any tags are invalid after cleaning
   */
  cleanAndValidateTags(tags) {
    const cleaned = this.cleanTags(tags);
    if (cleaned.length > 0) {
      this.validateTags(cleaned);
    }
    return cleaned;
  }

  /**
   * Get tag information including description
   * @param {string} tag - Tag to get info for
   * @returns {Object|null} - Tag info or null if not found
   */
  getTagInfo(tag) {
    tag = tag.replace(/^#/, '');
    const parts = tag.split('/');
    let current = this.taxonomy.tags;
    let info = null;

    for (const part of parts) {
      if (current && current[part]) {
        info = {
          tag: tag,
          description: current[part].description,
          allowCustomChildren: current[part].allowCustomChildren,
          maxChildDepth: current[part].maxChildDepth,
          hasDefinedChildren: !!(current[part].children && Object.keys(current[part].children).length > 0)
        };
        current = current[part].children || {};
      } else {
        // Tag not in taxonomy
        return null;
      }
    }

    return info;
  }

  /**
   * Get all valid tags with their descriptions
   * Only returns tags that can actually be used (respects depth constraints)
   * @returns {Array} - Array of valid tag info objects
   */
  getAllDefinedTags() {
    // Return cached result if available
    if (this.validTagsCache) {
      return this.validTagsCache;
    }

    const tags = [];
    
    const traverse = (level, prefix = '', depth = 0) => {
      for (const [key, value] of Object.entries(level)) {
        const fullTag = prefix ? `${prefix}/${key}` : key;
        const currentDepth = prefix ? depth + 1 : 0;
        
        // Get depth constraints using new format
        // depth: {min: 0, max: 1} or missing entirely
        const minDepth = value.depth?.min ?? 0;  // Default min is 0
        const maxDepth = value.depth?.max ?? null;  // Default max is unbounded (null)
        
        const hasChildren = value.children && Object.keys(value.children).length > 0;
        
        // Include the tag if current depth is >= minDepth
        // This means if minDepth is 0, the tag itself is valid
        // If minDepth is 1, only children are valid
        if (currentDepth >= minDepth) {
          tags.push({
            tag: fullTag,
            description: value.description,
            allowCustomChildren: value.allowCustomChildren,
            depth: { min: minDepth, max: maxDepth },
            hasDefinedChildren: hasChildren
          });
        }
        
        // Traverse children if we haven't exceeded maxDepth (null means no limit)
        if (value.children && (maxDepth === null || currentDepth < maxDepth)) {
          traverse(value.children, fullTag, currentDepth);
        }
      }
    };

    if (this.taxonomy.tags) {
      traverse(this.taxonomy.tags);
    }

    // Cache the result for future calls
    this.validTagsCache = tags;
    return tags;
  }

  /**
   * Reload taxonomy (useful if config changes)
   */
  reload() {
    this.validTagsCache = null; // Clear cache when reloading
    this.loadTaxonomy();
  }

  /**
   * Find closest matching tag (for suggestions)
   * @param {string} input - Input tag
   * @returns {string|null} - Suggested tag or null
   */
  findClosestTag(input) {
    const allTags = this.getAllDefinedTags().map(t => t.tag);
    if (allTags.length === 0) return null;

    // Simple similarity check (could be improved with better algorithm)
    let bestMatch = null;
    let bestScore = 0;

    for (const tag of allTags) {
      const score = this.calculateSimilarity(input.toLowerCase(), tag.toLowerCase());
      if (score > bestScore) {
        bestScore = score;
        bestMatch = tag;
      }
    }

    return bestScore > 0.3 ? bestMatch : null;
  }

  /**
   * Find closest tag within a specific level
   * @param {string} input - Input tag part
   * @param {Array<string>} parentPath - Parent path parts
   * @returns {string|null} - Suggested tag or null
   */
  findClosestTagInLevel(input, parentPath) {
    let current = this.taxonomy.tags;
    
    // Navigate to parent level
    for (const part of parentPath) {
      if (current && current[part]) {
        current = current[part].children || {};
      } else {
        return null;
      }
    }

    // Find best match at this level
    if (!current || Object.keys(current).length === 0) {
      return null;
    }

    let bestMatch = null;
    let bestScore = 0;

    for (const key of Object.keys(current)) {
      const score = this.calculateSimilarity(input.toLowerCase(), key.toLowerCase());
      if (score > bestScore) {
        bestScore = score;
        bestMatch = key;
      }
    }

    if (bestScore > 0.3) {
      return [...parentPath, bestMatch].join('/');
    }

    return null;
  }

  /**
   * Simple similarity calculation
   * @param {string} str1 
   * @param {string} str2 
   * @returns {number} - Similarity score 0-1
   */
  calculateSimilarity(str1, str2) {
    if (str1 === str2) return 1;
    if (str1.includes(str2) || str2.includes(str1)) return 0.7;
    
    // Simple character overlap
    const set1 = new Set(str1.split(''));
    const set2 = new Set(str2.split(''));
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  /**
   * Get taxonomy settings
   * @returns {Object} - Current taxonomy settings
   */
  getSettings() {
    return this.taxonomy.settings || {};
  }


  /**
   * Filter tags to only valid ones (for permissive mode)
   * @param {Array<string>} tags - Tags to filter
   * @returns {Object} - { valid: Array, invalid: Array }
   */
  filterValidTags(tags) {
    const valid = [];
    const invalid = [];

    for (const tag of tags) {
      const result = this.validateTag(tag);
      if (result.valid) {
        valid.push(tag);
      } else {
        invalid.push({ tag, reason: result.reason });
      }
    }

    return { valid, invalid };
  }

  /**
   * Suggest tags based on partial input
   * @param {string} partial - Partial tag input
   * @returns {Array} - Array of suggested tags with descriptions
   */
  suggestTags(partial) {
    const suggestions = [];
    const allTags = this.getAllDefinedTags();
    
    partial = partial.replace(/^#/, '').toLowerCase();
    
    for (const tagInfo of allTags) {
      if (tagInfo.tag.toLowerCase().includes(partial)) {
        suggestions.push({
          tag: tagInfo.tag,
          description: tagInfo.description,
          score: tagInfo.tag.toLowerCase().startsWith(partial) ? 2 : 1
        });
      }
    }

    // Sort by score (prefix matches first) then alphabetically
    suggestions.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.tag.localeCompare(b.tag);
    });

    return suggestions.slice(0, 10); // Return top 10 suggestions
  }

  /**
   * Get tags that should be automatically applied to new projects
   * @returns {Array<string>} - Array of tag names to apply
   */
  getTagsForNewProject() {
    const tags = [];
    
    const traverse = (level, prefix = '') => {
      for (const [key, value] of Object.entries(level)) {
        const fullTag = prefix ? `${prefix}/${key}` : key;
        
        // Check if this tag has the applyToNewProjects flag
        if (value.applyToNewProjects === true) {
          tags.push(fullTag);
        }
        
        // Recursively check children
        if (value.children) {
          traverse(value.children, fullTag);
        }
      }
    };

    if (this.taxonomy.tags) {
      traverse(this.taxonomy.tags);
    }

    return tags;
  }
}

// Singleton instance
let taxonomyInstance = null;

/**
 * Get or create the singleton TagTaxonomy instance
 * @returns {TagTaxonomy}
 */
export function getTagTaxonomy() {
  if (!taxonomyInstance) {
    taxonomyInstance = new TagTaxonomy();
  }
  return taxonomyInstance;
}

// Export for testing
export { TagTaxonomy };