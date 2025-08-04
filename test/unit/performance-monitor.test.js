import { describe, it, beforeEach, expect } from '@jest/globals';
import { PerformanceMonitor } from '../../src/metrics/performance-monitor.js';
import { performance } from 'perf_hooks';

describe('PerformanceMonitor', () => {
  let monitor;
  
  beforeEach(() => {
    monitor = new PerformanceMonitor();
  });
  
  describe('operation tracking', () => {
    it('should start and end operations', () => {
      const opId = monitor.startOperation('test-op', { user: 'test' });
      
      expect(opId).toBeTruthy();
      expect(monitor.activeOperations.has(opId)).toBe(true);
      
      const result = monitor.endOperation(opId, true, { items: 5 });
      
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.success).toBe(true);
      expect(monitor.activeOperations.has(opId)).toBe(false);
    });
    
    it('should track operation metadata', () => {
      const opId = monitor.startOperation('search', {
        query: 'test query',
        filters: ['tag1', 'tag2']
      });
      
      const op = monitor.activeOperations.get(opId);
      expect(op.metadata.query).toBe('test query');
      expect(op.metadata.filters).toEqual(['tag1', 'tag2']);
    });
    
    it('should handle concurrent operations', () => {
      const op1 = monitor.startOperation('op1');
      const op2 = monitor.startOperation('op2');
      const op3 = monitor.startOperation('op3');
      
      expect(monitor.activeOperations.size).toBe(3);
      
      monitor.endOperation(op2);
      expect(monitor.activeOperations.size).toBe(2);
      
      monitor.endOperation(op1);
      monitor.endOperation(op3);
      expect(monitor.activeOperations.size).toBe(0);
    });
    
    it('should handle ending non-existent operation', () => {
      const result = monitor.endOperation('fake-id');
      
      expect(result).toBeNull();
    });
  });
  
  describe('metrics calculation', () => {
    it('should calculate basic metrics', () => {
      // Add some operations
      for (let i = 0; i < 10; i++) {
        const opId = monitor.startOperation('test-op');
        // Simulate some work
        const start = Date.now();
        while (Date.now() - start < 5) {} // ~5ms
        monitor.endOperation(opId, true);
      }
      
      const metrics = monitor.getMetrics();
      
      expect(metrics['test-op']).toBeDefined();
      expect(metrics['test-op'].count).toBe(10);
      expect(metrics['test-op'].successCount).toBe(10);
      expect(metrics['test-op'].errorCount).toBe(0);
      expect(metrics['test-op'].avgDuration).toBeGreaterThan(0);
    });
    
    it('should track success and error rates', () => {
      // Mix of success and failures
      for (let i = 0; i < 10; i++) {
        const opId = monitor.startOperation('mixed-op');
        monitor.endOperation(opId, i % 3 !== 0); // Fail every 3rd
      }
      
      const metrics = monitor.getMetrics();
      
      expect(metrics['mixed-op'].successCount).toBe(6);
      expect(metrics['mixed-op'].errorCount).toBe(4);
      expect(metrics['mixed-op'].successRate).toBeCloseTo(0.6, 1);
    });
    
    it('should calculate percentiles', () => {
      // Add operations with known durations
      const durations = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      
      durations.forEach(duration => {
        monitor.operations.push({
          id: `op-${duration}`,
          name: 'percentile-test',
          startTime: Date.now() - duration,
          endTime: Date.now(),
          duration: duration,
          success: true,
          metadata: {}
        });
      });
      
      const metrics = monitor.getMetrics();
      const stats = metrics['percentile-test'];
      
      expect(stats.p50).toBeCloseTo(55, 0);
      expect(stats.p90).toBeCloseTo(91, 0);
      expect(stats.p99).toBeCloseTo(99.1, 0);
    });
  });
  
  describe('performance thresholds', () => {
    it('should set and check thresholds', () => {
      monitor.setThreshold('slow-op', 1000);
      
      // Fast operation
      const fastOp = monitor.startOperation('slow-op');
      const fastResult = monitor.endOperation(fastOp);
      expect(fastResult.exceedsThreshold).toBe(false);
      
      // Simulate slow operation
      monitor.operations.push({
        id: 'slow-1',
        name: 'slow-op',
        duration: 1500,
        success: true,
        exceedsThreshold: true
      });
      
      const metrics = monitor.getMetrics();
      expect(metrics['slow-op'].thresholdViolations).toBe(1);
    });
    
    it('should handle operations without thresholds', () => {
      const opId = monitor.startOperation('no-threshold');
      const result = monitor.endOperation(opId);
      
      expect(result.exceedsThreshold).toBe(false);
    });
  });
  
  describe('resource monitoring', () => {
    it('should track memory usage', () => {
      const opId = monitor.startOperation('memory-test');
      const result = monitor.endOperation(opId);
      
      expect(result.memoryDelta).toBeDefined();
      expect(typeof result.memoryDelta).toBe('number');
    });
    
    it('should provide resource summary', () => {
      // Add some operations
      for (let i = 0; i < 5; i++) {
        const opId = monitor.startOperation('resource-test');
        monitor.endOperation(opId);
      }
      
      const summary = monitor.getResourceSummary();
      
      expect(summary.peakMemory).toBeGreaterThan(0);
      expect(summary.currentMemory).toBeGreaterThan(0);
      expect(summary.avgMemoryPerOp).toBeGreaterThan(0);
    });
  });
  
  describe('operation history', () => {
    it('should maintain operation history', () => {
      const ops = [];
      for (let i = 0; i < 5; i++) {
        const opId = monitor.startOperation(`op-${i}`);
        monitor.endOperation(opId);
        ops.push(opId);
      }
      
      expect(monitor.operations.length).toBe(5);
      expect(monitor.operations[0].name).toBe('op-0');
      expect(monitor.operations[4].name).toBe('op-4');
    });
    
    it('should limit history size', () => {
      // Add many operations
      for (let i = 0; i < 2000; i++) {
        const opId = monitor.startOperation('bulk-op');
        monitor.endOperation(opId);
      }
      
      expect(monitor.operations.length).toBeLessThanOrEqual(1000);
      expect(monitor.operations[0].name).toBe('bulk-op');
    });
  });
  
  describe('reporting', () => {
    it('should generate detailed report', () => {
      // Add various operations
      const operations = [
        { name: 'search', count: 10, successRate: 0.9 },
        { name: 'write', count: 5, successRate: 1.0 },
        { name: 'read', count: 20, successRate: 0.95 }
      ];
      
      operations.forEach(({ name, count, successRate }) => {
        for (let i = 0; i < count; i++) {
          const opId = monitor.startOperation(name);
          const success = Math.random() < successRate;
          monitor.endOperation(opId, success);
        }
      });
      
      const report = monitor.generateReport();
      
      expect(report).toContain('Performance Report');
      expect(report).toContain('search');
      expect(report).toContain('write');
      expect(report).toContain('read');
      expect(report).toContain('Operations:');
      expect(report).toContain('Success:');
    });
    
    it('should generate CSV export', () => {
      // Add some operations
      for (let i = 0; i < 3; i++) {
        const opId = monitor.startOperation('export-test');
        monitor.endOperation(opId);
      }
      
      const csv = monitor.exportToCSV();
      
      expect(csv).toContain('Operation,Count,Success Rate');
      expect(csv).toContain('export-test,3,100.00%');
    });
  });
  
  describe('real-time monitoring', () => {
    it('should get current active operations', () => {
      const op1 = monitor.startOperation('active-1');
      const op2 = monitor.startOperation('active-2');
      
      const active = monitor.getActiveOperations();
      
      expect(active.length).toBe(2);
      expect(active.some(op => op.id === op1)).toBe(true);
      expect(active.some(op => op.id === op2)).toBe(true);
      
      monitor.endOperation(op1);
      
      const stillActive = monitor.getActiveOperations();
      expect(stillActive.length).toBe(1);
    });
    
    it('should detect long-running operations', () => {
      // Create an operation that started long ago
      const longOp = 'long-op';
      monitor.activeOperations.set(longOp, {
        id: longOp,
        name: 'long-running',
        startTime: performance.now() - 10000, // 10 seconds ago
        metadata: {}
      });
      
      const longRunning = monitor.getLongRunningOperations(5000);
      
      expect(longRunning.length).toBe(1);
      expect(longRunning[0].id).toBe(longOp);
      expect(longRunning[0].duration).toBeGreaterThan(9000);
    });
  });
  
  describe('integration with other metrics', () => {
    it('should track operation chains', () => {
      const parentOp = monitor.startOperation('parent', { step: 1 });
      
      // Child operations
      const child1 = monitor.startOperation('child', { parent: parentOp });
      monitor.endOperation(child1);
      
      const child2 = monitor.startOperation('child', { parent: parentOp });
      monitor.endOperation(child2);
      
      monitor.endOperation(parentOp);
      
      const metrics = monitor.getMetrics();
      expect(metrics['parent'].count).toBe(1);
      expect(metrics['child'].count).toBe(2);
    });
  });
});