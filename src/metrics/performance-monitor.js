/**
 * Performance monitoring system for MCP server
 * Tracks operation latencies, throughput, and resource usage
 */

import { performance } from 'perf_hooks';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export class PerformanceMonitor {
  constructor(config = {}) {
    this.config = config;
    this.metrics = {
      operations: new Map(), // Track individual operations
      summary: {
        totalCalls: 0,
        totalErrors: 0,
        avgLatency: 0,
        p95Latency: 0,
        p99Latency: 0,
        throughput: 0
      },
      resources: {
        memoryUsage: [],
        cpuUsage: []
      }
    };
    
    this.windowSize = config.metricsWindowSize || 3600000; // 1 hour default
    this.sampleInterval = config.metricsSampleInterval || 10000; // 10 seconds
    this.maxSamples = Math.floor(this.windowSize / this.sampleInterval);
    
    this.startTime = Date.now();
    this.samplingTimer = null;
    this.activeOperations = new Map(); // Track active operations
    this.thresholds = config.thresholds || {}; // Performance thresholds
    this.operationHistory = []; // Keep history for percentile calculations
    this.operations = []; // Alias for test compatibility
  }

  /**
   * Start performance monitoring
   */
  start() {
    this.startResourceMonitoring();
    console.error('[Performance Monitor] Started monitoring');
  }

  /**
   * Stop performance monitoring
   */
  async stop() {
    if (this.samplingTimer) {
      clearInterval(this.samplingTimer);
    }
    
    // Export final metrics
    await this.exportMetrics();
    console.error('[Performance Monitor] Stopped monitoring');
  }

  /**
   * Track the start of an operation
   */
  startOperation(operationName, metadata = {}) {
    const operationId = `${operationName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const memUsage = process.memoryUsage();
    
    this.activeOperations.set(operationId, {
      name: operationName,
      startTime: performance.now(),
      startMemory: memUsage.heapUsed,
      metadata,
      status: 'running'
    });
    
    return operationId;
  }

  /**
   * Track the completion of an operation
   */
  endOperation(operationId, success = true, result = {}) {
    const operation = this.activeOperations.get(operationId);
    if (!operation) return;
    
    const endTime = performance.now();
    const latency = endTime - operation.startTime;
    
    operation.endTime = endTime;
    operation.latency = latency;
    operation.success = success;
    operation.status = success ? 'completed' : 'failed';
    operation.result = result;
    
    // Store completed operation
    this.operationHistory.push(operation);
    
    // Update metrics by operation name
    if (!this.metrics.operations.has(operation.name)) {
      this.metrics.operations.set(operation.name, {
        count: 0,
        successCount: 0,
        errorCount: 0,
        totalDuration: 0,
        durations: []
      });
    }
    
    const opMetrics = this.metrics.operations.get(operation.name);
    opMetrics.count++;
    if (success) {
      opMetrics.successCount++;
    } else {
      opMetrics.errorCount++;
    }
    opMetrics.totalDuration += latency;
    opMetrics.durations.push(latency);
    opMetrics.avgDuration = opMetrics.totalDuration / opMetrics.count;
    opMetrics.successRate = opMetrics.count > 0 ? opMetrics.successCount / opMetrics.count : 0;
    
    // Calculate percentiles
    if (opMetrics.durations.length > 0) {
      const sorted = [...opMetrics.durations].sort((a, b) => a - b);
      const p50Index = Math.floor(sorted.length * 0.5);
      const p90Index = Math.floor(sorted.length * 0.9);
      const p95Index = Math.floor(sorted.length * 0.95);
      const p99Index = Math.floor(sorted.length * 0.99);
      
      opMetrics.p50 = sorted[p50Index] || sorted[sorted.length - 1];
      opMetrics.p90 = sorted[p90Index] || sorted[sorted.length - 1];
      opMetrics.p95 = sorted[p95Index] || sorted[sorted.length - 1];
      opMetrics.p99 = sorted[p99Index] || sorted[sorted.length - 1];
    }
    
    // Remove from active operations
    this.activeOperations.delete(operationId);
    
    // Update summary metrics
    this.updateSummaryMetrics(operation);
    
    // Clean up old operations to prevent memory leak
    this.cleanupOldOperations();
    
    // Calculate memory delta
    const currentMemory = process.memoryUsage().heapUsed;
    const memoryDelta = operation.startMemory ? currentMemory - operation.startMemory : 0;
    
    return {
      operationId,
      latency,
      success,
      memoryDelta
    };
  }

  /**
   * Track a complete operation (convenience method)
   */
  async trackOperation(operationName, fn, metadata = {}) {
    const operationId = this.startOperation(operationName, metadata);
    
    try {
      const result = await fn();
      this.endOperation(operationId, true, { result });
      return result;
    } catch (error) {
      this.endOperation(operationId, false, { error: error.message });
      throw error;
    }
  }

  /**
   * Update summary metrics
   */
  updateSummaryMetrics(operation) {
    const summary = this.metrics.summary;
    
    summary.totalCalls++;
    if (!operation.success) {
      summary.totalErrors++;
    }
    
    // Calculate latencies
    const recentOps = Array.from(this.metrics.operations.values())
      .filter(op => op.endTime && op.endTime > performance.now() - this.windowSize)
      .sort((a, b) => a.latency - b.latency);
    
    if (recentOps.length > 0) {
      // Average latency
      const totalLatency = recentOps.reduce((sum, op) => sum + op.latency, 0);
      summary.avgLatency = totalLatency / recentOps.length;
      
      // P95 and P99 latencies
      const p95Index = Math.floor(recentOps.length * 0.95);
      const p99Index = Math.floor(recentOps.length * 0.99);
      summary.p95Latency = recentOps[p95Index]?.latency || 0;
      summary.p99Latency = recentOps[p99Index]?.latency || 0;
      
      // Throughput (operations per second)
      const windowSeconds = this.windowSize / 1000;
      summary.throughput = recentOps.length / windowSeconds;
    }
  }

  /**
   * Start monitoring system resources
   */
  startResourceMonitoring() {
    // Initial sample
    this.sampleResources();
    
    // Schedule periodic sampling
    this.samplingTimer = setInterval(() => {
      this.sampleResources();
    }, this.sampleInterval);
  }

  /**
   * Sample current resource usage
   */
  sampleResources() {
    // Memory usage
    const memUsage = process.memoryUsage();
    this.metrics.resources.memoryUsage.push({
      timestamp: Date.now(),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      rss: memUsage.rss,
      external: memUsage.external
    });
    
    // CPU usage (simple approximation)
    const cpuUsage = process.cpuUsage();
    this.metrics.resources.cpuUsage.push({
      timestamp: Date.now(),
      user: cpuUsage.user,
      system: cpuUsage.system
    });
    
    // Limit sample history
    if (this.metrics.resources.memoryUsage.length > this.maxSamples) {
      this.metrics.resources.memoryUsage.shift();
    }
    if (this.metrics.resources.cpuUsage.length > this.maxSamples) {
      this.metrics.resources.cpuUsage.shift();
    }
  }

  /**
   * Clean up old operations to prevent memory leak
   */
  cleanupOldOperations() {
    const cutoffTime = performance.now() - this.windowSize;
    
    for (const [id, op] of this.metrics.operations.entries()) {
      if (op.endTime && op.endTime < cutoffTime) {
        this.metrics.operations.delete(id);
      }
    }
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics() {
    const now = Date.now();
    const uptime = (now - this.startTime) / 1000; // seconds
    
    // Get operation breakdown by type
    const operationBreakdown = {};
    for (const op of this.metrics.operations.values()) {
      if (op.endTime) {
        if (!operationBreakdown[op.name]) {
          operationBreakdown[op.name] = {
            count: 0,
            totalLatency: 0,
            errors: 0,
            avgLatency: 0
          };
        }
        
        const breakdown = operationBreakdown[op.name];
        breakdown.count++;
        breakdown.totalLatency += op.latency;
        if (!op.success) breakdown.errors++;
      }
    }
    
    // Calculate averages
    for (const breakdown of Object.values(operationBreakdown)) {
      breakdown.avgLatency = breakdown.count > 0 ? breakdown.totalLatency / breakdown.count : 0;
    }
    
    // Get latest resource usage
    const latestMemory = this.metrics.resources.memoryUsage[this.metrics.resources.memoryUsage.length - 1];
    const latestCpu = this.metrics.resources.cpuUsage[this.metrics.resources.cpuUsage.length - 1];
    
    return {
      summary: {
        ...this.metrics.summary,
        uptime,
        errorRate: this.metrics.summary.totalCalls > 0 
          ? (this.metrics.summary.totalErrors / this.metrics.summary.totalCalls) * 100 
          : 0
      },
      operations: operationBreakdown,
      resources: {
        memory: latestMemory || {},
        cpu: latestCpu || {},
        system: {
          platform: os.platform(),
          totalMemory: os.totalmem(),
          freeMemory: os.freemem(),
          cpuCount: os.cpus().length,
          loadAverage: os.loadavg()
        }
      },
      timestamp: now
    };
  }

  /**
   * Export metrics to file
   */
  async exportMetrics() {
    if (!this.config.metricsExportPath) return;
    
    try {
      const metrics = this.getMetrics();
      const exportPath = path.join(
        this.config.metricsExportPath,
        `metrics-${new Date().toISOString().split('T')[0]}.json`
      );
      
      await fs.mkdir(path.dirname(exportPath), { recursive: true });
      await fs.writeFile(exportPath, JSON.stringify(metrics, null, 2));
      
      console.error(`[Performance Monitor] Metrics exported to ${exportPath}`);
    } catch (error) {
      console.error('[Performance Monitor] Failed to export metrics:', error.message);
    }
  }

  /**
   * Generate performance report
   */
  generateReport() {
    const metrics = this.getMetrics();
    
    let report = '# Performance Report\n\n';
    
    // Summary
    report += '## Summary\n';
    report += `- Uptime: ${Math.floor(metrics.summary.uptime / 60)} minutes\n`;
    report += `- Total Operations: ${metrics.summary.totalCalls}\n`;
    report += `- Error Rate: ${metrics.summary.errorRate.toFixed(2)}%\n`;
    report += `- Average Latency: ${metrics.summary.avgLatency.toFixed(2)}ms\n`;
    report += `- P95 Latency: ${metrics.summary.p95Latency.toFixed(2)}ms\n`;
    report += `- P99 Latency: ${metrics.summary.p99Latency.toFixed(2)}ms\n`;
    report += `- Throughput: ${metrics.summary.throughput.toFixed(2)} ops/sec\n\n`;
    
    // Operation Breakdown
    report += '## Operation Breakdown\n';
    const sortedOps = Object.entries(metrics.operations)
      .sort((a, b) => b[1].count - a[1].count);
    
    for (const [name, stats] of sortedOps) {
      report += `\n### ${name}\n`;
      report += `- Count: ${stats.count}\n`;
      report += `- Average Latency: ${stats.avgLatency.toFixed(2)}ms\n`;
      report += `- Errors: ${stats.errors}\n`;
      report += `- Error Rate: ${stats.count > 0 ? ((stats.errors / stats.count) * 100).toFixed(2) : 0}%\n`;
    }
    
    // Resource Usage
    report += '\n## Resource Usage\n';
    report += `- Heap Used: ${(metrics.resources.memory.heapUsed / 1024 / 1024).toFixed(2)} MB\n`;
    report += `- Heap Total: ${(metrics.resources.memory.heapTotal / 1024 / 1024).toFixed(2)} MB\n`;
    report += `- RSS: ${(metrics.resources.memory.rss / 1024 / 1024).toFixed(2)} MB\n`;
    report += `- System Free Memory: ${(metrics.resources.system.freeMemory / 1024 / 1024 / 1024).toFixed(2)} GB\n`;
    report += `- Load Average: ${metrics.resources.system.loadAverage.map(l => l.toFixed(2)).join(', ')}\n`;
    
    return report;
  }

  /**
   * Start tracking an operation
   * @stub - Basic implementation for testing
   */
  startOperation(operationName, metadata = {}) {
    const operationId = `${operationName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.activeOperations.set(operationId, {
      name: operationName,
      startTime: performance.now(),
      metadata
    });
    return operationId;
  }

  /**
   * End tracking an operation
   * @stub - Basic implementation for testing
   */
  endOperation(operationId, success = true, metadata = {}) {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      return null;
    }
    
    const endTime = performance.now();
    const duration = endTime - operation.startTime;
    
    this.activeOperations.delete(operationId);
    
    // Track metrics by operation name
    if (!this.metrics.operations.has(operation.name)) {
      this.metrics.operations.set(operation.name, {
        count: 0,
        successCount: 0,
        errorCount: 0,
        totalDuration: 0,
        durations: []
      });
    }
    
    const opMetrics = this.metrics.operations.get(operation.name);
    opMetrics.count++;
    opMetrics.totalDuration += duration;
    opMetrics.durations.push(duration);
    
    if (success) {
      opMetrics.successCount++;
    } else {
      opMetrics.errorCount++;
    }
    
    // Calculate averages
    opMetrics.avgDuration = opMetrics.totalDuration / opMetrics.count;
    opMetrics.successRate = opMetrics.successCount / opMetrics.count;
    
    // Update summary metrics
    this.metrics.summary.totalCalls++;
    if (!success) {
      this.metrics.summary.totalErrors++;
    }
    
    // Track in history
    this.operationHistory.push({
      id: operationId,
      name: operation.name,
      duration,
      timestamp: Date.now(),
      success,
      ...metadata
    });
    
    // Keep history bounded
    if (this.operationHistory.length > 1000) {
      this.operationHistory = this.operationHistory.slice(-1000);
    }
    
    return { duration, success };
  }
  
  /**
   * Get metrics for all operations
   * @stub - Basic implementation for testing
   */
  getMetrics() {
    const metrics = {};
    
    // Return metrics grouped by operation name
    this.metrics.operations.forEach((value, name) => {
      metrics[name] = { ...value };
    });
    
    return metrics;
  }

  /**
   * Export metrics to CSV format
   */
  exportToCSV() {
    const metrics = this.getMetrics();
    let csv = 'Operation,Count,Success Rate,Avg Duration,P50,P90,P99\n';
    
    for (const [name, stats] of Object.entries(metrics)) {
      const successRate = stats.successRate ? (stats.successRate * 100).toFixed(2) : '0.00';
      const avgDuration = stats.avgDuration ? stats.avgDuration.toFixed(2) : '0.00';
      const p50 = stats.p50 ? stats.p50.toFixed(2) : '0.00';
      const p90 = stats.p90 ? stats.p90.toFixed(2) : '0.00';
      const p99 = stats.p99 ? stats.p99.toFixed(2) : '0.00';
      
      csv += `${name},${stats.count || 0},${successRate}%,${avgDuration},${p50},${p90},${p99}\n`;
    }
    
    return csv;
  }
  
  /**
   * Get resource summary
   */
  getResourceSummary() {
    const memUsage = process.memoryUsage();
    
    return {
      memory: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss
      },
      cpu: process.cpuUsage(),
      uptime: process.uptime()
    };
  }
  
  /**
   * Get active operations
   */
  getActiveOperations() {
    const active = [];
    const now = performance.now();
    
    this.activeOperations.forEach((op, id) => {
      active.push({
        id,
        name: op.name,
        duration: now - op.startTime,
        status: op.status
      });
    });
    
    return active;
  }
  
  /**
   * Get long running operations
   */
  getLongRunningOperations(thresholdMs = 5000) {
    const longRunning = [];
    const now = performance.now();
    
    this.activeOperations.forEach((op, id) => {
      const duration = now - op.startTime;
      if (duration > thresholdMs) {
        longRunning.push({
          id,
          name: op.name,
          duration,
          metadata: op.metadata
        });
      }
    });
    
    return longRunning;
  }
  
  /**
   * Get operation history
   */
  getHistory(limit = 100) {
    return this.operationHistory.slice(-limit);
  }
  
  /**
   * Set performance thresholds
   * @stub - Basic implementation for testing
   */
  setThresholds(thresholds) {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  /**
   * Check if operation exceeds threshold
   * @stub - Basic implementation for testing
   */
  checkThreshold(operationName, duration) {
    const threshold = this.thresholds[operationName];
    if (!threshold) {
      return { exceeded: false };
    }
    
    return {
      exceeded: duration > threshold,
      threshold,
      duration,
      excess: duration > threshold ? duration - threshold : 0
    };
  }

  /**
   * Calculate percentiles from operation history
   * @stub - Basic implementation for testing
   */
  calculatePercentiles(percentiles = [50, 95, 99]) {
    if (this.operationHistory.length === 0) {
      return percentiles.reduce((acc, p) => ({ ...acc, [`p${p}`]: 0 }), {});
    }
    
    const durations = this.operationHistory
      .map(op => op.duration)
      .sort((a, b) => a - b);
    
    const result = {};
    for (const percentile of percentiles) {
      const index = Math.ceil((percentile / 100) * durations.length) - 1;
      result[`p${percentile}`] = durations[Math.max(0, index)];
    }
    
    return result;
  }

  /**
   * Get current memory usage
   * @stub - Basic implementation for testing
   */
  getMemoryUsage() {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      rss: memUsage.rss,
      external: memUsage.external
    };
  }

  /**
   * Calculate success and error rates
   * @stub - Basic implementation for testing
   */
  getSuccessRate() {
    if (this.operationHistory.length === 0) {
      return { successRate: 100, errorRate: 0, total: 0 };
    }
    
    const successful = this.operationHistory.filter(op => op.success).length;
    const total = this.operationHistory.length;
    
    return {
      successRate: (successful / total) * 100,
      errorRate: ((total - successful) / total) * 100,
      total
    };
  }
}