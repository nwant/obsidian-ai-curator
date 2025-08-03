import { describe, it, beforeEach, afterEach, expect } from '@jest/globals';
import { TagHandler } from '../../src/handlers/tag-handler.js';
import { testHarness } from '../test-harness.js';
import fs from 'fs/promises';
import path from 'path';

describe('TagHandler', () => {
  let handler;
  let config;
  let cache;
  let apiClient;
  
  beforeEach(async () => {
    await testHarness.setup();
    
    config = {
      vaultPath: testHarness.testVaultPath
    };
    
    // Mock cache
    cache = {
      getVaultStructure: async () => {
        const notePaths = await testHarness.getAllNotes();
        return {
          files: notePaths.map(notePath => ({
            path: notePath,
            name: path.basename(notePath),
            extension: path.extname(notePath)
          })),
          total: notePaths.length
        };
      },
      getFileContent: async (filePath) => {
        try {
          const fullPath = path.join(testHarness.testVaultPath, filePath);
          const content = await fs.readFile(fullPath, 'utf-8');
          return content;
        } catch (error) {
          throw new Error(`File not found: ${fullPath}`);
        }
      }
    };
    
    // Mock API client
    apiClient = {
      isConnected: () => false,
      request: async () => ({ success: false })
    };
    
    handler = new TagHandler(config, cache, apiClient);
  });
  
  afterEach(async () => {
    await testHarness.teardown();
  });
  
  describe('getTags', () => {
    beforeEach(async () => {
      await testHarness.createTestVault({
        'note1.md': {
          content: 'Content with #inline-tag and #another-tag',
          frontmatter: { tags: ['project', 'important'] }
        },
        'note2.md': {
          content: 'More content #inline-tag #unique-tag',
          frontmatter: { tags: ['project', 'review'] }
        },
        'folder/note3.md': {
          content: 'Nested note with #nested-tag',
          frontmatter: { tags: ['folder-tag'] }
        }
      });
      
      cache.getVaultStructure = async () => ({
        files: [
          { path: 'note1.md', size: 100, mtime: new Date() },
          { path: 'note2.md', size: 100, mtime: new Date() },
          { path: 'folder/note3.md', size: 100, mtime: new Date() }
        ],
        total: 3
      });
    });
    
    it('should get all tags from vault', async () => {
      const result = await handler.getTags({});
      
      expect(result.tags).toContain('project');
      expect(result.tags).toContain('important');
      expect(result.tags).toContain('inline-tag');
      expect(result.tags).toContain('unique-tag');
      expect(result.tags).toContain('nested-tag');
    });
    
    it('should get tags from specific file', async () => {
      const result = await handler.getTags({ path: 'note1.md' });
      
      expect(result.tags).toContain('project');
      expect(result.tags).toContain('important');
      expect(result.tags).toContain('inline-tag');
      expect(result.tags).toContain('another-tag');
      expect(result.tags).not.toContain('unique-tag');
    });
    
    it('should handle file not found', async () => {
      await expect(handler.getTags({ path: 'nonexistent.md' }))
        .rejects.toThrow();
    });
    
    it('should handle empty vault', async () => {
      cache.getVaultStructure = async () => ({ files: [], total: 0 });
      
      const result = await handler.getTags({});
      expect(result.tags).toEqual([]);
    });
  });
  
  describe('analyzeTags', () => {
    beforeEach(async () => {
      await testHarness.createTestVault({
        'doc1.md': {
          content: '#docs #documentation #project/docs',
          frontmatter: { tags: ['docs', 'guide'] }
        },
        'doc2.md': {
          content: '#documentation #docs-guide',
          frontmatter: { tags: ['documentation', 'tutorial'] }
        },
        'proj1.md': {
          content: '#project #project/active',
          frontmatter: { tags: ['project', 'active'] }
        }
      });
      
      cache.getVaultStructure = async () => ({
        files: [
          { path: 'doc1.md', size: 100, mtime: new Date() },
          { path: 'doc2.md', size: 100, mtime: new Date() },
          { path: 'proj1.md', size: 100, mtime: new Date() }
        ],
        total: 3
      });
    });
    
    it('should analyze tag usage and patterns', async () => {
      const result = await handler.analyzeTags({});
      
      expect(result.tags.length).toBeGreaterThan(0);
      expect(result.totalUsage).toBeGreaterThan(0);
      expect(result.hierarchy).toBeDefined();
      expect(result.similar).toBeDefined();
    });
    
    it('should identify similar tags', async () => {
      const result = await handler.analyzeTags({});
      
      const similarGroups = result.similar;
      expect(similarGroups.length).toBeGreaterThan(0);
      
      // Should group docs/documentation
      const docsGroup = similarGroups.find(g => 
        g.tags.includes('docs') || g.tags.includes('documentation')
      );
      expect(docsGroup).toBeDefined();
    });
    
    it('should build tag hierarchy', async () => {
      const result = await handler.analyzeTags({});
      
      expect(result.hierarchy['project']).toBeDefined();
      expect(result.hierarchy['project'].children).toContain('docs');
      expect(result.hierarchy['project'].children).toContain('active');
    });
  });
  
  describe('suggestTags', () => {
    beforeEach(async () => {
      await testHarness.createTestVault({
        'js-guide.md': {
          content: 'JavaScript programming guide',
          frontmatter: { tags: ['javascript', 'programming', 'guide'] }
        },
        'python-tutorial.md': {
          content: 'Python programming tutorial',
          frontmatter: { tags: ['python', 'programming', 'tutorial'] }
        }
      });
      
      cache.getVaultStructure = async () => ({
        files: [
          { path: 'js-guide.md', size: 100, mtime: new Date() },
          { path: 'python-tutorial.md', size: 100, mtime: new Date() }
        ],
        total: 2
      });
    });
    
    it('should suggest tags based on content', async () => {
      const result = await handler.suggestTags({
        content: 'This is about JavaScript and web development'
      });
      
      expect(result.suggestions).toContain('javascript');
      expect(result.suggestions).toContain('programming');
      expect(result.reason).toBeDefined();
    });
    
    it('should exclude existing tags', async () => {
      const result = await handler.suggestTags({
        content: 'JavaScript tutorial',
        existingTags: ['javascript']
      });
      
      expect(result.suggestions).not.toContain('javascript');
      expect(result.suggestions).toContain('tutorial');
    });
    
    it('should handle empty content', async () => {
      const result = await handler.suggestTags({
        content: ''
      });
      
      expect(result.suggestions).toEqual([]);
    });
  });
  
  describe('renameTag', () => {
    beforeEach(async () => {
      await testHarness.createTestVault({
        'note1.md': {
          content: 'Content with #old-tag inline',
          frontmatter: { tags: ['old-tag', 'keep-tag'] }
        },
        'note2.md': {
          content: 'Another #old-tag mention',
          frontmatter: { tags: ['different', 'old-tag'] }
        }
      });
      
      cache.getVaultStructure = async () => ({
        files: [
          { path: 'note1.md', size: 100, mtime: new Date() },
          { path: 'note2.md', size: 100, mtime: new Date() }
        ],
        total: 2
      });
    });
    
    it('should preview tag rename', async () => {
      const result = await handler.renameTag({
        oldTag: 'old-tag',
        newTag: 'new-tag',
        preview: true
      });
      
      expect(result.preview).toBe(true);
      expect(result.affectedFiles.length).toBe(2);
      expect(result.changes).toBeDefined();
    });
    
    it('should execute tag rename', async () => {
      const result = await handler.renameTag({
        oldTag: 'old-tag',
        newTag: 'new-tag',
        preview: false
      });
      
      expect(result.success).toBe(true);
      expect(result.filesUpdated).toBe(2);
      
      // Verify changes
      const note1 = await testHarness.readNote('note1.md');
      expect(note1.frontmatter.tags).toContain('new-tag');
      expect(note1.frontmatter.tags).not.toContain('old-tag');
      expect(note1.content).toContain('#new-tag');
    });
    
    it('should handle tag not found', async () => {
      const result = await handler.renameTag({
        oldTag: 'nonexistent-tag',
        newTag: 'new-tag',
        preview: true
      });
      
      expect(result.affectedFiles.length).toBe(0);
    });
    
    it('should handle special characters in tags', async () => {
      await testHarness.createNote('special.md', 'Content #c++ #c#', {
        tags: ['c++', 'c#']
      });
      
      cache.getVaultStructure = async () => ({
        files: [
          { path: 'special.md', size: 100, mtime: new Date() }
        ],
        total: 1
      });
      
      const result = await handler.renameTag({
        oldTag: 'c++',
        newTag: 'cpp',
        preview: true
      });
      
      expect(result.affectedFiles.length).toBe(1);
    });
  });
  
  describe('updateTags', () => {
    it('should add tags to note', async () => {
      await testHarness.createNote('update.md', 'Content', {
        tags: ['existing']
      });
      
      const result = await handler.updateTags({
        path: 'update.md',
        add: ['new-tag', 'another-new']
      });
      
      expect(result.success).toBe(true);
      
      const note = await testHarness.readNote('update.md');
      expect(note.frontmatter.tags).toContain('existing');
      expect(note.frontmatter.tags).toContain('new-tag');
      expect(note.frontmatter.tags).toContain('another-new');
    });
    
    it('should remove tags from note', async () => {
      await testHarness.createNote('remove.md', 'Content', {
        tags: ['tag1', 'tag2', 'tag3']
      });
      
      const result = await handler.updateTags({
        path: 'remove.md',
        remove: ['tag2']
      });
      
      expect(result.success).toBe(true);
      
      const note = await testHarness.readNote('remove.md');
      expect(note.frontmatter.tags).toEqual(['tag1', 'tag3']);
    });
    
    it('should replace all tags', async () => {
      await testHarness.createNote('replace.md', 'Content', {
        tags: ['old1', 'old2']
      });
      
      const result = await handler.updateTags({
        path: 'replace.md',
        replace: ['new1', 'new2', 'new3']
      });
      
      expect(result.success).toBe(true);
      
      const note = await testHarness.readNote('replace.md');
      expect(note.frontmatter.tags).toEqual(['new1', 'new2', 'new3']);
    });
  });
});