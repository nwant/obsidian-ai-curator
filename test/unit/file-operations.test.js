import { describe, it, beforeAll, afterAll, beforeEach, expect } from '@jest/globals';
import { testHarness } from '../test-harness.js';

describe('File Operations Tools', () => {
  beforeAll(async () => {
    await testHarness.setup();
  });
  
  afterAll(async () => {
    await testHarness.teardown();
  });
  
  beforeEach(async () => {
    // Create test vault with linked notes
    await testHarness.createTestVault({
      'Notes/Main Note.md': {
        content: `# Main Note

This links to [[Linked Note]] and [[Projects/Project A]].
Also has a link with alias: [[Linked Note|my favorite note]].
And a markdown link: [External](https://example.com)`,
        frontmatter: { tags: ['main'] }
      },
      'Notes/Linked Note.md': {
        content: `# Linked Note

This links back to [[Main Note]].
Also links to [[Subfolder/Deep Note]]`,
        frontmatter: { tags: ['linked'] }
      },
      'Notes/Subfolder/Deep Note.md': {
        content: '# Deep Note\n\nLinks to [[Main Note]] and [[Linked Note]]',
        frontmatter: { tags: ['deep'] }
      },
      'Projects/Project A.md': {
        content: '# Project A\n\nReferences [[Main Note]]',
        frontmatter: { status: 'active' }
      },
      'Templates/Daily.md': {
        content: '# Daily Template\n\n- [ ] Task',
        frontmatter: { template: true }
      }
    });
  });
  
  describe('rename_file tool', () => {
    it('should rename file and update all links', async () => {
      const result = await testHarness.executeTool('rename_file', {
        oldPath: 'Notes/Linked Note.md',
        newPath: 'Notes/Renamed Note.md'
      });
      
      expect(result.success).toBe(true);
      expect(result.linksUpdated).toBeGreaterThan(0);
      
      // Check file exists at new location
      await testHarness.assertFileExists('Notes/Renamed Note.md');
      
      // Check old file is gone
      await expect(
        testHarness.assertFileExists('Notes/Linked Note.md')
      ).rejects.toThrow();
      
      // Check links are updated
      await testHarness.assertFileContains('Notes/Main Note.md', '[[Renamed Note]]');
      await testHarness.assertFileContains('Notes/Main Note.md', '[[Renamed Note|my favorite note]]');
      await testHarness.assertFileContains('Notes/Subfolder/Deep Note.md', '[[Renamed Note]]');
    });
    
    it('should handle renaming to different folder', async () => {
      const result = await testHarness.executeTool('rename_file', {
        oldPath: 'Notes/Linked Note.md',
        newPath: 'Archive/Linked Note.md'
      });
      
      expect(result.success).toBe(true);
      await testHarness.assertFileExists('Archive/Linked Note.md');
      
      // Links should include folder path if necessary
      await testHarness.assertFileContains('Notes/Main Note.md', '[[Archive/Linked Note|Linked Note]]');
    });
    
    it('should preserve file content and frontmatter', async () => {
      const originalContent = await testHarness.readNote('Notes/Linked Note.md');
      
      const result = await testHarness.executeTool('rename_file', {
        oldPath: 'Notes/Linked Note.md',
        newPath: 'Notes/Preserved Content.md'
      });
      
      expect(result.success).toBe(true);
      const newContent = await testHarness.readNote('Notes/Preserved Content.md');
      
      // Content should be identical except for updated self-links
      expect(newContent.content.includes('# Linked Note')).toBe(true);
      expect(newContent.raw.includes('tags:')).toBe(true);
    });
    
    it('should handle name conflicts', async () => {
      await expect(
        testHarness.executeTool('rename_file', {
          oldPath: 'Notes/Linked Note.md',
          newPath: 'Notes/Main Note.md'  // Already exists
        })
      ).rejects.toThrow(/already exists|conflict/i);
    });
    
    it('should handle special characters in filenames', async () => {
      // Create note with special characters
      await testHarness.createNote('Notes/Special & Name (test).md', 
        'Content with [[Main Note]]');
      
      const result = await testHarness.executeTool('rename_file', {
        oldPath: 'Notes/Special & Name (test).md',
        newPath: 'Notes/Clean Name.md'
      });
      
      expect(result.success).toBe(true);
    });
  });
  
  describe('move_file tool', () => {
    it('should move file to different directory', async () => {
      const result = await testHarness.executeTool('move_file', {
        sourcePath: 'Notes/Linked Note.md',
        targetPath: 'Archive/2024/Linked Note.md'
      });
      
      expect(result.success).toBe(true);
      await testHarness.assertFileExists('Archive/2024/Linked Note.md');
      
      // Check links are updated with path
      await testHarness.assertFileContains('Notes/Main Note.md', 
        '[[Archive/2024/Linked Note|Linked Note]]');
    });
    
    it('should create target directory if needed', async () => {
      const result = await testHarness.executeTool('move_file', {
        sourcePath: 'Notes/Linked Note.md',
        targetPath: 'New/Deeply/Nested/Linked Note.md'
      });
      
      expect(result.success).toBe(true);
      await testHarness.assertFileExists('New/Deeply/Nested/Linked Note.md');
    });
    
    it('should handle moving to root', async () => {
      const result = await testHarness.executeTool('move_file', {
        sourcePath: 'Notes/Subfolder/Deep Note.md',
        targetPath: 'Deep Note.md'
      });
      
      expect(result.success).toBe(true);
      await testHarness.assertFileExists('Deep Note.md');
      
      // Links from root don't need path prefix
      await testHarness.assertFileContains('Notes/Linked Note.md', '[[Deep Note]]');
    });
    
    it('should preserve backlinks when moving', async () => {
      const result = await testHarness.executeTool('move_file', {
        sourcePath: 'Notes/Main Note.md',
        targetPath: 'Important/Main Note.md'
      });
      
      expect(result.success).toBe(true);
      
      // All files that linked to Main Note should still link correctly
      await testHarness.assertFileContains('Notes/Linked Note.md', 
        '[[Important/Main Note|Main Note]]');
      await testHarness.assertFileContains('Projects/Project A.md', 
        '[[Important/Main Note|Main Note]]');
    });
  });
  
  describe('archive_notes tool', () => {
    it('should move multiple files in batch', async () => {
      const result = await testHarness.executeTool('archive_notes', {
        moves: [
          { from: 'Notes/Linked Note.md', to: 'Archive/2024/Linked Note.md' },
          { from: 'Notes/Subfolder/Deep Note.md', to: 'Archive/2024/Deep Note.md' }
        ]
      });
      
      expect(result.successful).toBe(2);
      expect(result.totalMoves).toBe(2);
      
      await testHarness.assertFileExists('Archive/2024/Linked Note.md');
      await testHarness.assertFileExists('Archive/2024/Deep Note.md');
    });
    
    it('should update all cross-references in batch', async () => {
      const result = await testHarness.executeTool('archive_notes', {
        moves: [
          { from: 'Notes/Main Note.md', to: 'Archive/Main Note.md' },
          { from: 'Notes/Linked Note.md', to: 'Archive/Linked Note.md' }
        ]
      });
      
      expect(result.successful).toBe(2);
      
      // Check that archived notes still link to each other correctly
      await testHarness.assertFileContains('Archive/Main Note.md', '[[Linked Note]]');
      await testHarness.assertFileContains('Archive/Linked Note.md', '[[Main Note]]');
      
      // Check external references
      await testHarness.assertFileContains('Projects/Project A.md', 
        '[[Archive/Main Note|Main Note]]');
    });
    
    it('should handle partial failures gracefully', async () => {
      const result = await testHarness.executeTool('archive_notes', {
        moves: [
          { from: 'Notes/Linked Note.md', to: 'Archive/Linked Note.md' },
          { from: 'Notes/NonExistent.md', to: 'Archive/NonExistent.md' },  // Doesn't exist
          { from: 'Notes/Main Note.md', to: 'Archive/Main Note.md' }
        ]
      });
      
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.totalMoves).toBe(3);
    });
    
    it('should validate all paths before moving', async () => {
      await expect(
        testHarness.executeTool('archive_notes', {
          moves: [
            { from: 'Notes/Linked Note.md', to: '../outside/vault.md' }
          ]
        })
      ).rejects.toThrow(/invalid path|outside vault/i);
    });
  });
  
  describe('Link update scenarios', () => {
    it.skip('should handle relative links correctly', async () => {  // TODO: Implement relative link support
      // Create notes with relative links
      await testHarness.createNote('Folder1/Note1.md', 
        'Links to [[../Folder2/Note2]] and [[./Sibling]]');
      await testHarness.createNote('Folder1/Sibling.md', 'Sibling note');
      await testHarness.createNote('Folder2/Note2.md', 'Note 2');
      
      const result = await testHarness.executeTool('move_file', {
        sourcePath: 'Folder1/Note1.md',
        targetPath: 'Folder3/Note1.md'
      });
      
      expect(result.success).toBe(true);
      // Relative links should be updated to maintain relationships
      await testHarness.assertFileContains('Folder3/Note1.md', '[[Folder2/Note2|Note2]]');
      await testHarness.assertFileContains('Folder3/Note1.md', '[[Folder1/Sibling|Sibling]]');
    });
    
    it('should handle circular references', async () => {
      // Create circular reference
      await testHarness.createNote('Notes/A.md', 'Links to [[B]]');
      await testHarness.createNote('Notes/B.md', 'Links to [[A]]');
      
      const result = await testHarness.executeTool('rename_file', {
        oldPath: 'Notes/A.md',
        newPath: 'Notes/A-Renamed.md'
      });
      
      expect(result.success).toBe(true);
      await testHarness.assertFileContains('Notes/B.md', '[[A-Renamed]]');
      await testHarness.assertFileContains('Notes/A-Renamed.md', '[[B]]');
    });
    
    it('should preserve link aliases', async () => {
      await testHarness.createNote('Notes/Source.md', 
        'Has [[Target|custom alias]] and [[Target|another alias]]');
      await testHarness.createNote('Notes/Target.md', 'Target note');
      
      const result = await testHarness.executeTool('rename_file', {
        oldPath: 'Notes/Target.md',
        newPath: 'Notes/Target-Renamed.md'
      });
      
      expect(result.success).toBe(true);
      await testHarness.assertFileContains('Notes/Source.md', 
        '[[Target-Renamed|custom alias]]');
      await testHarness.assertFileContains('Notes/Source.md', 
        '[[Target-Renamed|another alias]]');
    });
  });
  
  describe('Performance', () => {
    it('should handle vault with many links efficiently', async () => {
      // Create interconnected notes
      const noteCount = 50;
      const notes = {};
      
      for (let i = 0; i < noteCount; i++) {
        // Each note links to 5 others
        const links = [];
        for (let j = 0; j < 5; j++) {
          const target = (i + j + 1) % noteCount;
          links.push(`[[Note${target}]]`);
        }
        notes[`Perf/Note${i}.md`] = `# Note ${i}\n\n${links.join(', ')}`;
      }
      
      await testHarness.createTestVault(notes);
      
      const start = Date.now();
      const result = await testHarness.executeTool('rename_file', {
        oldPath: 'Perf/Note0.md',
        newPath: 'Perf/Note0-Renamed.md'
      });
      const duration = Date.now() - start;
      
      expect(result.success).toBe(true);
      expect(result.linksUpdated).toBeGreaterThanOrEqual(5);
      expect(duration).toBeLessThan(1000);
    });
  });
  
  describe('Error handling', () => {
    it('should handle file not found', async () => {
      await expect(
        testHarness.executeTool('rename_file', {
          oldPath: 'Notes/DoesNotExist.md',
          newPath: 'Notes/NewName.md'
        })
      ).rejects.toThrow(/not found|does not exist/i);
    });
    
    it.skip('should handle permission errors', async () => {  // TODO: Add permission simulation
      await testHarness.setFilePermissions('Notes/Linked Note.md', 
        { read: true, write: false });
      
      await expect(
        testHarness.executeTool('rename_file', {
          oldPath: 'Notes/Linked Note.md',
          newPath: 'Notes/NoPermission.md'
        })
      ).rejects.toThrow(/permission|access denied/i);
    });
    
    it('should validate paths', async () => {
      await expect(
        testHarness.executeTool('move_file', {
          sourcePath: 'Notes/Main Note.md',
          targetPath: '/etc/passwd'  // Absolute path outside vault
        })
      ).rejects.toThrow(/invalid path|outside vault/i);
    });
  });
});