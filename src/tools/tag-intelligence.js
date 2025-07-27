import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

export class TagIntelligence {
  constructor(config, cache, obsidianAPI) {
    this.config = config;
    this.cache = cache;
    this.obsidianAPI = obsidianAPI;
  }

  /**
   * Analyze all tags in the vault
   */
  async analyzeTags() {
    const startTime = Date.now();
    
    try {
      // Try Obsidian API first
      if (this.obsidianAPI && this.obsidianAPI.isAvailable()) {
        const apiTags = await this.obsidianAPI.request('/api/tags');
        if (apiTags && apiTags.tags) {
          return this.processTagsFromAPI(apiTags.tags);
        }
      }
      
      // Fallback to file system scan
      return await this.analyzeTagsFromFiles();
    } catch (error) {
      console.error('Tag analysis error:', error);
      throw error;
    }
  }

  /**
   * Process tags from Obsidian API response
   */
  processTagsFromAPI(apiTags) {
    const tagStats = new Map();
    const tagHierarchy = {};
    const tagCoOccurrence = new Map();
    
    // Process each tag
    Object.entries(apiTags).forEach(([tag, count]) => {
      // Basic stats
      tagStats.set(tag, {
        tag,
        count,
        isRoot: !tag.includes('/'),
        level: tag.split('/').length - 1,
        parent: this.getParentTag(tag)
      });
      
      // Build hierarchy
      this.addToHierarchy(tagHierarchy, tag);
    });
    
    return {
      totalTags: tagStats.size,
      stats: Array.from(tagStats.values()).sort((a, b) => b.count - a.count),
      hierarchy: tagHierarchy,
      recommendations: this.generateRecommendations(tagStats)
    };
  }

  /**
   * Analyze tags by scanning files (fallback method)
   */
  async analyzeTagsFromFiles() {
    const files = await this.cache.getAllFiles();
    const tagStats = new Map();
    const tagCoOccurrence = new Map();
    const tagFirstSeen = new Map();
    const tagLastSeen = new Map();
    
    for (const file of files) {
      if (!file.path.endsWith('.md')) continue;
      
      try {
        const content = await fs.readFile(
          path.join(this.config.vaultPath, file.path), 
          'utf-8'
        );
        
        const { data: frontmatter } = matter(content);
        const tags = this.extractTags(content, frontmatter);
        
        // Update stats
        tags.forEach(tag => {
          const current = tagStats.get(tag) || {
            tag,
            count: 0,
            files: [],
            isRoot: !tag.includes('/'),
            level: tag.split('/').length - 1,
            parent: this.getParentTag(tag)
          };
          
          current.count++;
          current.files.push(file.path);
          tagStats.set(tag, current);
          
          // Track first/last seen
          const mtime = file.mtime || Date.now();
          if (!tagFirstSeen.has(tag) || mtime < tagFirstSeen.get(tag)) {
            tagFirstSeen.set(tag, mtime);
          }
          if (!tagLastSeen.has(tag) || mtime > tagLastSeen.get(tag)) {
            tagLastSeen.set(tag, mtime);
          }
        });
        
        // Track co-occurrence
        this.updateCoOccurrence(tagCoOccurrence, tags);
      } catch (error) {
        console.error(`Error processing ${file.path}:`, error);
      }
    }
    
    // Build hierarchy
    const tagHierarchy = {};
    tagStats.forEach((stat, tag) => {
      this.addToHierarchy(tagHierarchy, tag);
    });
    
    // Find similar tags
    const similarTags = this.findSimilarTags(Array.from(tagStats.keys()));
    
    return {
      totalTags: tagStats.size,
      totalFiles: files.length,
      stats: Array.from(tagStats.values()).sort((a, b) => b.count - a.count),
      hierarchy: tagHierarchy,
      coOccurrence: this.formatCoOccurrence(tagCoOccurrence),
      similarTags,
      recommendations: this.generateRecommendations(tagStats, similarTags)
    };
  }

  /**
   * Extract tags from content and frontmatter
   */
  extractTags(content, frontmatter) {
    const tags = new Set();
    
    // Extract from frontmatter
    if (frontmatter.tags) {
      const fmTags = Array.isArray(frontmatter.tags) 
        ? frontmatter.tags 
        : [frontmatter.tags];
      fmTags.forEach(tag => {
        if (typeof tag === 'string') {
          tags.add(tag.startsWith('#') ? tag : `#${tag}`);
        }
      });
    }
    
    // Extract from content
    const tagRegex = /#[a-zA-Z0-9_\-\/]+/g;
    const matches = content.match(tagRegex) || [];
    matches.forEach(tag => tags.add(tag));
    
    return Array.from(tags);
  }

  /**
   * Get parent tag
   */
  getParentTag(tag) {
    const parts = tag.split('/');
    if (parts.length <= 1) return null;
    return parts.slice(0, -1).join('/');
  }

  /**
   * Add tag to hierarchy structure
   */
  addToHierarchy(hierarchy, tag) {
    const parts = tag.split('/');
    let current = hierarchy;
    
    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join('/');
      if (!current[part]) {
        current[part] = {
          name: part,
          path: path,
          children: {}
        };
      }
      current = current[part].children;
    });
  }

  /**
   * Update co-occurrence matrix
   */
  updateCoOccurrence(coOccurrence, tags) {
    for (let i = 0; i < tags.length; i++) {
      for (let j = i + 1; j < tags.length; j++) {
        const key = [tags[i], tags[j]].sort().join('|');
        coOccurrence.set(key, (coOccurrence.get(key) || 0) + 1);
      }
    }
  }

  /**
   * Format co-occurrence data
   */
  formatCoOccurrence(coOccurrence) {
    return Array.from(coOccurrence.entries())
      .map(([key, count]) => {
        const [tag1, tag2] = key.split('|');
        return { tag1, tag2, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 20); // Top 20 co-occurrences
  }

  /**
   * Find similar tags using various similarity measures
   */
  findSimilarTags(tags) {
    const similar = [];
    
    for (let i = 0; i < tags.length; i++) {
      for (let j = i + 1; j < tags.length; j++) {
        const similarity = this.calculateSimilarity(tags[i], tags[j]);
        if (similarity > 0.7) { // 70% similarity threshold
          similar.push({
            tag1: tags[i],
            tag2: tags[j],
            similarity,
            type: this.getSimilarityType(tags[i], tags[j])
          });
        }
      }
    }
    
    return similar.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Calculate similarity between two tags
   */
  calculateSimilarity(tag1, tag2) {
    // Remove # prefix for comparison
    const clean1 = tag1.replace('#', '').toLowerCase();
    const clean2 = tag2.replace('#', '').toLowerCase();
    
    // Exact match
    if (clean1 === clean2) return 1.0;
    
    // One is substring of other
    if (clean1.includes(clean2) || clean2.includes(clean1)) {
      return 0.85;
    }
    
    // Levenshtein distance
    const distance = this.levenshteinDistance(clean1, clean2);
    const maxLength = Math.max(clean1.length, clean2.length);
    const similarity = 1 - (distance / maxLength);
    
    // Boost similarity for common patterns
    if (this.arePlurals(clean1, clean2)) {
      return Math.max(similarity, 0.9);
    }
    
    return similarity;
  }

  /**
   * Get similarity type
   */
  getSimilarityType(tag1, tag2) {
    const clean1 = tag1.replace('#', '').toLowerCase();
    const clean2 = tag2.replace('#', '').toLowerCase();
    
    if (clean1 === clean2) return 'case-different';
    if (this.arePlurals(clean1, clean2)) return 'plural-singular';
    if (clean1.includes(clean2) || clean2.includes(clean1)) return 'substring';
    if (Math.abs(clean1.length - clean2.length) <= 2) return 'typo';
    return 'similar';
  }

  /**
   * Check if two words are plural/singular forms
   */
  arePlurals(word1, word2) {
    // Simple plural check
    return (word1 === word2 + 's') || 
           (word2 === word1 + 's') ||
           (word1 === word2 + 'es') || 
           (word2 === word1 + 'es');
  }

  /**
   * Calculate Levenshtein distance
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
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
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Generate recommendations based on analysis
   */
  generateRecommendations(tagStats, similarTags = []) {
    const recommendations = [];
    
    // Unused tags (only used once)
    const unusedTags = Array.from(tagStats.entries())
      .filter(([_, stat]) => stat.count === 1)
      .map(([tag, _]) => tag);
    
    if (unusedTags.length > 0) {
      recommendations.push({
        type: 'unused-tags',
        message: `Found ${unusedTags.length} tags used only once`,
        tags: unusedTags.slice(0, 10),
        action: 'Consider removing or consolidating these tags'
      });
    }
    
    // Similar tags
    if (similarTags.length > 0) {
      recommendations.push({
        type: 'similar-tags',
        message: `Found ${similarTags.length} similar tag pairs`,
        pairs: similarTags.slice(0, 5),
        action: 'Consider consolidating similar tags'
      });
    }
    
    // Deep hierarchies
    const deepTags = Array.from(tagStats.entries())
      .filter(([_, stat]) => stat.level > 2)
      .map(([tag, stat]) => ({ tag, level: stat.level }));
    
    if (deepTags.length > 0) {
      recommendations.push({
        type: 'deep-hierarchy',
        message: `Found ${deepTags.length} tags with deep hierarchy (>2 levels)`,
        tags: deepTags.slice(0, 5),
        action: 'Consider simplifying tag hierarchy'
      });
    }
    
    return recommendations;
  }

  /**
   * Suggest tags for given content
   */
  async suggestTags(content, existingTags = []) {
    // Get all tags in vault
    const analysis = await this.analyzeTags();
    const allTags = analysis.stats.map(s => s.tag);
    
    // Extract keywords from content
    const keywords = this.extractKeywords(content);
    
    // Score each tag based on relevance
    const suggestions = [];
    
    for (const tagStat of analysis.stats) {
      const tag = tagStat.tag;
      if (existingTags.includes(tag)) continue;
      
      const score = this.scoreTagRelevance(tag, keywords, content);
      if (score > 0.3) { // 30% relevance threshold
        suggestions.push({
          tag,
          score,
          count: tagStat.count,
          reason: this.getRelevanceReason(tag, keywords, score)
        });
      }
    }
    
    // Sort by score and return top suggestions
    return suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }

  /**
   * Extract keywords from content
   */
  extractKeywords(content) {
    // Simple keyword extraction
    const words = content.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    // Count word frequency
    const wordCount = {};
    words.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });
    
    // Return top keywords
    return Object.entries(wordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word]) => word);
  }

  /**
   * Score tag relevance to content
   */
  scoreTagRelevance(tag, keywords, content) {
    const cleanTag = tag.replace('#', '').toLowerCase();
    const tagParts = cleanTag.split(/[\/\-_]/);
    
    let score = 0;
    
    // Direct keyword match
    tagParts.forEach(part => {
      if (keywords.includes(part)) {
        score += 0.5;
      }
      // Partial match
      keywords.forEach(keyword => {
        if (keyword.includes(part) || part.includes(keyword)) {
          score += 0.2;
        }
      });
    });
    
    // Check if tag appears in content
    if (content.toLowerCase().includes(cleanTag)) {
      score += 0.3;
    }
    
    return Math.min(score, 1.0);
  }

  /**
   * Get reason for tag relevance
   */
  getRelevanceReason(tag, keywords, score) {
    const cleanTag = tag.replace('#', '').toLowerCase();
    const tagParts = cleanTag.split(/[\/\-_]/);
    
    for (const part of tagParts) {
      if (keywords.includes(part)) {
        return `Direct keyword match: "${part}"`;
      }
    }
    
    if (score > 0.5) {
      return 'High content relevance';
    } else if (score > 0.3) {
      return 'Moderate content relevance';
    }
    
    return 'Potential relevance';
  }
}