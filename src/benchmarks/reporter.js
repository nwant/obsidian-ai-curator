import fs from 'fs/promises';
import path from 'path';

export async function exportToVault(vaultPath, scenarioName, metrics) {
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0];
  const timestamp = date.toISOString();
  
  // Create directory structure
  const benchmarksDir = path.join(vaultPath, 'Benchmarks');
  const resultsDir = path.join(benchmarksDir, 'Results', dateStr);
  
  await fs.mkdir(resultsDir, { recursive: true });
  
  // Generate run number for today
  const runNumber = await getNextRunNumber(resultsDir);
  const runFile = path.join(resultsDir, `run-${String(runNumber).padStart(3, '0')}.md`);
  
  // Create the benchmark result markdown
  const content = generateResultMarkdown(scenarioName, metrics, timestamp);
  await fs.writeFile(runFile, content);
  
  // Update daily summary
  await updateDailySummary(resultsDir, scenarioName, metrics, runNumber);
  
  // Update dashboard
  await updateDashboard(benchmarksDir, metrics);
  
  return runFile;
}

async function getNextRunNumber(resultsDir) {
  try {
    const files = await fs.readdir(resultsDir);
    const runFiles = files.filter(f => f.startsWith('run-') && f.endsWith('.md'));
    
    if (runFiles.length === 0) return 1;
    
    const numbers = runFiles.map(f => {
      const match = f.match(/run-(\d+)\.md/);
      return match ? parseInt(match[1]) : 0;
    });
    
    return Math.max(...numbers) + 1;
  } catch (error) {
    // Directory doesn't exist yet
    return 1;
  }
}

function generateResultMarkdown(scenarioName, metrics, timestamp) {
  const frontmatter = {
    created: timestamp,
    type: 'benchmark-result',
    scenario: scenarioName,
    tags: ['benchmark/search', 'performance']
  };
  
  let content = '---\n';
  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      content += `${key}:\n${value.map(v => `  - ${v}`).join('\n')}\n`;
    } else {
      content += `${key}: ${value}\n`;
    }
  }
  content += '---\n\n';
  
  content += `# Benchmark Run: ${scenarioName}\n\n`;
  
  // Metrics section
  content += '## Metrics\n';
  content += `- **TTFR**: ${metrics.ttfr.toFixed(2)} seconds\n`;
  content += `- **Iterations**: ${metrics.iterations}\n`;
  content += `- **Tool Calls**: ${metrics.toolCalls}\n`;
  content += `- **Tokens Used**: ${metrics.tokensUsed}\n`;
  content += `- **Success Rate**: ${(metrics.successRate * 100).toFixed(0)}%\n`;
  
  if (metrics.precision !== undefined) {
    content += `- **Precision**: ${metrics.precision.toFixed(2)}\n`;
    content += `- **Recall**: ${metrics.recall.toFixed(2)}\n`;
    content += `- **F1 Score**: ${metrics.f1Score.toFixed(2)}\n`;
  }
  
  content += '\n';
  
  // Tool breakdown
  content += '## Tool Usage\n';
  for (const [tool, count] of Object.entries(metrics.toolBreakdown)) {
    content += `- ${tool}: ${count} calls\n`;
  }
  content += '\n';
  
  // Search strategy
  content += '## Search Strategy Used\n';
  metrics.stepResults.forEach((step, index) => {
    content += `${index + 1}. ${step.step} (${step.tool})`;
    if (!step.success) {
      content += ` - FAILED: ${step.error}`;
    }
    content += '\n';
  });
  content += '\n';
  
  // Performance details
  content += '## Performance Details\n';
  content += `- Average time per step: ${(metrics.avgTimePerStep / 1000).toFixed(2)}s\n`;
  content += `- Total execution time: ${metrics.ttfr.toFixed(2)}s\n`;
  
  return content;
}

async function updateDailySummary(resultsDir, scenarioName, metrics, runNumber) {
  const summaryFile = path.join(resultsDir, 'summary.md');
  
  let summary = '';
  try {
    summary = await fs.readFile(summaryFile, 'utf-8');
  } catch (error) {
    // Create new summary
    const date = path.basename(resultsDir);
    summary = `# Benchmark Summary - ${date}\n\n`;
    summary += '## Runs Today\n\n';
    summary += '| Run | Scenario | TTFR | Precision | Recall | F1 Score | Status |\n';
    summary += '|-----|----------|------|-----------|--------|----------|--------|\n';
  }
  
  // Add new run to table
  const lines = summary.split('\n');
  const tableEnd = lines.findIndex(line => line.trim() === '' && lines[lines.indexOf(line) - 1]?.includes('|'));
  
  const newRow = `| ${String(runNumber).padStart(3, '0')} | ${scenarioName} | ${metrics.ttfr.toFixed(2)}s | ${metrics.precision.toFixed(2)} | ${metrics.recall.toFixed(2)} | ${metrics.f1Score.toFixed(2)} | ✓ |`;
  
  if (tableEnd > 0) {
    lines.splice(tableEnd, 0, newRow);
  } else {
    lines.push(newRow);
  }
  
  await fs.writeFile(summaryFile, lines.join('\n'));
}

async function updateDashboard(benchmarksDir, metrics) {
  const dashboardFile = path.join(benchmarksDir, 'Dashboard.md');
  
  try {
    // For now, just ensure the dashboard exists
    await fs.access(dashboardFile);
  } catch (error) {
    // Create initial dashboard
    const dashboard = `# Benchmark Dashboard

## Overview

This dashboard provides an overview of search benchmark performance over time.

## Latest Results

_Dashboard will be automatically updated with benchmark results_

## Performance Trends

### TTFR (Time to First Result)
_Chart placeholder_

### Search Quality (F1 Score)
_Chart placeholder_

### Token Usage
_Chart placeholder_

## Scenario Comparison

| Scenario | Best TTFR | Best F1 | Latest Run |
|----------|-----------|---------|------------|
| _Data will be populated by benchmark runs_ |

## Notes

- Benchmarks are automatically run and results stored in \`Results/\` directory
- Each run creates a detailed report with metrics and analysis
- Daily summaries aggregate all runs for that day
`;
    
    await fs.writeFile(dashboardFile, dashboard);
  }
}