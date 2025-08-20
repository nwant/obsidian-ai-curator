import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { getTagTaxonomy } from './tag-taxonomy.js';
import { DateManager } from './date-manager.js';

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
   * Extract frontmatter from content with advanced parsing and error recovery
   */
  extractFrontmatter(content) {
    // Handle empty or missing content
    if (!content || typeof content !== 'string') {
      return {
        frontmatter: {},
        content: content || '',
        raw: content || ''
      };
    }
    
    try {
      // Use gray-matter for standard parsing
      const parsed = matter(content);
      return {
        frontmatter: parsed.data || {},
        content: parsed.content,
        raw: content
      };
    } catch (error) {
      // Advanced error recovery for malformed YAML
      const result = {
        frontmatter: {},
        content: content,
        raw: content,
        error: error.message
      };
      
      // Try to extract frontmatter block
      const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) {
        // No frontmatter found, return content as-is
        return result;
      }
      
      // Remove frontmatter from content
      result.content = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');
      
      // Parse line by line for partial recovery
      const yamlContent = frontmatterMatch[1];
      const lines = yamlContent.split('\n');
      let currentKey = null;
      let currentValue = '';
      let inMultiline = false;
      let multilineIndent = 0;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Skip empty lines
        if (!line.trim()) {
          if (inMultiline) {
            currentValue += '\n';
          }
          continue;
        }
        
        // Handle multiline values
        if (inMultiline) {
          const lineIndent = line.match(/^(\s*)/)[1].length;
          if (lineIndent >= multilineIndent) {
            currentValue += (currentValue ? '\n' : '') + line.substring(multilineIndent);
            continue;
          } else {
            // End of multiline value
            if (currentKey) {
              result.frontmatter[currentKey] = currentValue;
            }
            inMultiline = false;
            currentValue = '';
          }
        }
        
        // Check for array items
        if (line.match(/^\s*-\s+/)) {
          const item = line.replace(/^\s*-\s+/, '').trim();
          if (currentKey) {
            if (!Array.isArray(result.frontmatter[currentKey])) {
              result.frontmatter[currentKey] = [];
            }
            // Parse array item value
            result.frontmatter[currentKey].push(this.parseValue(item));
          }
          continue;
        }
        
        // Check for key-value pairs
        const keyMatch = line.match(/^([^:]+):\s*(.*)/);
        if (keyMatch) {
          // Save previous key-value if exists
          if (currentKey && !inMultiline && currentValue) {
            result.frontmatter[currentKey] = this.parseValue(currentValue);
          }
          
          currentKey = keyMatch[1].trim();
          const rawValue = keyMatch[2].trim();
          
          // Check for multiline indicators
          if (rawValue === '|' || rawValue === '>') {
            inMultiline = true;
            multilineIndent = lines[i + 1] ? lines[i + 1].match(/^(\s*)/)[1].length : 2;
            currentValue = '';
          } else if (rawValue === '' || rawValue === '[]') {
            // Check if next line is an array or nested object
            if (i + 1 < lines.length && lines[i + 1].match(/^\s+([-]|\w+:)/)) {
              // Will be handled by array/nested logic
              continue;
            } else {
              // Empty value
              result.frontmatter[currentKey] = rawValue === '[]' ? [] : null;
              currentKey = null;
            }
          } else {
            // Single line value
            result.frontmatter[currentKey] = this.parseValue(rawValue);
            currentKey = null;
            currentValue = '';
          }
        } else if (currentKey && line.match(/^\s+/)) {
          // Continuation of previous value or nested structure
          const trimmed = line.trim();
          if (trimmed.startsWith('-')) {
            // Array item
            if (!Array.isArray(result.frontmatter[currentKey])) {
              result.frontmatter[currentKey] = [];
            }
            result.frontmatter[currentKey].push(this.parseValue(trimmed.substring(1).trim()));
          } else if (trimmed.includes(':')) {
            // Nested object
            if (typeof result.frontmatter[currentKey] !== 'object' || Array.isArray(result.frontmatter[currentKey])) {
              result.frontmatter[currentKey] = {};
            }
            const [nestedKey, nestedValue] = trimmed.split(':').map(s => s.trim());
            result.frontmatter[currentKey][nestedKey] = this.parseValue(nestedValue);
          }
        }
      }
      
      // Save last key-value if exists
      if (currentKey && currentValue) {
        result.frontmatter[currentKey] = currentValue;
      }
      
      return result;
    }
  }
  
  /**
   * Parse a YAML value string into appropriate type
   */
  parseValue(value) {
    if (typeof value !== 'string') return value;
    
    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }
    
    // Handle special values
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null' || value === '~') return null;
    
    // Handle arrays
    if (value.startsWith('[') && value.endsWith(']')) {
      const items = value.slice(1, -1).split(',').map(item => item.trim());
      return items.map(item => this.parseValue(item));
    }
    
    // Handle numbers
    if (!isNaN(value) && value !== '' && !value.match(/^0\d/)) {
      return Number(value);
    }
    
    // Handle dates (ISO format)
    if (value.match(/^\d{4}-\d{2}-\d{2}/) && !isNaN(Date.parse(value))) {
      return value; // Keep as string for consistency
    }
    
    return value;
  }

  /**
   * Validate frontmatter against rules with advanced type checking
   */
  validateFrontmatter(frontmatter, rules = {}) {
    const errors = [];
    const warnings = [];
    
    // Merge rules with instance configuration
    const validationRules = {
      required: rules.required || this.requiredFields || [],
      dateFields: rules.dateFields || this.dateFields || [],
      types: rules.types || {},
      patterns: rules.patterns || {},
      ranges: rules.ranges || {},
      custom: rules.custom || {},
      validate: rules.validate,
      strict: rules.strict !== undefined ? rules.strict : false
    };
    
    // Check required fields
    for (const field of validationRules.required) {
      if (!(field in frontmatter) || frontmatter[field] === null || frontmatter[field] === undefined) {
        errors.push(`Missing required field: ${field}`);
      } else if (frontmatter[field] === '' || 
                 (Array.isArray(frontmatter[field]) && frontmatter[field].length === 0)) {
        errors.push(`Required field is empty: ${field}`);
      }
    }
    
    // Validate field types
    for (const [field, expectedType] of Object.entries(validationRules.types)) {
      if (field in frontmatter && frontmatter[field] !== null) {
        const value = frontmatter[field];
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        
        if (expectedType === 'array' && !Array.isArray(value)) {
          errors.push(`Field '${field}' must be an array`);
        } else if (expectedType === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
          errors.push(`Field '${field}' must be an object`);
        } else if (expectedType === 'string' && typeof value !== 'string') {
          errors.push(`Field '${field}' must be a string`);
        } else if (expectedType === 'number' && typeof value !== 'number') {
          errors.push(`Field '${field}' must be a number`);
        } else if (expectedType === 'boolean' && typeof value !== 'boolean') {
          errors.push(`Field '${field}' must be a boolean`);
        } else if (expectedType === 'date') {
          // Special handling for date type
          const dateValue = value instanceof Date ? value : new Date(value);
          if (isNaN(dateValue.getTime())) {
            errors.push(`Field '${field}' must be a valid date`);
          }
        }
      }
    }
    
    // Validate date fields
    for (const field of validationRules.dateFields) {
      if (field in frontmatter && frontmatter[field]) {
        const value = frontmatter[field];
        const dateValue = value instanceof Date ? value : new Date(value);
        
        if (isNaN(dateValue.getTime())) {
          errors.push(`Invalid date in field: ${field}`);
        } else {
          // Check for reasonable date ranges (warn for dates too far in past/future)
          const now = new Date();
          const yearDiff = Math.abs(dateValue.getFullYear() - now.getFullYear());
          if (yearDiff > 100) {
            warnings.push(`Date in field '${field}' seems unusual: ${value}`);
          }
        }
      }
    }
    
    // Validate patterns (regex)
    for (const [field, pattern] of Object.entries(validationRules.patterns)) {
      if (field in frontmatter && frontmatter[field]) {
        const value = frontmatter[field];
        const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
        
        if (typeof value === 'string' && !regex.test(value)) {
          errors.push(`Field '${field}' does not match required pattern: ${pattern}`);
        } else if (Array.isArray(value)) {
          const invalidItems = value.filter(item => 
            typeof item === 'string' && !regex.test(item)
          );
          if (invalidItems.length > 0) {
            errors.push(`Field '${field}' contains invalid items: ${invalidItems.join(', ')}`);
          }
        }
      }
    }
    
    // Validate ranges (for numbers)
    for (const [field, range] of Object.entries(validationRules.ranges)) {
      if (field in frontmatter && frontmatter[field] !== null) {
        const value = frontmatter[field];
        if (typeof value === 'number') {
          if (range.min !== undefined && value < range.min) {
            errors.push(`Field '${field}' is below minimum value ${range.min}`);
          }
          if (range.max !== undefined && value > range.max) {
            errors.push(`Field '${field}' is above maximum value ${range.max}`);
          }
        }
      }
    }
    
    // Custom field validators
    for (const [field, validator] of Object.entries(validationRules.custom)) {
      if (typeof validator === 'function') {
        try {
          const result = validator(frontmatter[field], frontmatter, field);
          if (result !== true && result !== undefined && result !== null) {
            if (typeof result === 'string') {
              errors.push(result);
            } else if (result === false) {
              errors.push(`Invalid value for field: ${field}`);
            }
          }
        } catch (error) {
          errors.push(`Validation error for field '${field}': ${error.message}`);
        }
      } else if (typeof validator === 'object') {
        // Handle validator objects with message
        if (validator.test && typeof validator.test === 'function') {
          const valid = validator.test(frontmatter[field], frontmatter);
          if (!valid) {
            errors.push(validator.message || `Invalid value for field: ${field}`);
          }
        }
      }
    }
    
    // Global validation function
    if (validationRules.validate && typeof validationRules.validate === 'function') {
      try {
        const customErrors = validationRules.validate(frontmatter);
        if (customErrors) {
          if (Array.isArray(customErrors)) {
            errors.push(...customErrors.filter(e => e)); // Filter out null/undefined
          } else if (typeof customErrors === 'string') {
            errors.push(customErrors);
          }
        }
      } catch (error) {
        errors.push(`Validation error: ${error.message}`);
      }
    }
    
    // Run instance custom validators
    for (const validator of this.customValidators) {
      if (typeof validator === 'function') {
        try {
          const error = validator(frontmatter);
          if (error) {
            errors.push(error);
          }
        } catch (err) {
          errors.push(`Custom validation error: ${err.message}`);
        }
      }
    }
    
    // In strict mode, check for unknown fields
    if (validationRules.strict) {
      const knownFields = new Set([
        ...validationRules.required,
        ...validationRules.dateFields,
        ...Object.keys(validationRules.types),
        ...Object.keys(validationRules.patterns),
        ...Object.keys(validationRules.ranges),
        ...Object.keys(validationRules.custom)
      ]);
      
      for (const field in frontmatter) {
        if (!knownFields.has(field)) {
          warnings.push(`Unknown field: ${field}`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      frontmatter // Return the validated frontmatter for reference
    };
  }

  /**
   * Format frontmatter consistently with template support and transformations
   */
  formatFrontmatter(frontmatter, options = {}) {
    const formatted = { ...frontmatter };
    
    // Apply template if specified
    if (options.template) {
      const template = typeof options.template === 'string' 
        ? this.getTemplate(options.template) 
        : options.template;
      
      if (template) {
        // Apply template defaults first
        for (const [key, value] of Object.entries(template)) {
          if (!(key in formatted)) {
            // Handle dynamic values in templates
            if (typeof value === 'function') {
              formatted[key] = value(formatted);
            } else if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
              // Template variable substitution
              const varName = value.slice(2, -2).trim();
              if (varName === 'date') {
                formatted[key] = new Date().toISOString().split('T')[0];
              } else if (varName === 'timestamp') {
                formatted[key] = new Date().toISOString();
              } else if (varName === 'uuid') {
                formatted[key] = this.generateUUID();
              } else if (varName in formatted) {
                formatted[key] = formatted[varName];
              }
            } else {
              formatted[key] = value;
            }
          }
        }
      }
    }
    
    // Apply default values if specified
    const defaultValues = options.defaults || this.defaultValues;
    if (defaultValues) {
      for (const [key, value] of Object.entries(defaultValues)) {
        if (!(key in formatted)) {
          // Handle dynamic defaults (functions)
          if (typeof value === 'function') {
            formatted[key] = value(formatted);
          } else {
            formatted[key] = value;
          }
        }
      }
    }
    
    // Apply field transformations
    if (options.transformations) {
      for (const [field, transformation] of Object.entries(options.transformations)) {
        if (field in formatted) {
          if (typeof transformation === 'function') {
            formatted[field] = transformation(formatted[field], formatted);
          } else if (typeof transformation === 'string') {
            // Built-in transformations
            formatted[field] = this.applyTransformation(formatted[field], transformation);
          }
        }
      }
    }
    
    // Format date fields
    const dateFields = options.dateFields || this.dateFields || [];
    const dateFormat = options.dateFormat || 'iso';
    
    for (const field of dateFields) {
      if (formatted[field]) {
        formatted[field] = this.formatDate(formatted[field], dateFormat);
      }
    }
    
    // Handle field ordering if specified
    if (options.fieldOrder) {
      const ordered = {};
      // First add fields in specified order
      for (const field of options.fieldOrder) {
        if (field in formatted) {
          ordered[field] = formatted[field];
        }
      }
      // Then add remaining fields
      for (const [key, value] of Object.entries(formatted)) {
        if (!(key in ordered)) {
          ordered[key] = value;
        }
      }
      Object.assign(formatted, ordered);
    }
    
    // Remove null/undefined fields if specified
    if (options.removeEmpty) {
      for (const key in formatted) {
        if (formatted[key] === null || formatted[key] === undefined || 
            (typeof formatted[key] === 'string' && formatted[key].trim() === '') ||
            (Array.isArray(formatted[key]) && formatted[key].length === 0)) {
          delete formatted[key];
        }
      }
    }
    
    // Always return YAML string for test compatibility
    return this.toYamlString(formatted);
  }
  
  /**
   * Format a date value according to the specified format
   */
  formatDate(value, format = 'iso') {
    let date;
    
    if (value instanceof Date) {
      date = value;
    } else if (typeof value === 'string' || typeof value === 'number') {
      date = new Date(value);
    } else {
      return value; // Return as-is if not a recognizable date
    }
    
    if (isNaN(date.getTime())) {
      return value; // Return original if invalid date
    }
    
    switch (format) {
      case 'iso':
      case 'date':
        return date.toISOString().split('T')[0];
      case 'full':
      case 'datetime':
        return date.toISOString();
      case 'time':
        return date.toTimeString().split(' ')[0];
      case 'year':
        return date.getFullYear().toString();
      case 'month':
        return String(date.getMonth() + 1).padStart(2, '0');
      case 'day':
        return String(date.getDate()).padStart(2, '0');
      case 'timestamp':
        return date.getTime();
      case 'relative':
        return this.getRelativeTime(date);
      default:
        // Custom format string (e.g., "YYYY-MM-DD HH:mm")
        if (typeof format === 'string') {
          return this.formatDateCustom(date, format);
        }
        return date.toISOString().split('T')[0];
    }
  }
  
  /**
   * Apply a built-in transformation to a value
   */
  applyTransformation(value, transformation) {
    switch (transformation) {
      case 'lowercase':
        return typeof value === 'string' ? value.toLowerCase() : value;
      case 'uppercase':
        return typeof value === 'string' ? value.toUpperCase() : value;
      case 'capitalize':
        return typeof value === 'string' 
          ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
          : value;
      case 'trim':
        return typeof value === 'string' ? value.trim() : value;
      case 'slug':
        return typeof value === 'string' 
          ? value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
          : value;
      case 'kebab':
        return typeof value === 'string'
          ? value.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
          : value;
      case 'camel':
        return typeof value === 'string'
          ? value.replace(/-([a-z])/g, (g) => g[1].toUpperCase())
          : value;
      case 'snake':
        return typeof value === 'string'
          ? value.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()
          : value;
      case 'title':
        return typeof value === 'string'
          ? value.replace(/\w\S*/g, txt => 
              txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase())
          : value;
      case 'sort':
        return Array.isArray(value) ? [...value].sort() : value;
      case 'unique':
        return Array.isArray(value) ? [...new Set(value)] : value;
      case 'reverse':
        return Array.isArray(value) ? [...value].reverse() : 
               typeof value === 'string' ? value.split('').reverse().join('') : value;
      case 'compact':
        return Array.isArray(value) ? value.filter(Boolean) : value;
      default:
        return value;
    }
  }
  
  /**
   * Format date with custom format string
   */
  formatDateCustom(date, format) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return format
      .replace('YYYY', year)
      .replace('YY', String(year).slice(-2))
      .replace('MM', month)
      .replace('M', String(date.getMonth() + 1))
      .replace('DD', day)
      .replace('D', String(date.getDate()))
      .replace('HH', hours)
      .replace('H', String(date.getHours()))
      .replace('mm', minutes)
      .replace('m', String(date.getMinutes()))
      .replace('ss', seconds)
      .replace('s', String(date.getSeconds()));
  }
  
  /**
   * Get relative time string
   */
  getRelativeTime(date) {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'just now';
  }
  
  /**
   * Generate a UUID v4
   */
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  
  /**
   * Get a predefined template
   */
  getTemplate(name) {
    // This could be extended to load from config or files
    const templates = {
      article: {
        title: '',
        author: '',
        created: '{{date}}',
        modified: '{{date}}',
        status: 'draft',
        tags: []
      },
      project: {
        name: '',
        description: '',
        created: '{{date}}',
        status: 'planning',
        priority: 'medium',
        tags: ['project']
      },
      meeting: {
        title: '',
        date: '{{date}}',
        attendees: [],
        agenda: [],
        notes: '',
        action_items: [],
        tags: ['meeting']
      },
      task: {
        title: '',
        created: '{{timestamp}}',
        due: null,
        priority: 'normal',
        status: 'todo',
        assigned: null,
        tags: ['task']
      }
    };
    
    return templates[name];
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
    
    const fullPath = path.join(this.config.vaultPath, notePath);
    
    // Read existing content
    const content = await fs.readFile(fullPath, 'utf-8');
    
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
      
      // Clean and validate tags if present in the updates
      if (newFrontmatter.tags) {
        const taxonomy = getTagTaxonomy();
        
        // Handle both array and string tags
        const tagsArray = Array.isArray(newFrontmatter.tags) 
          ? newFrontmatter.tags 
          : [newFrontmatter.tags];
        
        // Clean and validate - will throw if invalid
        newFrontmatter.tags = taxonomy.cleanAndValidateTags(tagsArray);
        
        // Remove tags field if empty after cleaning
        if (newFrontmatter.tags.length === 0) {
          delete newFrontmatter.tags;
        }
      }
      
      // Reconstruct the file using our validated method
      const newContent = this.buildContentWithFrontmatter(
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
      frontmatter: newFrontmatter,
      path: notePath
    };
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

  /**
   * Get default frontmatter for daily notes
   * @param {string} dateStr - The date string for the daily note
   * @returns {Object} Frontmatter object with appropriate defaults
   */
  getDailyNoteFrontmatter(dateStr) {
    const frontmatter = {
      created: DateManager.getCurrentDate(),
      modified: DateManager.getCurrentDate(),
      date: dateStr
    };
    
    // Add any daily note specific defaults from config
    const dailyDefaults = this.config.frontmatterDefaults?.daily || {};
    
    return { ...frontmatter, ...dailyDefaults };
  }

  /**
   * Get default frontmatter for a new note
   * @param {string} noteType - Type of note (optional)
   * @returns {Object} Frontmatter object with appropriate defaults
   */
  getDefaultFrontmatter(noteType = 'note') {
    const frontmatter = {
      created: DateManager.getCurrentDate(),
      modified: DateManager.getCurrentDate()
    };
    
    // Add type-specific defaults from config
    const typeDefaults = this.config.frontmatterDefaults?.[noteType] || {};
    
    return { ...frontmatter, ...typeDefaults };
  }

  /**
   * Build content with frontmatter - THE single source of truth for this operation
   * Everyone should use this instead of matter.stringify
   * @param {string} content - The markdown content
   * @param {Object} frontmatter - The frontmatter object
   * @returns {string} Combined content with validated frontmatter
   */
  buildContentWithFrontmatter(content, frontmatter) {
    let processedFrontmatter = { ...frontmatter };
    
    // Clean and validate tags if present
    if (processedFrontmatter.tags) {
      const taxonomy = getTagTaxonomy();
      
      // Handle both array and string tags
      const tagsArray = Array.isArray(processedFrontmatter.tags) 
        ? processedFrontmatter.tags 
        : [processedFrontmatter.tags];
      
      // Clean and validate - will throw if invalid
      processedFrontmatter.tags = taxonomy.cleanAndValidateTags(tagsArray);
      
      // Remove tags field if empty after cleaning
      if (processedFrontmatter.tags.length === 0) {
        delete processedFrontmatter.tags;
      }
    }
    
    // Format date fields consistently using DateManager
    for (const field of this.dateFields) {
      if (processedFrontmatter[field]) {
        try {
          processedFrontmatter[field] = DateManager.formatDate(processedFrontmatter[field]);
        } catch (error) {
          // Log warning but don't fail the entire operation
          console.warn(`Warning: Could not format date field '${field}': ${error.message}`);
          // Keep the original value
        }
      }
    }
    
    // Try to use Obsidian API if available for better formatting
    if (this.obsidianAPI && this.obsidianAPI.isAvailable()) {
      try {
        // This would use Obsidian's native formatting if available
        const result = this.obsidianAPI.request('/api/format/frontmatter', {
          content,
          frontmatter: processedFrontmatter
        });
        if (result && result.success) {
          return result.data;
        }
      } catch {
        // Fall back to matter.stringify
      }
    }
    
    // Use matter.stringify as fallback
    return matter.stringify(content, processedFrontmatter);
  }
}