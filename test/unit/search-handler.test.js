import { describe, it, beforeEach, afterEach, expect } from '@jest/globals';
import { SearchHandler } from '../../src/handlers/search-handler.js';
import { testHarness } from '../test-harness.js';

describe('SearchHandler', () => {
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
      getVaultStructure: async () => ({
        files: [],
        total: 0
      }),
      getFileContent: async (path) => {
        const notes = await testHarness.getAllNotes();
        const note = notes.find(n => n.path === path);
        if (note) return note.content;
        throw new Error(`File not found: ${path}`);
      }
    };
    
    // Mock API client
    apiClient = {
      isConnected: () => false,
      request: async () => ({ success: false })
    };
    
    handler = new SearchHandler(config, cache, apiClient);
  });
  
  afterEach(async () => {
    await testHarness.teardown();
  });
  
  describe('searchContent', () => {
    beforeEach(async () => {
      await testHarness.createTestVault({
        'note1.md': {
          content: 'This is a test note about JavaScript programming.',
          frontmatter: { tags: ['programming'] }
        },
        'note2.md': {
          content: 'Another note discussing Python and machine learning.',
          frontmatter: { tags: ['programming', 'ml'] }
        },
        'note3.md': {
          content: 'JavaScript is great for web development.',
          frontmatter: { tags: ['web'] }
        }
      });
      
      // Update cache mock
      cache.getVaultStructure = async () => ({
        files: [
          { path: 'note1.md', size: 100, mtime: new Date() },
          { path: 'note2.md', size: 100, mtime: new Date() },
          { path: 'note3.md', size: 100, mtime: new Date() }
        ],
        total: 3
      });
    });
    
    it('should find matches for simple query', async () => {
      const result = await handler.searchContent({
        query: 'JavaScript'
      });
      
      expect(result.matches.length).toBe(2);
      expect(result.totalMatches).toBe(2);
      expect(result.matches[0].file).toBe('note1.md');
      expect(result.matches[1].file).toBe('note3.md');
    });
    
    it('should respect maxResults limit', async () => {
      const result = await handler.searchContent({
        query: 'note',
        maxResults: 1
      });
      
      expect(result.matches.length).toBe(1);
      expect(result.totalMatches).toBeGreaterThanOrEqual(1);
    });
    
    it('should include context lines', async () => {
      const result = await handler.searchContent({
        query: 'JavaScript',
        contextLines: 1
      });
      
      expect(result.matches[0].context).toBeDefined();
      expect(result.matches[0].context.before).toBeDefined();
      expect(result.matches[0].context.after).toBeDefined();
    });
    
    it('should handle case-insensitive search', async () => {
      const result = await handler.searchContent({
        query: 'javascript' // lowercase
      });
      
      expect(result.matches.length).toBe(2);
    });
    
    it('should handle no matches', async () => {
      const result = await handler.searchContent({
        query: 'nonexistent'
      });
      
      expect(result.matches).toEqual([]);
      expect(result.totalMatches).toBe(0);
    });
    
    it('should handle regex patterns', async () => {
      const result = await handler.searchContent({
        query: 'Java[Ss]cript'
      });
      
      expect(result.matches.length).toBe(2);
    });
  });
  
  describe('findByMetadata', () => {
    beforeEach(async () => {
      await testHarness.createTestVault({
        'project1.md': {
          content: 'Project 1',
          frontmatter: { 
            status: 'active',
            priority: 5,
            tags: ['project']
          }
        },
        'project2.md': {
          content: 'Project 2',
          frontmatter: { 
            status: 'completed',
            priority: 3,
            tags: ['project', 'done']
          }
        },
        'task1.md': {
          content: 'Task 1',
          frontmatter: { 
            status: 'active',
            priority: 8,
            tags: ['task']
          }
        }
      });
      
      cache.getVaultStructure = async () => ({
        files: [
          { path: 'project1.md', size: 100, mtime: new Date() },
          { path: 'project2.md', size: 100, mtime: new Date() },
          { path: 'task1.md', size: 100, mtime: new Date() }
        ],
        total: 3
      });
    });
    
    it('should find by exact match', async () => {
      const result = await handler.findByMetadata({
        frontmatter: { status: 'active' }
      });
      
      expect(result.files.length).toBe(2);
      expect(result.files.some(f => f.path === 'project1.md')).toBe(true);
      expect(result.files.some(f => f.path === 'task1.md')).toBe(true);
    });
    
    it('should support $gt operator', async () => {
      const result = await handler.findByMetadata({
        frontmatter: { priority: { $gt: 4 } }
      });
      
      expect(result.files.length).toBe(2);
      expect(result.files.every(f => f.frontmatter.priority > 4)).toBe(true);
    });
    
    it('should support $in operator', async () => {
      const result = await handler.findByMetadata({
        frontmatter: { 
          tags: { $in: ['project'] } 
        }
      });
      
      expect(result.files.length).toBe(2);
      expect(result.files.every(f => f.frontmatter.tags.includes('project'))).toBe(true);
    });
    
    it('should support multiple conditions', async () => {
      const result = await handler.findByMetadata({
        frontmatter: { 
          status: 'active',
          priority: { $gte: 5 }
        }
      });
      
      expect(result.files.length).toBe(2);
      expect(result.files.every(f => 
        f.frontmatter.status === 'active' && 
        f.frontmatter.priority >= 5
      )).toBe(true);
    });
    
    it('should handle empty results', async () => {
      const result = await handler.findByMetadata({
        frontmatter: { status: 'archived' }
      });
      
      expect(result.files).toEqual([]);
      expect(result.total).toBe(0);
    });
    
    it('should handle word count filters', async () => {
      const result = await handler.findByMetadata({
        minWords: 1,
        maxWords: 10
      });
      
      expect(result.files.length).toBeGreaterThan(0);
    });
  });
  
  describe('queryDataview', () => {
    it('should execute dataview query', async () => {
      const result = await handler.queryDataview({
        query: 'TABLE status FROM "Projects"'
      });
      
      expect(result.type).toBe('table');
      expect(result.headers).toBeDefined();
      expect(result.rows).toBeDefined();
    });
    
    it('should handle render modes', async () => {
      const result = await handler.queryDataview({
        query: 'LIST FROM #tag',
        renderMode: 'compact'
      });
      
      expect(result.renderMode).toBe('compact');
    });
    
    it('should use context path', async () => {
      const result = await handler.queryDataview({
        query: 'TABLE FROM .',
        contextPath: 'Projects'
      });
      
      expect(result).toBeDefined();
    });
  });
  
  describe('error handling', () => {
    it('should handle invalid regex in search', async () => {
      await expect(handler.searchContent({
        query: '[invalid'
      })).rejects.toThrow();
    });
    
    it('should handle missing frontmatter gracefully', async () => {
      await testHarness.createNote('no-fm.md', 'Content without frontmatter');
      
      cache.getVaultStructure = async () => ({
        files: [{ path: 'no-fm.md', size: 100, mtime: new Date() }],
        total: 1
      });
      
      const result = await handler.findByMetadata({
        frontmatter: { any: 'value' }
      });
      
      expect(result.files).toEqual([]);
    });
    
    it('should handle file read errors', async () => {
      cache.getFileContent = async () => {
        throw new Error('Read error');
      };
      
      const result = await handler.searchContent({
        query: 'test'
      });
      
      expect(result.matches).toEqual([]);
    });
  });
  
  describe('performance', () => {
    it('should handle large vaults efficiently', async () => {
      // Create many files
      const files = {};
      for (let i = 0; i < 100; i++) {
        files[`note${i}.md`] = {
          content: `Note ${i} with some searchable content`,
          frontmatter: { id: i }
        };
      }
      await testHarness.createTestVault(files);
      
      // Update cache
      cache.getVaultStructure = async () => ({
        files: Object.keys(files).map(path => ({
          path,
          size: 100,
          mtime: new Date()
        })),
        total: 100
      });
      
      const start = Date.now();
      const result = await handler.searchContent({
        query: 'searchable',
        maxResults: 10
      });
      const duration = Date.now() - start;
      
      expect(result.matches.length).toBe(10);
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });
  });
});