/**
 * Error Handler with Automatic GitHub Issue Creation
 * Captures errors and decides whether to create bug reports
 */

import { create_bug_report } from './github/github-integration.js';

export class ErrorReporter {
  constructor(options = {}) {
    this.minSeverity = options.minSeverity || 'error';
    this.reportableTools = options.reportableTools || 'all';
    this.excludeTools = options.excludeTools || [];
    this.sessionInfo = options.sessionInfo || {};
    this.reportedErrors = new Set(); // Prevent duplicate reports
    this.errorCounts = new Map(); // Track error frequency
  }

  /**
   * Determine if an error should create a GitHub issue
   */
  shouldCreateIssue(error, context = {}) {
    // Don't report the same error multiple times in a session
    const errorKey = this.getErrorKey(error);
    if (this.reportedErrors.has(errorKey)) {
      return false;
    }

    // Don't report user errors or validation failures
    if (this.isUserError(error)) {
      return false;
    }

    // Don't report excluded tools
    if (this.excludeTools.includes(context.tool)) {
      return false;
    }

    // Check if tool is in reportable list
    if (this.reportableTools !== 'all' && !this.reportableTools.includes(context.tool)) {
      return false;
    }

    // Don't report known/expected errors
    if (this.isKnownError(error)) {
      return false;
    }

    // Track error frequency - only report if it happens multiple times
    const count = (this.errorCounts.get(errorKey) || 0) + 1;
    this.errorCounts.set(errorKey, count);
    
    // Report on first occurrence for critical errors, third occurrence for others
    const isCritical = this.isCriticalError(error);
    return isCritical ? count === 1 : count === 3;
  }

  /**
   * Generate a unique key for error deduplication
   */
  getErrorKey(error) {
    const message = error?.message || String(error);
    const stack = error?.stack || '';
    const firstStackLine = stack.split('\n')[1] || '';
    return `${message}::${firstStackLine}`.substring(0, 200);
  }

  /**
   * Check if error is a user error (validation, missing args, etc)
   */
  isUserError(error) {
    const userErrorPatterns = [
      /required/i,
      /invalid/i,
      /missing/i,
      /not found/i,
      /already exists/i,
      /permission denied/i,
      /unauthorized/i,
      /validation/i,
      /bad request/i,
      /not allowed/i
    ];

    const message = error?.message || String(error);
    return userErrorPatterns.some(pattern => pattern.test(message));
  }

  /**
   * Check if error is known/expected
   */
  isKnownError(error) {
    const knownErrors = [
      'ECONNREFUSED', // Obsidian plugin not running
      'ETIMEDOUT',    // Network timeout
      'ENOTFOUND',    // DNS issues
      'fetch failed', // Network issues
      'Cannot read properties of undefined', // Common JS error
      'Test mode enabled' // Test mode
    ];

    const message = error?.message || String(error);
    const code = error?.code || '';
    
    return knownErrors.some(known => 
      message.includes(known) || code === known
    );
  }

  /**
   * Check if error is critical (needs immediate attention)
   */
  isCriticalError(error) {
    const criticalPatterns = [
      /data loss/i,
      /corruption/i,
      /security/i,
      /infinite loop/i,
      /memory leak/i,
      /critical/i,
      /fatal/i
    ];

    const message = error?.message || String(error);
    return criticalPatterns.some(pattern => pattern.test(message));
  }

  /**
   * Capture and potentially report an error
   */
  async captureAndReport(error, context = {}) {
    try {
      // Log the error regardless
      console.error(`Error in ${context.tool || 'unknown'}:`, error);

      // Check if we should create an issue
      if (!this.shouldCreateIssue(error, context)) {
        return {
          reported: false,
          reason: 'Error does not meet reporting criteria'
        };
      }

      // Mark as reported to prevent duplicates
      const errorKey = this.getErrorKey(error);
      this.reportedErrors.add(errorKey);

      // Create the bug report
      const result = await create_bug_report({
        error,
        context: this.formatContext(context),
        toolName: context.tool,
        args: context.args,
        stackTrace: error?.stack,
        claudeSessionInfo: this.sessionInfo
      });

      console.log(`Bug report created: Issue #${result.issueNumber}`);

      return {
        reported: true,
        issueNumber: result.issueNumber,
        issueUrl: result.issueUrl,
        willAutoFix: result.triggeredWorkflow
      };

    } catch (reportError) {
      // If we can't report the error, just log it
      console.error('Failed to report error to GitHub:', reportError);
      return {
        reported: false,
        reason: `Failed to create issue: ${reportError.message}`
      };
    }
  }

  /**
   * Format context for bug report
   */
  formatContext(context) {
    const parts = [];

    if (context.description) {
      parts.push(`**Description**: ${context.description}`);
    }

    if (context.vaultPath) {
      parts.push(`**Vault Path**: \`${context.vaultPath}\``);
    }

    if (context.fileName) {
      parts.push(`**File**: \`${context.fileName}\``);
    }

    if (context.operation) {
      parts.push(`**Operation**: ${context.operation}`);
    }

    if (context.additionalInfo) {
      parts.push(`**Additional Info**: ${context.additionalInfo}`);
    }

    return parts.join('\n') || 'No additional context available';
  }

  /**
   * Create a wrapped tool function that captures errors
   */
  wrapTool(toolName, toolFunction) {
    return async (args) => {
      try {
        return await toolFunction(args);
      } catch (error) {
        // Capture and report the error
        const reportResult = await this.captureAndReport(error, {
          tool: toolName,
          args,
          operation: `Executing ${toolName}`
        });

        // Re-throw with additional info
        error.githubIssue = reportResult;
        throw error;
      }
    };
  }

  /**
   * Wrap all tools in an object with error reporting
   */
  wrapTools(tools) {
    const wrapped = {};
    for (const [name, func] of Object.entries(tools)) {
      if (typeof func === 'function') {
        wrapped[name] = this.wrapTool(name, func);
      } else {
        wrapped[name] = func;
      }
    }
    return wrapped;
  }

  /**
   * Clear error history (useful for new sessions)
   */
  clearHistory() {
    this.reportedErrors.clear();
    this.errorCounts.clear();
  }

  /**
   * Get error statistics
   */
  getStats() {
    return {
      reportedCount: this.reportedErrors.size,
      errorCounts: Array.from(this.errorCounts.entries()).map(([key, count]) => ({
        error: key.split('::')[0],
        occurrences: count
      }))
    };
  }
}

/**
 * Global error reporter instance
 */
export const globalErrorReporter = new ErrorReporter({
  minSeverity: 'error',
  reportableTools: 'all',
  excludeTools: ['test_tool'],
  sessionInfo: {
    startTime: new Date().toISOString(),
    platform: process.platform,
    nodeVersion: process.version
  }
});

/**
 * Middleware for Express/HTTP servers to catch errors
 */
export function errorMiddleware(err, req, res, next) {
  globalErrorReporter.captureAndReport(err, {
    tool: 'http_server',
    operation: `${req.method} ${req.path}`,
    args: req.body,
    additionalInfo: `Headers: ${JSON.stringify(req.headers)}`
  });

  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
    reported: true
  });
}

/**
 * Process-level error handlers
 */
export function setupGlobalErrorHandlers() {
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    globalErrorReporter.captureAndReport(error, {
      tool: 'process',
      operation: 'uncaughtException',
      additionalInfo: 'Critical error - process may be unstable'
    }).then(() => {
      // Give time for the report to be sent
      setTimeout(() => process.exit(1), 1000);
    });
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    globalErrorReporter.captureAndReport(reason, {
      tool: 'process',
      operation: 'unhandledRejection',
      additionalInfo: 'Unhandled promise rejection'
    });
  });
}
