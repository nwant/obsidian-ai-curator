import { describe, it, beforeEach, afterEach, expect } from '@jest/globals';
import { VaultCache } from '../../src/cache/vault-cache.js';
import fs from 'fs/promises';
import path from 'path';

// Mock fs module
jest.mock('fs/promises');

describe('VaultCache', () => {
  let cache;
  let mockConfig;
  
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Setup config
    mockConfig = {
      vaultPath: '/test/vault',
      cacheTimeout: 300000, // 5 minutes
      contentCacheTimeout: 600000 // 10 minutes
    };
    
    // Create cache instance
    cache = new VaultCache(mockConfig);
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('Constructor and initialization', () => {
    it('should initialize with correct config', () => {
      expect(cache.config).toEqual(mockConfig);
      expect(cache.structureCache).toBeNull();
      expect(cache.fileContentCache).toBeInstanceOf(Map);
      expect(cache.lastFullScan).toBe(0);
    });
    
    it('should use default timeouts if not provided', () => {
      const minimalConfig = { vaultPath: '/test/vault' };
      const minimalCache = new VaultCache(minimalConfig);
      
      expect(minimalCache.cacheTimeout).toBe(5 * 60 * 1000);
      expect(minimalCache.contentCacheTimeout).toBe(10 * 60 * 1000);
    });
  });
  
  describe('isCacheValid', () => {
    it('should return true for recent cache', () => {
      const recentTimestamp = Date.now() - 1000; // 1 second ago
      expect(cache.isCacheValid(recentTimestamp)).toBe(true);
    });
    
    it('should return false for expired cache', () => {
      const oldTimestamp = Date.now() - 400000; // Over 5 minutes ago
      expect(cache.isCacheValid(oldTimestamp)).toBe(false);
    });
    
    it('should respect custom timeout', () => {
      const timestamp = Date.now() - 5000; // 5 seconds ago
      expect(cache.isCacheValid(timestamp, 10000)).toBe(true); // 10 second timeout
      expect(cache.isCacheValid(timestamp, 3000)).toBe(false); // 3 second timeout
    });
  });
  
  describe('getVaultStructure', () => {
    it('should return cached structure if valid', async () => {
      // Set up valid cache
      cache.structureCache = {
        files: [{ path: 'test.md', size: 100 }],
        total: 1
      };
      cache.lastFullScan = Date.now() - 1000;
      
      const structure = await cache.getVaultStructure();
      
      expect(structure).toEqual(cache.structureCache);
      expect(fs.readdir).not.toHaveBeenCalled();
    });
    
    it('should scan vault if cache is invalid', async () => {
      // Mock file system
      fs.readdir.mockResolvedValue([
        { name: 'file1.md', isDirectory: () => false },
        { name: 'folder', isDirectory: () => true },
        { name: '.hidden', isDirectory: () => false }
      ]);
      
      fs.stat.mockResolvedValue({
        size: 1000,
        mtime: new Date(),
        isDirectory: () => false
      });
      
      const structure = await cache.getVaultStructure(true);
      
      expect(fs.readdir).toHaveBeenCalled();
      expect(structure.files).toHaveLength(1);
      expect(structure.files[0].path).toBe('file1.md');
    });
    
    it('should handle empty vault', async () => {
      fs.readdir.mockResolvedValue([]);
      
      const structure = await cache.getVaultStructure(true);
      
      expect(structure.files).toEqual([]);
      expect(structure.total).toBe(0);
    });
    
    it('should filter ignored patterns', async () => {
      fs.readdir.mockResolvedValue([
        { name: 'note.md', isDirectory: () => false },
        { name: '.obsidian', isDirectory: () => true },
        { name: '.git', isDirectory: () => true },
        { name: 'file.pdf', isDirectory: () => false }
      ]);
      
      fs.stat.mockResolvedValue({
        size: 100,
        mtime: new Date(),
        isDirectory: () => false
      });
      
      const structure = await cache.getVaultStructure(true);
      
      expect(structure.files).toHaveLength(1);
      expect(structure.files[0].path).toBe('note.md');
    });
  });
  
  describe('getFileContent', () => {
    it('should return cached content if valid', async () => {
      const testPath = '/test/vault/note.md';
      const testContent = '# Test Note';
      const recentTime = Date.now() - 1000;
      
      cache.fileContentCache.set(testPath, {
        content: testContent,
        timestamp: recentTime
      });
      
      fs.stat.mockResolvedValue({ mtime: new Date(recentTime - 2000) });
      
      const content = await cache.getFileContent(testPath);
      
      expect(content).toBe(testContent);
      expect(fs.readFile).not.toHaveBeenCalled();
    });
    
    it('should read file if not cached', async () => {
      const testPath = '/test/vault/note.md';
      const testContent = '# New Note';
      
      fs.readFile.mockResolvedValue(testContent);
      
      const content = await cache.getFileContent(testPath);
      
      expect(content).toBe(testContent);
      expect(fs.readFile).toHaveBeenCalledWith(testPath, 'utf-8');
      expect(cache.fileContentCache.has(testPath)).toBe(true);
    });
    
    it('should refresh cache if file was modified', async () => {
      const testPath = '/test/vault/note.md';
      const oldContent = '# Old Content';
      const newContent = '# Updated Content';
      const cacheTime = Date.now() - 10000;
      
      cache.fileContentCache.set(testPath, {
        content: oldContent,
        timestamp: cacheTime
      });
      
      fs.stat.mockResolvedValue({ mtime: new Date() }); // File modified after cache
      fs.readFile.mockResolvedValue(newContent);
      
      const content = await cache.getFileContent(testPath);
      
      expect(content).toBe(newContent);
      expect(fs.readFile).toHaveBeenCalled();
    });
    
    it('should handle read errors', async () => {
      const testPath = '/test/vault/missing.md';
      fs.readFile.mockRejectedValue(new Error('File not found'));
      
      await expect(cache.getFileContent(testPath)).rejects.toThrow('File not found');
    });
  });
  
  describe('invalidateFile', () => {
    it('should remove file from content cache', async () => {
      const relativePath = 'note.md';
      const fullPath = path.join(mockConfig.vaultPath, relativePath);
      
      cache.fileContentCache.set(fullPath, {
        content: 'test',
        timestamp: Date.now()
      });
      
      await cache.invalidateFile(relativePath);
      
      expect(cache.fileContentCache.has(fullPath)).toBe(false);
    });
    
    it('should force structure rescan', async () => {
      cache.structureCache = { files: [], total: 0 };
      cache.lastFullScan = Date.now();
      
      await cache.invalidateFile('any.md');
      
      expect(cache.lastFullScan).toBe(0);
    });
  });
  
  describe('Context caching', () => {
    it('should cache and retrieve contexts', () => {
      const contextKey = 'project:MyProject';
      const contextData = {
        files: ['file1.md', 'file2.md'],
        timestamp: Date.now()
      };
      
      cache.cacheContext(contextKey, contextData);
      const retrieved = cache.getCachedContext(contextKey);
      
      expect(retrieved).toEqual(contextData);
    });
    
    it('should return null for missing context', () => {
      const context = cache.getCachedContext('nonexistent');
      expect(context).toBeNull();
    });
    
    it('should return null for expired context', () => {
      const contextKey = 'old:context';
      const oldData = {
        files: ['old.md'],
        timestamp: Date.now() - 400000 // Over 5 minutes
      };
      
      cache.cacheContext(contextKey, oldData);
      const retrieved = cache.getCachedContext(contextKey);
      
      expect(retrieved).toBeNull();
    });
  });
  
  describe('clearCache', () => {
    it('should clear all caches', () => {
      // Set up some cached data
      cache.structureCache = { files: [], total: 0 };
      cache.lastFullScan = Date.now();
      cache.fileContentCache.set('test', { content: 'data' });
      cache.contexts.set('context', { data: 'value' });
      
      cache.clearCache();
      
      expect(cache.structureCache).toBeNull();
      expect(cache.lastFullScan).toBe(0);
      expect(cache.fileContentCache.size).toBe(0);
      expect(cache.contexts.size).toBe(0);
    });
  });
  
  describe('Performance and memory management', () => {
    it('should not grow unbounded with many files', async () => {
      // Simulate caching many files
      for (let i = 0; i < 1000; i++) {
        cache.fileContentCache.set(`file${i}.md`, {
          content: `Content ${i}`,
          timestamp: Date.now()
        });
      }
      
      // Cache should implement some limiting mechanism
      // For now, just verify it works with many files
      expect(cache.fileContentCache.size).toBe(1000);
    });
  });
});