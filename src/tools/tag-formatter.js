import matter from 'gray-matter';

export class TagFormatter {
  /**
   * Ensures all tags in frontmatter DON'T have the # prefix (Obsidian convention)
   */
  static formatContentTags(content) {
    try {
      // First, let's fix any existing tags with # in the raw content before parsing
      // This handles the case where tags with # are treated as nulls by YAML parser
      const fixedContent = content.replace(/^(\s*tags:\s*\n(?:\s*-\s*.+\n)*)/m, (match) => {
        // Replace # prefix in each tag line within the tags section
        return match.replace(/^(\s*-\s*)#(.+)$/gm, '$1$2');
      });
      
      const parsed = matter(fixedContent);
      
      // If there are tags in frontmatter, ensure they DON'T have # prefix
      if (parsed.data.tags) {
        if (Array.isArray(parsed.data.tags)) {
          parsed.data.tags = parsed.data.tags
            .filter(tag => tag !== null && tag !== undefined) // Remove null values
            .map(tag => {
              if (typeof tag === 'string' && tag.trim()) {
                // Remove # prefix if present (Obsidian frontmatter convention)
                const trimmedTag = tag.trim();
                const formattedTag = trimmedTag.startsWith('#') ? trimmedTag.substring(1) : trimmedTag;
                return formattedTag;
              }
              return tag;
            })
            .filter(tag => tag); // Remove any empty strings
        } else if (typeof parsed.data.tags === 'string') {
          // Single tag as string
          const tag = parsed.data.tags.trim();
          if (tag) {
            parsed.data.tags = tag.startsWith('#') ? tag.substring(1) : tag;
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