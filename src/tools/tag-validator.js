import matter from 'gray-matter';
import { TagTaxonomyReader } from './tag-taxonomy-reader.js';

export class TagValidator {
  constructor(tagIntelligence) {
    this.tagIntelligence = tagIntelligence;
    this.taxonomyReader = new TagTaxonomyReader(tagIntelligence.config);
    this.taxonomyLoaded = false;
  }

  /**
   * Validate tags before writing a note
   */
  async validateTags(content, proposedTags = []) {
    // Ensure taxonomy is loaded
    if (!this.taxonomyLoaded) {
      await this.taxonomyReader.loadTaxonomy();
      this.taxonomyLoaded = true;
    }
    
    // Parse content to extract any inline tags
    const contentTags = this.extractTagsFromContent(content);
    const allProposedTags = [...new Set([...proposedTags, ...contentTags])];
    
    // Apply auto-tagging rules from taxonomy
    const autoTags = await this.taxonomyReader.getSuggestedTags(content, allProposedTags);
    const combinedTags = [...new Set([...allProposedTags, ...autoTags])];
    
    if (combinedTags.length === 0) {
      return { valid: true, tags: [], warnings: [] };
    }
    
    // Get current tag analysis
    const analysis = await this.tagIntelligence.analyzeTags();
    const existingTags = analysis.stats.map(s => s.tag);
    
    const warnings = [];
    const suggestions = [];
    const validatedTags = [];
    const autoTagsAdded = [];
    
    for (const tag of combinedTags) {
      // Track auto-added tags
      if (autoTags.includes(tag) && !allProposedTags.includes(tag)) {
        autoTagsAdded.push(tag);
      }
      
      const validation = await this.validateSingleTag(tag, existingTags, analysis);
      
      if (validation.isNew) {
        warnings.push(validation.warning);
        if (validation.suggestions.length > 0) {
          suggestions.push(...validation.suggestions);
        }
      }
      
      validatedTags.push(validation.recommendedTag || tag);
    }
    
    // Add info about auto-tagged items
    if (autoTagsAdded.length > 0) {
      warnings.push({
        type: 'auto-tags-added',
        message: `Auto-tagged based on vault taxonomy: ${autoTagsAdded.join(', ')}`,
        severity: 'info'
      });
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
          message: 'Additional tags suggested based on content analysis',
          tags: contentSuggestions.slice(0, 5)
        });
      }
    }
    
    // Ensure tags are returned without hashtags for frontmatter
    const cleanValidatedTags = validatedTags.map(tag => 
      tag.startsWith('#') ? tag.substring(1) : tag
    );
    
    return {
      valid: warnings.filter(w => w.severity !== 'info').length === 0,
      tags: cleanValidatedTags,
      warnings,
      suggestions,
      autoTagsAdded
    };
  }

  /**
   * Extract tags from content
   */
  extractTagsFromContent(content) {
    const tags = new Set();
    
    // Extract from frontmatter (without hashtags - Obsidian convention)
    try {
      const { data } = matter(content);
      if (data.tags) {
        const fmTags = Array.isArray(data.tags) ? data.tags : [data.tags];
        fmTags.forEach(tag => {
          if (typeof tag === 'string') {
            // Store frontmatter tags without hashtag prefix
            const cleanTag = tag.startsWith('#') ? tag.substring(1) : tag;
            tags.add(cleanTag);
          }
        });
      }
    } catch (e) {
      // Content might not have valid frontmatter
    }
    
    // Extract inline tags (these keep hashtags)
    const tagRegex = /#[a-zA-Z0-9_\-\/]+/g;
    const matches = content.match(tagRegex) || [];
    matches.forEach(tag => {
      // Remove hashtag for consistency in validation
      tags.add(tag.substring(1));
    });
    
    return Array.from(tags);
  }

  /**
   * Validate a single tag
   */
  async validateSingleTag(tag, existingTags, analysis) {
    // Work with tags without hashtags for consistency
    const cleanTag = tag.startsWith('#') ? tag.substring(1) : tag;
    const existingCleanTags = existingTags.map(t => t.startsWith('#') ? t.substring(1) : t);
    
    // Check if tag exists
    if (existingCleanTags.includes(cleanTag)) {
      return {
        isNew: false,
        valid: true,
        recommendedTag: cleanTag
      };
    }
    
    // Use taxonomy reader for validation
    const taxonomyValidation = this.taxonomyReader.validateTag(cleanTag, { existingTags });
    
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
            message: `New tag "#${cleanTag}" is very similar to existing "#${bestMatch.tag}" (${Math.round(bestMatch.similarity * 100)}% match)`,
            suggestion: `Use "#${bestMatch.tag}" instead`,
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
    
    // Check taxonomy validation results
    if (!taxonomyValidation.valid) {
      const warning = taxonomyValidation.warnings[0];
      const suggestion = taxonomyValidation.suggestions[0];
      
      return {
        isNew: true,
        valid: false,
        recommendedTag: suggestion || cleanTag,
        warning: {
          type: 'taxonomy-violation',
          message: warning,
          suggestion: suggestion,
          severity: 'medium'
        },
        suggestions: taxonomyValidation.suggestions.map(s => ({
          tag: s,
          reason: 'Matches vault taxonomy',
          source: 'taxonomy'
        }))
      };
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
    
    // Check if it should be in a hierarchy (from taxonomy)
    if (taxonomyValidation.suggestions.length > 0) {
      return {
        isNew: true,
        valid: true,
        recommendedTag: cleanTag,
        warning: {
          type: 'hierarchy-suggestion',
          message: `New tag "#${cleanTag}" might fit better in existing hierarchy`,
          suggestion: taxonomyValidation.suggestions[0],
          severity: 'low'
        },
        suggestions: taxonomyValidation.suggestions.map(s => ({
          tag: s,
          reason: 'Better hierarchy placement',
          source: 'taxonomy'
        }))
      };
    }
    
    // New tag with no issues
    return {
      isNew: true,
      valid: true,
      recommendedTag: cleanTag,
      warning: {
        type: 'new-tag',
        message: `Creating new tag "#${cleanTag}"`,
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
    const similarityThreshold = this.tagIntelligence.config.tagIntelligence?.thresholds?.similarity || 0.7;
    
    for (const existing of existingTags) {
      const cleanExisting = existing.replace('#', '').toLowerCase();
      const similarity = this.calculateSimilarity(cleanTag, cleanExisting);
      
      if (similarity > similarityThreshold && similarity < 1.0) {
        similar.push({
          tag: cleanExisting,  // Return without hashtag
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
        suggestion: cleanTag.toLowerCase()
      });
    }
    
    // Check for underscores
    if (cleanTag.includes('_')) {
      issues.push({
        issue: 'Uses underscores instead of hyphens',
        suggestion: cleanTag.replace(/_/g, '-')
      });
    }
    
    // Check for spaces
    if (cleanTag.includes(' ')) {
      issues.push({
        issue: 'Contains spaces',
        suggestion: cleanTag.replace(/ /g, '-')
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