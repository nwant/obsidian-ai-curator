import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

export class TagTaxonomyReader {
  constructor(config) {
    this.config = config;
    this.taxonomy = null;
    this.autoTagRules = [];
    this.hierarchies = {};
    this.patterns = {};
    this.loadError = null;
  }

  /**
   * Load tag taxonomy from configured document
   */
  async loadTaxonomy() {
    try {
      // Check multiple possible locations for taxonomy
      const possiblePaths = [
        this.config.tagIntelligence?.taxonomyDocument,
        path.join(this.config.vaultPath, 'Meta/Tag Taxonomy Index.md'),
        path.join(this.config.vaultPath, 'Tag Taxonomy.md'),
        path.join(this.config.vaultPath, '.obsidian/tags.md')
      ];

      for (const taxonomyPath of possiblePaths) {
        if (!taxonomyPath) continue;
        
        const fullPath = path.isAbsolute(taxonomyPath) 
          ? taxonomyPath 
          : path.join(this.config.vaultPath, taxonomyPath);
        
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          await this.parseTaxonomyDocument(content);
          console.error(`Loaded tag taxonomy from: ${fullPath}`);
          return true;
        } catch (error) {
          // Try next path
          continue;
        }
      }

      // No taxonomy document found, use defaults
      console.error('No tag taxonomy document found, using intelligent defaults');
      this.useDefaults();
      return false;
    } catch (error) {
      console.error('Error loading tag taxonomy:', error);
      this.loadError = error;
      this.useDefaults();
      return false;
    }
  }

  /**
   * Parse taxonomy document to extract rules and patterns
   */
  async parseTaxonomyDocument(content) {
    const lines = content.split('\n');
    let currentSection = null;
    let currentHierarchy = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines
      if (!trimmed) continue;

      // Detect sections
      if (trimmed.startsWith('## ')) {
        currentSection = trimmed.substring(3).toLowerCase();
        continue;
      }

      // Parse hierarchy definitions
      if (trimmed.startsWith('#') && !trimmed.startsWith('##')) {
        const match = trimmed.match(/^(#[\w-]+\/\*?)(?:\s*-\s*(.+))?/);
        if (match) {
          const [, tag, description] = match;
          currentHierarchy = tag.replace('/*', '');
          this.hierarchies[currentHierarchy] = {
            description: description || '',
            children: [],
            patterns: []
          };
        }
      }

      // Parse child tags under a hierarchy
      if (currentHierarchy && trimmed.startsWith('- #')) {
        const match = trimmed.match(/^-\s*(#[\w-]+)(?:\s*-\s*(.+))?/);
        if (match) {
          const [, tag, description] = match;
          this.hierarchies[currentHierarchy].children.push({
            tag,
            description: description || ''
          });
        }
      }

      // Parse auto-tagging rules
      if (currentSection === 'auto-tagging rules' || currentSection === 'automation') {
        const ruleMatch = trimmed.match(/^-\s*(?:When|If)\s+(.+?)\s*(?:then add|add|->)\s*(.+)/i);
        if (ruleMatch) {
          const [, trigger, tags] = ruleMatch;
          this.autoTagRules.push({
            trigger: this.parseTrigger(trigger),
            tags: this.parseTags(tags)
          });
        }
      }

      // Parse common patterns
      if (currentSection === 'common patterns' || currentSection === 'tag combinations') {
        const patternMatch = trimmed.match(/^-\s*(.+?):\s*(.+)/);
        if (patternMatch) {
          const [, patternName, tags] = patternMatch;
          this.patterns[patternName.toLowerCase()] = this.parseTags(tags);
        }
      }
    }

    // Extract additional patterns from content
    this.extractImplicitPatterns(content);
  }

  /**
   * Parse trigger conditions for auto-tagging
   */
  parseTrigger(trigger) {
    // Handle various trigger formats
    if (trigger.includes(' or ')) {
      return {
        type: 'or',
        keywords: trigger.split(/\s+or\s+/i).map(k => k.trim().toLowerCase())
      };
    } else if (trigger.includes(' and ')) {
      return {
        type: 'and',
        keywords: trigger.split(/\s+and\s+/i).map(k => k.trim().toLowerCase())
      };
    } else {
      return {
        type: 'contains',
        keywords: [trigger.trim().toLowerCase()]
      };
    }
  }

  /**
   * Parse tag list from string
   */
  parseTags(tagString) {
    return tagString
      .split(/[,\s]+/)
      .map(tag => tag.trim())
      .filter(tag => tag.startsWith('#'))
      .map(tag => tag.toLowerCase());
  }

  /**
   * Extract implicit patterns from document structure
   */
  extractImplicitPatterns(content) {
    // Look for tag combinations that appear together frequently
    const tagPattern = /#[\w-]+/g;
    const lines = content.split('\n');
    const coOccurrences = new Map();

    for (const line of lines) {
      const tags = line.match(tagPattern);
      if (tags && tags.length > 1) {
        const uniqueTags = [...new Set(tags.map(t => t.toLowerCase()))];
        for (let i = 0; i < uniqueTags.length; i++) {
          for (let j = i + 1; j < uniqueTags.length; j++) {
            const pair = [uniqueTags[i], uniqueTags[j]].sort().join(',');
            coOccurrences.set(pair, (coOccurrences.get(pair) || 0) + 1);
          }
        }
      }
    }

    // Store frequent co-occurrences as patterns
    for (const [pair, count] of coOccurrences) {
      if (count >= 3) {
        const tags = pair.split(',');
        this.patterns[`common-pair-${tags.join('-')}`] = tags;
      }
    }
  }

  /**
   * Use intelligent defaults if no taxonomy found
   */
  useDefaults() {
    // Common hierarchies found in many vaults
    this.hierarchies = {
      '#type': {
        description: 'Document or note types',
        children: [
          { tag: '#type/note', description: 'Regular note' },
          { tag: '#type/moc', description: 'Map of Content' },
          { tag: '#type/index', description: 'Index or overview' },
          { tag: '#type/journal', description: 'Journal or log entry' },
          { tag: '#type/reference', description: 'Reference material' }
        ]
      },
      '#status': {
        description: 'Status or state',
        children: [
          { tag: '#status/draft', description: 'Work in progress' },
          { tag: '#status/review', description: 'Needs review' },
          { tag: '#status/complete', description: 'Completed' },
          { tag: '#status/archived', description: 'Archived' }
        ]
      },
      '#project': {
        description: 'Project-related tags',
        children: [],
        patterns: ['#project/*']
      },
      '#area': {
        description: 'Areas of responsibility',
        children: [],
        patterns: ['#area/*']
      }
    };

    // Common auto-tagging rules
    this.autoTagRules = [
      {
        trigger: { type: 'contains', keywords: ['index'] },
        tags: ['#type/index']
      },
      {
        trigger: { type: 'contains', keywords: ['moc', 'map of content'] },
        tags: ['#type/moc']
      },
      {
        trigger: { type: 'contains', keywords: ['daily note', 'journal'] },
        tags: ['#type/journal']
      },
      {
        trigger: { type: 'contains', keywords: ['meeting', 'notes'] },
        tags: ['#type/meeting-notes']
      }
    ];
  }

  /**
   * Get suggested tags based on content and existing tags
   */
  async getSuggestedTags(content, existingTags = []) {
    // Check if auto-tagging is enabled
    if (this.config.tagIntelligence?.autoTagging === false) {
      return [];
    }
    
    if (!this.taxonomy) {
      await this.loadTaxonomy();
    }

    const suggestions = new Set();
    const contentLower = content.toLowerCase();

    // Apply auto-tagging rules
    for (const rule of this.autoTagRules) {
      if (this.matchesTrigger(contentLower, rule.trigger)) {
        rule.tags.forEach(tag => suggestions.add(tag));
      }
    }

    // Check for hierarchy patterns if enabled
    if (this.config.tagIntelligence?.suggestFromTaxonomy !== false) {
      for (const [hierarchy, data] of Object.entries(this.hierarchies)) {
        // If content matches hierarchy context, suggest appropriate child tags
        if (this.contentMatchesHierarchy(contentLower, hierarchy, data)) {
          // Suggest most relevant child tags
          const relevantChildren = this.findRelevantChildren(contentLower, data.children);
          relevantChildren.forEach(child => suggestions.add(child.tag));
        }
      }
    }

    // Check for common patterns
    for (const [patternName, tags] of Object.entries(this.patterns)) {
      if (this.contentMatchesPattern(contentLower, patternName, existingTags)) {
        tags.forEach(tag => {
          if (!existingTags.includes(tag)) {
            suggestions.add(tag);
          }
        });
      }
    }

    return Array.from(suggestions);
  }

  /**
   * Check if content matches a trigger
   */
  matchesTrigger(content, trigger) {
    switch (trigger.type) {
      case 'contains':
        return trigger.keywords.some(keyword => content.includes(keyword));
      case 'and':
        return trigger.keywords.every(keyword => content.includes(keyword));
      case 'or':
        return trigger.keywords.some(keyword => content.includes(keyword));
      default:
        return false;
    }
  }

  /**
   * Check if content matches a hierarchy context
   */
  contentMatchesHierarchy(content, hierarchy, data) {
    const hierarchyName = hierarchy.replace('#', '').replace('/', '-');
    
    // Check if content mentions the hierarchy
    if (content.includes(hierarchyName)) return true;
    
    // Check if description keywords match
    if (data.description) {
      const keywords = data.description.toLowerCase().split(/\s+/);
      if (keywords.some(keyword => content.includes(keyword))) return true;
    }

    return false;
  }

  /**
   * Find relevant child tags based on content
   */
  findRelevantChildren(content, children) {
    return children
      .filter(child => {
        const tagName = child.tag.replace(/#[\w-]+\//, '');
        const keywords = [
          tagName,
          ...child.description.toLowerCase().split(/\s+/)
        ];
        return keywords.some(keyword => content.includes(keyword));
      })
      .slice(0, 3); // Limit to top 3 suggestions
  }

  /**
   * Check if content matches a pattern
   */
  contentMatchesPattern(content, patternName, existingTags) {
    // Check if some pattern tags are already present
    const patternTags = this.patterns[patternName];
    const matchingTags = existingTags.filter(tag => 
      patternTags.includes(tag.toLowerCase())
    );
    
    // If at least one pattern tag exists, suggest the others
    return matchingTags.length > 0 && matchingTags.length < patternTags.length;
  }

  /**
   * Validate if a tag follows taxonomy rules
   */
  validateTag(tag, context = {}) {
    const tagLower = tag.toLowerCase();
    const warnings = [];
    const suggestions = [];

    // Skip validation if enforceHierarchy is disabled
    if (this.config.tagIntelligence?.enforceHierarchy === false) {
      return { valid: true, warnings: [], suggestions: [] };
    }

    // Check if tag exists in known hierarchies
    let isKnownTag = false;
    for (const [hierarchy, data] of Object.entries(this.hierarchies)) {
      if (tagLower.startsWith(hierarchy)) {
        isKnownTag = true;
        
        // Check if it's a valid child
        const isValidChild = data.children.some(child => 
          child.tag.toLowerCase() === tagLower
        );
        
        if (!isValidChild && data.children.length > 0) {
          warnings.push(`Tag ${tag} doesn't match known ${hierarchy} tags`);
          
          // Suggest similar children
          const tagSuffix = tagLower.replace(hierarchy + '/', '');
          const similar = data.children.filter(child => {
            const childSuffix = child.tag.toLowerCase().replace(hierarchy + '/', '');
            return childSuffix.includes(tagSuffix) || tagSuffix.includes(childSuffix);
          });
          
          if (similar.length > 0) {
            suggestions.push(...similar.map(s => s.tag));
          }
        }
        break;
      }
    }

    // If not a known tag, check if it should belong to a hierarchy
    if (!isKnownTag && this.config.tagIntelligence?.suggestFromTaxonomy !== false) {
      const suggestedHierarchy = this.suggestHierarchy(tag, context);
      if (suggestedHierarchy) {
        warnings.push(`Consider using hierarchy: ${suggestedHierarchy}/${tag.replace('#', '')}`);
        suggestions.push(`${suggestedHierarchy}/${tag.replace('#', '')}`);
      }
    }

    return {
      valid: warnings.length === 0,
      warnings,
      suggestions
    };
  }

  /**
   * Suggest appropriate hierarchy for a tag
   */
  suggestHierarchy(tag, context) {
    const tagName = tag.replace('#', '').toLowerCase();
    
    // Check common patterns
    if (['draft', 'review', 'complete', 'archived', 'wip'].includes(tagName)) {
      return '#status';
    }
    
    if (['note', 'moc', 'index', 'journal', 'reference', 'guide'].includes(tagName)) {
      return '#type';
    }
    
    if (tagName.includes('project')) {
      return '#project';
    }
    
    if (tagName.includes('area') || tagName.includes('domain')) {
      return '#area';
    }
    
    return null;
  }
}