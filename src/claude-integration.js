import { spawn } from 'child_process';
import EventEmitter from 'events';

export class ClaudeIntegration extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.claudeBinary = config.claudeBinary || 'claude';
    this.sessions = new Map();
    this.usageStats = {
      opus: { tokens: 0, requests: 0 },
      sonnet: { tokens: 0, requests: 0 },
      lastReset: new Date()
    };
    this.opusUsagePercent = 0;
  }

  /**
   * Get the appropriate model based on usage
   */
  getOptimalModel() {
    // Reset daily if needed
    const now = new Date();
    const timeSinceReset = now - this.usageStats.lastReset;
    if (timeSinceReset > 24 * 60 * 60 * 1000) {
      this.resetUsageStats();
    }

    // Calculate Opus usage percentage
    const totalUsage = this.usageStats.opus.tokens + this.usageStats.sonnet.tokens;
    this.opusUsagePercent = totalUsage > 0 ? (this.usageStats.opus.tokens / totalUsage) * 100 : 0;

    // Use Opus 4 for up to 50% of usage, then switch to Sonnet 4
    if (this.opusUsagePercent < 50) {
      console.log(`Using Opus 4 (current usage: ${this.opusUsagePercent.toFixed(1)}%)`);
      return 'opus';
    } else {
      console.log(`Using Sonnet 4 (Opus usage at: ${this.opusUsagePercent.toFixed(1)}%)`);
      return 'sonnet';
    }
  }

  /**
   * Send a message to Claude and get a response
   */
  async sendMessage(sessionId, message, options = {}) {
    // Determine which model to use
    const model = options.model || this.getOptimalModel();
    
    const args = [
      '--print',
      '--model', model,
      '--output-format', 'json',
      '--dangerously-skip-permissions'
    ];

    // Handle session resumption
    if (sessionId && this.sessions.has(sessionId)) {
      args.push('--resume', sessionId);
    }

    // Add MCP tools if specified
    if (options.tools && options.tools.length > 0) {
      args.push('--allowedTools', options.tools.join(' '));
    }

    return new Promise((resolve, reject) => {
      const claudeProcess = spawn(this.claudeBinary, args, {
        cwd: this.config.vaultPath,
        env: {
          ...process.env,
          PATH: this.enhancePath(process.env.PATH)
        },
        // No timeout - let Claude take as long as needed
        timeout: 0
      });

      let stdout = '';
      let stderr = '';

      claudeProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      claudeProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      claudeProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Claude process failed: ${stderr || stdout}`));
          return;
        }

        try {
          const response = this.parseResponse(stdout);
          
          // Store session ID for future use
          if (response.sessionId) {
            this.sessions.set(response.sessionId, {
              id: response.sessionId,
              created: new Date(),
              lastUsed: new Date()
            });
          }

          // Track usage
          this.trackUsage(model, response.usage);

          resolve(response);
        } catch (error) {
          reject(new Error(`Failed to parse Claude response: ${error.message}`));
        }
      });

      claudeProcess.on('error', (error) => {
        reject(new Error(`Failed to spawn Claude: ${error.message}`));
      });

      // Send the message via stdin
      claudeProcess.stdin.write(message);
      claudeProcess.stdin.end();
    });
  }

  /**
   * Stream a response from Claude
   */
  async *streamMessage(sessionId, message, options = {}) {
    // Determine which model to use
    const model = options.model || this.getOptimalModel();
    
    const args = [
      '--print',
      '--model', model,
      '--output-format', 'stream-json',
      '--dangerously-skip-permissions',
      '--verbose'
    ];

    if (sessionId && this.sessions.has(sessionId)) {
      args.push('--resume', sessionId);
    }

    if (options.tools && options.tools.length > 0) {
      args.push('--allowedTools', options.tools.join(' '));
    }

    const claudeProcess = spawn(this.claudeBinary, args, {
      cwd: this.config.vaultPath,
      env: {
        ...process.env,
        PATH: this.enhancePath(process.env.PATH)
      },
      // No timeout for streaming
      timeout: 0
    });

    let buffer = '';

    // Send message
    claudeProcess.stdin.write(message);
    claudeProcess.stdin.end();

    // Stream stdout
    for await (const chunk of claudeProcess.stdout) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const data = JSON.parse(line);
            yield this.parseStreamChunk(data);
          } catch (error) {
            console.error('Failed to parse stream chunk:', line);
          }
        }
      }
    }

    // Handle remaining buffer
    if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer);
        yield this.parseStreamChunk(data);
      } catch (error) {
        console.error('Failed to parse final buffer:', buffer);
      }
    }
  }

  /**
   * Get active sessions
   */
  getSessions() {
    return Array.from(this.sessions.values());
  }

  /**
   * Clear old sessions
   */
  cleanupSessions() {
    const now = new Date();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [id, session] of this.sessions) {
      if (now - session.lastUsed > maxAge) {
        this.sessions.delete(id);
      }
    }
  }

  /**
   * Enhance PATH to include common Node.js locations
   */
  enhancePath(currentPath = '') {
    const nodePaths = [
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin'
    ];
    
    const paths = [...nodePaths, ...currentPath.split(':')].filter(Boolean);
    return [...new Set(paths)].join(':');
  }

  /**
   * Parse Claude's response
   */
  parseResponse(output) {
    try {
      const data = JSON.parse(output);
      
      // Handle different response formats
      if (data.type === 'result' && data.result) {
        return {
          content: data.result,
          sessionId: data.session_id,
          usage: data.usage,
          stopReason: data.stop_reason
        };
      }
      
      // Direct response format
      if (data.content || data.result) {
        return {
          content: data.content || data.result,
          sessionId: data.session_id,
          usage: data.usage
        };
      }
      
      // Fallback
      return { content: output };
    } catch (error) {
      // If not JSON, return as plain text
      return { content: output.trim() };
    }
  }

  /**
   * Parse streaming chunk
   */
  parseStreamChunk(data) {
    console.log('Claude stream data:', JSON.stringify(data).substring(0, 200));
    
    if (data.type === 'assistant') {
      const message = data.message;
      if (message && message.content && message.content[0]) {
        // Check if this is thinking/reasoning content
        const contentItem = message.content[0];
        const isThinking = contentItem.type === 'thinking' || 
                          contentItem.thinking === true ||
                          (contentItem.text && contentItem.text.includes('<thinking>'));
        
        return {
          type: 'content',
          content: contentItem.text || '',
          sessionId: data.session_id,
          isFull: true,  // Claude sends full content, not deltas
          thinking: isThinking
        };
      }
    } else if (data.type === 'thinking') {
      // Explicit thinking type
      return {
        type: 'thinking',
        content: data.content || data.message || '',
        sessionId: data.session_id
      };
    } else if (data.type === 'result') {
      return {
        type: 'result',
        content: data.result || '',
        sessionId: data.session_id,
        usage: data.usage,
        isFull: true  // This is always the full result
      };
    } else if (data.type === 'error') {
      return {
        type: 'error',
        error: data.message || data.error
      };
    }
    
    return { type: 'system', data };
  }

  /**
   * Track usage statistics
   */
  trackUsage(model, usage) {
    if (!usage || !usage.outputTokens) return;

    const modelKey = model.toLowerCase();
    if (this.usageStats[modelKey]) {
      this.usageStats[modelKey].tokens += (usage.inputTokens || 0) + (usage.outputTokens || 0);
      this.usageStats[modelKey].requests += 1;
    }

    // Emit usage event
    this.emit('usage', {
      model,
      usage,
      stats: this.getUsageStats()
    });
  }

  /**
   * Reset usage statistics
   */
  resetUsageStats() {
    this.usageStats = {
      opus: { tokens: 0, requests: 0 },
      sonnet: { tokens: 0, requests: 0 },
      lastReset: new Date()
    };
    this.opusUsagePercent = 0;
  }

  /**
   * Get current usage statistics
   */
  getUsageStats() {
    const totalTokens = this.usageStats.opus.tokens + this.usageStats.sonnet.tokens;
    const totalRequests = this.usageStats.opus.requests + this.usageStats.sonnet.requests;

    return {
      opus: {
        ...this.usageStats.opus,
        percentage: totalTokens > 0 ? (this.usageStats.opus.tokens / totalTokens) * 100 : 0
      },
      sonnet: {
        ...this.usageStats.sonnet,
        percentage: totalTokens > 0 ? (this.usageStats.sonnet.tokens / totalTokens) * 100 : 0
      },
      total: {
        tokens: totalTokens,
        requests: totalRequests
      },
      lastReset: this.usageStats.lastReset,
      currentModel: this.getOptimalModel()
    };
  }
}