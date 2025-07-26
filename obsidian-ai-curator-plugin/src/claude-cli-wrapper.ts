import { spawn } from 'child_process';
import { EventEmitter } from 'events';

export interface ClaudeCliOptions {
  model?: 'sonnet' | 'opus' | 'haiku';
  maxTokens?: number;
  temperature?: number;
  outputFormat?: 'json' | 'stream-json' | 'text';
  verbose?: boolean;
  sessionId?: string;
  tools?: string[];
}

export interface ClaudeResponse {
  content: string;
  stopReason?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cost?: {
      amount: number;
      currency: string;
    };
  };
  sessionId?: string;
  error?: string;
}

export class ClaudeCliWrapper extends EventEmitter {
  private defaultModel = 'sonnet';
  private claudeBinary: string;
  
  constructor(claudeBinary: string = 'claude') {
    super();
    this.claudeBinary = this.findClaudeBinary(claudeBinary);
  }

  private findClaudeBinary(providedPath: string): string {
    // If a specific path is provided, use it
    if (providedPath && providedPath !== 'claude') {
      return providedPath;
    }

    // Try common installation paths
    const fs = require('fs');
    const commonPaths = [
      '/opt/homebrew/bin/claude',  // Apple Silicon Homebrew
      '/usr/local/bin/claude',      // Intel Mac Homebrew
      process.env.HOME + '/.npm-global/bin/claude',  // Global npm
      'claude'  // System PATH
    ];

    for (const path of commonPaths) {
      try {
        if (fs.existsSync(path)) {
          console.log(`Found Claude CLI at: ${path}`);
          return path;
        }
      } catch (e) {
        // Continue checking other paths
      }
    }

    // Default to 'claude' and let it fail with a better error
    console.warn('Claude CLI not found in common locations. Using default "claude" - this may fail.');
    return 'claude';
  }

  /**
   * Execute a Claude CLI command with the given prompt
   */
  async execute(prompt: string, options: ClaudeCliOptions = {}): Promise<ClaudeResponse> {
    // Use stdin for long prompts to avoid shell escaping issues
    const useStdin = prompt.length > 500;
    const args = this.buildArgs(useStdin ? '' : prompt, options);
    
    console.log('[Claude CLI] Binary path:', this.claudeBinary);
    console.log('[Claude CLI] Executing with args:', args);
    console.log('[Claude CLI] Using stdin:', useStdin);
    console.log('[Claude CLI] Prompt length:', prompt.length);
    
    return new Promise((resolve, reject) => {
      // Ensure Node.js is in PATH for Claude CLI
      const env = { ...process.env };
      const nodePaths = [
        '/opt/homebrew/bin',  // Homebrew on Apple Silicon
        '/usr/local/bin',     // Homebrew on Intel / system
        '/usr/bin',           // System
      ];
      
      // Add Node paths to PATH if not already present
      const currentPath = env.PATH || '';
      const pathsToAdd = nodePaths.filter(p => !currentPath.includes(p));
      if (pathsToAdd.length > 0) {
        env.PATH = pathsToAdd.join(':') + ':' + currentPath;
      }

      // Use spawn for better handling of large inputs/outputs
      const childProcess = spawn(this.claudeBinary, args, {
        shell: false,
        env
      });

      let stdout = '';
      let stderr = '';

      const timeout = setTimeout(() => {
        childProcess.kill();
        reject(new Error('Claude CLI timed out after 60 seconds'));
      }, 60000);

      childProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      childProcess.stderr.on('data', (data) => {
        const errorStr = data.toString();
        stderr += errorStr;
        // Log stderr for debugging
        if (errorStr.trim()) {
          console.log('[Claude CLI] stderr:', errorStr);
        }
      });

      childProcess.on('close', (code) => {
        clearTimeout(timeout);
        console.log('[Claude CLI] Process closed with code:', code);
        console.log('[Claude CLI] Final stdout length:', stdout.length);
        console.log('[Claude CLI] Final stderr length:', stderr.length);
        
        if (code !== 0) {
          console.error('[Claude CLI] Process failed with code:', code);
          console.error('[Claude CLI] stderr:', stderr);
          console.error('[Claude CLI] stdout:', stdout.substring(0, 500));
          
          // Try to extract meaningful error from stderr or stdout
          let errorMessage = stderr.trim() || stdout.trim() || `Process exited with code ${code}`;
          reject(new Error(`Claude CLI failed: ${errorMessage}`));
          return;
        }

        try {
          const response = this.parseResponse(stdout, options.outputFormat);
          console.log('[Claude CLI] Parsed response:', response);
          resolve(response);
        } catch (parseError: any) {
          console.error('[Claude CLI] Parse error:', parseError);
          console.log('[Claude CLI] Raw output:', stdout.substring(0, 500));
          reject(new Error(`Failed to parse Claude response: ${parseError.message}`));
        }
      });

      childProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn Claude CLI: ${error.message}`));
      });

      // Write prompt to stdin if using stdin mode
      if (useStdin) {
        childProcess.stdin.write(prompt);
        childProcess.stdin.end();
      }
    });
  }

  /**
   * Stream execution for real-time responses
   */
  async *stream(prompt: string, options: ClaudeCliOptions = {}): AsyncGenerator<Partial<ClaudeResponse>> {
    const streamOptions = { ...options, outputFormat: 'stream-json' as const, verbose: true };
    const useStdin = prompt.length > 500;
    const args = this.buildArgs(useStdin ? '' : prompt, streamOptions);
    
    console.log('[Claude CLI] Streaming with args:', args.join(' '));
    console.log('[Claude CLI] Using stdin for stream:', useStdin);
    
    // Ensure Node.js is in PATH for Claude CLI
    const env = { ...process.env };
    const nodePaths = [
      '/opt/homebrew/bin',  // Homebrew on Apple Silicon
      '/usr/local/bin',     // Homebrew on Intel / system
      '/usr/bin',           // System
    ];
    
    // Add Node paths to PATH if not already present
    const currentPath = env.PATH || '';
    const pathsToAdd = nodePaths.filter(p => !currentPath.includes(p));
    if (pathsToAdd.length > 0) {
      env.PATH = pathsToAdd.join(':') + ':' + currentPath;
    }
    
    const childProcess = spawn(this.claudeBinary, args, {
      shell: false,
      env
    });

    let buffer = '';
    let hasError = false;
    let stderrBuffer = '';

    // Handle stderr
    childProcess.stderr.on('data', (data) => {
      stderrBuffer += data.toString();
      console.error('[Claude CLI Stream] stderr:', data.toString());
    });

    // Handle process errors
    childProcess.on('error', (error) => {
      hasError = true;
      console.error('[Claude CLI Stream] Process error:', error);
      stderrBuffer += `Process error: ${error.message}`;
    });

    // Set a timeout for the stream
    const timeout = setTimeout(() => {
      console.error('[Claude CLI Stream] Timeout after 60 seconds');
      childProcess.kill();
      hasError = true;
    }, 60000);

    // Write prompt to stdin if needed
    if (useStdin) {
      childProcess.stdin.write(prompt);
      childProcess.stdin.end();
    }

    // Read stdout stream
    for await (const chunk of childProcess.stdout) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const data = JSON.parse(line);
            yield this.parseStreamChunk(data);
          } catch (error) {
            console.error('[Claude CLI Stream] Failed to parse chunk:', line);
          }
        }
      }
    }

    // Handle any remaining buffer
    if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer);
        yield this.parseStreamChunk(data);
      } catch (error) {
        console.error('[Claude CLI Stream] Failed to parse final buffer:', buffer);
      }
    }

    // Clear timeout
    clearTimeout(timeout);

    // Check for errors
    if (hasError || stderrBuffer) {
      yield { error: stderrBuffer || 'Stream failed' };
    }
  }

  private buildArgs(prompt: string, options: ClaudeCliOptions): string[] {
    const args: string[] = [];

    // Always use print mode for programmatic usage
    args.push('--print');

    // Model selection
    args.push('--model', options.model || this.defaultModel);

    // Output format
    if (options.outputFormat) {
      args.push('--output-format', options.outputFormat);
    }

    // Session management
    if (options.sessionId) {
      args.push('--resume', options.sessionId);
    }

    // Tools/MCP servers - use allowedTools instead of --tool
    if (options.tools && options.tools.length > 0) {
      args.push('--allowedTools', options.tools.join(' '));
    }

    // Skip permissions for automated usage
    args.push('--dangerously-skip-permissions');

    // Verbose mode for streaming
    if (options.verbose) {
      args.push('--verbose');
    }

    // Add the prompt only if provided (not using stdin)
    if (prompt) {
      args.push(prompt);
    }

    return args;
  }


  private parseResponse(output: string, format?: string): ClaudeResponse {
    if (format === 'json') {
      try {
        // First try to parse as JSON directly
        const data = JSON.parse(output);
        
        // Handle Claude CLI wrapper format
        if (data.type === 'result' && data.result) {
          // Extract content from the result field
          let content = data.result;
          
          // If content contains markdown code blocks, extract the JSON
          if (typeof content === 'string' && content.includes('```json')) {
            const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
              content = jsonMatch[1].trim();
            }
          }
          
          return {
            content: content,
            stopReason: data.stop_reason,
            usage: data.usage,
            sessionId: data.session_id,
            error: data.is_error ? data.result : undefined
          };
        }
        
        // If it's a direct string response
        if (typeof data === 'string') {
          return { content: data };
        }
        
        // If it's an array or simple object, that's the actual response
        if (Array.isArray(data) || (typeof data === 'object' && !data.result && !data.content)) {
          return { content: JSON.stringify(data) };
        }
        
        // Fallback to various field names
        let content = data.result || data.content || data.response || '';
        
        return {
          content: content,
          stopReason: data.finish_reason || data.stop_reason,
          usage: data.usage,
          sessionId: data.session_id,
          error: data.error || (data.is_error ? data.result : undefined)
        };
      } catch (error) {
        console.error('[Claude CLI] Failed to parse JSON response:', error);
        console.error('[Claude CLI] Raw output:', output.substring(0, 200));
        // If JSON parsing fails, return as plain text
        return { content: output.trim() };
      }
    }

    // Default text format
    return {
      content: output.trim()
    };
  }

  private parseStreamChunk(data: any): Partial<ClaudeResponse> {
    // Handle Claude CLI stream-json format
    if (data.type === 'assistant') {
      // Extract content from assistant message
      const message = data.message;
      if (message && message.content && message.content[0]) {
        return { 
          content: message.content[0].text || '',
          usage: message.usage,
          sessionId: data.session_id
        };
      }
    } else if (data.type === 'result') {
      // Final result
      return { 
        content: data.result || '',
        sessionId: data.session_id,
        usage: data.usage
      };
    } else if (data.type === 'system') {
      // System messages (init, etc)
      return { sessionId: data.session_id };
    } else if (data.type === 'error') {
      return { error: data.message || data.error };
    }
    
    // Legacy format handling
    if (data.type === 'content') {
      return { content: data.text || '' };
    } else if (data.type === 'usage') {
      return { usage: data };
    } else if (data.type === 'session') {
      return { sessionId: data.id };
    }
    
    return {};
  }
}