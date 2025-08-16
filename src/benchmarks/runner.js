import { performance } from 'perf_hooks';
import { loadScenarios } from './scenarios.js';
import { calculateMetrics } from './metrics.js';
import { exportToVault } from './reporter.js';
import fs from 'fs/promises';
import path from 'path';

export class BenchmarkRunner {
  constructor(server, config) {
    this.server = server;
    this.config = config;
    this.cacheFile = path.join(process.cwd(), 'data', 'benchmark-cache.json');
  }

  async runScenario(scenarioName) {
    const scenarios = await loadScenarios();
    const scenario = scenarios[scenarioName];
    
    if (!scenario) {
      throw new Error(`Unknown scenario: ${scenarioName}`);
    }

    console.error(`Running benchmark scenario: ${scenarioName}`);
    
    const startTime = performance.now();
    const toolCalls = [];
    const messages = [];
    
    // Track tool usage
    const originalCallTool = this.server.callTool.bind(this.server);
    this.server.callTool = async (request) => {
      toolCalls.push({
        tool: request.params.name,
        arguments: request.params.arguments,
        timestamp: performance.now() - startTime
      });
      return originalCallTool(request);
    };

    try {
      // Execute the scenario search strategy
      const results = await this.executeScenario(scenario);
      
      const endTime = performance.now();
      const executionTime = endTime - startTime;
      
      // Calculate metrics
      const metrics = calculateMetrics({
        scenario,
        results,
        executionTime,
        toolCalls,
        messages
      });
      
      // Cache results
      await this.cacheResults(scenarioName, metrics);
      
      // Export to vault
      await exportToVault(this.config.vaultPath, scenarioName, metrics);
      
      return metrics;
      
    } finally {
      // Restore original callTool
      this.server.callTool = originalCallTool;
    }
  }

  async executeScenario(scenario) {
    const results = [];
    
    for (const step of scenario.steps) {
      try {
        const stepResult = await this.executeStep(step);
        results.push(stepResult);
      } catch (error) {
        results.push({
          step: step.name,
          error: error.message,
          success: false
        });
      }
    }
    
    return results;
  }

  async executeStep(step) {
    const { tool, params } = step;
    
    const request = {
      params: {
        name: tool,
        arguments: params
      }
    };
    
    const response = await this.server.callTool(request);
    
    return {
      step: step.name,
      tool,
      params,
      response: response.content,
      success: true
    };
  }

  async runAll() {
    const scenarios = await loadScenarios();
    const results = {};
    
    for (const scenarioName of Object.keys(scenarios)) {
      try {
        results[scenarioName] = await this.runScenario(scenarioName);
      } catch (error) {
        console.error(`Failed to run scenario ${scenarioName}:`, error);
        results[scenarioName] = { error: error.message };
      }
    }
    
    return results;
  }

  async cacheResults(scenarioName, metrics) {
    // Ensure data directory exists
    await fs.mkdir(path.dirname(this.cacheFile), { recursive: true });
    
    let cache = {};
    try {
      const existing = await fs.readFile(this.cacheFile, 'utf-8');
      cache = JSON.parse(existing);
    } catch (error) {
      // File doesn't exist yet
    }
    
    cache[scenarioName] = {
      ...metrics,
      timestamp: new Date().toISOString()
    };
    
    await fs.writeFile(this.cacheFile, JSON.stringify(cache, null, 2));
  }

  async compareWithBaseline(scenarioName) {
    const groundTruthFile = path.join(process.cwd(), 'data', 'ground-truth.json');
    
    try {
      const groundTruth = JSON.parse(await fs.readFile(groundTruthFile, 'utf-8'));
      const baseline = groundTruth[scenarioName];
      
      if (!baseline) {
        return null;
      }
      
      const current = await this.runScenario(scenarioName);
      
      return {
        baseline,
        current,
        comparison: this.compareMetrics(baseline, current)
      };
    } catch (error) {
      console.error('Failed to load ground truth:', error);
      return null;
    }
  }

  compareMetrics(baseline, current) {
    return {
      ttfrDiff: current.ttfr - baseline.ttfr,
      precisionDiff: current.precision - baseline.precision,
      recallDiff: current.recall - baseline.recall,
      tokensDiff: current.tokensUsed - baseline.tokensUsed,
      improved: current.precision > baseline.precision && current.recall >= baseline.recall
    };
  }
}