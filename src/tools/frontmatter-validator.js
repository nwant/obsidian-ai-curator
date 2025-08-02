import matter from 'gray-matter';

export class FrontmatterValidator {
  /**
   * Validate frontmatter for Obsidian compatibility
   * Obsidian has limited support for complex nested structures
   */
  static validateForObsidian(content) {
    try {
      const parsed = matter(content);
      const issues = [];
      const warnings = [];
      
      // Check each frontmatter property
      for (const [key, value] of Object.entries(parsed.data)) {
        const result = this.checkValue(key, value, []);
        issues.push(...result.issues);
        warnings.push(...result.warnings);
      }
      
      return {
        valid: issues.length === 0,
        issues,
        warnings,
        suggestions: this.generateSuggestions(parsed.data, issues)
      };
    } catch (error) {
      return {
        valid: false,
        issues: [`Failed to parse frontmatter: ${error.message}`],
        warnings: [],
        suggestions: []
      };
    }
  }
  
  /**
   * Recursively check values for Obsidian compatibility
   */
  static checkValue(key, value, path) {
    const fullPath = [...path, key].join('.');
    const issues = [];
    const warnings = [];
    
    // Null values are problematic (often from # in YAML)
    if (value === null) {
      issues.push({
        path: fullPath,
        value: null,
        issue: 'Null value (possibly from unquoted # in YAML)',
        severity: 'error'
      });
      return { issues, warnings };
    }
    
    // Check value type
    const valueType = Array.isArray(value) ? 'array' : typeof value;
    
    switch (valueType) {
      case 'string':
      case 'number':
      case 'boolean':
        // Simple types are fine
        break;
        
      case 'array':
        // Check array contents
        if (value.length > 0) {
          const firstType = typeof value[0];
          
          // Arrays of simple values are OK
          if (['string', 'number', 'boolean'].includes(firstType)) {
            // Check all elements are same type
            const mixedTypes = value.some(item => typeof item !== firstType);
            if (mixedTypes) {
              warnings.push({
                path: fullPath,
                issue: 'Mixed types in array',
                severity: 'warning'
              });
            }
          } else if (firstType === 'object') {
            // Arrays of objects are problematic in Obsidian
            issues.push({
              path: fullPath,
              issue: 'Array of objects not supported in Obsidian UI',
              severity: 'error',
              example: value.slice(0, 2) // Show first 2 items as example
            });
          }
        }
        break;
        
      case 'object':
        // Nested objects have limited support
        if (value !== null) {
          const depth = path.length + 1;
          if (depth > 1) {
            warnings.push({
              path: fullPath,
              issue: 'Nested objects have limited support in Obsidian',
              severity: 'warning'
            });
          }
          
          // Recursively check nested properties
          for (const [nestedKey, nestedValue] of Object.entries(value)) {
            const result = this.checkValue(nestedKey, nestedValue, [...path, key]);
            issues.push(...result.issues);
            warnings.push(...result.warnings);
          }
        }
        break;
        
      default:
        warnings.push({
          path: fullPath,
          issue: `Unusual type: ${valueType}`,
          severity: 'warning'
        });
    }
    
    return { issues, warnings };
  }
  
  /**
   * Generate suggestions for fixing issues
   */
  static generateSuggestions(data, issues) {
    const suggestions = [];
    
    for (const issue of issues) {
      if (issue.issue.includes('Array of objects')) {
        suggestions.push({
          path: issue.path,
          suggestion: 'Consider using a table in the note body or separate linked notes',
          alternative: this.convertArrayOfObjectsToTable(issue.example)
        });
      } else if (issue.issue.includes('Null value')) {
        suggestions.push({
          path: issue.path,
          suggestion: 'Remove this field or provide a valid value',
          alternative: ''
        });
      }
    }
    
    return suggestions;
  }
  
  /**
   * Convert array of objects to markdown table format
   */
  static convertArrayOfObjectsToTable(data) {
    if (!Array.isArray(data) || data.length === 0) return '';
    
    // Get all keys from all objects
    const keys = [...new Set(data.flatMap(obj => Object.keys(obj)))];
    
    // Build table
    let table = '\n| ' + keys.join(' | ') + ' |\n';
    table += '| ' + keys.map(() => '---').join(' | ') + ' |\n';
    
    for (const obj of data) {
      const row = keys.map(key => String(obj[key] || '')).join(' | ');
      table += '| ' + row + ' |\n';
    }
    
    return table;
  }
  
  /**
   * Clean frontmatter to be Obsidian-compatible
   */
  static cleanForObsidian(content) {
    try {
      const parsed = matter(content);
      const cleaned = { ...parsed.data };
      const movedData = {};
      
      // Process each property
      for (const [key, value] of Object.entries(cleaned)) {
        const result = this.cleanValue(key, value);
        
        if (result.remove) {
          delete cleaned[key];
          if (result.moveToBody) {
            movedData[key] = result.moveToBody;
          }
        } else if (result.replace !== undefined) {
          cleaned[key] = result.replace;
        }
      }
      
      // Rebuild content
      let newContent = matter.stringify(parsed.content, cleaned);
      
      // Add moved data to body as tables or sections
      if (Object.keys(movedData).length > 0) {
        newContent += '\n\n---\n\n## Metadata\n';
        for (const [key, data] of Object.entries(movedData)) {
          newContent += `\n### ${key}\n${data}\n`;
        }
      }
      
      return {
        content: newContent,
        cleaned: Object.keys(movedData).length > 0,
        movedData
      };
    } catch (error) {
      return {
        content,
        cleaned: false,
        error: error.message
      };
    }
  }
  
  /**
   * Clean individual values
   */
  static cleanValue(key, value) {
    // Handle null values
    if (value === null) {
      return { remove: true };
    }
    
    // Handle arrays of objects
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
      return {
        remove: true,
        moveToBody: this.convertArrayOfObjectsToTable(value)
      };
    }
    
    // Keep other values as-is
    return { keep: true };
  }
}