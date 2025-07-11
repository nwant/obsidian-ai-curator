export function calculateMetrics({ scenario, results, executionTime, toolCalls }) {
  const metrics = {
    // Time to First Result (in seconds)
    ttfr: executionTime / 1000,
    
    // Number of iterations/steps
    iterations: scenario.steps.length,
    
    // Total tool calls made
    toolCalls: toolCalls.length,
    
    // Tool call breakdown
    toolBreakdown: getToolBreakdown(toolCalls),
    
    // Execution time per step
    avgTimePerStep: executionTime / scenario.steps.length,
    
    // Success rate
    successRate: calculateSuccessRate(results),
    
    // Quality metrics (if expected results provided)
    precision: 0,
    recall: 0,
    f1Score: 0,
    
    // Token usage (placeholder - would need actual token counting)
    tokensUsed: estimateTokenUsage(toolCalls, results),
    
    // Detailed results
    stepResults: results.map((result, index) => ({
      step: scenario.steps[index].name,
      tool: scenario.steps[index].tool,
      success: result.success,
      error: result.error,
      responseSize: result.response ? JSON.stringify(result.response).length : 0
    })),
    
    // Timestamp
    timestamp: new Date().toISOString()
  };
  
  // Calculate precision/recall if expected results are provided
  if (scenario.expectedResults && scenario.expectedResults.length > 0) {
    const qualityMetrics = calculateQualityMetrics(results, scenario.expectedResults);
    metrics.precision = qualityMetrics.precision;
    metrics.recall = qualityMetrics.recall;
    metrics.f1Score = qualityMetrics.f1Score;
  }
  
  return metrics;
}

function getToolBreakdown(toolCalls) {
  const breakdown = {};
  
  for (const call of toolCalls) {
    breakdown[call.tool] = (breakdown[call.tool] || 0) + 1;
  }
  
  return breakdown;
}

function calculateSuccessRate(results) {
  const successful = results.filter(r => r.success).length;
  return results.length > 0 ? successful / results.length : 0;
}

function estimateTokenUsage(toolCalls, results) {
  // Rough estimation based on request/response sizes
  let tokens = 0;
  
  // Estimate tokens for tool calls
  for (const call of toolCalls) {
    tokens += estimateTokensFromObject(call.arguments);
  }
  
  // Estimate tokens for results
  for (const result of results) {
    if (result.response) {
      tokens += estimateTokensFromObject(result.response);
    }
  }
  
  return Math.round(tokens);
}

function estimateTokensFromObject(obj) {
  // Very rough estimation: ~4 characters per token
  const jsonString = JSON.stringify(obj);
  return Math.ceil(jsonString.length / 4);
}

function calculateQualityMetrics(results, expectedResults) {
  // Extract actual results from the search operations
  const actualResults = extractActualResults(results);
  
  // Convert expected results to a Set for efficient lookup
  const expectedSet = new Set(expectedResults);
  const actualSet = new Set(actualResults);
  
  // Calculate true positives, false positives, false negatives
  let truePositives = 0;
  let falsePositives = 0;
  
  for (const result of actualSet) {
    if (expectedSet.has(result)) {
      truePositives++;
    } else {
      falsePositives++;
    }
  }
  
  const falseNegatives = expectedSet.size - truePositives;
  
  // Calculate metrics
  const precision = actualSet.size > 0 ? truePositives / actualSet.size : 0;
  const recall = expectedSet.size > 0 ? truePositives / expectedSet.size : 0;
  const f1Score = (precision + recall) > 0 
    ? 2 * (precision * recall) / (precision + recall) 
    : 0;
  
  return {
    precision: Math.round(precision * 100) / 100,
    recall: Math.round(recall * 100) / 100,
    f1Score: Math.round(f1Score * 100) / 100,
    truePositives,
    falsePositives,
    falseNegatives
  };
}

function extractActualResults(results) {
  const actualResults = [];
  
  for (const result of results) {
    if (result.success && result.response) {
      // Extract file paths from different tool responses
      if (result.tool === 'find_by_metadata' && result.response.notes) {
        actualResults.push(...result.response.notes.map(n => n.path));
      } else if (result.tool === 'search_content' && result.response.matches) {
        actualResults.push(...result.response.matches.map(m => m.path));
      } else if (result.tool === 'vault_scan' && result.response.files) {
        actualResults.push(...result.response.files.map(f => f.path));
      } else if (result.tool === 'read_notes' && result.response.notes) {
        actualResults.push(...result.response.notes.map(n => n.path));
      }
    }
  }
  
  // Remove duplicates
  return [...new Set(actualResults)];
}

export function compareMetrics(baseline, current) {
  return {
    ttfr: {
      baseline: baseline.ttfr,
      current: current.ttfr,
      diff: current.ttfr - baseline.ttfr,
      percentChange: ((current.ttfr - baseline.ttfr) / baseline.ttfr) * 100
    },
    precision: {
      baseline: baseline.precision,
      current: current.precision,
      diff: current.precision - baseline.precision,
      improved: current.precision > baseline.precision
    },
    recall: {
      baseline: baseline.recall,
      current: current.recall,
      diff: current.recall - baseline.recall,
      improved: current.recall > baseline.recall
    },
    f1Score: {
      baseline: baseline.f1Score,
      current: current.f1Score,
      diff: current.f1Score - baseline.f1Score,
      improved: current.f1Score > baseline.f1Score
    },
    tokens: {
      baseline: baseline.tokensUsed,
      current: current.tokensUsed,
      diff: current.tokensUsed - baseline.tokensUsed,
      percentChange: ((current.tokensUsed - baseline.tokensUsed) / baseline.tokensUsed) * 100
    },
    overallImproved: current.f1Score > baseline.f1Score && current.ttfr <= baseline.ttfr * 1.1
  };
}