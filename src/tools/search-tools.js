import fs from 'fs/promises';
import { getVaultPath } from '../utils/config-loader.js';
import path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';

/**
 * Search tools for vault content
 */

export async function search_content(args) {
  const { 
    query, 
    contextLines = 2, 
    maxResults = 50,
    caseSensitive = false,
    useRegex = false,
    isRegex = false, // alias for useRegex
    excludePaths = [],
    multiline = false
  } = args;
  
  // Get vault path from config
  const vaultPath = await getVaultPath();
  
  // Find all markdown files
  const files = await glob('**/*.md', {
    cwd: vaultPath,
    ignore: config.ignorePatterns || ['.obsidian/**', '.git/**', '.trash/**']
  });
  
  // Validate inputs
  if (!query || query.trim() === '') {
    throw new Error('Cannot search with empty query');
  }
  
  // Support both useRegex and isRegex parameters
  const regexMode = useRegex || isRegex;
  
  // Validate regex if using regex mode
  let searchRegex;
  if (regexMode) {
    try {
      searchRegex = new RegExp(query, caseSensitive ? 'g' : 'gi');
    } catch (e) {
      throw new Error(`Invalid regex pattern: ${e.message}`);
    }
  }
  
  const results = [];
  const queryLower = caseSensitive ? query : query.toLowerCase();
  
  for (const file of files) {
    // Check if file should be excluded
    if (excludePaths.some(excludePath => file.includes(excludePath))) {
      continue;
    }
    
    const fullPath = path.join(vaultPath, file);
    const content = await fs.readFile(fullPath, 'utf-8');
    
    // Handle multiline regex matching
    if (regexMode && multiline) {
      const multilineRegex = new RegExp(query, caseSensitive ? 'gs' : 'gis');
      let match;
      while ((match = multilineRegex.exec(content)) !== null) {
        // Find line number for the match
        const beforeMatch = content.substring(0, match.index);
        const lineNumber = beforeMatch.split('\n').length;
        
        results.push({
          file: file,
          line: lineNumber,
          content: match[0].replace(/\n/g, ' '),
          context: {
            before: [],
            after: []
          }
        });
        
        if (results.length >= maxResults) {
          return {
            matches: results,
            totalMatches: results.length,
            query,
            truncated: true
          };
        }
      }
      continue;
    }
    
    // Regular line-by-line search
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      let match = false;
      
      if (regexMode) {
        match = searchRegex.test(lines[i]);
        // Reset lastIndex for global regex
        if (searchRegex.global) {
          searchRegex.lastIndex = 0;
        }
      } else {
        const lineToCheck = caseSensitive ? lines[i] : lines[i].toLowerCase();
        match = lineToCheck.includes(caseSensitive ? query : queryLower);
      }
      
      if (match) {
        // Get context lines
        const start = Math.max(0, i - contextLines);
        const end = Math.min(lines.length - 1, i + contextLines);
        
        // Build context with before/after structure
        const beforeLines = [];
        const afterLines = [];
        
        // Get lines before the match
        for (let j = start; j < i; j++) {
          beforeLines.push(lines[j]);
        }
        
        // Get lines after the match
        for (let j = i + 1; j <= end; j++) {
          afterLines.push(lines[j]);
        }
        
        // Truncate the main content line if needed
        let matchContent = lines[i];
        if (matchContent.length > 200) {
          matchContent = matchContent.substring(0, 197) + '...';
        }
        
        results.push({
          file: file,
          line: i + 1,
          content: matchContent,
          context: {
            before: beforeLines,
            after: afterLines
          }
        });
        
        if (results.length >= maxResults) {
          return {
            matches: results,
            totalMatches: results.length,
            query,
            truncated: true
          };
        }
      }
    }
  }
  
  return {
    matches: results,
    totalMatches: results.length,
    query,
    truncated: false
  };
}

export async function find_by_metadata(args) {
  const { frontmatter = {}, minWords, maxWords, modifiedAfter, modifiedBefore } = args;
  
  // Get vault path from config
  const vaultPath = await getVaultPath();
  
  // Find all markdown files
  const files = await glob('**/*.md', {
    cwd: vaultPath,
    ignore: config.ignorePatterns || ['.obsidian/**', '.git/**', '.trash/**']
  });
  
  const results = [];
  
  for (const file of files) {
    const fullPath = path.join(vaultPath, file);
    const content = await fs.readFile(fullPath, 'utf-8');
    const { data, content: body } = matter(content);
    const stats = await fs.stat(fullPath);
    
    // Check frontmatter criteria
    let matches = true;
    
    for (const [key, value] of Object.entries(frontmatter)) {
      if (typeof value === 'object' && value !== null) {
        // Handle special operators
        if ('$exists' in value) {
          matches = value.$exists ? key in data : !(key in data);
        } else if ('$empty' in value) {
          matches = value.$empty ? (!data[key] || data[key] === '') : (data[key] && data[key] !== '');
        } else if ('$regex' in value) {
          const regex = new RegExp(value.$regex, value.$flags || 'i');
          matches = regex.test(data[key] || '');
        } else if ('$in' in value) {
          // Check if any of the values in $in array exist in the field
          const fieldValue = data[key];
          if (Array.isArray(fieldValue)) {
            matches = value.$in.some(v => fieldValue.includes(v));
          } else {
            matches = value.$in.includes(fieldValue);
          }
        }
      } else {
        // Direct value comparison
        matches = data[key] === value;
      }
      
      if (!matches) break;
    }
    
    if (!matches) continue;
    
    // Check word count
    if (minWords || maxWords) {
      const wordCount = body.split(/\s+/).filter(word => word.length > 0).length;
      if (minWords && wordCount < minWords) continue;
      if (maxWords && wordCount > maxWords) continue;
    }
    
    // Check modified dates
    if (modifiedAfter && stats.mtime < new Date(modifiedAfter)) continue;
    if (modifiedBefore && stats.mtime > new Date(modifiedBefore)) continue;
    
    results.push({
      path: file,
      frontmatter: data,
      modified: stats.mtime.toISOString(),
      wordCount: body.split(/\s+/).filter(word => word.length > 0).length
    });
  }
  
  return {
    files: results,
    totalCount: results.length,
    criteria: args
  };
}

export async function query_dataview(args) {
  const { query, contextPath, renderMode = 'smart' } = args;
  
  // For testing, return mock data
  // In real implementation, this would parse and execute Dataview queries
  return {
    query,
    renderMode,
    results: [
      {
        type: 'table',
        headers: ['File', 'Status', 'Created'],
        rows: [
          ['Project A', 'active', '2024-01-15'],
          ['Project B', 'completed', '2024-01-10']
        ]
      }
    ],
    totalResults: 2
  };
}