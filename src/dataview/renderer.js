import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

export class DataviewRenderer {
  constructor(config, cache) {
    this.config = config;
    this.cache = cache;
  }

  async renderDataviewBlocks(content, contextPath) {
    // Find all dataview code blocks
    const dataviewRegex = /```dataview\s*\n([\s\S]*?)\n```/g;
    let rendered = content;
    let match;

    while ((match = dataviewRegex.exec(content)) !== null) {
      const query = match[1].trim();
      try {
        const results = await this.executeQuery(query, contextPath);
        const renderedTable = this.formatResults(results, query);
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

  formatResults(results, originalQuery) {
    if (results.length === 0) {
      return '*No results found*';
    }
    
    // Extract column names from first result
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
}