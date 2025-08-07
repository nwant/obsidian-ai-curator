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
    this.operations = this.operationHistory; // Alias for test compatibility
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
    if (!operation) return null;
    
    const endTime = performance.now();
    const latency = endTime - operation.startTime;
    
    operation.endTime = endTime;
    operation.latency = latency;
    operation.duration = latency; // Add duration alias for test compatibility
    operation.success = success;
    operation.status = success ? 'completed' : 'failed';
    operation.result = result;
    
    // Calculate memory delta
    const currentMemory = process.memoryUsage().heapUsed;
    const memoryDelta = operation.startMemory ? currentMemory - operation.startMemory : 0;
    
    // Store completed operation with memoryDelta
    operation.memoryDelta = memoryDelta;
    this.operationHistory.push(operation);
    
    // Update metrics by operation name
    if (!this.metrics.operations.has(operation.name)) {
      this.metrics.operations.set(operation.name, {
        count: 0,
        successCount: 0,
        errorCount: 0,
        totalDuration: 0,
        durations: [],
        thresholdViolations: 0
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
    
    // Check threshold
    let exceedsThreshold = false;
    if (this.thresholds[operation.name] && latency > this.thresholds[operation.name]) {
      opMetrics.thresholdViolations++;
      exceedsThreshold = true;
      operation.exceedsThreshold = true;
    }
    
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
    
    return {
      operationId,
      latency,
      success,
      memoryDelta: operation.memoryDelta,
      exceedsThreshold,
      duration: latency
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
    
    // Also limit operation history size
    const maxHistorySize = 1000;
    if (this.operationHistory.length > maxHistorySize) {
      // Keep the most recent operations by removing old ones
      this.operationHistory.splice(0, this.operationHistory.length - maxHistorySize);
    }
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics() {
    // For test compatibility, return metrics grouped by operation name
    const metrics = {};
    
    // Get metrics from the operations Map
    this.metrics.operations.forEach((value, name) => {
      metrics[name] = { ...value };
    });
    
    // Also compute metrics from operationHistory if needed
    const historyByName = {};
    for (const op of this.operationHistory) {
      if (!historyByName[op.name]) {
        historyByName[op.name] = [];
      }
      historyByName[op.name].push(op);
    }
    
    // Add or merge metrics for operations in history
    for (const [name, ops] of Object.entries(historyByName)) {
      if (!metrics[name]) {
        // Create new metrics entry from history
        const durations = ops.map(op => op.duration || op.latency || 0).filter(d => d > 0);
        const successCount = ops.filter(op => op.success).length;
        const errorCount = ops.filter(op => !op.success).length;
        const count = ops.length;
        
        const thresholdViolations = ops.filter(op => op.exceedsThreshold).length;
        
        metrics[name] = {
          count,
          successCount,
          errorCount,
          durations,
          avgDuration: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
          successRate: count > 0 ? successCount / count : 0,
          thresholdViolations
        };
        
        // Calculate percentiles
        if (durations.length > 0) {
          const sorted = [...durations].sort((a, b) => a - b);
          
          const calculatePercentile = (arr, p) => {
            const index = (p / 100) * (arr.length - 1);
            const lower = Math.floor(index);
            const upper = Math.ceil(index);
            const weight = index % 1;
            
            if (lower === upper) {
              return arr[lower];
            }
            
            return arr[lower] * (1 - weight) + arr[upper] * weight;
          };
          
          metrics[name].p50 = calculatePercentile(sorted, 50);
          metrics[name].p90 = calculatePercentile(sorted, 90);
          metrics[name].p95 = calculatePercentile(sorted, 95);
          metrics[name].p99 = calculatePercentile(sorted, 99);
        }
      } else {
        // Merge threshold violations from history into existing metrics
        const historyViolations = ops.filter(op => op.exceedsThreshold).length;
        if (historyViolations > 0 && metrics[name].thresholdViolations !== undefined) {
          // Add history violations that aren't already counted
          const existingViolations = metrics[name].thresholdViolations || 0;
          metrics[name].thresholdViolations = Math.max(existingViolations, historyViolations);
        }
      }
    }
    
    return metrics;
  }
  
  /**
   * Get detailed metrics snapshot
   */
  getDetailedMetrics() {
    const now = Date.now();
    const uptime = (now - this.startTime) / 1000; // seconds
    
    // Get operation breakdown by type
    const operationBreakdown = {};
    
    // Build from metrics.operations Map
    this.metrics.operations.forEach((stats, name) => {
      operationBreakdown[name] = {
        count: stats.count || 0,
        totalLatency: stats.totalDuration || 0,
        errors: stats.errorCount || 0,
        avgLatency: stats.avgDuration || 0
      };
    });
    
    // Also add from operationHistory
    for (const op of this.operationHistory) {
      if (!operationBreakdown[op.name]) {
        operationBreakdown[op.name] = {
          count: 0,
          totalLatency: 0,
          errors: 0,
          avgLatency: 0
        };
      }
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
      const metrics = this.getDetailedMetrics();
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
    const metrics = this.getDetailedMetrics();
    
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
      report += `- Operations: ${stats.count}\n`;
      report += `- Success: ${stats.count - stats.errors}\n`;
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
    
    // Calculate peak memory from history
    let peakMemory = memUsage.heapUsed;
    let totalMemoryDelta = 0;
    let opCount = 0;
    
    for (const op of this.operationHistory) {
      if (op.memoryDelta !== undefined) {
        totalMemoryDelta += Math.abs(op.memoryDelta);
        opCount++;
      }
    }
    
    return {
      memory: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss
      },
      cpu: process.cpuUsage(),
      uptime: process.uptime(),
      peakMemory: peakMemory,
      currentMemory: memUsage.heapUsed,
      avgMemoryPerOp: opCount > 0 ? totalMemoryDelta / opCount : 0
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
   */
  setThreshold(operationName, threshold) {
    this.thresholds[operationName] = threshold;
  }
  
  /**
   * Set multiple performance thresholds
   */
  setThresholds(thresholds) {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  /**
   * Check if operation exceeds threshold with alerting and auto-scaling support
   */
  checkThreshold(operationName, duration) {
    const threshold = this.thresholds[operationName];
    if (!threshold) {
      return { exceeded: false };
    }
    
    const exceeded = duration > threshold;
    const result = {
      exceeded,
      threshold,
      duration,
      excess: exceeded ? duration - threshold : 0,
      severity: this.calculateSeverity(duration, threshold)
    };
    
    // Track threshold violations for alerting
    if (exceeded) {
      this.recordThresholdViolation(operationName, result);
      
      // Trigger alert if violations exceed alert threshold
      if (this.shouldAlert(operationName)) {
        this.triggerAlert(operationName, result);
      }
      
      // Check for auto-scaling conditions
      if (this.shouldAutoScale(operationName)) {
        this.triggerAutoScale(operationName, result);
      }
    }
    
    return result;
  }
  
  calculateSeverity(duration, threshold) {
    const ratio = duration / threshold;
    if (ratio < 1.2) return 'low';
    if (ratio < 1.5) return 'medium';
    if (ratio < 2.0) return 'high';
    return 'critical';
  }
  
  recordThresholdViolation(operationName, violation) {
    if (!this.thresholdViolations) {
      this.thresholdViolations = new Map();
    }
    
    if (!this.thresholdViolations.has(operationName)) {
      this.thresholdViolations.set(operationName, []);
    }
    
    const violations = this.thresholdViolations.get(operationName);
    violations.push({
      timestamp: Date.now(),
      ...violation
    });
    
    // Keep only recent violations (last hour)
    const cutoff = Date.now() - 3600000;
    const recentViolations = violations.filter(v => v.timestamp > cutoff);
    this.thresholdViolations.set(operationName, recentViolations);
  }
  
  shouldAlert(operationName) {
    const violations = this.thresholdViolations?.get(operationName) || [];
    const recentViolations = violations.filter(
      v => v.timestamp > Date.now() - 300000 // Last 5 minutes
    );
    
    // Alert if more than 5 violations in last 5 minutes
    return recentViolations.length > 5;
  }
  
  triggerAlert(operationName, violation) {
    if (!this.alerts) {
      this.alerts = [];
    }
    
    this.alerts.push({
      timestamp: Date.now(),
      operation: operationName,
      violation,
      type: 'threshold_exceeded'
    });
    
    // Log alert (in production, this would send to monitoring service)
    console.error(`[ALERT] Operation '${operationName}' exceeded threshold: ${violation.duration}ms > ${violation.threshold}ms (severity: ${violation.severity})`);
  }
  
  shouldAutoScale(operationName) {
    const violations = this.thresholdViolations?.get(operationName) || [];
    const recentViolations = violations.filter(
      v => v.timestamp > Date.now() - 600000 // Last 10 minutes
    );
    
    // Auto-scale if consistent high/critical violations
    const criticalCount = recentViolations.filter(v => 
      v.severity === 'critical' || v.severity === 'high'
    ).length;
    
    return criticalCount > 10;
  }
  
  triggerAutoScale(operationName, violation) {
    if (!this.autoScaleEvents) {
      this.autoScaleEvents = [];
    }
    
    this.autoScaleEvents.push({
      timestamp: Date.now(),
      operation: operationName,
      violation,
      action: 'scale_up'
    });
    
    // Log auto-scale event (in production, this would trigger scaling)
    console.error(`[AUTO-SCALE] Triggering scale-up for '${operationName}' due to performance degradation`);
  }

  /**
   * Calculate percentiles with sliding window and outlier detection
   */
  calculatePercentiles(percentiles = [50, 95, 99], windowMs = null, excludeOutliers = false) {
    if (this.operationHistory.length === 0) {
      return percentiles.reduce((acc, p) => ({ ...acc, [`p${p}`]: 0 }), {});
    }
    
    // Apply sliding window if specified
    let operations = this.operationHistory;
    if (windowMs) {
      const cutoff = Date.now() - windowMs;
      operations = operations.filter(op => 
        (op.endTime || op.startTime) && 
        (op.endTime || op.startTime) > cutoff
      );
    }
    
    if (operations.length === 0) {
      return percentiles.reduce((acc, p) => ({ ...acc, [`p${p}`]: 0 }), {});
    }
    
    let durations = operations
      .map(op => op.duration || op.latency || 0)
      .filter(d => d > 0);
    
    // Outlier detection using IQR method
    if (excludeOutliers && durations.length > 4) {
      durations = this.removeOutliers(durations);
    }
    
    durations.sort((a, b) => a - b);
    
    const result = {};
    for (const percentile of percentiles) {
      // Use linear interpolation for more accurate percentiles
      const index = (percentile / 100) * (durations.length - 1);
      const lower = Math.floor(index);
      const upper = Math.ceil(index);
      const weight = index % 1;
      
      if (lower === upper) {
        result[`p${percentile}`] = durations[lower];
      } else {
        result[`p${percentile}`] = 
          durations[lower] * (1 - weight) + durations[upper] * weight;
      }
    }
    
    // Add statistics about the calculation
    result.sampleSize = durations.length;
    result.windowMs = windowMs;
    result.outliersExcluded = excludeOutliers;
    
    return result;
  }
  
  removeOutliers(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const q1Index = Math.floor(sorted.length * 0.25);
    const q3Index = Math.floor(sorted.length * 0.75);
    
    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;
    
    // Standard IQR outlier bounds
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;
    
    const filtered = values.filter(v => v >= lowerBound && v <= upperBound);
    
    // Log outlier detection
    const outlierCount = values.length - filtered.length;
    if (outlierCount > 0) {
      console.error(`[Performance Monitor] Removed ${outlierCount} outliers from percentile calculation`);
    }
    
    return filtered;
  }

  /**
   * Get memory usage with trend analysis and leak detection
   */
  getMemoryUsage() {
    const memUsage = process.memoryUsage();
    const current = {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      rss: memUsage.rss,
      external: memUsage.external,
      timestamp: Date.now()
    };
    
    // Track memory history for trend analysis
    if (!this.memoryHistory) {
      this.memoryHistory = [];
    }
    
    this.memoryHistory.push(current);
    
    // Keep last 100 samples
    if (this.memoryHistory.length > 100) {
      this.memoryHistory.shift();
    }
    
    // Calculate trends if we have enough history
    if (this.memoryHistory.length >= 10) {
      const trend = this.calculateMemoryTrend();
      const leakIndicators = this.detectMemoryLeak();
      
      return {
        ...current,
        trend,
        leakIndicators,
        analysis: this.analyzeMemoryUsage()
      };
    }
    
    return current;
  }
  
  calculateMemoryTrend() {
    if (!this.memoryHistory || this.memoryHistory.length < 2) {
      return { direction: 'stable', rate: 0 };
    }
    
    // Calculate linear regression for heap usage
    const samples = this.memoryHistory.slice(-20); // Last 20 samples
    const n = samples.length;
    
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    const startTime = samples[0].timestamp;
    
    samples.forEach((sample, i) => {
      const x = (sample.timestamp - startTime) / 1000; // Convert to seconds
      const y = sample.heapUsed / (1024 * 1024); // Convert to MB
      
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    });
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const avgY = sumY / n;
    
    // Determine trend direction
    let direction = 'stable';
    if (slope > 0.5) direction = 'increasing';
    else if (slope < -0.5) direction = 'decreasing';
    
    return {
      direction,
      rate: slope, // MB per second
      avgMemoryMB: avgY
    };
  }
  
  detectMemoryLeak() {
    if (!this.memoryHistory || this.memoryHistory.length < 30) {
      return { hasLeak: false, confidence: 0 };
    }
    
    const samples = this.memoryHistory.slice(-30);
    const trend = this.calculateMemoryTrend();
    
    // Check for consistent memory growth
    let increasingCount = 0;
    for (let i = 1; i < samples.length; i++) {
      if (samples[i].heapUsed > samples[i - 1].heapUsed) {
        increasingCount++;
      }
    }
    
    const increasingRatio = increasingCount / (samples.length - 1);
    
    // Calculate garbage collection effectiveness
    const gcEffectiveness = this.calculateGCEffectiveness();
    
    // Leak detection criteria
    const hasLeak = 
      trend.direction === 'increasing' && 
      trend.rate > 1.0 && // Growing by more than 1MB/sec
      increasingRatio > 0.7 && // 70% of samples show increase
      gcEffectiveness < 0.3; // GC recovering less than 30% of memory
    
    const confidence = Math.min(
      (increasingRatio * 0.4) + 
      (Math.min(trend.rate, 5) / 5 * 0.4) + 
      ((1 - gcEffectiveness) * 0.2),
      1.0
    );
    
    if (hasLeak && confidence > 0.7) {
      console.error('[MEMORY LEAK] Potential memory leak detected with confidence:', (confidence * 100).toFixed(1) + '%');
    }
    
    return {
      hasLeak,
      confidence,
      increasingRatio,
      gcEffectiveness
    };
  }
  
  calculateGCEffectiveness() {
    if (!this.memoryHistory || this.memoryHistory.length < 10) {
      return 1.0; // Assume good GC if not enough data
    }
    
    const samples = this.memoryHistory.slice(-10);
    let decreases = 0;
    let totalDecrease = 0;
    let totalIncrease = 0;
    
    for (let i = 1; i < samples.length; i++) {
      const delta = samples[i].heapUsed - samples[i - 1].heapUsed;
      if (delta < 0) {
        decreases++;
        totalDecrease += Math.abs(delta);
      } else {
        totalIncrease += delta;
      }
    }
    
    if (totalIncrease === 0) return 1.0;
    
    return Math.min(totalDecrease / totalIncrease, 1.0);
  }
  
  analyzeMemoryUsage() {
    const current = this.memoryHistory[this.memoryHistory.length - 1];
    const heapUsagePercent = (current.heapUsed / current.heapTotal) * 100;
    
    let status = 'healthy';
    let recommendation = null;
    
    if (heapUsagePercent > 90) {
      status = 'critical';
      recommendation = 'Consider increasing heap size or optimizing memory usage';
    } else if (heapUsagePercent > 75) {
      status = 'warning';
      recommendation = 'Monitor memory usage closely';
    }
    
    return {
      heapUsagePercent,
      status,
      recommendation
    };
  }

  /**
   * Calculate success rates with categorization and root cause analysis
   */
  getSuccessRate(operationName = null, windowMs = null) {
    let operations = this.operationHistory;
    
    // Filter by operation name if specified
    if (operationName) {
      operations = operations.filter(op => op.name === operationName);
    }
    
    // Apply time window if specified
    if (windowMs) {
      const cutoff = Date.now() - windowMs;
      operations = operations.filter(op => 
        (op.endTime || op.startTime) && 
        (op.endTime || op.startTime) > cutoff
      );
    }
    
    if (operations.length === 0) {
      return { 
        successRate: 100, 
        errorRate: 0, 
        total: 0,
        categories: {},
        analysis: { status: 'no_data' }
      };
    }
    
    const successful = operations.filter(op => op.success).length;
    const failed = operations.filter(op => !op.success);
    const total = operations.length;
    
    // Categorize errors
    const errorCategories = this.categorizeErrors(failed);
    
    // Perform root cause analysis
    const rootCauses = this.analyzeRootCauses(failed);
    
    // Calculate rates by time periods for trend analysis
    const ratesByPeriod = this.calculateRatesByPeriod(operations);
    
    return {
      successRate: (successful / total) * 100,
      errorRate: (failed.length / total) * 100,
      total,
      successful,
      failed: failed.length,
      categories: errorCategories,
      rootCauses,
      trend: this.calculateSuccessTrend(ratesByPeriod),
      analysis: this.analyzeSuccessRate(successful / total, errorCategories)
    };
  }
  
  categorizeErrors(failedOps) {
    const categories = {};
    
    failedOps.forEach(op => {
      // Categorize by error type from metadata or result
      let category = 'unknown';
      
      if (op.result?.error) {
        const error = op.result.error;
        if (error.includes('timeout')) category = 'timeout';
        else if (error.includes('permission')) category = 'permission';
        else if (error.includes('not found')) category = 'not_found';
        else if (error.includes('network')) category = 'network';
        else if (error.includes('validation')) category = 'validation';
        else if (error.includes('memory')) category = 'resource';
        else category = 'application';
      }
      
      if (!categories[category]) {
        categories[category] = {
          count: 0,
          operations: [],
          percentage: 0
        };
      }
      
      categories[category].count++;
      categories[category].operations.push({
        name: op.name,
        timestamp: op.endTime || op.startTime,
        duration: op.duration || op.latency,
        error: op.result?.error
      });
    });
    
    // Calculate percentages
    const totalErrors = failedOps.length;
    Object.keys(categories).forEach(cat => {
      categories[cat].percentage = 
        totalErrors > 0 ? (categories[cat].count / totalErrors) * 100 : 0;
    });
    
    return categories;
  }
  
  analyzeRootCauses(failedOps) {
    const causes = [];
    
    // Group failures by time to detect patterns
    const timeGroups = this.groupByTimeWindow(failedOps, 60000); // 1 minute windows
    
    // Detect spike patterns
    timeGroups.forEach(group => {
      if (group.length > 5) {
        causes.push({
          type: 'spike',
          timestamp: group[0].endTime || group[0].startTime,
          count: group.length,
          description: `Error spike detected with ${group.length} failures`,
          operations: group.map(op => op.name)
        });
      }
    });
    
    // Detect repeated failures
    const opFailures = {};
    failedOps.forEach(op => {
      if (!opFailures[op.name]) {
        opFailures[op.name] = 0;
      }
      opFailures[op.name]++;
    });
    
    Object.entries(opFailures).forEach(([name, count]) => {
      if (count > 10) {
        causes.push({
          type: 'repeated',
          operation: name,
          count,
          description: `Operation '${name}' has high failure rate`,
          recommendation: 'Review implementation or add retry logic'
        });
      }
    });
    
    // Detect correlated failures
    const correlations = this.findCorrelatedFailures(failedOps);
    correlations.forEach(correlation => {
      causes.push({
        type: 'correlation',
        ...correlation
      });
    });
    
    return causes;
  }
  
  groupByTimeWindow(operations, windowMs) {
    const groups = [];
    let currentGroup = [];
    let currentWindowStart = null;
    
    const sorted = [...operations].sort((a, b) => 
      (a.endTime || a.startTime) - (b.endTime || b.startTime)
    );
    
    sorted.forEach(op => {
      const timestamp = op.endTime || op.startTime;
      
      if (!currentWindowStart || timestamp - currentWindowStart > windowMs) {
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
        }
        currentGroup = [op];
        currentWindowStart = timestamp;
      } else {
        currentGroup.push(op);
      }
    });
    
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
    
    return groups;
  }
  
  findCorrelatedFailures(failedOps) {
    const correlations = [];
    
    // Look for operations that frequently fail together
    const timeThreshold = 5000; // 5 seconds
    
    for (let i = 0; i < failedOps.length - 1; i++) {
      const op1 = failedOps[i];
      const relatedOps = [];
      
      for (let j = i + 1; j < failedOps.length; j++) {
        const op2 = failedOps[j];
        const timeDiff = Math.abs(
          (op2.endTime || op2.startTime) - (op1.endTime || op1.startTime)
        );
        
        if (timeDiff < timeThreshold && op1.name !== op2.name) {
          relatedOps.push(op2.name);
        }
      }
      
      if (relatedOps.length > 0) {
        const uniqueOps = [...new Set(relatedOps)];
        if (uniqueOps.length >= 2) {
          correlations.push({
            primaryOperation: op1.name,
            relatedOperations: uniqueOps,
            description: `${op1.name} failures often occur with ${uniqueOps.join(', ')}`,
            recommendation: 'Investigate dependencies between these operations'
          });
        }
      }
    }
    
    // Remove duplicate correlations
    const unique = [];
    const seen = new Set();
    
    correlations.forEach(c => {
      const key = [c.primaryOperation, ...c.relatedOperations.sort()].join(':');
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(c);
      }
    });
    
    return unique;
  }
  
  calculateRatesByPeriod(operations) {
    const periods = [];
    const periodMs = 300000; // 5 minute periods
    
    if (operations.length === 0) return periods;
    
    const sorted = [...operations].sort((a, b) => 
      (a.endTime || a.startTime) - (b.endTime || b.startTime)
    );
    
    let periodStart = sorted[0].endTime || sorted[0].startTime;
    let periodOps = [];
    
    sorted.forEach(op => {
      const timestamp = op.endTime || op.startTime;
      
      if (timestamp - periodStart > periodMs) {
        if (periodOps.length > 0) {
          const successful = periodOps.filter(o => o.success).length;
          periods.push({
            start: periodStart,
            end: periodStart + periodMs,
            total: periodOps.length,
            successRate: (successful / periodOps.length) * 100
          });
        }
        
        periodStart = timestamp;
        periodOps = [op];
      } else {
        periodOps.push(op);
      }
    });
    
    // Add last period
    if (periodOps.length > 0) {
      const successful = periodOps.filter(o => o.success).length;
      periods.push({
        start: periodStart,
        end: periodStart + periodMs,
        total: periodOps.length,
        successRate: (successful / periodOps.length) * 100
      });
    }
    
    return periods;
  }
  
  calculateSuccessTrend(ratesByPeriod) {
    if (ratesByPeriod.length < 2) {
      return { direction: 'stable', change: 0 };
    }
    
    const recent = ratesByPeriod.slice(-3); // Last 3 periods
    const older = ratesByPeriod.slice(-6, -3); // Previous 3 periods
    
    if (older.length === 0) {
      return { direction: 'stable', change: 0 };
    }
    
    const recentAvg = recent.reduce((sum, p) => sum + p.successRate, 0) / recent.length;
    const olderAvg = older.reduce((sum, p) => sum + p.successRate, 0) / older.length;
    
    const change = recentAvg - olderAvg;
    
    let direction = 'stable';
    if (change > 5) direction = 'improving';
    else if (change < -5) direction = 'degrading';
    
    return { direction, change };
  }
  
  analyzeSuccessRate(rate, errorCategories) {
    let status = 'healthy';
    let recommendations = [];
    
    if (rate < 0.9) {
      status = 'degraded';
      recommendations.push('Success rate below 90%, investigate failures');
    }
    
    if (rate < 0.8) {
      status = 'critical';
      recommendations.push('Critical: Success rate below 80%');
    }
    
    // Check for specific error patterns
    Object.entries(errorCategories).forEach(([category, data]) => {
      if (data.percentage > 30) {
        recommendations.push(`High ${category} error rate (${data.percentage.toFixed(1)}%)`);
        
        if (category === 'timeout') {
          recommendations.push('Consider increasing timeout values or optimizing slow operations');
        } else if (category === 'resource') {
          recommendations.push('Check system resources and scaling configuration');
        }
      }
    });
    
    return {
      status,
      recommendations,
      healthScore: Math.max(0, Math.min(100, rate * 100))
    };
  }
}