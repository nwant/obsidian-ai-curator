/**
 * Tag operations handler for MCP server
 * Handles tag management, analysis, and suggestions
 */

import path from 'path';
import fs from 'fs/promises';
import matter from 'gray-matter';
import { 
  get_tags, 
  analyze_tags, 
  suggest_tags, 
  update_tags,
  rename_tag 
} from '../tools/tag-management.js';
import { TagIntelligence } from '../tools/tag-intelligence.js';

export class TagHandler {
  constructor(config, cache, apiClient) {
    this.config = config;
    this.cache = cache;
    this.apiClient = apiClient;
    this.tagIntelligence = new TagIntelligence(config, cache, apiClient);
  }

  /**
   * Get tags from vault or specific file
   */
  async getTags({ path: filePath }) {
    try {
      // Try API first
      if (this.apiClient.isConnected()) {
        try {
          const endpoint = filePath ? 'tags/file' : 'tags/all';
          const result = await this.apiClient.request(endpoint, { path: filePath });
          
          if (result.success) {
            return result.data;
          }
        } catch (apiError) {
          console.error('API tags failed, falling back:', apiError.message);
        }
      }

      // Fallback to tool function
      const result = await get_tags({ path: filePath });
      
      // Transform to match test expectations
      if (filePath) {
        // Single file - already returns { tags: [...], file: ... }
        return result;
      } else {
        // All tags - transform to array format for tests
        return {
          tags: Object.keys(result.tags), // Convert object keys to array
          tagCounts: result.tags, // Keep counts for reference
          ...result
        };
      }
    } catch (error) {
      console.error('Get tags error:', error);
      throw error;
    }
  }

  /**
   * Analyze tags in the vault
   */
  async analyzeTags() {
    try {
      // Try API first for comprehensive analysis
      if (this.apiClient.isConnected()) {
        try {
          const result = await this.apiClient.request('tags/analyze');
          if (result.success) {
            return result.data;
          }
        } catch (apiError) {
          console.error('API tag analysis failed, falling back:', apiError.message);
        }
      }

      // Fallback to tool function
      return analyze_tags({});
    } catch (error) {
      console.error('Analyze tags error:', error);
      throw error;
    }
  }

  /**
   * Suggest tags based on content
   */
  async suggestTags({ content, existingTags = [] }) {
    try {
      // Use tag intelligence for better suggestions
      const suggestions = await this.tagIntelligence.suggestTags(content, existingTags);
      
      return {
        suggestions,
        confidence: suggestions.map(tag => ({
          tag,
          score: this.calculateTagRelevance(tag, content)
        })).sort((a, b) => b.score - a.score)
      };
    } catch (error) {
      // Fallback to basic suggestions
      return suggest_tags({ content, existingTags });
    }
  }

  /**
   * Update tags for a note
   */
  async updateNoteTags({ path: notePath, add, remove, replace }) {
    return update_tags({ path: notePath, add, remove, replace });
  }

  /**
   * Rename a tag globally
   */
  async renameGlobalTag({ oldTag, newTag, preview = false, includeInline = true, includeFrontmatter = true }) {
    return rename_tag({ oldTag, newTag, preview, includeInline, includeFrontmatter });
  }

  /**
   * Get tag statistics
   */
  async getTagStats() {
    const analysis = await this.analyzeTags();
    
    return {
      totalTags: analysis.tags.length,
      totalUsage: analysis.totalUsage,
      topTags: analysis.usage.slice(0, 10),
      recentTags: analysis.tags
        .filter(tag => tag.lastUsed)
        .sort((a, b) => new Date(b.lastUsed) - new Date(a.lastUsed))
        .slice(0, 10),
      hierarchy: analysis.hierarchy,
      orphaned: analysis.orphaned
    };
  }

  /**
   * Calculate tag relevance score
   */
  calculateTagRelevance(tag, content) {
    const lowerContent = content.toLowerCase();
    const lowerTag = tag.toLowerCase();
    
    let score = 0;
    
    // Exact matches
    const exactMatches = (lowerContent.match(new RegExp(`\\b${lowerTag}\\b`, 'g')) || []).length;
    score += exactMatches * 10;
    
    // Partial matches
    const partialMatches = (lowerContent.match(new RegExp(lowerTag, 'g')) || []).length - exactMatches;
    score += partialMatches * 5;
    
    // Related words (simple heuristic)
    const tagWords = lowerTag.split(/[-_]/);
    tagWords.forEach(word => {
      if (word.length > 3) {
        const wordMatches = (lowerContent.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length;
        score += wordMatches * 3;
      }
    });
    
    return score;
  }
}