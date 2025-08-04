import { describe, it, beforeEach, afterEach, expect } from '@jest/globals';
import { AutoMetricsCollector } from '../../src/metrics/auto-collector.js';

describe('AutoMetricsCollector', () => {
  let collector;
  let mockCache;
  let cacheContextCalls;
  let getCachedContextCalls;
  
  beforeEach(() => {
    cacheContextCalls = [];
    getCachedContextCalls = [];
    
    // Mock cache without Jest
    mockCache = {
      cacheContext: (key, data) => {
        cacheContextCalls.push({ key, data });
      },
      getCachedContext: (key) => {
        getCachedContextCalls.push(key);
        return null;
      }
    };
    
    collector = new AutoMetricsCollector(mockCache);
  });
  
  afterEach(() => {
    // Clear intervals
    if (collector.reportInterval) {
      clearInterval(collector.reportInterval);
    }
  });
  
  describe('initialization', () => {
    it('should initialize with default settings', () => {
      expect(collector.cache).toBe(mockCache);
      expect(collector.metrics).toEqual({});
      expect(collector.sessionStart).toBeLessThanOrEqual(Date.now());
      expect(collector.enabled).toBe(true);
    });
    
    it('should start with auto reporting disabled', () => {
      expect(collector.reportInterval).toBeNull();
    });
  });
  
  describe('recordSearch', () => {
    it('should record search metrics', () => {
      collector.recordSearch('test query', 5, 100);
      
      const key = collector.getSearchKey('test query');
      expect(collector.metrics[key]).toBeDefined();
      expect(collector.metrics[key].count).toBe(1);
      expect(collector.metrics[key].totalResults).toBe(5);
      expect(collector.metrics[key].totalTime).toBe(100);
      expect(collector.metrics[key].avgResults).toBe(5);
      expect(collector.metrics[key].avgTime).toBe(100);
    });
    
    it('should aggregate multiple searches', () => {
      collector.recordSearch('same query', 5, 100);
      collector.recordSearch('same query', 10, 200);
      collector.recordSearch('same query', 15, 150);
      
      const key = collector.getSearchKey('same query');
      const metrics = collector.metrics[key];
      
      expect(metrics.count).toBe(3);
      expect(metrics.totalResults).toBe(30);
      expect(metrics.totalTime).toBe(450);
      expect(metrics.avgResults).toBe(10);
      expect(metrics.avgTime).toBe(150);
    });
    
    it('should track search patterns', () => {
      collector.recordSearch('javascript', 10, 50);
      collector.recordSearch('javascript tutorial', 5, 60);
      collector.recordSearch('python', 8, 45);
      
      expect(Object.keys(collector.metrics).length).toBe(3);
    });
    
    it('should not record when disabled', () => {
      collector.enabled = false;
      collector.recordSearch('test', 5, 100);
      
      expect(Object.keys(collector.metrics).length).toBe(0);
    });
  });
  
  describe('recordToolUse', () => {
    it('should record tool usage', () => {
      collector.recordToolUse('search_content', true, 150);
      
      const key = `tool:search_content`;
      expect(collector.metrics[key]).toBeDefined();
      expect(collector.metrics[key].count).toBe(1);
      expect(collector.metrics[key].successCount).toBe(1);
      expect(collector.metrics[key].totalTime).toBe(150);
    });
    
    it('should track success and failure', () => {
      collector.recordToolUse('write_note', true, 100);
      collector.recordToolUse('write_note', false, 50);
      collector.recordToolUse('write_note', true, 80);
      
      const metrics = collector.metrics['tool:write_note'];
      
      expect(metrics.count).toBe(3);
      expect(metrics.successCount).toBe(2);
      expect(metrics.failureCount).toBe(1);
      expect(metrics.successRate).toBeCloseTo(0.67, 2);
    });
    
    it('should track different tools separately', () => {
      collector.recordToolUse('read_notes', true, 50);
      collector.recordToolUse('write_note', true, 100);
      collector.recordToolUse('search_content', true, 200);
      
      expect(collector.metrics['tool:read_notes']).toBeDefined();
      expect(collector.metrics['tool:write_note']).toBeDefined();
      expect(collector.metrics['tool:search_content']).toBeDefined();
    });
  });
  
  describe('recordCacheHit', () => {
    it('should record cache hits and misses', () => {
      collector.recordCacheHit('search', true);
      collector.recordCacheHit('search', true);
      collector.recordCacheHit('search', false);
      
      const metrics = collector.metrics['cache:search'];
      
      expect(metrics.hits).toBe(2);
      expect(metrics.misses).toBe(1);
      expect(metrics.hitRate).toBeCloseTo(0.67, 2);
    });
    
    it('should track different cache types', () => {
      collector.recordCacheHit('search', true);
      collector.recordCacheHit('file', false);
      collector.recordCacheHit('structure', true);
      
      expect(collector.metrics['cache:search']).toBeDefined();
      expect(collector.metrics['cache:file']).toBeDefined();
      expect(collector.metrics['cache:structure']).toBeDefined();
    });
  });
  
  describe('getSearchKey', () => {
    it('should normalize search queries', () => {
      expect(collector.getSearchKey('Test Query')).toBe('search:test query');
      expect(collector.getSearchKey('  spaces  ')).toBe('search:spaces');
      expect(collector.getSearchKey('UPPERCASE')).toBe('search:uppercase');
    });
    
    it('should truncate long queries', () => {
      const longQuery = 'a'.repeat(200);
      const key = collector.getSearchKey(longQuery);
      
      expect(key.length).toBeLessThan(150);
      expect(key).toContain('...');
    });
  });
  
  describe('getTopSearches', () => {
    beforeEach(() => {
      collector.recordSearch('popular query', 10, 50);
      collector.recordSearch('popular query', 15, 60);
      collector.recordSearch('popular query', 20, 55);
      
      collector.recordSearch('medium query', 5, 40);
      collector.recordSearch('medium query', 8, 45);
      
      collector.recordSearch('rare query', 2, 30);
    });
    
    it('should return top searches by count', () => {
      const top = collector.getTopSearches(2);
      
      expect(top.length).toBe(2);
      expect(top[0].query).toContain('popular query');
      expect(top[0].count).toBe(3);
      expect(top[1].query).toContain('medium query');
      expect(top[1].count).toBe(2);
    });
    
    it('should include average metrics', () => {
      const top = collector.getTopSearches(1);
      
      expect(top[0].avgResults).toBe(15);
      expect(top[0].avgTime).toBeCloseTo(55, 0);
    });
    
    it('should handle limit larger than available', () => {
      const top = collector.getTopSearches(10);
      
      expect(top.length).toBe(3);
    });
  });
  
  describe('getToolUsageStats', () => {
    beforeEach(() => {
      collector.recordToolUse('search_content', true, 100);
      collector.recordToolUse('search_content', true, 120);
      collector.recordToolUse('search_content', false, 80);
      
      collector.recordToolUse('write_note', true, 200);
      collector.recordToolUse('write_note', true, 150);
    });
    
    it('should return tool usage statistics', () => {
      const stats = collector.getToolUsageStats();
      
      expect(stats.length).toBe(2);
      
      const searchStats = stats.find(s => s.tool === 'search_content');
      expect(searchStats.count).toBe(3);
      expect(searchStats.successRate).toBeCloseTo(0.67, 2);
      expect(searchStats.avgTime).toBe(100);
      
      const writeStats = stats.find(s => s.tool === 'write_note');
      expect(writeStats.count).toBe(2);
      expect(writeStats.successRate).toBe(1);
      expect(writeStats.avgTime).toBe(175);
    });
    
    it('should sort by usage count', () => {
      const stats = collector.getToolUsageStats();
      
      expect(stats[0].tool).toBe('search_content');
      expect(stats[0].count).toBe(3);
    });
  });
  
  describe('getSessionSummary', () => {
    beforeEach(() => {
      // Add various metrics
      collector.recordSearch('query1', 5, 100);
      collector.recordSearch('query2', 10, 150);
      collector.recordToolUse('tool1', true, 200);
      collector.recordToolUse('tool2', false, 100);
      collector.recordCacheHit('search', true);
      collector.recordCacheHit('search', false);
    });
    
    it('should return comprehensive session summary', () => {
      const summary = collector.getSessionSummary();
      
      expect(summary.duration).toBeGreaterThanOrEqual(0);
      expect(summary.totalSearches).toBe(2);
      expect(summary.totalToolUses).toBe(2);
      expect(summary.uniqueQueries).toBe(2);
      expect(summary.avgSearchTime).toBe(125);
      expect(summary.cacheHitRate).toBe(0.5);
    });
    
    it('should handle empty metrics', () => {
      const emptyCollector = new AutoMetricsCollector(mockCache);
      const summary = emptyCollector.getSessionSummary();
      
      expect(summary.totalSearches).toBe(0);
      expect(summary.totalToolUses).toBe(0);
      expect(summary.avgSearchTime).toBe(0);
      expect(summary.cacheHitRate).toBe(0);
    });
  });
  
  describe('exportMetrics', () => {
    beforeEach(() => {
      collector.recordSearch('test', 5, 100);
      collector.recordToolUse('test_tool', true, 50);
    });
    
    it('should export metrics with metadata', () => {
      const exported = collector.exportMetrics();
      
      expect(exported.sessionStart).toBeDefined();
      expect(exported.exportTime).toBeDefined();
      expect(exported.metrics).toBeDefined();
      expect(Object.keys(exported.metrics).length).toBeGreaterThan(0);
    });
    
    it('should cache exported metrics', () => {
      collector.exportMetrics();
      
      expect(cacheContextCalls.length).toBe(1);
      expect(cacheContextCalls[0].key).toBe('metrics:export');
      expect(cacheContextCalls[0].data).toBeDefined();
    });
  });
  
  describe('importMetrics', () => {
    it('should import and merge metrics', () => {
      const toImport = {
        'search:imported': {
          count: 5,
          totalResults: 50,
          totalTime: 500,
          avgResults: 10,
          avgTime: 100
        }
      };
      
      collector.importMetrics(toImport);
      
      expect(collector.metrics['search:imported']).toBeDefined();
      expect(collector.metrics['search:imported'].count).toBe(5);
    });
    
    it('should merge with existing metrics', () => {
      collector.recordSearch('existing', 5, 100);
      
      collector.importMetrics({
        'search:existing': {
          count: 3,
          totalResults: 30,
          totalTime: 300,
          avgResults: 10,
          avgTime: 100
        }
      });
      
      const metrics = collector.metrics['search:existing'];
      expect(metrics.count).toBe(4); // 1 + 3
      expect(metrics.totalResults).toBe(35); // 5 + 30
    });
  });
  
  describe('reset', () => {
    it('should clear all metrics', () => {
      collector.recordSearch('test', 5, 100);
      collector.recordToolUse('tool', true, 50);
      
      collector.reset();
      
      expect(Object.keys(collector.metrics).length).toBe(0);
      expect(collector.sessionStart).toBeLessThanOrEqual(Date.now());
    });
  });
  
  describe('enableAutoReporting', () => {
    it('should start periodic reporting', (done) => {
      let callCount = 0;
      const mockCallback = (summary) => {
        callCount++;
        expect(summary).toBeDefined();
        if (callCount === 2) {
          clearInterval(collector.reportInterval);
          done();
        }
      };
      
      collector.enableAutoReporting(50, mockCallback); // Short interval for testing
      
      expect(collector.reportInterval).toBeDefined();
    });
    
    it('should disable previous interval', () => {
      const mockCallback1 = () => {};
      const mockCallback2 = () => {};
      
      collector.enableAutoReporting(1000, mockCallback1);
      const firstInterval = collector.reportInterval;
      
      collector.enableAutoReporting(2000, mockCallback2);
      
      expect(collector.reportInterval).not.toBe(firstInterval);
    });
  });
  
  describe('generateReport', () => {
    beforeEach(() => {
      collector.recordSearch('javascript', 10, 100);
      collector.recordSearch('python', 5, 80);
      collector.recordToolUse('search_content', true, 150);
      collector.recordCacheHit('search', true);
    });
    
    it('should generate formatted report', () => {
      const report = collector.generateReport();
      
      expect(report).toContain('Metrics Report');
      expect(report).toContain('Session Duration');
      expect(report).toContain('Top Searches');
      expect(report).toContain('javascript');
      expect(report).toContain('Tool Usage');
      expect(report).toContain('search_content');
      expect(report).toContain('Cache Performance');
    });
  });
});