import fs from 'fs/promises';
import { getVaultPath, loadConfig } from '../utils/config-loader.js';
import path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';

/**
 * Tag management tools
 */

export async function get_tags(args = {}) {
  const { path: filePath } = args;
  
  // Get vault path and config
  const vaultPath = await getVaultPath();
  const config = await loadConfig();
  
  // Try to use Obsidian API if available (but not in test mode)
  if (config.useObsidianAPI !== false && process.env.NODE_ENV !== 'test') {
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
          
          const tagHierarchy = apiData.data.hierarchy || buildHierarchy(tagList);
          
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
      cwd: vaultPath,
      ignore: config.ignorePatterns || ['.obsidian/**', '.git/**', '.trash/**']
    });
  }
  
  const tagCounts = new Map();
  const fileTagMap = new Map();
  
  for (const file of files) {
    const fullPath = path.join(vaultPath, file);
    
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
    let body = content;
    
    // Try to parse frontmatter, but handle malformed YAML gracefully
    try {
      const parsed = matter(content);
      data = parsed.data;
      body = parsed.content;
    } catch (yamlError) {
      // If YAML parsing fails, try to extract content after frontmatter delimiter
      console.warn(`Warning: Skipping malformed frontmatter in ${file}`);
      if (content.startsWith('---\n')) {
        const endIndex = content.indexOf('\n---\n', 4);
        if (endIndex > 0) {
          body = content.substring(endIndex + 5);
        }
      }
    }
    
    const fileTags = new Set();
    
    // Get frontmatter tags
    if (data.tags) {
      const frontmatterTags = Array.isArray(data.tags) ? data.tags : [data.tags];
      frontmatterTags.forEach(tag => {
        if (tag && typeof tag === 'string') {
          const cleanTag = tag.replace(/^#/, '');
          fileTags.add(cleanTag);
          tagCounts.set(cleanTag, (tagCounts.get(cleanTag) || 0) + 1);
        }
      });
    }
    
    // Get inline tags - support hierarchical tags with slashes
    const inlineTagRegex = /#[\w-]+(\/[\w-]+)*/g;
    const matches = body.match(inlineTagRegex) || [];
    matches.forEach(tag => {
      const cleanTag = tag.substring(1);
      fileTags.add(cleanTag);
      tagCounts.set(cleanTag, (tagCounts.get(cleanTag) || 0) + 1);
    });
    
    if (fileTags.size > 0) {
      fileTagMap.set(file, Array.from(fileTags));
    }
  }
  
  // Build tag hierarchy
  const tagHierarchy = {};
  const allTags = Array.from(tagCounts.keys());
  
  allTags.forEach(tag => {
    const parts = tag.split('/');
    let current = tagHierarchy;
    
    parts.forEach((part, index) => {
      if (!current[part]) {
        current[part] = {
          count: 0,
          children: {}
        };
      }
      
      // Only count at the exact level
      if (index === parts.length - 1) {
        current[part].count = tagCounts.get(tag);
      }
      
      current = current[part].children;
    });
  });
  
  // Convert tagCounts Map to object for easier access
  const tagsObject = {};
  tagCounts.forEach((count, tag) => {
    tagsObject[tag] = count;
  });
  
  const result = {
    tags: Array.from(tagCounts.keys()).map(tag => tag.replace(/^#/, '')),  // Array of tag names for test compatibility
    tagCounts: tagsObject,  // Object mapping tag to count
    tagList: Array.from(tagCounts.entries()).map(([tag, count]) => ({ 
      tag: tag.replace(/^#/, ''),  // Remove hashtag prefix if present
      count 
    })),
    totalTags: tagCounts.size,
    hierarchy: tagHierarchy,
    // Also expose tags as array for test compatibility
    tagArray: Array.from(tagCounts.keys()).map(tag => tag.replace(/^#/, ''))  // Remove hashtag prefix
  };
  
  if (filePath) {
    // For single file, return simpler format
    return {
      tags: fileTagMap.get(filePath) || [],
      file: filePath
    };
  }
  
  return result;
}

export async function update_tags(args) {
  const { path: filePath, add = [], remove = [], replace } = args;
  
  // Validate tags for invalid characters
  const validateTag = (tag) => {
    const invalidChars = /[@\\]/;
    if (invalidChars.test(tag)) {
      throw new Error(`Invalid character in tag: ${tag}`);
    }
  };
  
  // Validate all tags
  [...add, ...remove, ...(replace || [])].forEach(validateTag);
  
  // Try to use Obsidian API if available
  const config = await loadConfig();
  if (config.useObsidianAPI !== false && process.env.NODE_ENV !== 'test') {
    try {
      const response = await fetch('http://localhost:3001/api/tags/update', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ path: filePath, add, remove, replace }),
        signal: AbortSignal.timeout(2000)
      });
      
      if (response.ok) {
        const apiData = await response.json();
        if (apiData.success) {
          // The API should handle tag updates properly
          // Ensure we return cleaned tags
          const result = apiData.data;
          if (result.tags && Array.isArray(result.tags)) {
            result.tags = result.tags.map(t => t.replace(/^#/, ''));
          }
          return result;
        }
      }
    } catch (apiError) {
      // Fall back to file-based update
      console.error('API not available for tag update:', apiError.message);
    }
  }
  
  // Get vault path from config
  const vaultPath = await getVaultPath();
  
  const fullPath = path.join(vaultPath, filePath);
  const content = await fs.readFile(fullPath, 'utf-8');
  
  let parsed;
  try {
    parsed = matter(content);
  } catch (yamlError) {
    throw new Error(`Cannot update tags: file has malformed frontmatter - ${yamlError.message}`);
  }
  
  // Get current tags
  let currentTags = [];
  if (parsed.data.tags) {
    currentTags = Array.isArray(parsed.data.tags) ? parsed.data.tags : [parsed.data.tags];
  }
  
  // Clean tags (remove # prefix and normalize)
  const normalizeTag = (tag) => {
    return tag.replace(/^#/, '')  // Remove # prefix
              .replace(/\s+/g, '-')  // Replace spaces with hyphens
              .toLowerCase();        // Convert to lowercase
  };
  
  currentTags = currentTags.map(normalizeTag);
  const cleanAdd = add.map(normalizeTag);
  const cleanRemove = remove.map(normalizeTag);
  
  // Apply changes
  let newTags;
  if (replace !== undefined) {
    newTags = Array.isArray(replace) ? replace.map(normalizeTag) : [];
  } else {
    newTags = [...currentTags];
    
    // Remove tags
    newTags = newTags.filter(tag => !cleanRemove.includes(tag));
    
    // Add tags
    cleanAdd.forEach(tag => {
      if (!newTags.includes(tag)) {
        newTags.push(tag);
      }
    });
  }
  
  // Update frontmatter
  if (newTags.length > 0) {
    parsed.data.tags = newTags;
  } else {
    delete parsed.data.tags;
  }
  
  parsed.data.modified = new Date().toISOString();
  
  // Write back
  const newContent = matter.stringify(parsed.content, parsed.data);
  await fs.writeFile(fullPath, newContent);
  
  return {
    path: filePath,
    tags: newTags,
    added: cleanAdd,
    removed: cleanRemove,
    success: true
  };
}

export async function analyze_tags() {
  // Try to use Obsidian API if available
  const config = await loadConfig();
  
  // Check if we can use the Obsidian API (but not in test mode)
  if (config.useObsidianAPI !== false && process.env.NODE_ENV !== 'test') {
    try {
      const response = await fetch('http://localhost:3001/api/tags', {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(1000)
      });
      
      if (response.ok) {
        const apiData = await response.json();
        if (apiData.success && apiData.data) {
          // Process API data into our format
          // IMPORTANT: Obsidian API returns tags WITH hashtags
          const tags = apiData.data.tags || {};
          const tagList = Object.entries(tags).map(([tag, count]) => ({ 
            tag: tag.replace(/^#/, ''),  // Remove hashtag prefix
            count 
          }));
          
          // Build similar tags from API data if available
          const similarTags = findSimilarTagsFromList(tagList);
          
          return {
            analysis: {
              totalTags: tagList.length,
              mostUsedTags: tagList.sort((a, b) => b.count - a.count).slice(0, 10),
              leastUsedTags: tagList.filter(t => t.count === 1),
              similar: similarTags,
              orphaned: tagList.filter(t => t.count === 1).map(t => t.tag),
              hierarchy: apiData.data.hierarchy || {}
            },
            totalTags: tagList.length,
            recommendations: generateRecommendations(tagList, similarTags),
            tags: tagList.sort((a, b) => b.count - a.count).slice(0, 10).map(t => t.tag),
            totalUsage: tagList.reduce((sum, t) => sum + t.count, 0),
            similar: similarTags
          };
        }
      }
    } catch (apiError) {
      // Fall back to file-based scanning
      console.error('API not available, using file scan:', apiError.message);
    }
  }
  
  // Get all tags from file system
  const tagData = await get_tags();
  const tagList = tagData.tagList || [];
  
  // Calculate statistics
  const hierarchicalTags = tagList.filter(t => t.tag.includes('/'));
  const maxDepth = hierarchicalTags.reduce((max, t) => {
    const depth = t.tag.split('/').length;
    return Math.max(max, depth);
  }, 0);
  
  const stats = {
    totalTags: tagList.length,
    avgTagsPerNote: 0,
    mostUsedTags: tagList.sort((a, b) => b.count - a.count).slice(0, 10),
    leastUsedTags: tagList.filter(t => t.count === 1),
    hierarchicalTags: hierarchicalTags,
    recommendations: [],
    similar: [],
    orphaned: [],
    hierarchy: tagData.hierarchy,
    mostUsed: tagList.sort((a, b) => b.count - a.count).slice(0, 10),
    maxDepth: maxDepth
  };
  
  // Add recommendations
  if (stats.leastUsedTags.length > 20) {
    stats.recommendations.push({
      type: 'cleanup',
      message: `You have ${stats.leastUsedTags.length} tags used only once. Consider consolidating or removing them.`
    });
  }
  
  // Check for similar tags
  const similarTags = findSimilarTagsFromList(tagList);
  
  if (similarTags.length > 0) {
    stats.recommendations.push({
      type: 'merge',
      message: `Found ${similarTags.length} pairs of similar tags that might be duplicates`,
      tags: similarTags
    });
    stats.similar = similarTags;
  }
  
  // Identify orphaned tags (used only once)
  stats.orphaned = stats.leastUsedTags.map(t => t.tag);
  
  return {
    analysis: stats,
    totalTags: stats.totalTags,
    recommendations: stats.recommendations,
    // Add for test compatibility
    tags: stats.mostUsedTags.map(t => t.tag),
    totalUsage: tagList.reduce((sum, t) => sum + t.count, 0),
    similar: stats.similar // Ensure similar is included at top level
  };
}

export async function suggest_tags(args) {
  const { content, existingTags = [] } = args;
  
  // Try to use Obsidian API if available
  const config = await loadConfig();
  let tagList = [];
  
  // Check if we can use the Obsidian API for tag data (but not in test mode)
  if (config.useObsidianAPI !== false && process.env.NODE_ENV !== 'test') {
    try {
      const response = await fetch('http://localhost:3001/api/tags', {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(1000)
      });
      
      if (response.ok) {
        const apiData = await response.json();
        if (apiData.success && apiData.data && apiData.data.tags) {
          // Convert API tags object to our tagList format
          // Clean hashtags from Obsidian API tags
          tagList = Object.entries(apiData.data.tags).map(([tag, count]) => ({ 
            tag: tag.replace(/^#/, ''),  // Remove hashtag
            count 
          }));
        }
      }
    } catch (apiError) {
      // Fall back to file-based tags
      console.error('API not available for tag suggestions:', apiError.message);
    }
  }
  
  // If we didn't get tags from API, get them from file system
  if (tagList.length === 0) {
    const tagData = await get_tags();
    tagList = tagData.tagList || [];
  }
  
  // Simple keyword-based suggestion
  const suggestions = [];
  const contentLower = content.toLowerCase();
  
  // Check each existing tag
  tagList.forEach(({ tag, count }) => {
    // Clean the tag of any hashtag prefix
    const cleanTag = tag.replace(/^#/, '');
    if (existingTags.includes(cleanTag)) return;
    
    const tagLower = cleanTag.toLowerCase();
    const keywords = tagLower.split(/[-_\/]/).filter(k => k.length > 2); // Lowered threshold
    
    // Check if any keyword appears in content as a whole word
    const matches = keywords.filter(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      return regex.test(content);
    });
    
    if (matches.length > 0) {
      suggestions.push({
        tag: cleanTag,  // Use cleaned tag without hashtag
        score: matches.length * Math.log(count + 1),
        reason: `Content contains: ${matches.join(', ')}`,
        usage: count
      });
    }
  });
  
  // Add suggestions based on common words and related tags
  if (content.trim()) {
    // Extract potential tag candidates from content
    const words = contentLower.match(/\b[a-z]+\b/g) || [];
    const commonTags = ['javascript', 'tutorial', 'programming', 'web', 'development'];
    
    // Related tags map
    const relatedTags = {
      'javascript': ['programming', 'web', 'development'],
      'python': ['programming', 'scripting'],
      'react': ['javascript', 'web', 'frontend'],
      'nodejs': ['javascript', 'backend'],
      'typescript': ['javascript', 'programming']
    };
    
    commonTags.forEach(tag => {
      if (words.includes(tag) && !existingTags.includes(tag) && !suggestions.find(s => s.tag === tag)) {
        suggestions.push({
          tag,
          score: 1,
          reason: 'Common keyword in content',
          usage: 0
        });
        
        // Also add related tags
        const related = relatedTags[tag] || [];
        related.forEach(relTag => {
          if (!existingTags.includes(relTag) && !suggestions.find(s => s.tag === relTag)) {
            suggestions.push({
              tag: relTag,
              score: 0.5,
              reason: `Related to ${tag}`,
              usage: 0
            });
          }
        });
      }
    });
  }
  
  // Sort by score
  suggestions.sort((a, b) => b.score - a.score);
  
  // Return format expected by tests and TagHandler
  const topSuggestions = suggestions.slice(0, 10);
  return {
    suggestions: topSuggestions.map(s => s.tag),  // Array of tag names for compatibility
    confidence: topSuggestions,  // Full objects with scores
    basedOn: 'content-analysis',
    reason: topSuggestions.length > 0 ? topSuggestions[0].reason : 'No matching tags found'
  };
}

export async function rename_tag(args) {
  const { oldTag, newTag, preview = false, includeInline = true, includeFrontmatter = true, merge = false } = args;
  
  // Clean tags
  const cleanOld = oldTag.replace(/^#/, '');
  const cleanNew = newTag.replace(/^#/, '');
  
  // Validate new tag name - no spaces allowed
  if (/\s/.test(cleanNew)) {
    throw new Error('Invalid tag name: spaces not allowed');
  }
  
  // Get vault path and config
  const vaultPath = await getVaultPath();
  const config = await loadConfig();
  
  // Find all files
  const files = await glob('**/*.md', {
    cwd: vaultPath,
    ignore: config.ignorePatterns || ['.obsidian/**', '.git/**', '.trash/**']
  });
  
  const changes = [];
  
  for (const file of files) {
    const fullPath = path.join(vaultPath, file);
    const content = await fs.readFile(fullPath, 'utf-8');
    
    let parsed;
    try {
      parsed = matter(content);
    } catch (yamlError) {
      console.warn(`Warning: Skipping file with malformed frontmatter: ${file}`);
      continue; // Skip this file
    }
    
    let modified = false;
    
    // Check frontmatter tags
    if (includeFrontmatter && parsed.data.tags) {
      const tags = Array.isArray(parsed.data.tags) ? parsed.data.tags : [parsed.data.tags];
      const newTags = tags.map(tag => tag === cleanOld ? cleanNew : tag);
      
      if (tags.some((tag, i) => tag !== newTags[i])) {
        if (!preview) {
          parsed.data.tags = newTags;
        }
        modified = true;
      }
    }
    
    // Check inline tags
    let newBody = parsed.content;
    if (includeInline) {
      // Escape special regex characters
      const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedOld = escapeRegex(cleanOld);
      // Use negative lookahead to ensure tag ends properly (not followed by word char or hyphen or slash)
      const oldTagRegex = new RegExp(`#${escapedOld}(?![\\w-/])`, 'g');
      const matches = newBody.match(oldTagRegex);
      
      if (matches) {
        if (!preview) {
          newBody = newBody.replace(oldTagRegex, `#${cleanNew}`);
        }
        modified = true;
      }
    }
    
    if (modified) {
      // Use the same escaped regex
      const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedOld = escapeRegex(cleanOld);
      
      changes.push({
        path: file,
        frontmatterChanges: includeFrontmatter && parsed.data.tags ? 1 : 0,
        inlineChanges: includeInline ? (parsed.content.match(new RegExp(`#${escapedOld}\\b`, 'g')) || []).length : 0
      });
      
      if (!preview) {
        parsed.data.modified = new Date().toISOString();
        const newContent = matter.stringify(newBody, parsed.data);
        await fs.writeFile(fullPath, newContent);
      }
    }
  }
  
  return {
    oldTag: cleanOld,
    newTag: cleanNew,
    filesChanged: changes.length,
    filesUpdated: changes.length, // Add alias for test compatibility
    affectedFiles: changes.map(c => c.path), // Add for test compatibility
    changes,
    preview,
    success: !preview,
    merged: merge && changes.length > 0
  };
}

// Helper function to build hierarchy from tag list
function buildHierarchy(tagList) {
  const hierarchy = {};
  
  tagList.forEach(({ tag }) => {
    const parts = tag.split('/');
    let current = hierarchy;
    
    parts.forEach((part, index) => {
      if (!current[part]) {
        current[part] = {
          count: 0,
          children: {}
        };
      }
      
      // Only count at the exact level
      if (index === parts.length - 1) {
        const tagItem = tagList.find(t => t.tag === tag);
        current[part].count = tagItem ? tagItem.count : 0;
      }
      
      current = current[part].children;
    });
  });
  
  return hierarchy;
}

// Helper function to find similar tags from a list
function findSimilarTagsFromList(tagList) {
  const similarTags = [];
  for (let i = 0; i < tagList.length; i++) {
    for (let j = i + 1; j < tagList.length; j++) {
      const tag1 = tagList[i].tag.toLowerCase();
      const tag2 = tagList[j].tag.toLowerCase();
      
      // Simple similarity check
      if (Math.abs(tag1.length - tag2.length) <= 2) {
        const distance = levenshteinDistance(tag1, tag2);
        if (distance <= 2) {
          similarTags.push([tagList[i].tag, tagList[j].tag]);
        }
      }
    }
  }
  return similarTags;
}

// Helper function to generate recommendations
function generateRecommendations(tagList, similarTags) {
  const recommendations = [];
  
  const leastUsedTags = tagList.filter(t => t.count === 1);
  if (leastUsedTags.length > 20) {
    recommendations.push({
      type: 'cleanup',
      message: `You have ${leastUsedTags.length} tags used only once. Consider consolidating or removing them.`
    });
  }
  
  if (similarTags.length > 0) {
    recommendations.push({
      type: 'merge',
      message: `Found ${similarTags.length} pairs of similar tags that might be duplicates`,
      tags: similarTags
    });
  }
  
  return recommendations;
}

// Helper function for tag similarity
function levenshteinDistance(a, b) {
  const matrix = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}