import { performance } from 'perf_hooks';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class AutoMetricsCollector {
  constructor(config) {
    this.config = config;
    // Use a path relative to the source file, not process.cwd()
    this.metricsFile = path.join(__dirname, '..', '..', 'data', 'search-metrics.json');
    console.error('Metrics file path:', this.metricsFile);
    this.metrics = [];
    this.loadMetrics();
  }

  async loadMetrics() {
    try {
      const data = await fs.readFile(this.metricsFile, 'utf-8');
      this.metrics = JSON.parse(data);
    } catch (error) {
      this.metrics = [];
    }
  }

  async saveMetrics() {
    try {
      await fs.mkdir(path.dirname(this.metricsFile), { recursive: true });
      await fs.writeFile(this.metricsFile, JSON.stringify(this.metrics, null, 2));
      console.error(`Metrics saved: ${this.metrics.length} total entries`);
    } catch (error) {
      console.error('Failed to save metrics:', error);
    }
  }

  async trackSearchOperation(toolName, params, operation) {
    const startTime = performance.now();
    let result;
    let error;
    let resultCount = 0;

    try {
      result = await operation();
      
      // Extract result count based on tool type
      switch (toolName) {
        case 'vault_scan':
          resultCount = result.content?.[0]?.text ? 
            JSON.parse(result.content[0].text).files?.length || 0 : 0;
          break;
        case 'search_content':
          resultCount = result.content?.[0]?.text ? 
            JSON.parse(result.content[0].text).matches?.length || 0 : 0;
          break;
        case 'find_by_metadata':
          resultCount = result.content?.[0]?.text ? 
            JSON.parse(result.content[0].text).paths?.length || 0 : 0;
          break;
        case 'get_working_context':
          resultCount = result.content?.[0]?.text ? 
            JSON.parse(result.content[0].text).notes?.length || 0 : 0;
          break;
      }
    } catch (err) {
      error = err.message;
      throw err;
    } finally {
      const endTime = performance.now();
      const duration = endTime - startTime;

      const metric = {
        timestamp: new Date().toISOString(),
        tool: toolName,
        params: this.sanitizeParams(params),
        duration,
        resultCount,
        success: !error,
        error
      };

      this.metrics.push(metric);
      console.error(`Metric tracked: ${toolName} - ${duration.toFixed(2)}ms - ${resultCount} results`);
      
      // Keep only last 1000 metrics to prevent unbounded growth
      if (this.metrics.length > 1000) {
        this.metrics = this.metrics.slice(-1000);
      }

      // Save metrics asynchronously without blocking
      this.saveMetrics().catch(console.error);
    }

    return result;
  }

  sanitizeParams(params) {
    // Remove potentially sensitive content from params
    const sanitized = { ...params };
    if (sanitized.content) {
      sanitized.content = '<content>';
    }
    if (sanitized.query && sanitized.query.length > 50) {
      sanitized.query = sanitized.query.substring(0, 50) + '...';
    }
    return sanitized;
  }

  getAggregatedMetrics(timeWindow = 24 * 60 * 60 * 1000) {
    const cutoff = Date.now() - timeWindow;
    const recentMetrics = this.metrics.filter(m => 
      new Date(m.timestamp).getTime() > cutoff
    );

    const byTool = {};
    
    recentMetrics.forEach(metric => {
      if (!byTool[metric.tool]) {
        byTool[metric.tool] = {
          count: 0,
          totalDuration: 0,
          avgDuration: 0,
          successRate: 0,
          avgResultCount: 0,
          successCount: 0,
          totalResults: 0
        };
      }

      const toolMetrics = byTool[metric.tool];
      toolMetrics.count++;
      toolMetrics.totalDuration += metric.duration;
      if (metric.success) {
        toolMetrics.successCount++;
        toolMetrics.totalResults += metric.resultCount || 0;
      }
    });

    // Calculate averages
    Object.keys(byTool).forEach(tool => {
      const metrics = byTool[tool];
      metrics.avgDuration = metrics.totalDuration / metrics.count;
      metrics.successRate = metrics.successCount / metrics.count;
      metrics.avgResultCount = metrics.totalResults / metrics.successCount || 0;
    });

    return {
      timeWindow: `Last ${timeWindow / (60 * 60 * 1000)} hours`,
      totalOperations: recentMetrics.length,
      byTool
    };
  }

  async exportDailyReport() {
    const report = this.getAggregatedMetrics();
    const reportPath = path.join(
      this.config.vaultPath,
      'Benchmarks',
      'Daily-Reports',
      `search-metrics-${new Date().toISOString().split('T')[0]}.md`
    );

    const content = `# Search Metrics Daily Report
Generated: ${new Date().toISOString()}

## Summary
- Total Operations: ${report.totalOperations}
- Time Window: ${report.timeWindow}

## Performance by Tool

${Object.entries(report.byTool).map(([tool, metrics]) => `
### ${tool}
- **Total Calls**: ${metrics.count}
- **Average Duration**: ${metrics.avgDuration.toFixed(2)}ms
- **Success Rate**: ${(metrics.successRate * 100).toFixed(1)}%
- **Average Results**: ${metrics.avgResultCount.toFixed(1)}
`).join('\n')}

## Trends
${this.generateTrends()}

## Raw Metrics
\`\`\`json
${JSON.stringify(report, null, 2)}
\`\`\`
`;

    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, content);
    
    return reportPath;
  }

  generateTrends() {
    if (this.metrics.length < 10) {
      return 'Not enough data to generate trends.';
    }

    const recentMetrics = this.metrics.slice(-100);
    const oldMetrics = this.metrics.slice(-200, -100);

    if (oldMetrics.length === 0) {
      return 'Not enough historical data for trend analysis.';
    }

    const calculateAvgDuration = (metrics) => {
      const durations = metrics.map(m => m.duration);
      return durations.reduce((a, b) => a + b, 0) / durations.length;
    };

    const recentAvg = calculateAvgDuration(recentMetrics);
    const oldAvg = calculateAvgDuration(oldMetrics);
    const change = ((recentAvg - oldAvg) / oldAvg) * 100;

    if (Math.abs(change) < 5) {
      return '- Performance is stable';
    } else if (change > 0) {
      return `- ⚠️ Performance degradation detected: ${change.toFixed(1)}% slower`;
    } else {
      return `- ✅ Performance improvement: ${Math.abs(change).toFixed(1)}% faster`;
    }
  }
}