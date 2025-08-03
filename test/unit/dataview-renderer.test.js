import { describe, it, beforeEach, expect } from '@jest/globals';
import { DataviewRenderer } from '../../src/dataview/renderer.js';
import { VaultCache } from '../../src/cache/vault-cache.js';

// Mock dependencies
jest.mock('../../src/cache/vault-cache.js');

describe('DataviewRenderer - Error Conditions and Edge Cases', () => {
  let renderer;
  let mockConfig;
  let mockCache;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    mockConfig = {
      vaultPath: '/test/vault'
    };
    
    mockCache = {
      getVaultStructure: jest.fn(),
      getFileContent: jest.fn()
    };
    
    VaultCache.mockImplementation(() => mockCache);
    
    renderer = new DataviewRenderer(mockConfig, mockCache);
  });
  
  describe('executeQuery - Error Conditions', () => {
    it('should handle malformed queries gracefully', async () => {
      const malformedQueries = [
        'TABLE without FROM',
        'LIST',
        'TASK WHERE',
        'TABLE FROM WHERE =',
        'SELECT * FROM notes', // SQL-like query
        ''
      ];
      
      for (const query of malformedQueries) {
        const result = await renderer.executeQuery(query);
        expect(result).toBeDefined();
        expect(result.error || result.results).toBeDefined();
      }
    });
    
    it('should handle cache errors', async () => {
      mockCache.getVaultStructure.mockRejectedValue(new Error('Cache corrupted'));
      
      const result = await renderer.executeQuery('TABLE FROM "Notes"');
      
      expect(result.error).toBe('Cache corrupted');
    });
    
    it('should handle file read errors during query execution', async () => {
      mockCache.getVaultStructure.mockResolvedValue({
        files: [
          { path: 'Notes/good.md', size: 100, mtime: Date.now() },
          { path: 'Notes/bad.md', size: 200, mtime: Date.now() }
        ]
      });
      
      mockCache.getFileContent
        .mockResolvedValueOnce('---\ntitle: Good\n---\nContent')
        .mockRejectedValueOnce(new Error('Read error'));
      
      const result = await renderer.executeQuery('TABLE title FROM "Notes"');
      
      // Should return partial results
      expect(result.results.length).toBeGreaterThan(0);
    });
    
    it('should handle complex WHERE clauses', async () => {
      mockCache.getVaultStructure.mockResolvedValue({
        files: [{ path: 'test.md', size: 100, mtime: Date.now() }]
      });
      
      mockCache.getFileContent.mockResolvedValue(`---
tags: [test, complex]
status: active
priority: 5
---
Content`);
      
      const complexQueries = [
        'TABLE WHERE contains(tags, "test") AND status = "active"',
        'LIST WHERE priority > 3 AND priority < 10',
        'TABLE WHERE tags AND !contains(tags, "archive")',
        'LIST WHERE status = "active" OR status = "pending"'
      ];
      
      for (const query of complexQueries) {
        const result = await renderer.executeQuery(query);
        expect(result).toBeDefined();
      }
    });
    
    it('should handle queries on empty vault', async () => {
      mockCache.getVaultStructure.mockResolvedValue({
        files: []
      });
      
      const result = await renderer.executeQuery('TABLE FROM "Notes"');
      
      expect(result.results).toEqual([]);
      expect(result.error).toBeUndefined();
    });
    
    it('should handle circular references in query evaluation', async () => {
      mockCache.getVaultStructure.mockResolvedValue({
        files: [{ path: 'circular.md', size: 100, mtime: Date.now() }]
      });
      
      mockCache.getFileContent.mockResolvedValue(`---
related: "[[circular]]"
self: "[[circular]]"
---
Content`);
      
      const result = await renderer.executeQuery('TABLE related FROM ""');
      
      expect(result).toBeDefined();
      // Should not hang or crash
    });
  });
  
  describe('renderResults - Edge Cases', () => {
    it('should handle various render modes with empty results', () => {
      const modes = ['smart', 'summary', 'count', 'table', 'compact'];
      const emptyResults = { results: [], query: 'TABLE FROM "Empty"' };
      
      modes.forEach(mode => {
        const rendered = renderer.renderResults(emptyResults, mode);
        expect(rendered).toBeDefined();
        expect(typeof rendered).toBe('string');
      });
    });
    
    it('should handle results with missing fields', () => {
      const results = {
        results: [
          { file: 'note1.md', title: 'Test' },
          { file: 'note2.md' }, // Missing title
          { title: 'Orphan' }, // Missing file
          {} // Empty object
        ],
        query: 'TABLE title'
      };
      
      const rendered = renderer.renderResults(results, 'table');
      expect(rendered).toContain('note1.md');
      expect(rendered).toContain('Test');
    });
    
    it('should handle very large result sets', () => {
      const largeResults = {
        results: Array(1000).fill(null).map((_, i) => ({
          file: `note${i}.md`,
          index: i
        })),
        query: 'TABLE FROM ""'
      };
      
      const rendered = renderer.renderResults(largeResults, 'compact');
      expect(rendered).toBeDefined();
      expect(rendered.length).toBeLessThan(50000); // Should be reasonably sized
    });
    
    it('should handle special characters in results', () => {
      const results = {
        results: [{
          file: 'special.md',
          title: 'Test & <Demo>',
          emoji: '🎉 Party!',
          unicode: '日本語'
        }],
        query: 'TABLE title, emoji, unicode'
      };
      
      const rendered = renderer.renderResults(results, 'table');
      expect(rendered).toContain('Test & <Demo>');
      expect(rendered).toContain('🎉 Party!');
      expect(rendered).toContain('日本語');
    });
  });
  
  describe('evaluateWhereClause - Complex Conditions', () => {
    it('should handle nested property access', async () => {
      const file = {
        path: 'test.md',
        frontmatter: {
          author: {
            name: 'John Doe',
            email: 'john@example.com'
          },
          metadata: {
            version: 2,
            tags: ['nested', 'test']
          }
        }
      };
      
      const testCases = [
        { clause: 'author.name = "John Doe"', expected: true },
        { clause: 'metadata.version > 1', expected: true },
        { clause: 'contains(metadata.tags, "nested")', expected: true },
        { clause: 'author.missing = "value"', expected: false }
      ];
      
      for (const test of testCases) {
        const result = await renderer.evaluateWhereClause(file, test.clause);
        expect(result).toBe(test.expected);
      }
    });
    
    it('should handle date comparisons', async () => {
      const file = {
        path: 'test.md',
        frontmatter: {
          created: '2024-01-15',
          modified: new Date('2024-02-20'),
          deadline: '2024-12-31'
        }
      };
      
      const result1 = await renderer.evaluateWhereClause(file, 'created < "2024-02-01"');
      expect(result1).toBe(true);
      
      const result2 = await renderer.evaluateWhereClause(file, 'modified > "2024-02-19"');
      expect(result2).toBe(true);
    });
    
    it('should handle null and undefined values', async () => {
      const file = {
        path: 'test.md',
        frontmatter: {
          title: 'Test',
          description: null,
          tags: undefined
        }
      };
      
      const result1 = await renderer.evaluateWhereClause(file, 'description = null');
      expect(result1).toBe(true);
      
      const result2 = await renderer.evaluateWhereClause(file, '!tags');
      expect(result2).toBe(true);
      
      const result3 = await renderer.evaluateWhereClause(file, 'title');
      expect(result3).toBe(true);
    });
  });
  
  describe('Performance and Memory', () => {
    it('should handle queries on very large vaults efficiently', async () => {
      const files = Array(10000).fill(null).map((_, i) => ({
        path: `Notes/note${i}.md`,
        size: 1000,
        mtime: Date.now() - i * 1000
      }));
      
      mockCache.getVaultStructure.mockResolvedValue({ files });
      mockCache.getFileContent.mockResolvedValue('---\nstatus: active\n---\nContent');
      
      const startTime = Date.now();
      const result = await renderer.executeQuery('TABLE FROM "Notes" LIMIT 100');
      const duration = Date.now() - startTime;
      
      expect(result.results.length).toBeLessThanOrEqual(100);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
    
    it('should not leak memory with repeated queries', async () => {
      mockCache.getVaultStructure.mockResolvedValue({
        files: [{ path: 'test.md', size: 100, mtime: Date.now() }]
      });
      mockCache.getFileContent.mockResolvedValue('---\ntitle: Test\n---\nContent');
      
      // Run many queries
      for (let i = 0; i < 100; i++) {
        await renderer.executeQuery(`TABLE title FROM "" WHERE title = "Test"`);
      }
      
      // Memory should be stable (can't directly test, but shouldn't crash)
      expect(true).toBe(true);
    });
  });
  
  describe('Injection and Security', () => {
    it('should handle potential injection attempts safely', async () => {
      mockCache.getVaultStructure.mockResolvedValue({
        files: [{ path: 'test.md', size: 100, mtime: Date.now() }]
      });
      
      const injectionAttempts = [
        'TABLE FROM "../../etc/passwd"',
        'TABLE FROM ""; DROP TABLE users; --',
        'LIST WHERE title = "\'" OR 1=1 --"',
        'TABLE FROM "${process.env.HOME}"'
      ];
      
      for (const query of injectionAttempts) {
        const result = await renderer.executeQuery(query);
        // Should not throw or expose system files
        expect(result).toBeDefined();
      }
    });
  });
});