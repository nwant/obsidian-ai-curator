import { describe, it, beforeEach, afterEach, expect } from '@jest/globals';
import { VaultHandler } from '../../src/handlers/vault-handler.js';
import { testHarness } from '../test-harness.js';

describe('VaultHandler - Simple Tests', () => {
  let handler;
  let config;
  let cache;
  let apiClient;
  
  beforeEach(async () => {
    await testHarness.setup();
    
    config = {
      vaultPath: testHarness.testVaultPath
    };
    
    // Simple mock cache
    cache = {
      getVaultStructure: async (forceRefresh) => {
        const notePaths = await testHarness.getAllNotes();
        return {
          files: notePaths.map(notePath => ({
            path: notePath,
            size: 100, // Mock size
            mtime: new Date()
          })),
          total: notePaths.length
        };
      }
    };
    
    // Mock API client
    apiClient = {
      isConnected: () => false,
      request: async () => ({ success: false })
    };
    
    handler = new VaultHandler(config, cache, apiClient);
  });
  
  afterEach(async () => {
    await testHarness.teardown();
  });
  
  describe('scanVault', () => {
    it('should scan empty vault', async () => {
      const result = await handler.scanVault({});
      
      expect(result.files).toEqual([]);
      expect(result.total).toBe(0);
    });
    
    it('should scan vault with files', async () => {
      await testHarness.createTestVault({
        'note1.md': { content: 'Content 1' },
        'folder/note2.md': { content: 'Content 2' },
        'folder/subfolder/note3.md': { content: 'Content 3' }
      });
      
      const result = await handler.scanVault({});
      
      expect(result.files.length).toBe(3);
      expect(result.total).toBe(3);
      expect(result.files.every(f => f.path.endsWith('.md'))).toBe(true);
    });
    
    it('should filter by patterns', async () => {
      await testHarness.createTestVault({
        'note.md': { content: 'Markdown' },
        'data.json': { content: '{}' },
        'folder/doc.md': { content: 'Doc' },
        'folder/config.yml': { content: 'config: true' }
      });
      
      const result = await handler.scanVault({
        patterns: ['*.md']
      });
      
      expect(result.files.length).toBe(2);
      expect(result.files.every(f => f.path.endsWith('.md'))).toBe(true);
    });
    
    it('should sort files by modification time', async () => {
      // Create files with different timestamps
      await testHarness.createNote('old.md', 'Old content');
      await new Promise(resolve => setTimeout(resolve, 10));
      await testHarness.createNote('middle.md', 'Middle content');
      await new Promise(resolve => setTimeout(resolve, 10));
      await testHarness.createNote('new.md', 'New content');
      
      const result = await handler.scanVault({
        sortBy: 'modified'
      });
      
      // Most recent first
      expect(result.files[0].path).toBe('new.md');
      expect(result.files[result.files.length - 1].path).toBe('old.md');
    });
    
    it('should respect limit parameter', async () => {
      // Create many files
      for (let i = 0; i < 20; i++) {
        await testHarness.createNote(`note${i}.md`, `Content ${i}`);
      }
      
      const result = await handler.scanVault({
        limit: 5
      });
      
      expect(result.files.length).toBe(5);
      expect(result.total).toBe(5);
    });
    
    it('should include stats when requested', async () => {
      await testHarness.createNote('note.md', 'Some content here');
      
      const result = await handler.scanVault({
        includeStats: true
      });
      
      expect(result.files[0].wordCount).toBeGreaterThan(0);
    });
    
    it('should include frontmatter when requested', async () => {
      await testHarness.createNote('with-fm.md', 'Content', {
        title: 'Test Note',
        tags: ['test']
      });
      
      const result = await handler.scanVault({
        includeFrontmatter: true
      });
      
      expect(result.files[0].frontmatter).toBeDefined();
      expect(result.files[0].frontmatter.title).toBe('Test Note');
    });
    
    it('should include preview when requested', async () => {
      const content = 'This is a long content that should be truncated for preview...'.repeat(10);
      await testHarness.createNote('preview.md', content);
      
      const result = await handler.scanVault({
        includePreview: true
      });
      
      expect(result.files[0].preview).toBeDefined();
      expect(result.files[0].preview.length).toBeLessThan(content.length);
    });
  });
  
  describe('fileExists', () => {
    it('should check if file exists', async () => {
      await testHarness.createNote('exists.md', 'Content');
      
      const exists = await handler.fileExists('exists.md');
      const notExists = await handler.fileExists('missing.md');
      
      expect(exists).toBe(true);
      expect(notExists).toBe(false);
    });
    
    it('should handle nested paths', async () => {
      await testHarness.createNote('folder/nested/file.md', 'Content');
      
      const exists = await handler.fileExists('folder/nested/file.md');
      
      expect(exists).toBe(true);
    });
  });
  
  describe('getVaultStats', () => {
    it('should get stats for empty vault', async () => {
      const stats = await handler.getVaultStats();
      
      expect(stats.totalFiles).toBe(0);
      expect(stats.totalSize).toBe(0);
      expect(stats.fileTypes).toEqual({});
    });
    
    it('should calculate vault statistics', async () => {
      await testHarness.createTestVault({
        'note1.md': { content: 'Content 1' },
        'note2.md': { content: 'Longer content here' },
        'data.json': { content: '{"key": "value"}' },
        'folder/note3.md': { content: 'More content' }
      });
      
      const stats = await handler.getVaultStats();
      
      expect(stats.totalFiles).toBe(4);
      expect(stats.totalSize).toBeGreaterThan(0);
      expect(stats.fileTypes['.md']).toBe(3);
      expect(stats.fileTypes['.json']).toBe(1);
      expect(stats.largestFile).toBeDefined();
      expect(stats.oldestFile).toBeDefined();
      expect(stats.newestFile).toBeDefined();
    });
    
    it('should handle files without extensions', async () => {
      await testHarness.createNote('README', 'Readme content');
      await testHarness.createNote('.gitignore', 'node_modules');
      
      const stats = await handler.getVaultStats();
      
      expect(stats.fileTypes['no extension']).toBe(1);
      expect(stats.fileTypes['.gitignore']).toBe(1);
    });
  });
  
  describe('error handling', () => {
    it('should handle API errors gracefully', async () => {
      // Make API claim to be connected but fail
      apiClient.isConnected = () => true;
      apiClient.request = async () => {
        throw new Error('API Error');
      };
      
      // Should fall back to file system
      const result = await handler.scanVault({});
      
      expect(result).toBeDefined();
      expect(result.files).toBeDefined();
    });
    
    it('should handle invalid patterns gracefully', async () => {
      await testHarness.createNote('test.md', 'Content');
      
      // Even with invalid pattern, should not crash
      const result = await handler.scanVault({
        patterns: ['[invalid']
      });
      
      expect(result).toBeDefined();
    });
  });
  
  describe('performance', () => {
    it('should handle large vaults efficiently', async () => {
      // Create many files
      const fileCount = 100;
      for (let i = 0; i < fileCount; i++) {
        await testHarness.createNote(`files/note${i}.md`, `Content ${i}`);
      }
      
      const start = Date.now();
      const result = await handler.scanVault({});
      const duration = Date.now() - start;
      
      expect(result.files.length).toBe(fileCount);
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });
  });
});