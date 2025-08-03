import { describe, it, beforeEach, expect } from '@jest/globals';
import { VaultCache } from '../../src/cache/vault-cache.js';
import { testHarness } from '../test-harness.js';

describe('VaultCache - Simple Tests', () => {
  let cache;
  let config;
  
  beforeEach(async () => {
    await testHarness.setup();
    config = {
      vaultPath: testHarness.testVaultPath,
      cacheEnabled: true,
      cacheTTL: 5 * 60 * 1000
    };
    cache = new VaultCache(config);
  });
  
  afterEach(async () => {
    await testHarness.teardown();
  });
  
  describe('basic functionality', () => {
    it('should initialize with config values', () => {
      expect(cache.vaultPath).toBe(config.vaultPath);
      expect(cache.cacheEnabled).toBe(true);
      expect(cache.cacheTTL).toBe(5 * 60 * 1000);
    });
    
    it('should scan empty vault', async () => {
      const result = await cache.getVaultStructure();
      expect(result.files).toEqual([]);
      expect(result.total).toBe(0);
    });
    
    it('should scan vault with files', async () => {
      // Create test files
      await testHarness.createNote('test1.md', '# Test 1');
      await testHarness.createNote('folder/test2.md', '# Test 2');
      
      const result = await cache.getVaultStructure();
      
      expect(result.files.length).toBe(2);
      expect(result.total).toBe(2);
      expect(result.files.some(f => f.path.includes('test1.md'))).toBe(true);
      expect(result.files.some(f => f.path.includes('test2.md'))).toBe(true);
    });
    
    it('should cache vault structure', async () => {
      await testHarness.createNote('cached.md', 'Content');
      
      // First scan
      const result1 = await cache.getVaultStructure();
      const scanTime1 = Date.now();
      
      // Second scan (should use cache)
      const result2 = await cache.getVaultStructure();
      const scanTime2 = Date.now();
      
      expect(result1.files).toEqual(result2.files);
      expect(scanTime2 - scanTime1).toBeLessThan(10); // Should be fast
    });
    
    it('should force refresh when requested', async () => {
      await testHarness.createNote('initial.md', 'Initial');
      
      // First scan
      const result1 = await cache.getVaultStructure();
      expect(result1.files.length).toBe(1);
      
      // Add another file
      await testHarness.createNote('added.md', 'Added');
      
      // Scan without force (uses cache)
      const result2 = await cache.getVaultStructure();
      expect(result2.files.length).toBe(1);
      
      // Force refresh
      const result3 = await cache.getVaultStructure(true);
      expect(result3.files.length).toBe(2);
    });
  });
  
  describe('file content caching', () => {
    it('should read and cache file content', async () => {
      await testHarness.createNote('content.md', '# Header\n\nBody text');
      
      const content = await cache.getFileContent('content.md');
      expect(content).toContain('# Header');
      expect(content).toContain('Body text');
    });
    
    it('should use cached content on second read', async () => {
      await testHarness.createNote('cached-content.md', 'Original');
      
      // First read
      const content1 = await cache.getFileContent('cached-content.md');
      expect(content1).toBe('Original');
      
      // Modify file directly (bypass cache)
      await testHarness.createNote('cached-content.md', 'Modified');
      
      // Second read (should still return cached)
      const content2 = await cache.getFileContent('cached-content.md');
      expect(content2).toBe('Original');
    });
    
    it('should handle missing files', async () => {
      await expect(cache.getFileContent('nonexistent.md'))
        .rejects.toThrow();
    });
  });
  
  describe('cache invalidation', () => {
    it('should invalidate specific file', async () => {
      await testHarness.createNote('invalidate.md', 'Original');
      
      // Read and cache
      const content1 = await cache.getFileContent('invalidate.md');
      expect(content1).toBe('Original');
      
      // Modify and invalidate
      await testHarness.createNote('invalidate.md', 'Updated');
      cache.invalidateFile('invalidate.md');
      
      // Read again (should get new content)
      const content2 = await cache.getFileContent('invalidate.md');
      expect(content2).toBe('Updated');
    });
    
    it('should invalidate all caches', async () => {
      await testHarness.createNote('file1.md', 'File 1');
      await testHarness.createNote('file2.md', 'File 2');
      
      // Cache structure and files
      await cache.getVaultStructure();
      await cache.getFileContent('file1.md');
      await cache.getFileContent('file2.md');
      
      // Add new file and modify existing
      await testHarness.createNote('file3.md', 'File 3');
      await testHarness.createNote('file1.md', 'File 1 Updated');
      
      // Invalidate all
      cache.invalidateAll();
      
      // Get fresh data
      const structure = await cache.getVaultStructure();
      const content1 = await cache.getFileContent('file1.md');
      
      expect(structure.files.length).toBe(3);
      expect(content1).toBe('File 1 Updated');
    });
  });
  
  describe('cache behavior with disabled cache', () => {
    it('should bypass cache when disabled', async () => {
      const noCache = new VaultCache({
        ...config,
        cacheEnabled: false
      });
      
      await testHarness.createNote('nocache.md', 'Initial');
      
      // First read
      const content1 = await noCache.getFileContent('nocache.md');
      expect(content1).toBe('Initial');
      
      // Modify file
      await testHarness.createNote('nocache.md', 'Modified');
      
      // Second read (should get new content)
      const content2 = await noCache.getFileContent('nocache.md');
      expect(content2).toBe('Modified');
    });
  });
  
  describe('concurrent operations', () => {
    it('should handle concurrent file reads', async () => {
      await testHarness.createNote('concurrent.md', 'Concurrent content');
      
      // Start multiple reads simultaneously
      const promises = Array(10).fill(null).map(() => 
        cache.getFileContent('concurrent.md')
      );
      
      const results = await Promise.all(promises);
      
      // All should return same content
      expect(results.every(r => r === 'Concurrent content')).toBe(true);
    });
    
    it('should handle concurrent structure scans', async () => {
      // Create some files
      for (let i = 0; i < 5; i++) {
        await testHarness.createNote(`file${i}.md`, `Content ${i}`);
      }
      
      // Start multiple scans
      const promises = Array(5).fill(null).map(() => 
        cache.getVaultStructure()
      );
      
      const results = await Promise.all(promises);
      
      // All should return same structure
      expect(results.every(r => r.total === 5)).toBe(true);
    });
  });
});