import matter from 'gray-matter';

export class TagValidator {
  constructor(tagIntelligence) {
    this.tagIntelligence = tagIntelligence;
  }

  /**
   * Validate tags before writing a note
   */
  async validateTags(content, proposedTags = []) {
    // Parse content to extract any inline tags
    const contentTags = this.extractTagsFromContent(content);
    const allProposedTags = [...new Set([...proposedTags, ...contentTags])];
    
    if (allProposedTags.length === 0) {
      return { valid: true, tags: [], warnings: [] };
    }
    
    // Get current tag analysis
    const analysis = await this.tagIntelligence.analyzeTags();
    const existingTags = analysis.stats.map(s => s.tag);
    
    const warnings = [];
    const suggestions = [];
    const validatedTags = [];
    
    for (const tag of allProposedTags) {
      const validation = await this.validateSingleTag(tag, existingTags, analysis);
      
      if (validation.isNew) {
        warnings.push(validation.warning);
        if (validation.suggestions.length > 0) {
          suggestions.push(...validation.suggestions);
        }
      }
      
      validatedTags.push(validation.recommendedTag || tag);
    }
    
    // Get content-based suggestions if we have content
    if (content && content.length > 50) {
      const contentSuggestions = await this.tagIntelligence.suggestTags(
        content, 
        validatedTags
      );
      
      if (contentSuggestions.length > 0) {
        suggestions.push({
          type: 'content-based',
          message: 'Tags suggested based on content analysis',
          tags: contentSuggestions.slice(0, 5)
        });
      }
    }
    
    return {
      valid: warnings.length === 0,
      tags: validatedTags,
      warnings,
      suggestions
    };
  }

  /**
   * Extract tags from content
   */
  extractTagsFromContent(content) {
    const tags = new Set();
    
    // Extract from frontmatter
    try {
      const { data } = matter(content);
      if (data.tags) {
        const fmTags = Array.isArray(data.tags) ? data.tags : [data.tags];
        fmTags.forEach(tag => {
          if (typeof tag === 'string') {
            tags.add(tag.startsWith('#') ? tag : `#${tag}`);
          }
        });
      }
    } catch (e) {
      // Content might not have valid frontmatter
    }
    
    // Extract inline tags
    const tagRegex = /#[a-zA-Z0-9_\-\/]+/g;
    const matches = content.match(tagRegex) || [];
    matches.forEach(tag => tags.add(tag));
    
    return Array.from(tags);
  }

  /**
   * Validate a single tag
   */
  async validateSingleTag(tag, existingTags, analysis) {
    const cleanTag = tag.startsWith('#') ? tag : `#${tag}`;
    
    // Check if tag exists
    if (existingTags.includes(cleanTag)) {
      return {
        isNew: false,
        valid: true,
        recommendedTag: cleanTag
      };
    }
    
    // Find similar tags
    const similarTags = this.findSimilarTags(cleanTag, existingTags);
    
    if (similarTags.length > 0) {
      const bestMatch = similarTags[0];
      
      if (bestMatch.similarity > 0.85) {
        return {
          isNew: true,
          valid: false,
          recommendedTag: bestMatch.tag,
          warning: {
            type: 'similar-exists',
            message: `New tag "${cleanTag}" is very similar to existing "${bestMatch.tag}" (${Math.round(bestMatch.similarity * 100)}% match)`,
            suggestion: `Use "${bestMatch.tag}" instead`,
            severity: 'high'
          },
          suggestions: [{
            tag: bestMatch.tag,
            reason: `${bestMatch.type} match`,
            similarity: bestMatch.similarity
          }]
        };
      }
    }
    
    // Check naming conventions
    const conventionIssues = this.checkNamingConventions(cleanTag);
    if (conventionIssues.length > 0) {
      return {
        isNew: true,
        valid: false,
        recommendedTag: conventionIssues[0].suggestion,
        warning: {
          type: 'convention-violation',
          message: `Tag "${cleanTag}" violates naming conventions: ${conventionIssues[0].issue}`,
          suggestion: conventionIssues[0].suggestion,
          severity: 'medium'
        },
        suggestions: []
      };
    }
    
    // Check if it should be in a hierarchy
    const hierarchySuggestion = this.suggestHierarchy(cleanTag, analysis.hierarchy);
    if (hierarchySuggestion) {
      return {
        isNew: true,
        valid: true,
        recommendedTag: cleanTag,
        warning: {
          type: 'hierarchy-suggestion',
          message: `New tag "${cleanTag}" might fit better in existing hierarchy`,
          suggestion: hierarchySuggestion,
          severity: 'low'
        },
        suggestions: []
      };
    }
    
    // New tag with no issues
    return {
      isNew: true,
      valid: true,
      recommendedTag: cleanTag,
      warning: {
        type: 'new-tag',
        message: `Creating new tag "${cleanTag}"`,
        severity: 'info'
      },
      suggestions: []
    };
  }

  /**
   * Find similar tags
   */
  findSimilarTags(tag, existingTags) {
    const similar = [];
    const cleanTag = tag.replace('#', '').toLowerCase();
    
    for (const existing of existingTags) {
      const cleanExisting = existing.replace('#', '').toLowerCase();
      const similarity = this.calculateSimilarity(cleanTag, cleanExisting);
      
      if (similarity > 0.7 && similarity < 1.0) {
        similar.push({
          tag: existing,
          similarity,
          type: this.getSimilarityType(cleanTag, cleanExisting)
        });
      }
    }
    
    return similar.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Calculate similarity (simplified version)
   */
  calculateSimilarity(str1, str2) {
    if (str1 === str2) return 1.0;
    
    // Check for plural/singular
    if (str1 === str2 + 's' || str2 === str1 + 's') {
      return 0.9;
    }
    
    // Check for substring
    if (str1.includes(str2) || str2.includes(str1)) {
      return 0.85;
    }
    
    // Simple character similarity
    const set1 = new Set(str1.split(''));
    const set2 = new Set(str2.split(''));
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  /**
   * Get similarity type
   */
  getSimilarityType(tag1, tag2) {
    if (tag1 === tag2 + 's' || tag2 === tag1 + 's') {
      return 'plural-singular';
    }
    if (tag1.includes(tag2) || tag2.includes(tag1)) {
      return 'substring';
    }
    return 'similar';
  }

  /**
   * Check naming conventions
   */
  checkNamingConventions(tag) {
    const issues = [];
    const cleanTag = tag.replace('#', '');
    
    // Check for uppercase
    if (cleanTag !== cleanTag.toLowerCase()) {
      issues.push({
        issue: 'Contains uppercase letters',
        suggestion: tag.toLowerCase()
      });
    }
    
    // Check for underscores
    if (cleanTag.includes('_')) {
      issues.push({
        issue: 'Uses underscores instead of hyphens',
        suggestion: tag.replace(/_/g, '-')
      });
    }
    
    // Check for spaces
    if (cleanTag.includes(' ')) {
      issues.push({
        issue: 'Contains spaces',
        suggestion: tag.replace(/ /g, '-')
      });
    }
    
    return issues;
  }

  /**
   * Suggest hierarchy placement
   */
  suggestHierarchy(tag, hierarchy) {
    const cleanTag = tag.replace('#', '').toLowerCase();
    
    // Common hierarchy patterns
    const patterns = {
      'project': /project|proj/,
      'area': /area|domain/,
      'type': /type|kind|category/,
      'status': /status|state/,
      'priority': /priority|pri/
    };
    
    for (const [category, pattern] of Object.entries(patterns)) {
      if (pattern.test(cleanTag) && hierarchy[`#${category}`]) {
        return `#${category}/${cleanTag.replace(pattern, '').replace(/^-|-$/g, '')}`;
      }
    }
    
    return null;
  }
}