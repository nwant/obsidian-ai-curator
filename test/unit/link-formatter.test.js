import { describe, it, expect } from '@jest/globals';
import { LinkFormatter } from '../../src/tools/link-formatter.js';

describe('LinkFormatter', () => {
  let formatter;
  
  beforeEach(() => {
    formatter = new LinkFormatter();
  });
  
  describe('convertToWikilinks', () => {
    it('should convert basic markdown links to wikilinks', () => {
      const content = 'Check out [my note](Notes/my note.md) for details.';
      const result = formatter.convertToWikilinks(content);
      
      expect(result).toBe('Check out [[my note]] for details.');
    });
    
    it('should handle links with aliases', () => {
      const content = 'See [this important document](Notes/Project Plan.md) for more info.';
      const result = formatter.convertToWikilinks(content);
      
      expect(result).toBe('See [[Project Plan|this important document]] for more info.');
    });
    
    it('should preserve existing wikilinks', () => {
      const content = 'Already has [[wikilink]] and [[link|with alias]].';
      const result = formatter.convertToWikilinks(content);
      
      expect(result).toBe(content);
    });
    
    it('should handle multiple links in one line', () => {
      const content = '[First](Notes/First.md) and [Second](Notes/Second.md) links.';
      const result = formatter.convertToWikilinks(content);
      
      expect(result).toBe('[[First]] and [[Second]] links.');
    });
    
    it('should handle links with subdirectories', () => {
      const content = 'Link to [nested note](Projects/AI/Overview.md).';
      const result = formatter.convertToWikilinks(content);
      
      expect(result).toBe('Link to [[Overview|nested note]].');
    });
    
    it('should not convert external links', () => {
      const content = 'External [link](https://example.com) stays.';
      const result = formatter.convertToWikilinks(content);
      
      expect(result).toBe(content);
    });
    
    it('should handle empty content', () => {
      expect(formatter.convertToWikilinks('')).toBe('');
      expect(formatter.convertToWikilinks(null)).toBe('');
      expect(formatter.convertToWikilinks(undefined)).toBe('');
    });
    
    it('should handle links with special characters', () => {
      const content = '[C++ Guide](Notes/C++ Guide.md) and [Q&A](Notes/Q&A.md)';
      const result = formatter.convertToWikilinks(content);
      
      expect(result).toBe('[[C++ Guide]] and [[Q&A]]');
    });
    
    it('should handle links with numbers', () => {
      const content = 'See [2024 Report](Reports/2024 Report.md)';
      const result = formatter.convertToWikilinks(content);
      
      expect(result).toBe('See [[2024 Report]]');
    });
    
    it('should handle multiline content', () => {
      const content = `First line with [link1](Notes/link1.md)
Second line with [link2](Notes/link2.md)
Third line with [[existing wikilink]]`;
      
      const expected = `First line with [[link1]]
Second line with [[link2]]
Third line with [[existing wikilink]]`;
      
      expect(formatter.convertToWikilinks(content)).toBe(expected);
    });
    
    it('should preserve code blocks', () => {
      const content = `
Normal [link](Notes/test.md)
\`\`\`
Code with [link](Notes/code.md) should not change
\`\`\`
Another [link](Notes/test2.md)`;
      
      const result = formatter.convertToWikilinks(content);
      
      expect(result).toContain('[[test]]');
      expect(result).toContain('[link](Notes/code.md)'); // In code block
      expect(result).toContain('[[test2]]');
    });
    
    it('should handle edge cases', () => {
      // Empty link text
      const emptyText = '[](Notes/empty.md)';
      expect(formatter.convertToWikilinks(emptyText)).toBe('[[empty]]');
      
      // Link at start of line
      const startLine = '[Start](Notes/Start.md) of line';
      expect(formatter.convertToWikilinks(startLine)).toBe('[[Start]] of line');
      
      // Link at end of line
      const endLine = 'End of line [End](Notes/End.md)';
      expect(formatter.convertToWikilinks(endLine)).toBe('End of line [[End]]');
      
      // Adjacent links
      const adjacent = '[One](Notes/One.md)[Two](Notes/Two.md)';
      expect(formatter.convertToWikilinks(adjacent)).toBe('[[One]][[Two]]');
    });
  });
  
  describe('formatLink', () => {
    it('should format simple links', () => {
      expect(formatter.formatLink('My Note')).toBe('[[My Note]]');
      expect(formatter.formatLink('My Note', 'Custom Text')).toBe('[[My Note|Custom Text]]');
    });
    
    it('should handle empty inputs', () => {
      expect(formatter.formatLink('')).toBe('[[]]');
      expect(formatter.formatLink('Note', '')).toBe('[[Note]]');
    });
  });
  
  describe('extractLinks', () => {
    it('should extract all wikilinks from content', () => {
      const content = `
        This has [[Link One]] and [[Link Two|with alias]].
        Also [[Link Three]] appears here.
      `;
      
      const links = formatter.extractLinks(content);
      
      expect(links).toHaveLength(3);
      expect(links).toContain('Link One');
      expect(links).toContain('Link Two');
      expect(links).toContain('Link Three');
    });
    
    it('should extract markdown links', () => {
      const content = 'Has [markdown link](Notes/Target.md) here.';
      const links = formatter.extractLinks(content);
      
      expect(links).toHaveLength(1);
      expect(links).toContain('Target');
    });
    
    it('should handle mixed link types', () => {
      const content = `
        [[Wikilink]] and [markdown](Notes/Markdown.md)
        Plus [[Another|with alias]] link.
      `;
      
      const links = formatter.extractLinks(content);
      
      expect(links).toHaveLength(3);
      expect(links).toContain('Wikilink');
      expect(links).toContain('Markdown');
      expect(links).toContain('Another');
    });
    
    it('should return empty array for no links', () => {
      const content = 'No links here at all.';
      expect(formatter.extractLinks(content)).toEqual([]);
    });
    
    it('should handle duplicate links', () => {
      const content = '[[Same]] and [[Same]] again, plus [[Same|different text]]';
      const links = formatter.extractLinks(content);
      
      // Should deduplicate
      expect(links).toHaveLength(1);
      expect(links).toContain('Same');
    });
  });
  
  describe('isWikilink', () => {
    it('should identify wikilinks correctly', () => {
      expect(formatter.isWikilink('[[Note]]')).toBe(true);
      expect(formatter.isWikilink('[[Note|Alias]]')).toBe(true);
      expect(formatter.isWikilink('[Not](a/wikilink.md)')).toBe(false);
      expect(formatter.isWikilink('[[]]')).toBe(true);
      expect(formatter.isWikilink('Not a link')).toBe(false);
    });
  });
  
  describe('normalizeLink', () => {
    it('should normalize link paths', () => {
      expect(formatter.normalizeLink('Notes/My Note.md')).toBe('My Note');
      expect(formatter.normalizeLink('Subfolder/Deep/Note.md')).toBe('Note');
      expect(formatter.normalizeLink('Simple.md')).toBe('Simple');
      expect(formatter.normalizeLink('NoExtension')).toBe('NoExtension');
    });
  });
});