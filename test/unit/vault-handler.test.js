import { describe, it, beforeEach, afterEach, expect } from '@jest/globals';
import { VaultHandler } from '../../src/handlers/vault-handler.js';
import { VaultCache } from '../../src/cache/vault-cache.js';
import { ObsidianAPIClient } from '../../src/obsidian-api-client.js';
import fs from 'fs/promises';
import { glob } from 'glob';

// Mock dependencies
jest.mock('../../src/cache/vault-cache.js', () => ({
  VaultCache: jest.fn()
}));
jest.mock('../../src/obsidian-api-client.js', () => ({
  ObsidianAPIClient: jest.fn()
}));
jest.mock('fs/promises');
jest.mock('glob', () => ({
  glob: {
    minimatch: jest.fn((file, pattern) => {
      // Simple pattern matching for tests
      return file.includes(pattern.replace('**/', '').replace('*', ''));
    })
  }
}));

describe('VaultHandler - Error Conditions and Edge Cases', () => {
  let handler;
  let mockConfig;
  let mockCache;
  let mockApiClient;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    mockConfig = {
      vaultPath: '/test/vault'
    };
    
    mockCache = {
      getVaultStructure: jest.fn(),
      getFileContent: jest.fn(),
      invalidateFile: jest.fn()
    };
    
    mockApiClient = {
      isConnected: jest.fn().mockReturnValue(false),
      request: jest.fn()
    };
    
    VaultCache.mockImplementation(() => mockCache);
    ObsidianAPIClient.mockImplementation(() => mockApiClient);
    
    handler = new VaultHandler(mockConfig, mockCache, mockApiClient);
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('scanVault - Error Conditions', () => {
    it('should handle API connection errors gracefully', async () => {
      mockApiClient.isConnected.mockReturnValue(true);
      mockApiClient.request.mockRejectedValue(new Error('API timeout'));
      
      mockCache.getVaultStructure.mockResolvedValue({
        files: [{ path: 'fallback.md', size: 100, mtime: Date.now() }],
        total: 1
      });
      
      const result = await handler.scanVault({ patterns: ['*.md'] });
      
      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('fallback.md');
      expect(console.error).toHaveBeenCalledWith(
        'API scan failed, falling back to file system:',
        'API timeout'
      );
    });
    
    it('should handle empty vault gracefully', async () => {
      mockCache.getVaultStructure.mockResolvedValue({
        files: [],
        total: 0
      });
      
      const result = await handler.scanVault({});
      
      expect(result.files).toEqual([]);
      expect(result.total).toBe(0);
    });
    
    it('should handle file read errors during enrichment', async () => {
      mockCache.getVaultStructure.mockResolvedValue({
        files: [
          { path: 'good.md', size: 100, mtime: Date.now() },
          { path: 'corrupt.md', size: 200, mtime: Date.now() }
        ]
      });
      
      fs.readFile
        .mockResolvedValueOnce('# Good content')
        .mockRejectedValueOnce(new Error('File corrupted'));
      
      const result = await handler.scanVault({ includePreview: true });
      
      expect(result.files).toHaveLength(2);
      expect(result.files[0].preview).toBeDefined();
      expect(result.files[1].preview).toBeUndefined();
    });
    
    it('should handle invalid glob patterns', async () => {
      mockCache.getVaultStructure.mockResolvedValue({
        files: [{ path: 'test.md', size: 100, mtime: Date.now() }]
      });
      
      glob.minimatch = jest.fn().mockImplementation(() => {
        throw new Error('Invalid pattern');
      });
      
      await expect(handler.scanVault({ patterns: ['[invalid'] }))
        .rejects.toThrow();
    });
    
    it('should handle very large file lists with limit', async () => {
      const largeFileList = Array(10000).fill(null).map((_, i) => ({
        path: `file${i}.md`,
        size: 100,
        mtime: Date.now() - i * 1000
      }));
      
      mockCache.getVaultStructure.mockResolvedValue({
        files: largeFileList,
        total: largeFileList.length
      });
      
      const result = await handler.scanVault({ limit: 100 });
      
      expect(result.files).toHaveLength(100);
      expect(result.total).toBe(100);
    });
    
    it('should handle malformed frontmatter gracefully', async () => {
      mockCache.getVaultStructure.mockResolvedValue({
        files: [{ path: 'malformed.md', size: 100, mtime: Date.now() }]
      });
      
      fs.readFile.mockResolvedValue('---\ninvalid: yaml: here\n---\nContent');
      
      const result = await handler.scanVault({ includeFrontmatter: true });
      
      expect(result.files).toHaveLength(1);
      // Should handle error without crashing
    });
  });
  
  describe('fileExists - Edge Cases', () => {
    it('should handle permission denied errors', async () => {
      fs.access.mockRejectedValue(new Error('EACCES: permission denied'));
      
      const exists = await handler.fileExists('protected.md');
      expect(exists).toBe(false);
    });
    
    it('should handle very long file paths', async () => {
      const longPath = 'a/'.repeat(100) + 'file.md';
      fs.access.mockResolvedValue();
      
      const exists = await handler.fileExists(longPath);
      expect(exists).toBe(true);
    });
    
    it('should handle null/undefined paths', async () => {
      expect(await handler.fileExists(null)).toBe(false);
      expect(await handler.fileExists(undefined)).toBe(false);
      expect(await handler.fileExists('')).toBe(false);
    });
  });
  
  describe('getVaultStats - Error Conditions', () => {
    it('should handle cache errors', async () => {
      mockCache.getVaultStructure.mockRejectedValue(new Error('Cache corrupted'));
      
      await expect(handler.getVaultStats()).rejects.toThrow('Cache corrupted');
    });
    
    it('should handle files with missing metadata', async () => {
      mockCache.getVaultStructure.mockResolvedValue({
        files: [
          { path: 'normal.md', size: 100, mtime: Date.now() },
          { path: 'no-size.md', mtime: Date.now() },
          { path: 'no-mtime.md', size: 200 }
        ]
      });
      
      const stats = await handler.getVaultStats();
      
      expect(stats.totalFiles).toBe(3);
      expect(stats.totalSize).toBe(300); // Should handle missing size as 0
    });
    
    it('should handle empty extensions correctly', async () => {
      mockCache.getVaultStructure.mockResolvedValue({
        files: [
          { path: 'README', size: 100, mtime: Date.now() },
          { path: '.gitignore', size: 50, mtime: Date.now() }
        ]
      });
      
      const stats = await handler.getVaultStats();
      
      expect(stats.fileTypes['no extension']).toBe(1);
      expect(stats.fileTypes['.gitignore']).toBe(1);
    });
  });
  
  describe('Performance and Concurrency', () => {
    it('should handle concurrent scan requests', async () => {
      mockCache.getVaultStructure.mockResolvedValue({
        files: Array(100).fill({ path: 'test.md', size: 100, mtime: Date.now() })
      });
      
      // Launch multiple concurrent scans
      const promises = Array(10).fill(null).map(() => 
        handler.scanVault({ patterns: ['*.md'] })
      );
      
      const results = await Promise.all(promises);
      
      results.forEach(result => {
        expect(result.files).toHaveLength(100);
      });
    });
    
    it('should handle rapid cache invalidation', async () => {
      const files = Array(1000).fill(null).map((_, i) => ({
        path: `file${i}.md`,
        size: 100,
        mtime: Date.now()
      }));
      
      mockCache.getVaultStructure
        .mockResolvedValueOnce({ files: files.slice(0, 500), total: 500 })
        .mockResolvedValueOnce({ files: files.slice(0, 600), total: 600 })
        .mockResolvedValueOnce({ files, total: 1000 });
      
      // Simulate rapid changes
      const result1 = await handler.scanVault({ useCache: false });
      const result2 = await handler.scanVault({ useCache: false });
      const result3 = await handler.scanVault({ useCache: false });
      
      expect(result1.total).toBe(500);
      expect(result2.total).toBe(600);
      expect(result3.total).toBe(1000);
    });
  });
  
  describe('Special Characters and Encoding', () => {
    it('should handle files with unicode characters', async () => {
      mockCache.getVaultStructure.mockResolvedValue({
        files: [
          { path: '日本語.md', size: 100, mtime: Date.now() },
          { path: 'émojis 😀.md', size: 200, mtime: Date.now() },
          { path: 'Ñoño.md', size: 150, mtime: Date.now() }
        ]
      });
      
      const result = await handler.scanVault({});
      
      expect(result.files).toHaveLength(3);
      expect(result.files.map(f => f.path)).toContain('日本語.md');
      expect(result.files.map(f => f.path)).toContain('émojis 😀.md');
    });
    
    it('should handle special file system characters', async () => {
      mockCache.getVaultStructure.mockResolvedValue({
        files: [
          { path: 'file (1).md', size: 100, mtime: Date.now() },
          { path: 'file [draft].md', size: 100, mtime: Date.now() },
          { path: 'file & notes.md', size: 100, mtime: Date.now() }
        ]
      });
      
      const result = await handler.scanVault({ patterns: ['*\\[*\\]*'] });
      
      expect(result.files.some(f => f.path.includes('[draft]'))).toBe(true);
    });
  });
});