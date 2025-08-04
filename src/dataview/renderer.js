import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

export class DataviewRenderer {
  constructor(config, cache) {
    this.config = config;
    this.cache = cache;
  }

  async renderDataviewBlocks(content, contextPath, renderMode = 'smart') {
    // Find all dataview code blocks
    const dataviewRegex = /```dataview\s*\n([\s\S]*?)\n```/g;
    let rendered = content;
    let match;

    while ((match = dataviewRegex.exec(content)) !== null) {
      const query = match[1].trim();
      try {
        const results = await this.executeQuery(query, contextPath);
        const renderedTable = this.formatResults(results, query, renderMode);
        rendered = rendered.replace(match[0], renderedTable);
      } catch (error) {
        // If we can't render, leave the original query
        console.error(`Failed to render Dataview query: ${error.message}`);
      }
    }

    return rendered;
  }

  async executeQuery(query, contextPath) {
    // Parse common TABLE queries
    const tableMatch = query.match(/TABLE\s+(.*?)\s*FROM\s+"([^"]+)"\s*(WHERE\s+(.+?))?\s*(SORT\s+(.+))?/i);
    
    if (!tableMatch) {
      throw new Error('Unsupported Dataview query format');
    }

    const [, fields, fromPath, , whereClause, , sortClause] = tableMatch;
    
    // Parse fields
    const fieldDefs = this.parseFields(fields);
    
    // Get files from the specified path
    const files = await this.getFilesFromPath(fromPath);
    
    // Apply WHERE clause
    let filteredFiles = files;
    if (whereClause) {
      filteredFiles = await this.applyWhereClause(files, whereClause);
    }
    
    // Apply SORT
    if (sortClause) {
      filteredFiles = this.applySortClause(filteredFiles, sortClause);
    }
    
    // Extract requested fields
    return this.extractFields(filteredFiles, fieldDefs);
  }

  parseFields(fieldStr) {
    const fields = fieldStr.split(',').map(f => f.trim());
    return fields.map(field => {
      const asMatch = field.match(/(.+?)\s+as\s+"([^"]+)"/);
      if (asMatch) {
        return { field: asMatch[1].trim(), alias: asMatch[2] };
      }
      return { field: field, alias: field };
    });
  }

  async getFilesFromPath(fromPath) {
    const vaultFiles = await this.cache.getVaultStructure();
    const matchingFiles = [];
    
    for (const file of vaultFiles) {
      if (file.path.startsWith(fromPath + '/') || fromPath === "") {
        try {
          const content = await this.cache.getFileContent(file.path);
          const { data: frontmatter } = matter(content.content);
          matchingFiles.push({
            path: file.path,
            frontmatter,
            modified: file.modified
          });
        } catch (error) {
          console.error(`Error reading ${file.path}:`, error);
        }
      }
    }
    
    return matchingFiles;
  }

  async applyWhereClause(files, whereClause) {
    const filtered = [];
    
    for (const file of files) {
      if (await this.evaluateWhereClause(file, whereClause)) {
        filtered.push(file);
      }
    }
    
    return filtered;
  }

  async evaluateWhereClause(file, clause) {
    // Support common patterns
    const typeMatch = clause.match(/type\s*=\s*"([^"]+)"/);
    const tagMatch = clause.match(/contains\(tags,\s*"([^"]+)"\)/);
    const statusMatch = clause.match(/status\s*=\s*"([^"]+)"/);
    
    let conditions = [];
    
    if (typeMatch) {
      conditions.push(file.frontmatter.type === typeMatch[1]);
    }
    
    if (tagMatch) {
      const tags = file.frontmatter.tags || [];
      conditions.push(tags.includes(tagMatch[1]));
    }
    
    if (statusMatch) {
      conditions.push(file.frontmatter.status === statusMatch[1]);
    }
    
    // Handle AND conditions
    if (clause.includes('AND')) {
      return conditions.every(c => c);
    }
    
    // Default to all conditions being true
    return conditions.length === 0 || conditions.every(c => c);
  }

  applySortClause(files, sortClause) {
    const descMatch = sortClause.match(/(\w+)\s+DESC/i);
    const field = descMatch ? descMatch[1] : sortClause.trim();
    const desc = !!descMatch;
    
    return files.sort((a, b) => {
      let aVal, bVal;
      
      if (field === 'date') {
        aVal = new Date(a.frontmatter.created || a.modified);
        bVal = new Date(b.frontmatter.created || b.modified);
      } else {
        aVal = a.frontmatter[field] || '';
        bVal = b.frontmatter[field] || '';
      }
      
      if (desc) {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
      return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    });
  }

  extractFields(files, fieldDefs) {
    return files.map(file => {
      const row = {};
      
      for (const fieldDef of fieldDefs) {
        const value = file.frontmatter[fieldDef.field] || '';
        row[fieldDef.alias] = value;
      }
      
      // Always include file path for reference
      row._path = file.path;
      
      return row;
    });
  }

  formatResults(results, originalQuery, renderMode = 'smart') {
    if (results.length === 0) {
      return '*No results found*';
    }
    
    // Smart rendering based on result count
    const resultCount = results.length;
    
    // If mode is 'smart', decide based on result count
    if (renderMode === 'smart') {
      if (resultCount > 10) {
        renderMode = 'summary';
      } else {
        renderMode = 'table';
      }
    }
    
    switch (renderMode) {
      case 'summary':
        return this.formatSummary(results, originalQuery);
      case 'count':
        return this.formatCount(results, originalQuery);
      case 'table':
        return this.formatTable(results, originalQuery);
      case 'compact':
        return this.formatCompact(results, originalQuery);
      default:
        return this.formatTable(results, originalQuery);
    }
  }
  
  formatSummary(results, originalQuery) {
    const count = results.length;
    const columns = Object.keys(results[0]).filter(k => k !== '_path');
    
    // Group by first column (usually type or status)
    const groups = {};
    const groupCol = columns[0];
    
    for (const row of results) {
      const key = row[groupCol] || 'Other';
      groups[key] = (groups[key] || 0) + 1;
    }
    
    let summary = `\n📊 **Summary**: ${count} total results\n\n`;
    
    // Show distribution
    for (const [key, count] of Object.entries(groups)) {
      summary += `- ${key}: ${count}\n`;
    }
    
    // Show recent 5 items
    if (count > 5) {
      summary += `\n**Recent items:**\n`;
      for (let i = 0; i < Math.min(5, results.length); i++) {
        const row = results[i];
        const title = row[columns[0]] || 'Untitled';
        summary += `- ${title}\n`;
      }
      summary += `*...and ${count - 5} more*\n`;
    }
    
    return summary + `\n*Dataview summary (${count} results)*`;
  }
  
  formatCount(results, originalQuery) {
    const count = results.length;
    const columns = Object.keys(results[0]).filter(k => k !== '_path');
    
    // Group by status/type if available
    const statusCol = columns.find(c => c.toLowerCase().includes('status') || c.toLowerCase().includes('type'));
    
    if (statusCol) {
      const groups = {};
      for (const row of results) {
        const key = row[statusCol] || 'Unknown';
        groups[key] = (groups[key] || 0) + 1;
      }
      
      let output = `\n**Total**: ${count} items\n`;
      for (const [key, count] of Object.entries(groups)) {
        output += `- ${key}: ${count}\n`;
      }
      return output + `\n*Dataview count*`;
    }
    
    return `\n**Count**: ${count} items\n*Dataview count*`;
  }
  
  formatCompact(results, originalQuery) {
    const maxRows = 10;
    const columns = Object.keys(results[0]).filter(k => k !== '_path');
    
    // Only show first 2 columns for compact view
    const compactCols = columns.slice(0, 2);
    
    let table = '\n| ' + compactCols.join(' | ') + ' |\n';
    table += '| ' + compactCols.map(() => '---').join(' | ') + ' |\n';
    
    const rowsToShow = Math.min(maxRows, results.length);
    
    for (let i = 0; i < rowsToShow; i++) {
      const row = results[i];
      const values = compactCols.map(col => {
        const val = row[col];
        // Truncate long values
        if (typeof val === 'string' && val.length > 30) {
          return val.substring(0, 30) + '...';
        }
        return val;
      });
      table += '| ' + values.join(' | ') + ' |\n';
    }
    
    if (results.length > maxRows) {
      table += `\n*...and ${results.length - maxRows} more results*\n`;
    }
    
    return table + `\n*Dataview compact view (${results.length} total)*`;
  }
  
  formatTable(results, originalQuery) {
    // Original full table implementation
    const columns = Object.keys(results[0]).filter(k => k !== '_path');
    
    // Build markdown table
    let table = '\n| ' + columns.join(' | ') + ' |\n';
    table += '| ' + columns.map(() => '---').join(' | ') + ' |\n';
    
    for (const row of results) {
      const values = columns.map(col => {
        const val = row[col];
        // Make paths into links
        if (col === '_path' || (typeof val === 'string' && val.endsWith('.md'))) {
          return `[[${val.replace('.md', '')}]]`;
        }
        return val;
      });
      table += '| ' + values.join(' | ') + ' |\n';
    }
    
    return table + `\n*Rendered from Dataview query*`;
  }

  /**
   * Render a Dataview query
   * @stub - Basic implementation for testing
   */
  async renderQuery(query) {
    if (!query || query.trim() === '') {
      return {
        type: 'empty',
        error: 'Empty query provided'
      };
    }

    const parsed = this.parseQuery(query);
    
    if (parsed.type === 'error') {
      return parsed;
    }

    // Basic implementation - return parsed structure with mock data
    const type = parsed.type.toLowerCase();  // Convert to lowercase for renderQuery
    
    switch (type) {
      case 'table':
        return {
          type: 'table',
          headers: ['File', ...parsed.fields],
          rows: [],
          ...parsed
        };
      
      case 'list':
        return {
          type: 'list',
          items: [],
          ...parsed
        };
      
      case 'task':
        return {
          type: 'task',
          tasks: [],
          ...parsed
        };
      
      default:
        return {
          type: 'error',
          error: `Unknown query type: ${parsed.type}`
        };
    }
  }

  /**
   * Choose render mode based on result count
   */
  chooseRenderMode(results) {
    if (!results || results.length === 0) {
      return 'empty';
    }
    
    if (results.length > 10) {
      return 'summary';
    }
    
    return 'table';
  }
  
  /**
   * Extract fields from a field string
   */
  extractFields(fieldStr) {
    if (!fieldStr || fieldStr.trim() === '') {
      return [];
    }
    
    // Handle AS aliases properly
    const fields = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < fieldStr.length; i++) {
      const char = fieldStr[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
        current += char;
      } else if (char === ',' && !inQuotes) {
        if (current.trim()) {
          fields.push(current.trim());
        }
        current = '';
      } else {
        current += char;
      }
    }
    
    if (current.trim()) {
      fields.push(current.trim());
    }
    
    return fields;
  }
  
  /**
   * Evaluate FROM clause to get matching files
   */
  async evaluateFrom(fromClause) {
    const vaultStructure = await this.cache.getVaultStructure();
    const files = vaultStructure.files || [];
    
    if (!fromClause) {
      return files;
    }
    
    // Remove quotes
    const from = fromClause.replace(/"/g, '');
    
    // Handle folder paths
    if (!from.startsWith('#')) {
      return files.filter(file => {
        return file.path.startsWith(from + '/') || file.path.startsWith(from);
      });
    }
    
    // Handle tag queries (e.g., #tag)
    const tag = from.substring(1);
    const matchingFiles = [];
    
    for (const file of files) {
      try {
        const content = await this.cache.getFileContent(file.path);
        const parsed = matter(content);
        const tags = parsed.data?.tags || [];
        
        if (tags.includes(tag)) {
          matchingFiles.push(file);
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }
    
    return matchingFiles;
  }
  
  /**
   * Evaluate WHERE clause conditions
   */
  async evaluateWhere(files, whereClause) {
    if (!whereClause) {
      return files;
    }
    
    const filtered = [];
    
    for (const file of files) {
      try {
        const content = await this.cache.getFileContent(file.path);
        const parsed = matter(content);
        
        // Handle simple conditions
        if (whereClause.includes('OR')) {
          const conditions = whereClause.split('OR').map(c => c.trim());
          let matches = false;
          
          for (const condition of conditions) {
            if (await this.evaluateSingleCondition(parsed.data, condition)) {
              matches = true;
              break;
            }
          }
          
          if (matches) {
            filtered.push(file);
          }
        } else {
          if (await this.evaluateSingleCondition(parsed.data, whereClause)) {
            filtered.push(file);
          }
        }
      } catch (error) {
        // Skip files that can't be evaluated
      }
    }
    
    return filtered;
  }
  
  /**
   * Evaluate a single WHERE condition
   */
  async evaluateSingleCondition(frontmatter, condition) {
    // Handle tag contains
    const tagMatch = condition.match(/contains\(tags?,\s*"([^"]+)"\)/);
    if (tagMatch) {
      const tags = frontmatter.tags || [];
      return tags.includes(tagMatch[1]);
    }
    
    // Handle simple equality
    const equalMatch = condition.match(/(\w+)\s*=\s*"([^"]+)"/);
    if (equalMatch) {
      const [, field, value] = equalMatch;
      return frontmatter[field] === value;
    }
    
    // Handle !completed for tasks
    if (condition === '!completed') {
      return frontmatter.completed !== true;
    }
    
    return false;
  }
  
  /**
   * Parse a Dataview query
   * @stub - Basic implementation for testing
   */
  parseQuery(query) {
    if (!query || query.trim() === '') {
      return {
        type: 'error',
        error: 'Empty query'
      };
    }

    const trimmed = query.trim();
    
    // Parse TABLE queries
    if (trimmed.toUpperCase().startsWith('TABLE')) {
      // Try with fields first
      let match = trimmed.match(/TABLE\s+(.*?)\s+FROM\s+("[^"]+"|[^\s]+)(?:\s+WHERE\s+(.+?))?(?:\s+SORT\s+(.+?))?(?:\s+LIMIT\s+(\d+))?$/i);
      
      if (match) {
        const [, fields, from, where, sort, limit] = match;
        return {
          type: 'TABLE',  // uppercase for parseQuery
          fields: fields ? fields.split(',').map(f => f.trim()) : [],
          from,
          where,
          sort,
          limit: limit || undefined  // Keep as string
        };
      }
      
      // Try without fields (TABLE FROM ...)
      match = trimmed.match(/TABLE\s+FROM\s+("[^"]+"|[^\s]+)(?:\s+WHERE\s+(.+?))?(?:\s+SORT\s+(.+?))?(?:\s+LIMIT\s+(\d+))?$/i);
      
      if (match) {
        const [, from, where, sort, limit] = match;
        return {
          type: 'TABLE',  // uppercase for parseQuery
          fields: [],
          from,
          where,
          sort,
          limit: limit || undefined  // Keep as string
        };
      }
    }
    
    // Parse LIST queries
    if (trimmed.toUpperCase().startsWith('LIST')) {
      const match = trimmed.match(/LIST(?:\s+FROM\s+(.+?))?(?:\s+WHERE\s+(.+?))?(?:\s+SORT\s+(.+?))?(?:\s+LIMIT\s+(\d+))?$/i);
      
      if (match) {
        const [, from, where, sort, limit] = match;
        return {
          type: 'LIST',  // uppercase for parseQuery
          from,
          where,
          sort,
          limit: limit || undefined  // Keep as string
        };
      }
    }
    
    // Parse TASK queries
    if (trimmed.toUpperCase().startsWith('TASK')) {
      const match = trimmed.match(/TASK(?:\s+WHERE\s+(.+?))?(?:\s+SORT\s+(.+?))?(?:\s+LIMIT\s+(\d+))?$/i);
      
      if (match) {
        const [, where, sort, limit] = match;
        return {
          type: 'TASK',  // uppercase for parseQuery
          where,
          sort,
          limit: limit || undefined  // Keep as string
        };
      }
    }
    
    // Invalid query
    return {
      type: 'error',
      error: 'Invalid query format'
    };
  }
}