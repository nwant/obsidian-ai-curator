import matter from 'gray-matter';

export class TagFormatter {
  /**
   * Ensures all tags in frontmatter have the # prefix
   */
  static formatContentTags(content) {
    try {
      const parsed = matter(content);
      
      // If there are tags in frontmatter, ensure they have # prefix
      if (parsed.data.tags) {
        if (Array.isArray(parsed.data.tags)) {
          parsed.data.tags = parsed.data.tags.map(tag => {
            if (typeof tag === 'string' && tag.trim()) {
              // Ensure the tag starts with # and is properly formatted
              const formattedTag = tag.startsWith('#') ? tag : `#${tag}`;
              // No need to quote - gray-matter will handle this
              return formattedTag;
            }
            return tag;
          });
        } else if (typeof parsed.data.tags === 'string') {
          // Single tag as string
          const tag = parsed.data.tags.trim();
          if (tag) {
            parsed.data.tags = tag.startsWith('#') ? tag : `#${tag}`;
          }
        }
      }
      
      // Rebuild the content with updated frontmatter
      return matter.stringify(parsed.content, parsed.data);
    } catch (error) {
      // If parsing fails, return original content
      console.error('Failed to format tags:', error);
      return content;
    }
  }
  
  /**
   * Validates and formats a list of tags
   */
  static formatTagList(tags) {
    if (!Array.isArray(tags)) {
      return [];
    }
    
    return tags
      .filter(tag => tag && typeof tag === 'string')
      .map(tag => {
        const trimmed = tag.trim();
        return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
      });
  }
  
  /**
   * Removes # prefix from tags (useful for some operations)
   */
  static stripPrefix(tags) {
    if (!Array.isArray(tags)) {
      return [];
    }
    
    return tags.map(tag => {
      if (typeof tag === 'string') {
        return tag.startsWith('#') ? tag.substring(1) : tag;
      }
      return tag;
    });
  }
}