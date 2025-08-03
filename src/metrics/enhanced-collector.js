/**
 * Enhanced metrics collector that combines auto-collection with performance monitoring
 */

import { performance } from 'perf_hooks';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { PerformanceMonitor } from './performance-monitor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class EnhancedMetricsCollector {
  constructor(config, server) {
    this.config = config;
    this.server = server;
    
    // Initialize performance monitor
    this.performanceMonitor = new PerformanceMonitor(config);
    
    // Metrics storage
    this.metricsFile = path.join(__dirname, '..', '..', 'data', 'search-metrics.json');
    this.metrics = [];
    this.sessionMetrics = {
      startTime: Date.now(),
      toolCalls: new Map(),
      errors: new Map()
    };
    
    this.isRunning = false;
  }

  /**
   * Start metrics collection
   */
  async start() {
    await this.loadMetrics();
    this.performanceMonitor.start();
    this.isRunning = true;
    
    // Schedule periodic metrics export
    this.exportInterval = setInterval(() => {
      this.exportSessionMetrics();
    }, this.config.metricsExportInterval || 300000); // 5 minutes default
    
    console.error('[Enhanced Metrics] Collection started');
  }

  /**
   * Stop metrics collection
   */
  async stop() {
    this.isRunning = false;
    
    if (this.exportInterval) {
      clearInterval(this.exportInterval);
    }
    
    await this.performanceMonitor.stop();
    await this.exportSessionMetrics();
    await this.saveMetrics();
    
    console.error('[Enhanced Metrics] Collection stopped');
  }

  /**
   * Track a tool call with performance monitoring
   */
  async trackToolCall(toolName, args, fn) {
    const metadata = {
      toolName,
      args: this.sanitizeArgs(args),
      timestamp: Date.now()
    };
    
    // Track in session metrics
    const toolMetrics = this.sessionMetrics.toolCalls.get(toolName) || {
      count: 0,
      totalTime: 0,
      errors: 0
    };
    
    try {
      // Track with performance monitor
      const result = await this.performanceMonitor.trackOperation(
        `tool:${toolName}`,
        fn,
        metadata
      );
      
      // Update session metrics
      toolMetrics.count++;
      this.sessionMetrics.toolCalls.set(toolName, toolMetrics);
      
      return result;
    } catch (error) {
      // Track error
      toolMetrics.errors++;
      this.sessionMetrics.toolCalls.set(toolName, toolMetrics);
      
      const errorCount = this.sessionMetrics.errors.get(toolName) || 0;
      this.sessionMetrics.errors.set(toolName, errorCount + 1);
      
      throw error;
    }
  }

  /**
   * Track a manual metric
   */
  trackMetric(category, name, value, metadata = {}) {
    const metric = {
      category,
      name,
      value,
      metadata,
      timestamp: Date.now()
    };
    
    this.metrics.push(metric);
    
    // Limit metrics history
    const maxMetrics = this.config.maxMetricsHistory || 10000;
    if (this.metrics.length > maxMetrics) {
      this.metrics = this.metrics.slice(-maxMetrics);
    }
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics() {
    return this.performanceMonitor.getMetrics();
  }

  /**
   * Get session metrics
   */
  getSessionMetrics() {
    const duration = Date.now() - this.sessionMetrics.startTime;
    const toolStats = {};
    
    // Calculate tool statistics
    for (const [tool, metrics] of this.sessionMetrics.toolCalls.entries()) {
      toolStats[tool] = {
        ...metrics,
        avgTime: metrics.totalTime > 0 ? metrics.totalTime / metrics.count : 0,
        errorRate: metrics.count > 0 ? (metrics.errors / metrics.count) * 100 : 0
      };
    }
    
    return {
      duration,
      totalCalls: Array.from(this.sessionMetrics.toolCalls.values())
        .reduce((sum, m) => sum + m.count, 0),
      totalErrors: Array.from(this.sessionMetrics.errors.values())
        .reduce((sum, count) => sum + count, 0),
      toolStats,
      performance: this.getPerformanceMetrics()
    };
  }

  /**
   * Generate metrics report
   */
  async generateReport(format = 'markdown') {
    const sessionMetrics = this.getSessionMetrics();
    const perfReport = this.performanceMonitor.generateReport();
    
    if (format === 'markdown') {
      let report = '# Metrics Report\n\n';
      report += `Generated: ${new Date().toISOString()}\n\n`;
      
      // Session summary
      report += '## Session Summary\n';
      report += `- Duration: ${Math.floor(sessionMetrics.duration / 60000)} minutes\n`;
      report += `- Total Tool Calls: ${sessionMetrics.totalCalls}\n`;
      report += `- Total Errors: ${sessionMetrics.totalErrors}\n`;
      report += `- Error Rate: ${sessionMetrics.totalCalls > 0 ? ((sessionMetrics.totalErrors / sessionMetrics.totalCalls) * 100).toFixed(2) : 0}%\n\n`;
      
      // Tool usage
      report += '## Tool Usage\n';
      const sortedTools = Object.entries(sessionMetrics.toolStats)
        .sort((a, b) => b[1].count - a[1].count);
      
      for (const [tool, stats] of sortedTools) {
        report += `\n### ${tool}\n`;
        report += `- Calls: ${stats.count}\n`;
        report += `- Errors: ${stats.errors}\n`;
        report += `- Error Rate: ${stats.errorRate.toFixed(2)}%\n`;
      }
      
      // Performance metrics
      report += '\n---\n\n';
      report += perfReport;
      
      return report;
    } else if (format === 'json') {
      return {
        session: sessionMetrics,
        performance: this.getPerformanceMetrics(),
        history: this.metrics.slice(-100) // Last 100 metrics
      };
    }
  }

  /**
   * Export session metrics to vault
   */
  async exportSessionMetrics() {
    if (!this.config.vaultPath || !this.server) return;
    
    try {
      const report = await this.generateReport('markdown');
      const date = new Date();
      const dateStr = date.toISOString().split('T')[0];
      
      // Write to file system instead of using server to avoid circular dependency
      const metricsDir = path.join(this.config.vaultPath, 'Metrics');
      await fs.mkdir(metricsDir, { recursive: true });
      
      const metricsPath = path.join(metricsDir, `${dateStr}-session.md`);
      await fs.writeFile(metricsPath, report, 'utf-8');
      
      console.error(`[Enhanced Metrics] Exported session metrics to ${metricsPath}`);
    } catch (error) {
      console.error('[Enhanced Metrics] Failed to export session metrics:', error.message);
    }
  }

  /**
   * Sanitize arguments for storage
   */
  sanitizeArgs(args) {
    if (!args) return {};
    
    const sanitized = {};
    for (const [key, value] of Object.entries(args)) {
      if (key === 'content' || key === 'query') {
        // Truncate long content
        sanitized[key] = typeof value === 'string' && value.length > 100 
          ? value.substring(0, 100) + '...' 
          : value;
      } else if (typeof value === 'object' && value !== null) {
        // Don't store complex objects
        sanitized[key] = '[object]';
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /**
   * Load historical metrics
   */
  async loadMetrics() {
    try {
      const data = await fs.readFile(this.metricsFile, 'utf-8');
      this.metrics = JSON.parse(data);
    } catch (error) {
      this.metrics = [];
    }
  }

  /**
   * Save metrics to file
   */
  async saveMetrics() {
    try {
      await fs.mkdir(path.dirname(this.metricsFile), { recursive: true });
      await fs.writeFile(this.metricsFile, JSON.stringify(this.metrics, null, 2));
    } catch (error) {
      console.error('[Enhanced Metrics] Failed to save metrics:', error.message);
    }
  }
}