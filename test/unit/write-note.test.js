import { describe, it, beforeAll, afterAll, beforeEach, expect } from '@jest/globals';
import { testHarness } from '../test-harness.js';
import path from 'path';

describe('write_note tool', () => {
  beforeAll(async () => {
    await testHarness.setup();
  });
  
  afterAll(async () => {
    await testHarness.teardown();
  });
  
  beforeEach(async () => {
    // Clean up test notes between tests
    await testHarness.createTestVault({});
  });
  
  describe('Basic write functionality', () => {
    it('should create a new note', async () => {
      const result = await testHarness.executeTool('write_note', {
        path: 'Notes/Test Note.md',
        content: '# Test Note\n\nThis is a test.'
      });
      
      expect(result.success).toBe(true);
      expect(result.path).toBe('Notes/Test Note.md');
      
      await testHarness.assertFileExists('Notes/Test Note.md');
      await testHarness.assertFileContains('Notes/Test Note.md', '# Test Note');
    });
    
    it('should create directories if needed', async () => {
      const result = await testHarness.executeTool('write_note', {
        path: 'New/Nested/Folder/Note.md',
        content: 'Nested content'
      });
      
      expect(result.success).toBe(true);
      await testHarness.assertFileExists('New/Nested/Folder/Note.md');
    });
    
    it('should overwrite existing notes', async () => {
      // Create initial note
      await testHarness.createNote('Notes/Existing.md', 'Old content');
      
      // Overwrite it
      const result = await testHarness.executeTool('write_note', {
        path: 'Notes/Existing.md',
        content: 'New content'
      });
      
      expect(result.success).toBe(true);
      await testHarness.assertFileContains('Notes/Existing.md', 'New content');
      
      // Should not contain old content
      const note = await testHarness.readNote('Notes/Existing.md');
      expect(note.content.includes('Old content')).toBe(false);
    });
  });
  
  describe('Frontmatter handling', () => {
    it('should preserve existing frontmatter when updating content', async () => {
      // Create note with frontmatter
      await testHarness.createNote('Notes/WithFrontmatter.md', 
        '# Title\n\nContent', 
        { tags: ['test'], status: 'active' }
      );
      
      // Update content only
      const result = await testHarness.executeTool('write_note', {
        path: 'Notes/WithFrontmatter.md',
        content: '# New Title\n\nNew content',
        preserveFrontmatter: true
      });
      
      expect(result.success).toBe(true);
      await testHarness.assertFrontmatter('Notes/WithFrontmatter.md', 'status', 'active');
      await testHarness.assertFileContains('Notes/WithFrontmatter.md', 'New content');
    });
    
    it('should add frontmatter to content without it', async () => {
      const contentWithFrontmatter = `---
tags:
  - project
  - important
status: draft
---

# My Note

Content here`;
      
      const result = await testHarness.executeTool('write_note', {
        path: 'Notes/NewWithFrontmatter.md',
        content: contentWithFrontmatter
      });
      
      expect(result.success).toBe(true);
      await testHarness.assertFrontmatter('Notes/NewWithFrontmatter.md', 'status', 'draft');
    });
    
    it('should handle complex frontmatter structures', async () => {
      const content = `---
title: Complex Note
tags:
  - one
  - two
metadata:
  created: 2025-08-01
  author: Test
---

# Content`;
      
      const result = await testHarness.executeTool('write_note', {
        path: 'Notes/Complex.md',
        content: content
      });
      
      expect(result.success).toBe(true);
      // Tool should convert complex structures to simple ones
      await testHarness.assertFrontmatter('Notes/Complex.md', 'title', 'Complex Note');
    });
  });
  
  describe('Link formatting', () => {
    it('should convert markdown links to wikilinks', async () => {
      const content = `# Note with Links

Here is a [link to another note](Notes/Another.md).
And [external link](https://example.com) should stay.
Also [relative link](../Projects/Project.md).`;
      
      const result = await testHarness.executeTool('write_note', {
        path: 'Notes/WithLinks.md',
        content: content
      });
      
      expect(result.success).toBe(true);
      await testHarness.assertFileContains('Notes/WithLinks.md', '[[Another|link to another note]]');
      await testHarness.assertFileContains('Notes/WithLinks.md', '[external link](https://example.com)');
      await testHarness.assertFileContains('Notes/WithLinks.md', '[[Project|relative link]]');
    });
    
    it('should handle links with aliases', async () => {
      const content = 'Check [this important note](Notes/Important.md) for details.';
      
      const result = await testHarness.executeTool('write_note', {
        path: 'Notes/LinkAlias.md',
        content: content
      });
      
      expect(result.success).toBe(true);
      await testHarness.assertFileContains('Notes/LinkAlias.md', '[[Important|this important note]]');
    });
    
    it('should not convert already-formatted wikilinks', async () => {
      const content = 'This [[Already Formatted]] link and [[Note|with alias]] should stay.';
      
      const result = await testHarness.executeTool('write_note', {
        path: 'Notes/PreFormatted.md',
        content: content
      });
      
      expect(result.success).toBe(true);
      await testHarness.assertFileContains('Notes/PreFormatted.md', '[[Already Formatted]]');
      await testHarness.assertFileContains('Notes/PreFormatted.md', '[[Note|with alias]]');
    });
  });
  
  describe('Date handling', () => {
    it('should format dates consistently', async () => {
      const content = `---
created: 2025/08/01
modified: 08-01-2025
date: 2025-08-01
---

# Note`;
      
      const result = await testHarness.executeTool('write_note', {
        path: 'Notes/Dates.md',
        content: content
      });
      
      expect(result.success).toBe(true);
      // All dates should be normalized to yyyy-MM-dd
      await testHarness.assertFrontmatter('Notes/Dates.md', 'created', '2025-08-01');
      await testHarness.assertFrontmatter('Notes/Dates.md', 'modified', '2025-08-01');
      await testHarness.assertFrontmatter('Notes/Dates.md', 'date', '2025-08-01');
    });
    
    it('should add modified date automatically', async () => {
      const result = await testHarness.executeTool('write_note', {
        path: 'Notes/AutoDate.md',
        content: '# Note',
        addModifiedDate: true
      });
      
      expect(result.success).toBe(true);
      const note = await testHarness.readNote('Notes/AutoDate.md');
      expect(note.raw.includes('modified:')).toBe(true);
    });
  });
  
  describe('Tag validation', () => {
    it('should validate and format tags', async () => {
      const content = `---
tags:
  - "#no-hash-in-frontmatter"
  - "spaces not allowed"
  - "UPPERCASE"
  - valid-tag
---

# Note`;
      
      const result = await testHarness.executeTool('write_note', {
        path: 'Notes/Tags.md',
        content: content
      });
      
      expect(result.success).toBe(true);
      // Tags should be cleaned up
      const note = await testHarness.readNote('Notes/Tags.md');
      expect(note.frontmatter.tags.includes('no-hash-in-frontmatter')).toBe(true);
      expect(note.frontmatter.tags.includes('spaces-not-allowed')).toBe(true);
      expect(note.frontmatter.tags.includes('uppercase')).toBe(true);
    });
    
    it('should handle inline tags correctly', async () => {
      const content = `# Note

This has #inline-tags and #another-tag in the content.`;
      
      const result = await testHarness.executeTool('write_note', {
        path: 'Notes/InlineTags.md',
        content: content
      });
      
      expect(result.success).toBe(true);
      await testHarness.assertFileContains('Notes/InlineTags.md', '#inline-tags');
      await testHarness.assertFileContains('Notes/InlineTags.md', '#another-tag');
    });
  });
  
  describe('Path validation', () => {
    it('should reject paths outside vault', async () => {
      await expect(
        testHarness.executeTool('write_note', {
          path: '../../../etc/passwd',
          content: 'malicious'
        })
      ).rejects.toThrow(/invalid path|outside vault/i);
    });
    
    it('should reject absolute paths', async () => {
      await expect(
        testHarness.executeTool('write_note', {
          path: '/etc/passwd',
          content: 'malicious'
        })
      ).rejects.toThrow(/absolute path|invalid path/i);
    });
    
    it('should handle special characters in filenames', async () => {
      const result = await testHarness.executeTool('write_note', {
        path: 'Notes/Special & Characters (test).md',
        content: 'Content'
      });
      
      expect(result.success).toBe(true);
      await testHarness.assertFileExists('Notes/Special & Characters (test).md');
    });
  });
  
  describe('Error handling', () => {
    it('should handle missing path parameter', async () => {
      await expect(
        testHarness.executeTool('write_note', {
          content: 'Content without path'
        })
      ).rejects.toThrow(/path.*required/i);
    });
    
    it('should handle missing content parameter', async () => {
      await expect(
        testHarness.executeTool('write_note', {
          path: 'Notes/NoContent.md'
        })
      ).rejects.toThrow(/content.*required/i);
    });
    
    it('should handle write permission errors', async () => {
      // Simulate permission error
      await testHarness.setFilePermissions('Notes/ReadOnly.md', 'read-only');
      
      await expect(
        testHarness.executeToolWithSimulation('write_note', {
          path: 'Notes/ReadOnly.md',
          content: 'Should fail'
        })
      ).rejects.toThrow(/permission|access denied/i);
    });
    
    it('should handle disk full errors gracefully', async () => {
      // Simulate disk full
      testHarness.simulateDiskFull();
      
      await expect(
        testHarness.executeToolWithSimulation('write_note', {
          path: 'Notes/DiskFull.md',
          content: 'Large content'
        })
      ).rejects.toThrow(/disk full|no space|ENOSPC/i);
      
      // Reset disk full simulation
      testHarness.simulateDiskFull(false);
    });
  });
  
  describe('Performance', () => {
    it('should handle large files efficiently', async () => {
      const largeContent = 'Line of text\n'.repeat(10000);
      
      const start = Date.now();
      const result = await testHarness.executeTool('write_note', {
        path: 'Notes/Large.md',
        content: largeContent
      });
      const duration = Date.now() - start;
      
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(1000);
    });
    
    it('should handle many frontmatter fields', async () => {
      const manyFields = {};
      for (let i = 0; i < 100; i++) {
        manyFields[`field${i}`] = `value${i}`;
      }
      
      const content = `---
${Object.entries(manyFields).map(([k, v]) => `${k}: ${v}`).join('\n')}
---

# Content`;
      
      const result = await testHarness.executeTool('write_note', {
        path: 'Notes/ManyFields.md',
        content: content
      });
      
      expect(result.success).toBe(true);
    });
  });
});