import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class MCPBridgeHandler {
  constructor(config) {
    this.config = config;
    this.mcpServerPath = path.join(__dirname, 'mcp-server.js');
    this.activeProcesses = new Map();
  }

  async handleRequest(message) {
    const { id, tool, args, obsidianContext } = message;
    
    // If we have Obsidian context, use it for optimized operations
    if (obsidianContext) {
      return await this.handleOptimizedRequest(tool, args, obsidianContext);
    }
    
    // Otherwise, fall back to MCP server
    return await this.callMCPServer(tool, args);
  }

  async handleOptimizedRequest(tool, args, context) {
    switch (tool) {
      case 'vault_scan':
        return this.optimizedVaultScan(args, context);
      case 'search_content':
        return this.optimizedSearch(args, context);
      case 'find_by_metadata':
        return this.optimizedMetadataSearch(args, context);
      case 'get_tags':
        return this.getTags(args, context);
      case 'get_links':
        return this.getLinks(args, context);
      case 'get_backlinks':
        return this.getBacklinks(args, context);
      default:
        // Fall back to MCP server for other operations
        return await this.callMCPServer(tool, args);
    }
  }

  async optimizedVaultScan(args, context) {
    const { files, metadata } = context;
    const results = [];
    
    for (const file of files) {
      // Check patterns if provided
      if (args.patterns && !this.matchesPatterns(file.path, args.patterns)) {
        continue;
      }
      
      const fileInfo = {
        path: file.path,
        modified: file.modified,
        size: file.size
      };
      
      if (args.includeStats) {
        fileInfo.wordCount = file.wordCount;
      }
      
      if (args.includePreview) {
        fileInfo.preview = file.preview;
      }
      
      if (args.includeFrontmatter && metadata[file.path]) {
        fileInfo.frontmatter = metadata[file.path].frontmatter;
      }
      
      results.push(fileInfo);
    }
    
    // Sort results
    if (args.sortBy) {
      results.sort((a, b) => {
        switch (args.sortBy) {
          case 'modified':
            return b.modified - a.modified;
          case 'path':
            return a.path.localeCompare(b.path);
          case 'size':
            return b.size - a.size;
          default:
            return 0;
        }
      });
    }
    
    // Apply limit
    if (args.limit) {
      return { content: results.slice(0, args.limit) };
    }
    
    return { content: results };
  }

  async optimizedSearch(args, context) {
    const { searchResults } = context;
    const maxResults = args.maxResults || 50;
    
    // Filter and format results
    const results = searchResults
      .filter(result => result.score > 0)
      .slice(0, maxResults)
      .map(result => ({
        path: result.path,
        content: result.content,
        score: result.score,
        matches: result.matches
      }));
    
    return { content: results };
  }

  async optimizedMetadataSearch(args, context) {
    const { files, metadata } = context;
    const results = [];
    
    for (const file of files) {
      const fileMeta = metadata[file.path];
      if (!fileMeta) continue;
      
      // Check date filters
      if (args.modifiedAfter || args.modifiedBefore) {
        const modifiedTime = file.modified;
        if (args.modifiedAfter && modifiedTime < new Date(args.modifiedAfter).getTime()) {
          continue;
        }
        if (args.modifiedBefore && modifiedTime > new Date(args.modifiedBefore).getTime()) {
          continue;
        }
      }
      
      // Check frontmatter filters
      if (args.frontmatter && fileMeta.frontmatter) {
        if (!this.matchesFrontmatterQuery(fileMeta.frontmatter, args.frontmatter)) {
          continue;
        }
      }
      
      // Check word count filters
      if (args.minWords || args.maxWords) {
        const wordCount = file.wordCount;
        
        if (args.minWords && wordCount < args.minWords) continue;
        if (args.maxWords && wordCount > args.maxWords) continue;
      }
      
      results.push({
        path: file.path,
        frontmatter: fileMeta.frontmatter || {},
        modified: new Date(file.modified).toISOString()
      });
    }
    
    return { content: results };
  }

  async getTags(args, context) {
    const { tags } = context;
    
    if (args.path) {
      // Get tags for specific file
      const fileTags = tags.byFile[args.path] || {};
      return { content: { tags: fileTags } };
    } else {
      // Get all tags in vault
      return { content: { tags: tags.all } };
    }
  }

  async getLinks(args, context) {
    const { links } = context;
    const fileLinks = links.outgoing[args.path] || [];
    return { content: { links: fileLinks } };
  }

  async getBacklinks(args, context) {
    const { links } = context;
    const backlinks = links.incoming[args.path] || [];
    return { content: { backlinks } };
  }

  async callMCPServer(tool, args) {
    return new Promise((resolve, reject) => {
      const request = {
        jsonrpc: '2.0',
        id: Date.now().toString(),
        method: 'tools/call',
        params: {
          name: tool,
          arguments: args
        }
      };

      const mcpProcess = spawn('node', [this.mcpServerPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          OBSIDIAN_VAULT_PATH: this.config.vaultPath
        }
      });

      let responseBuffer = '';
      let errorBuffer = '';

      mcpProcess.stdout.on('data', (data) => {
        responseBuffer += data.toString();
        
        // Try to parse complete JSON responses
        try {
          const lines = responseBuffer.split('\n');
          for (const line of lines) {
            if (line.trim()) {
              const response = JSON.parse(line);
              if (response.id === request.id) {
                mcpProcess.kill();
                if (response.error) {
                  reject(new Error(response.error.message));
                } else {
                  resolve(response.result);
                }
                return;
              }
            }
          }
        } catch (e) {
          // Not a complete JSON yet, continue buffering
        }
      });

      mcpProcess.stderr.on('data', (data) => {
        errorBuffer += data.toString();
      });

      mcpProcess.on('error', (err) => {
        reject(err);
      });

      mcpProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`MCP server exited with code ${code}: ${errorBuffer}`));
        }
      });

      // Send request
      mcpProcess.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  // Helper methods
  matchesPatterns(path, patterns) {
    return patterns.some(pattern => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
      return regex.test(path);
    });
  }

  matchesFrontmatterQuery(frontmatter, query) {
    for (const [key, value] of Object.entries(query)) {
      if (value && typeof value === 'object') {
        // Handle special operators
        if ('$exists' in value) {
          if (value.$exists && !(key in frontmatter)) return false;
          if (!value.$exists && key in frontmatter) return false;
        }
        if ('$empty' in value) {
          const fmValue = frontmatter[key];
          const isEmpty = !fmValue || (Array.isArray(fmValue) && fmValue.length === 0);
          if (value.$empty && !isEmpty) return false;
          if (!value.$empty && isEmpty) return false;
        }
        if ('$regex' in value) {
          const regex = new RegExp(value.$regex);
          if (!regex.test(String(frontmatter[key] || ''))) return false;
        }
        if ('$not' in value) {
          if (frontmatter[key] === value.$not) return false;
        }
        if ('$gt' in value || '$gte' in value || '$lt' in value || '$lte' in value) {
          const fmValue = frontmatter[key];
          if (typeof fmValue !== 'number') return false;
          if ('$gt' in value && fmValue <= value.$gt) return false;
          if ('$gte' in value && fmValue < value.$gte) return false;
          if ('$lt' in value && fmValue >= value.$lt) return false;
          if ('$lte' in value && fmValue > value.$lte) return false;
        }
        if ('$in' in value) {
          if (!value.$in.includes(frontmatter[key])) return false;
        }
      } else {
        // Direct value comparison
        if (frontmatter[key] !== value) return false;
      }
    }
    return true;
  }
}