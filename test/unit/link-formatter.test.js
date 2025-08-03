import { describe, it, beforeEach, expect } from '@jest/globals';
import { LinkFormatter } from '../../src/tools/link-formatter.js';

describe('LinkFormatter', () => {
  let formatter;
  
  beforeEach(() => {
    formatter = new LinkFormatter();
  });
  
  describe('formatLinks (instance method)', () => {
    it('should convert markdown links to wikilinks', async () => {
      const content = 'Here is [a link](path/to/note.md) and [another](file.md).';
      const result = await formatter.formatLinks(content);
      
      expect(result).toBe('Here is [[note|a link]] and [[file|another]].');
    });
    
    it('should handle links without aliases', async () => {
      const content = '[note](note.md) here';
      const result = await formatter.formatLinks(content);
      
      expect(result).toBe('[[note]] here');
    });
    
    it('should handle paths correctly', async () => {
      const content = '[Link text](../folder/My Note.md)';
      const result = await formatter.formatLinks(content);
      
      expect(result).toBe('[[My Note|Link text]]');
    });
    
    it('should skip external URLs', async () => {
      const content = '[External](https://example.com) and [Internal](note.md)';
      const result = await formatter.formatLinks(content);
      
      expect(result).toBe('[External](https://example.com) and [[note|Internal]]');
    });
  });
  
  describe('formatLinksStatic (static method)', () => {
    it('should convert markdown links to wikilinks', () => {
      const content = `
        Here is [a link](notes/My Note.md).
        And [another link](../Other Note.md).
        But not [this](https://example.com).
      `;
      
      const result = LinkFormatter.formatLinksStatic(content);
      
      expect(result).toContain('[[My Note|a link]]');
      expect(result).toContain('[[Other Note|another link]]');
      expect(result).toContain('[this](https://example.com)');
    });
    
    it('should handle links without aliases', () => {
      const content = '[My Note](My Note.md)';
      const result = LinkFormatter.formatLinksStatic(content);
      
      expect(result).toBe('[[My Note]]');
    });
    
    it('should handle complex paths', () => {
      const content = '[Complex](../../deeply/nested/Note Name.md)';
      const result = LinkFormatter.formatLinksStatic(content);
      
      expect(result).toBe('[[Note Name|Complex]]');
    });
    
    it('should convert bare paths to wikilinks', () => {
      const content = 'Reference to /path/to/MyNote.md in text';
      const result = LinkFormatter.formatLinksStatic(content);
      
      expect(result).toBe('Reference to [[MyNote]] in text');
    });
  });
  
  describe('formatLink (static)', () => {
    it('should format simple links', () => {
      expect(LinkFormatter.formatLink('My Note')).toBe('[[My Note]]');
      expect(LinkFormatter.formatLink('My Note', 'Custom Text')).toBe('[[My Note|Custom Text]]');
    });
    
    it('should handle paths in targets', () => {
      expect(LinkFormatter.formatLink('folder/My Note.md')).toBe('[[My Note]]');
      expect(LinkFormatter.formatLink('deep/path/to/Note.md', 'Alias')).toBe('[[Note|Alias]]');
    });
    
    it('should handle special characters', () => {
      expect(LinkFormatter.formatLink('Note (2023)')).toBe('[[Note (2023)]]');
      expect(LinkFormatter.formatLink('C++ Guide')).toBe('[[C++ Guide]]');
    });
    
    it('should remove .md extension', () => {
      expect(LinkFormatter.formatLink('MyNote.md')).toBe('[[MyNote]]');
      expect(LinkFormatter.formatLink('path/to/Note.md')).toBe('[[Note]]');
    });
  });
  
  describe('extractWikilinks (static)', () => {
    it('should extract wikilinks from content', () => {
      const content = `
        Here is [[Note One]] and [[Note Two|Custom Alias]].
        Also [[Folder/Note Three]].
      `;
      
      const links = LinkFormatter.extractWikilinks(content);
      
      expect(links).toHaveLength(3);
      expect(links[0]).toEqual({ 
        link: '[[Note One]]',
        target: 'Note One', 
        alias: null 
      });
      expect(links[1]).toEqual({ 
        link: '[[Note Two|Custom Alias]]',
        target: 'Note Two', 
        alias: 'Custom Alias' 
      });
      expect(links[2]).toEqual({ 
        link: '[[Folder/Note Three]]',
        target: 'Folder/Note Three', 
        alias: null 
      });
    });
    
    it('should handle empty content', () => {
      expect(LinkFormatter.extractWikilinks('')).toEqual([]);
      expect(LinkFormatter.extractWikilinks('No links here')).toEqual([]);
    });
    
    it('should not extract markdown links', () => {
      const content = '[Not a wikilink](path/to/file.md)';
      expect(LinkFormatter.extractWikilinks(content)).toEqual([]);
    });
  });
  
  describe('validateLinks (static)', () => {
    it('should validate correct wikilink formats', () => {
      const valid = LinkFormatter.validateLinks('Content with [[Good Link]] and [[Another]]');
      expect(valid.valid).toBe(true);
      expect(valid.issues).toEqual([]);
    });
    
    it('should detect incorrect markdown links', () => {
      const invalid = LinkFormatter.validateLinks('Bad [link](path/to/note.md)');
      expect(invalid.valid).toBe(false);
      // The validateLinks function finds both the markdown link and the bare path
      expect(invalid.issues.length).toBeGreaterThanOrEqual(1);
      expect(invalid.issues.some(i => i.type === 'incorrect-format')).toBe(true);
      expect(invalid.issues[0].suggestion).toBe('[[note|link]]');
    });
    
    it('should detect bare paths', () => {
      const invalid = LinkFormatter.validateLinks('Reference to /path/to/note.md directly');
      expect(invalid.valid).toBe(false);
      expect(invalid.issues).toHaveLength(1);
      expect(invalid.issues[0].type).toBe('bare-path');
      expect(invalid.issues[0].suggestion).toBe('[[note]]');
    });
    
    it('should ignore external URLs', () => {
      const valid = LinkFormatter.validateLinks('[External](https://example.com)');
      expect(valid.valid).toBe(true);
      expect(valid.issues).toEqual([]);
    });
  });
  
  describe('wikilinksToPaths (static)', () => {
    it('should convert wikilinks to markdown paths', () => {
      const content = 'Link to [[My Note]] and [[Other Note|custom text]]';
      const result = LinkFormatter.wikilinksToPaths(content);
      
      expect(result).toBe('Link to [My Note](My Note.md) and [custom text](Other Note.md)');
    });
    
    it('should use vault structure when provided', () => {
      const content = '[[Note A]] and [[Note B]]';
      const vaultStructure = {
        'Note A': 'folder/Note A.md',
        'Note B': 'other/Note B.md'
      };
      
      const result = LinkFormatter.wikilinksToPaths(content, vaultStructure);
      
      expect(result).toBe('[Note A](folder/Note A.md) and [Note B](other/Note B.md)');
    });
    
    it('should handle aliases correctly', () => {
      const content = '[[Target|Display Text]]';
      const result = LinkFormatter.wikilinksToPaths(content);
      
      expect(result).toBe('[Display Text](Target.md)');
    });
  });
  
  describe('formatLinksWithAPI', () => {
    it('should use static method when API is not available', async () => {
      const content = '[link](path/to/note.md)';
      const result = await formatter.formatLinksWithAPI(content, '');
      
      // Should fall back to static conversion
      expect(result).toBe('[[note|link]]');
    });
    
    it('should handle API errors gracefully', async () => {
      // Create formatter with mock API that throws errors
      const mockAPI = {
        isAvailable: () => true,
        request: async () => { throw new Error('API Error'); }
      };
      
      const formatterWithAPI = new LinkFormatter(mockAPI);
      const content = '[test](path/to/test.md)';
      const result = await formatterWithAPI.formatLinksWithAPI(content, '');
      
      // Should fall back to basic formatting
      expect(result).toBe('[[test]]');
    });
  });
  
  describe('error handling', () => {
    it('should handle null/undefined input', () => {
      expect(LinkFormatter.formatLink(null)).toBe('[[]]');
      expect(LinkFormatter.formatLink(undefined)).toBe('[[]]');
      expect(LinkFormatter.extractWikilinks(null)).toEqual([]);
      expect(LinkFormatter.extractWikilinks(undefined)).toEqual([]);
    });
    
    it('should handle empty aliases', () => {
      expect(LinkFormatter.formatLink('Note', '')).toBe('[[Note]]');
      expect(LinkFormatter.formatLink('Note', null)).toBe('[[Note]]');
    });
    
    it('should handle empty content in formatLinks', async () => {
      expect(await formatter.formatLinks('')).toBe('');
      expect(await formatter.formatLinks(null)).toBe('');
      expect(await formatter.formatLinks(undefined)).toBe('');
    });
  });
  
  describe('performance', () => {
    it('should handle large documents efficiently', () => {
      const largeContent = Array(1000).fill('Some text [[Link]] more text').join('\n');
      
      const start = Date.now();
      const links = LinkFormatter.extractWikilinks(largeContent);
      const duration = Date.now() - start;
      
      expect(links).toHaveLength(1000);
      expect(duration).toBeLessThan(100); // Should process in under 100ms
    });
    
    it('should handle many links in one document', () => {
      const links = Array(100).fill(null).map((_, i) => `[[Note ${i}]]`).join(' ');
      
      const start = Date.now();
      const extracted = LinkFormatter.extractWikilinks(links);
      const duration = Date.now() - start;
      
      expect(extracted).toHaveLength(100);
      expect(duration).toBeLessThan(50);
    });
    
    it('should handle large conversion operations efficiently', async () => {
      const largeContent = Array(100).fill('[link](path/to/note.md)').join(' ');
      
      const start = Date.now();
      const result = await formatter.formatLinks(largeContent);
      const duration = Date.now() - start;
      
      expect(result).toContain('[[note|link]]');
      expect(duration).toBeLessThan(100);
    });
  });
});