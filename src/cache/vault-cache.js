import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export class VaultCache {
  constructor(config) {
    this.config = config || {};
    this.vaultPath = this.config.vaultPath; // Expected by tests
    this.cacheEnabled = this.config.cacheEnabled !== false; // Default true
    this.cacheTTL = this.config.cacheTTL || 5 * 60 * 1000; // Expected by tests
    
    this.structure = new Map();     // file paths, metadata
    this.content = new Map();       // recent file contents with LRU
    this.contexts = new Map();      // computed context sets
    this.searchIndex = null;        // inverted index
    this.lastFullScan = 0;
    this.maxContentCacheSize = 100;
    this.maxContextCacheSize = 20;
    this.cacheTimeout = this.cacheTTL; // Use configured TTL
    this.contentCacheTimeout = 10 * 60 * 1000; // 10 minutes
  }

  // Generate cache key for contexts
  contextKey(params) {
    return crypto.createHash('md5').update(JSON.stringify(params)).digest('hex');
  }

  // Check if cache is still valid
  isCacheValid(timestamp, timeout = this.cacheTimeout) {
    return Date.now() - timestamp < timeout;
  }

  // Get vault structure with smart caching
  async getVaultStructure(forceRefresh = false) {
    if (!forceRefresh && this.isCacheValid(this.lastFullScan)) {
      return Array.from(this.structure.values());
    }

    // Full scan needed
    await this.scanVault();
    return Array.from(this.structure.values());
  }

  // Scan vault and build structure cache
  async scanVault() {
    const startTime = Date.now();
    this.structure.clear();
    
    const scanDir = async (dir, baseDir = '') => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.join(baseDir, entry.name);
        
        if (entry.isDirectory() && !this.shouldIgnore(entry.name)) {
          await scanDir(fullPath, relativePath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          const stats = await fs.stat(fullPath);
          
          this.structure.set(relativePath, {
            path: relativePath,
            fullPath,
            size: stats.size,
            modified: stats.mtime.toISOString(),
            mtime: stats.mtime.getTime()
          });
        }
      }
    };
    
    await scanDir(this.config.vaultPath);
    this.lastFullScan = Date.now();
    
    console.error(`Vault scan completed in ${Date.now() - startTime}ms, found ${this.structure.size} files`);
  }

  // Get file content with caching
  async getFileContent(relativePath, includeMetadata = false) {
    const cacheEntry = this.content.get(relativePath);
    const fileInfo = this.structure.get(relativePath);
    
    if (!fileInfo) {
      throw new Error(`File not found: ${relativePath}`);
    }
    
    // Check if cached content is still valid
    if (cacheEntry && 
        cacheEntry.mtime === fileInfo.mtime && 
        this.isCacheValid(cacheEntry.timestamp, this.contentCacheTimeout)) {
      return cacheEntry.data;
    }
    
    // Read file and cache it
    const fullPath = path.join(this.config.vaultPath, relativePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    
    // Extract preview (first 200 chars or first paragraph)
    const firstNewline = content.indexOf('\n\n');
    const preview = firstNewline > 0 && firstNewline < 200 
      ? content.substring(0, firstNewline)
      : content.substring(0, 200);
    
    const data = {
      content,
      preview,
      relativePath
    };
    
    // Cache management - LRU style
    if (this.content.size >= this.maxContentCacheSize) {
      // Remove oldest entry
      const oldestKey = this.content.keys().next().value;
      this.content.delete(oldestKey);
    }
    
    this.content.set(relativePath, {
      data,
      mtime: fileInfo.mtime,
      timestamp: Date.now()
    });
    
    return data;
  }

  // Get or compute context set
  async getContext(params, computeFn) {
    const key = this.contextKey(params);
    const cached = this.contexts.get(key);
    
    if (cached && this.isCacheValid(cached.timestamp)) {
      return cached.data;
    }
    
    // Compute context
    const data = await computeFn();
    
    // Cache management
    if (this.contexts.size >= this.maxContextCacheSize) {
      const oldestKey = this.contexts.keys().next().value;
      this.contexts.delete(oldestKey);
    }
    
    this.contexts.set(key, {
      data,
      timestamp: Date.now()
    });
    
    return data;
  }

  // Invalidate caches for a specific file
  invalidate(relativePath) {
    this.structure.delete(relativePath);
    this.content.delete(relativePath);
    // Clear all contexts as they might be affected
    this.contexts.clear();
  }

  // Clear all caches
  clear() {
    this.structure.clear();
    this.content.clear();
    this.contexts.clear();
    this.searchIndex = null;
    this.lastFullScan = 0;
  }

  // Check if path should be ignored
  shouldIgnore(name) {
    const ignorePatterns = this.config.ignorePatterns || [
      '.git', '.obsidian', '.trash', 'node_modules', '.DS_Store'
    ];
    return ignorePatterns.includes(name) || name.startsWith('.');
  }

  // Get cache statistics
  getStats() {
    return {
      structureSize: this.structure.size,
      contentCacheSize: this.content.size,
      contextCacheSize: this.contexts.size,
      lastFullScan: new Date(this.lastFullScan).toISOString(),
      cacheAge: Date.now() - this.lastFullScan
    };
  }
}