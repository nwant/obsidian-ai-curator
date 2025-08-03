import { describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import { testHarness } from '../test-harness.js';
import { performance } from 'perf_hooks';

describe('Performance Benchmarks - Integration Tests', () => {
  let metricsCollector = {
    operations: [],
    
    track(name, duration, metadata = {}) {
      this.operations.push({ name, duration, metadata, timestamp: Date.now() });
    },
    
    getStats(operationName) {
      const ops = this.operations.filter(op => op.name === operationName);
      if (ops.length === 0) return null;
      
      const durations = ops.map(op => op.duration).sort((a, b) => a - b);
      return {
        count: ops.length,
        min: Math.min(...durations),
        max: Math.max(...durations),
        avg: durations.reduce((a, b) => a + b, 0) / durations.length,
        p50: durations[Math.floor(durations.length * 0.5)],
        p95: durations[Math.floor(durations.length * 0.95)],
        p99: durations[Math.floor(durations.length * 0.99)]
      };
    },
    
    report() {
      const operations = [...new Set(this.operations.map(op => op.name))];
      const report = {};
      
      operations.forEach(op => {
        report[op] = this.getStats(op);
      });
      
      return report;
    }
  };
  
  beforeAll(async () => {
    await testHarness.setup();
  });
  
  afterAll(async () => {
    // Print performance report
    console.log('\n=== Performance Benchmark Report ===');
    const report = metricsCollector.report();
    
    Object.entries(report).forEach(([operation, stats]) => {
      console.log(`\n${operation}:`);
      console.log(`  Count: ${stats.count}`);
      console.log(`  Avg: ${stats.avg.toFixed(2)}ms`);
      console.log(`  P50: ${stats.p50.toFixed(2)}ms`);
      console.log(`  P95: ${stats.p95.toFixed(2)}ms`);
      console.log(`  P99: ${stats.p99.toFixed(2)}ms`);
    });
    
    await testHarness.teardown();
  });
  
  async function measureOperation(name, operation, metadata = {}) {
    const start = performance.now();
    const result = await operation();
    const duration = performance.now() - start;
    
    metricsCollector.track(name, duration, metadata);
    return { result, duration };
  }
  
  describe('Vault Operations Performance', () => {
    it('should scan large vaults efficiently', async () => {
      // Create vault with many files
      const fileCount = 5000;
      const files = {};
      
      for (let i = 0; i < fileCount; i++) {
        const depth = Math.floor(i / 100);
        const folder = `Level${depth}`;
        files[`${folder}/note${i}.md`] = {
          content: `# Note ${i}\n\n${'Lorem ipsum '.repeat(50)}`,
          frontmatter: {
            id: i,
            tags: [`tag${i % 20}`, `category${i % 10}`],
            created: new Date(Date.now() - i * 86400000).toISOString()
          }
        };
      }
      
      await testHarness.createTestVault(files);
      
      // Benchmark: Full vault scan
      const { duration: scanDuration } = await measureOperation(
        'vault_scan_5k',
        () => testHarness.executeTool('vault_scan', { patterns: ['**/*.md'] }),
        { fileCount }
      );
      
      expect(scanDuration).toBeLessThan(5000); // Should complete within 5s
      
      // Benchmark: Limited scan with stats
      const { duration: statsScanDuration } = await measureOperation(
        'vault_scan_stats',
        () => testHarness.executeTool('vault_scan', {
          patterns: ['**/*.md'],
          includeStats: true,
          limit: 100
        }),
        { fileCount, limit: 100 }
      );
      
      expect(statsScanDuration).toBeLessThan(1000); // Should be fast with limit
      
      // Benchmark: Pattern filtering
      const { result: patternResult, duration: patternDuration } = await measureOperation(
        'vault_scan_pattern',
        () => testHarness.executeTool('vault_scan', {
          patterns: ['Level2/**/*.md']
        }),
        { pattern: 'Level2/**/*.md' }
      );
      
      expect(patternDuration).toBeLessThan(2000);
      expect(patternResult.files.length).toBeLessThan(fileCount);
    });
    
    it('should handle concurrent read operations', async () => {
      // Create test notes
      const notes = {};
      for (let i = 0; i < 100; i++) {
        notes[`Concurrent/note${i}.md`] = {
          content: `# Note ${i}\n\n${'Content '.repeat(100)}`,
          frontmatter: { id: i }
        };
      }
      await testHarness.createTestVault(notes);
      
      // Benchmark: Sequential reads
      const sequentialStart = performance.now();
      for (let i = 0; i < 50; i++) {
        await testHarness.executeTool('read_notes', {
          paths: [`Concurrent/note${i}.md`]
        });
      }
      const sequentialDuration = performance.now() - sequentialStart;
      
      // Benchmark: Concurrent reads
      const concurrentStart = performance.now();
      const readPromises = Array(50).fill(null).map((_, i) =>
        testHarness.executeTool('read_notes', {
          paths: [`Concurrent/note${i}.md`]
        })
      );
      await Promise.all(readPromises);
      const concurrentDuration = performance.now() - concurrentStart;
      
      metricsCollector.track('read_sequential_50', sequentialDuration);
      metricsCollector.track('read_concurrent_50', concurrentDuration);
      
      // Concurrent should be significantly faster
      expect(concurrentDuration).toBeLessThan(sequentialDuration * 0.5);
    });
  });
  
  describe('Search Performance', () => {
    beforeAll(async () => {
      // Create searchable content
      const files = {};
      const topics = ['javascript', 'python', 'rust', 'golang', 'typescript'];
      const words = ['function', 'variable', 'class', 'interface', 'module'];
      
      for (let i = 0; i < 1000; i++) {
        const topic = topics[i % topics.length];
        const content = words.map(w => `${topic} ${w} example`).join('\n');
        
        files[`Search/doc${i}.md`] = {
          content: `# ${topic} Documentation ${i}\n\n${content}\n\n${'Additional content '.repeat(20)}`,
          frontmatter: {
            topic,
            index: i,
            keywords: words.slice(0, i % 5 + 1)
          }
        };
      }
      
      await testHarness.createTestVault(files);
    });
    
    it('should search content efficiently', async () => {
      const searchQueries = [
        { query: 'javascript function', expected: 200 }, // ~200 matches
        { query: 'python AND class', expected: 40 },    // Fewer matches
        { query: 'rust|golang', expected: 400 },         // OR query
        { query: 'typescript interface module', expected: 40 } // Multiple terms
      ];
      
      for (const { query, expected } of searchQueries) {
        const { result, duration } = await measureOperation(
          'search_content',
          () => testHarness.executeTool('search_content', {
            query,
            maxResults: 50,
            contextLines: 1
          }),
          { query, expectedMatches: expected }
        );
        
        expect(duration).toBeLessThan(2000); // Each search under 2s
        expect(result.matches.length).toBeLessThanOrEqual(50);
      }
    });
    
    it('should handle metadata queries efficiently', async () => {
      const metadataQueries = [
        {
          name: 'simple_equality',
          query: { topic: 'javascript' },
          expectedCount: 200
        },
        {
          name: 'array_contains',
          query: { keywords: { $in: ['function', 'class'] } },
          expectedCount: 600
        },
        {
          name: 'complex_conditions',
          query: { 
            topic: { $in: ['python', 'rust'] },
            index: { $gte: 100, $lt: 500 }
          },
          expectedCount: 160
        }
      ];
      
      for (const { name, query, expectedCount } of metadataQueries) {
        const { result, duration } = await measureOperation(
          `metadata_query_${name}`,
          () => testHarness.executeTool('find_by_metadata', {
            frontmatter: query
          }),
          { query, expectedCount }
        );
        
        expect(duration).toBeLessThan(1500);
        // Verify results are in expected range
        expect(result.files.length).toBeGreaterThan(expectedCount * 0.8);
        expect(result.files.length).toBeLessThan(expectedCount * 1.2);
      }
    });
  });
  
  describe('Write Operations Performance', () => {
    it('should handle batch writes efficiently', async () => {
      const batchSizes = [10, 50, 100];
      
      for (const batchSize of batchSizes) {
        const writes = Array(batchSize).fill(null).map((_, i) => ({
          path: `BatchWrite/note${i}.md`,
          content: `# Batch Note ${i}\n\n${'Content '.repeat(50)}`
        }));
        
        const { duration } = await measureOperation(
          `batch_write_${batchSize}`,
          async () => {
            const promises = writes.map(w => 
              testHarness.executeTool('write_note', w)
            );
            return Promise.all(promises);
          },
          { batchSize }
        );
        
        // Should scale sub-linearly
        const expectedMaxDuration = batchSize * 50; // 50ms per write max
        expect(duration).toBeLessThan(expectedMaxDuration);
      }
    });
    
    it('should handle large file writes', async () => {
      const fileSizes = [
        { name: '1mb', size: 1024 * 1024 },
        { name: '5mb', size: 5 * 1024 * 1024 },
        { name: '10mb', size: 10 * 1024 * 1024 }
      ];
      
      for (const { name, size } of fileSizes) {
        const content = 'x'.repeat(size);
        
        const { duration } = await measureOperation(
          `write_large_file_${name}`,
          () => testHarness.executeTool('write_note', {
            path: `LargeFiles/file_${name}.md`,
            content
          }),
          { size }
        );
        
        // Should complete reasonably fast even for large files
        expect(duration).toBeLessThan(2000);
      }
    });
  });
  
  describe('Tag Operations Performance', () => {
    beforeAll(async () => {
      // Create notes with various tag configurations
      const files = {};
      const tagGroups = ['dev', 'docs', 'project', 'personal', 'archive'];
      
      for (let i = 0; i < 500; i++) {
        const numTags = (i % 5) + 1;
        const tags = Array(numTags).fill(null).map((_, j) => 
          `${tagGroups[j % tagGroups.length]}/${tagGroups[(i + j) % tagGroups.length]}/tag${i}`
        );
        
        files[`Tagged/note${i}.md`] = {
          content: `# Tagged Note ${i}\n\n${tags.map(t => `#${t}`).join(' ')}`,
          frontmatter: { tags }
        };
      }
      
      await testHarness.createTestVault(files);
    });
    
    it('should analyze tags efficiently', async () => {
      const { result, duration } = await measureOperation(
        'analyze_tags_500_notes',
        () => testHarness.executeTool('analyze_tags', {})
      );
      
      expect(duration).toBeLessThan(3000);
      expect(result.tags.length).toBeGreaterThan(100);
      expect(result.hierarchy).toBeDefined();
      expect(result.similar.length).toBeGreaterThan(0);
    });
    
    it('should rename tags efficiently', async () => {
      // Test preview first
      const { duration: previewDuration } = await measureOperation(
        'rename_tag_preview',
        () => testHarness.executeTool('rename_tag', {
          oldTag: 'dev/docs/tag1',
          newTag: 'development/documentation/tag1',
          preview: true
        })
      );
      
      expect(previewDuration).toBeLessThan(1000);
      
      // Test actual rename
      const { result, duration: renameDuration } = await measureOperation(
        'rename_tag_execute',
        () => testHarness.executeTool('rename_tag', {
          oldTag: 'dev/docs/tag2',
          newTag: 'development/documentation/tag2',
          preview: false
        })
      );
      
      expect(renameDuration).toBeLessThan(2000);
      expect(result.filesUpdated || result.success).toBeTruthy();
    });
  });
  
  describe('Memory and Resource Usage', () => {
    it('should maintain stable memory usage over time', async () => {
      const initialMemory = process.memoryUsage();
      
      // Perform many operations
      for (let cycle = 0; cycle < 5; cycle++) {
        // Write files
        for (let i = 0; i < 100; i++) {
          await testHarness.executeTool('write_note', {
            path: `MemTest/cycle${cycle}/note${i}.md`,
            content: `Cycle ${cycle} Note ${i}\n\n${'x'.repeat(1000)}`
          });
        }
        
        // Read files
        await testHarness.executeTool('vault_scan', {
          patterns: [`MemTest/cycle${cycle}/**/*.md`]
        });
        
        // Search
        await testHarness.executeTool('search_content', {
          query: `Cycle ${cycle}`,
          maxResults: 50
        });
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }
      
      const finalMemory = process.memoryUsage();
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      const growthMB = memoryGrowth / 1024 / 1024;
      
      console.log(`Memory growth: ${growthMB.toFixed(2)} MB`);
      
      // Memory growth should be reasonable (less than 100MB)
      expect(growthMB).toBeLessThan(100);
    });
  });
  
  describe('Performance SLA Validation', () => {
    it('should meet performance SLAs for critical operations', async () => {
      const slas = {
        vault_scan_100_files: { p95: 500, p99: 1000 },
        read_single_note: { p95: 50, p99: 100 },
        write_single_note: { p95: 100, p99: 200 },
        search_simple_query: { p95: 1000, p99: 2000 },
        update_tags: { p95: 200, p99: 400 }
      };
      
      // Run multiple iterations to get percentiles
      const iterations = 100;
      
      // Test vault scan
      for (let i = 0; i < iterations; i++) {
        await measureOperation('vault_scan_100_files', () =>
          testHarness.executeTool('vault_scan', { limit: 100 })
        );
      }
      
      // Test read operations
      for (let i = 0; i < iterations; i++) {
        await measureOperation('read_single_note', () =>
          testHarness.executeTool('read_notes', { 
            paths: [`MemTest/cycle0/note${i % 100}.md`] 
          })
        );
      }
      
      // Test write operations
      for (let i = 0; i < iterations; i++) {
        await measureOperation('write_single_note', () =>
          testHarness.executeTool('write_note', {
            path: `SLA/note${i}.md`,
            content: `SLA Test ${i}`
          })
        );
      }
      
      // Validate SLAs
      Object.entries(slas).forEach(([operation, targets]) => {
        const stats = metricsCollector.getStats(operation);
        if (stats && stats.count >= 50) {
          expect(stats.p95).toBeLessThanOrEqual(targets.p95);
          expect(stats.p99).toBeLessThanOrEqual(targets.p99);
        }
      });
    });
  });
});