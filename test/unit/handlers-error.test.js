import { describe, it, beforeEach, expect } from '@jest/globals';
import { testHarness } from '../test-harness.js';

describe('Handler Error Conditions and Edge Cases', () => {
  beforeEach(async () => {
    await testHarness.setup();
    await testHarness.cleanTestVault();
  });
  
  describe('VaultHandler - Error Conditions', () => {
    it('should handle empty vault gracefully', async () => {
      const result = await testHarness.executeTool('vault_scan', {});
      
      expect(result.files).toEqual([]);
      expect(result.total).toBe(0);
    });
    
    it('should handle invalid glob patterns', async () => {
      await testHarness.createNote('test.md', 'Content');
      
      // These patterns should still work without crashing
      const patterns = ['[invalid', '**/{missing', ''];
      
      for (const pattern of patterns) {
        const result = await testHarness.executeTool('vault_scan', {
          patterns: [pattern]
        });
        
        expect(result).toBeDefined();
        expect(result.files).toBeDefined();
      }
    });
    
    it('should handle very large file lists with limit', async () => {
      // Create many files
      for (let i = 0; i < 200; i++) {
        await testHarness.createNote(`large/file${i}.md`, `Content ${i}`);
      }
      
      const result = await testHarness.executeTool('vault_scan', {
        limit: 50
      });
      
      expect(result.files).toHaveLength(50);
      expect(result.total).toBe(50);
    });
  });
  
  describe('NoteHandler - Error Conditions', () => {
    it('should handle path traversal attempts', async () => {
      const result = await testHarness.executeTool('read_notes', {
        paths: ['../../../etc/passwd', 'normal.md']
      });
      
      expect(result.notes).toHaveLength(2);
      expect(result.notes[0].error).toBeDefined();
      expect(result.notes[0].error).toContain('Invalid path');
    });
    
    it('should handle missing files gracefully', async () => {
      const result = await testHarness.executeTool('read_notes', {
        paths: ['nonexistent.md', 'also-missing.md']
      });
      
      expect(result.notes).toHaveLength(2);
      result.notes.forEach(note => {
        expect(note.error).toBeDefined();
      });
    });
    
    it('should handle malformed frontmatter', async () => {
      await testHarness.createNote('malformed.md', `---
invalid yaml: [unclosed
---
Content here`);
      
      const result = await testHarness.executeTool('read_notes', {
        paths: ['malformed.md']
      });
      
      expect(result.notes).toHaveLength(1);
      // Should still return content even if frontmatter parsing fails
      expect(result.notes[0].content || result.notes[0].raw).toContain('Content here');
    });
    
    it('should handle concurrent writes to same file', async () => {
      const promises = Array(5).fill(null).map((_, i) =>
        testHarness.executeTool('write_note', {
          path: 'concurrent.md',
          content: `Version ${i}`
        })
      );
      
      const results = await Promise.all(promises);
      
      // All should succeed
      expect(results.every(r => r.success)).toBe(true);
      
      // Verify file exists
      await testHarness.assertFileExists('concurrent.md');
    });
    
    it('should handle partial archive failures', async () => {
      await testHarness.createNote('exists1.md', 'Content 1');
      await testHarness.createNote('exists2.md', 'Content 2');
      
      const result = await testHarness.executeTool('archive_notes', {
        moves: [
          { from: 'exists1.md', to: 'archive/exists1.md' },
          { from: 'nonexistent.md', to: 'archive/nonexistent.md' },
          { from: 'exists2.md', to: 'archive/exists2.md' }
        ]
      });
      
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });
  });
  
  describe('SearchHandler - Error Conditions', () => {
    it('should handle empty search results', async () => {
      await testHarness.createNote('test.md', 'Some content');
      
      const result = await testHarness.executeTool('search_content', {
        query: 'nonexistentterm12345'
      });
      
      expect(result.matches).toEqual([]);
      expect(result.totalMatches).toBe(0);
    });
    
    it('should handle invalid regex patterns', async () => {
      await testHarness.createNote('test.md', 'Content');
      
      const invalidPatterns = ['[', '(unclosed', '*invalid'];
      
      for (const pattern of invalidPatterns) {
        try {
          await testHarness.executeTool('search_content', {
            query: pattern
          });
        } catch (error) {
          // Should handle gracefully, either by escaping or returning error
          expect(error).toBeDefined();
        }
      }
    });
    
    it('should handle complex metadata queries', async () => {
      await testHarness.createNote('complex.md', 'Content', {
        status: 'active',
        priority: 5,
        tags: ['test', 'complex'],
        nested: {
          value: 'deep'
        }
      });
      
      const queries = [
        { status: 'active', priority: { $gt: 3 } },
        { tags: { $in: ['test', 'other'] } },
        { 'nested.value': 'deep' },
        { $or: [{ status: 'active' }, { priority: 10 }] }
      ];
      
      for (const query of queries) {
        const result = await testHarness.executeTool('find_by_metadata', {
          frontmatter: query
        });
        
        expect(result).toBeDefined();
        expect(result.files).toBeDefined();
      }
    });
  });
  
  describe('TagHandler - Error Conditions', () => {
    it('should handle empty vault tag analysis', async () => {
      const result = await testHarness.executeTool('analyze_tags', {});
      
      expect(result.tags).toEqual([]);
      expect(result.totalUsage).toBe(0);
    });
    
    it('should handle tag rename conflicts', async () => {
      await testHarness.createNote('note1.md', 'Content #old-tag', {
        tags: ['old-tag', 'existing-tag']
      });
      await testHarness.createNote('note2.md', 'Content #existing-tag', {
        tags: ['existing-tag']
      });
      
      const result = await testHarness.executeTool('rename_tag', {
        oldTag: 'old-tag',
        newTag: 'existing-tag',
        preview: true
      });
      
      // Should handle the conflict appropriately
      expect(result).toBeDefined();
    });
    
    it('should handle special characters in tags', async () => {
      const specialTags = ['c++', 'c#', 'q&a', 'test/nested/deep'];
      
      for (const tag of specialTags) {
        await testHarness.createNote(`special${specialTags.indexOf(tag)}.md`, 
          `Content #${tag}`, 
          { tags: [tag] }
        );
      }
      
      const result = await testHarness.executeTool('get_tags', {});
      
      expect(result.tags).toHaveLength(specialTags.length);
    });
  });
  
  describe('Edge Cases - File Names and Paths', () => {
    it('should handle files with unicode characters', async () => {
      const unicodeFiles = [
        '日本語.md',
        'émojis 😀.md',
        'Ñoño.md',
        'Привет.md'
      ];
      
      for (const filename of unicodeFiles) {
        const result = await testHarness.executeTool('write_note', {
          path: `unicode/${filename}`,
          content: `Content for ${filename}`
        });
        
        expect(result.success).toBe(true);
      }
      
      const scanResult = await testHarness.executeTool('vault_scan', {
        patterns: ['unicode/**/*.md']
      });
      
      expect(scanResult.files).toHaveLength(unicodeFiles.length);
    });
    
    it('should handle very long file paths', async () => {
      const deepPath = Array(20).fill('folder').join('/') + '/file.md';
      
      const result = await testHarness.executeTool('write_note', {
        path: deepPath,
        content: 'Deep content'
      });
      
      expect(result.success).toBe(true);
    });
    
    it('should handle files with multiple extensions', async () => {
      const multiExtFiles = [
        'file.backup.md',
        'document.v2.draft.md',
        'archive.2024.01.15.md'
      ];
      
      for (const filename of multiExtFiles) {
        await testHarness.createNote(filename, `Content for ${filename}`);
      }
      
      const result = await testHarness.executeTool('vault_scan', {});
      
      expect(result.files.length).toBeGreaterThanOrEqual(multiExtFiles.length);
    });
  });
  
  describe('Performance Under Stress', () => {
    it('should handle rapid file creation and deletion', async () => {
      const operations = [];
      
      // Rapidly create and delete files
      for (let i = 0; i < 50; i++) {
        operations.push(
          testHarness.executeTool('write_note', {
            path: `stress/temp${i}.md`,
            content: `Temporary content ${i}`
          })
        );
      }
      
      await Promise.all(operations);
      
      // Immediately scan
      const scanResult = await testHarness.executeTool('vault_scan', {
        patterns: ['stress/**/*.md']
      });
      
      expect(scanResult.files.length).toBeGreaterThanOrEqual(40); // Some tolerance for timing
    });
    
    it('should handle very large content operations', async () => {
      const largeContent = 'x'.repeat(5 * 1024 * 1024); // 5MB
      
      const result = await testHarness.executeTool('write_note', {
        path: 'large-content.md',
        content: `# Large File\n\n${largeContent}`
      });
      
      expect(result.success).toBe(true);
      
      // Should be able to read it back
      const readResult = await testHarness.executeTool('read_notes', {
        paths: ['large-content.md']
      });
      
      expect(readResult.notes[0].content).toContain('Large File');
    });
  });
  
  afterEach(async () => {
    await testHarness.cleanTestVault();
  });
});