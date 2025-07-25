#!/usr/bin/env node
import WebSocket, { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import matter from 'gray-matter';
import simpleGit from 'simple-git';
import { LinkIndexManager } from './link-index.js';
import { EnhancedFileOperations } from './enhanced-file-ops.js';
import { VaultCache } from './cache/vault-cache.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'config.json');

// Load configuration
async function loadConfig() {
  try {
    const configData = await fs.readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(configData);
  } catch (error) {
    console.warn('Config not found, using defaults');
    return { 
      vaultPath: process.env.OBSIDIAN_VAULT_PATH || '', 
      ignorePatterns: [],
      websocketPort: 3000 
    };
  }
}

class VaultWebSocketServer {
  constructor(config) {
    this.config = config;
    this.port = config.websocketPort || 3000;
    this.clients = new Set();
    this.cache = new VaultCache(config);
    this.linkIndex = new LinkIndexManager(config);
    this.git = simpleGit(config.vaultPath);
    this.isShuttingDown = false;
    
    // Initialize WebSocket server
    this.wss = new WebSocketServer({ 
      port: this.port,
      perMessageDeflate: false
    });
    
    this.setupServer();
  }

  setupServer() {
    console.log(`WebSocket server starting on port ${this.port}...`);

    this.wss.on('connection', (ws) => {
      console.log('New client connected');
      this.clients.add(ws);

      // Send welcome message
      this.sendMessage(ws, {
        type: 'notification',
        method: 'connected',
        params: { 
          serverVersion: '1.0.0',
          vaultPath: this.config.vaultPath 
        }
      });

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log('Received message:', message.method || message.type);
          await this.handleMessage(ws, message);
        } catch (error) {
          console.error('Error handling message:', error);
          this.sendError(ws, null, error.message);
        }
      });

      ws.on('close', () => {
        console.log('Client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });

    this.wss.on('listening', () => {
      console.log(`WebSocket server listening on port ${this.port}`);
    });

    this.wss.on('error', (error) => {
      console.error('Server error:', error);
    });
  }

  async handleMessage(ws, message) {
    const { id, method, params, type } = message;

    // Handle different message types
    if (type === 'request') {
      // Request expects a response
      try {
        const result = await this.handleRequest(method, params);
        this.sendMessage(ws, {
          id,
          type: 'response',
          result
        });
      } catch (error) {
        this.sendError(ws, id, error.message);
      }
    } else if (type === 'notification') {
      // Notification doesn't expect a response
      await this.handleNotification(method, params);
    }
  }

  async handleRequest(method, params) {
    switch (method) {
      case 'vault-info':
        return await this.getVaultInfo();
      
      case 'search':
        return await this.searchContent(params);
      
      case 'read-note':
        return await this.readNote(params);
      
      case 'preview-move':
        return await this.previewMove(params);
      
      default:
        throw new Error(`Unknown request method: ${method}`);
    }
  }

  async handleNotification(method, params) {
    switch (method) {
      case 'file-change':
        await this.handleFileChange(params);
        break;
      
      case 'vault-sync':
        await this.handleVaultSync(params);
        break;
      
      case 'workspace-context':
        await this.handleWorkspaceContext(params);
        break;
      
      default:
        console.warn(`Unknown notification method: ${method}`);
    }
  }

  async handleFileChange(params) {
    const { type, path, oldPath, metadata } = params;
    console.log(`File ${type}: ${path}`);

    try {
      switch (type) {
        case 'create':
        case 'modify':
          await this.linkIndex.updateFileLinks(path);
          break;
        
        case 'delete':
          this.linkIndex.removeFileFromIndex(path);
          await this.linkIndex.save();
          break;
        
        case 'rename':
          if (oldPath) {
            // Update link index for rename
            const fileOps = new EnhancedFileOperations(this.config, this.linkIndex, this.git);
            await this.linkIndex.updateLinksOnMove(oldPath, path);
            
            // Notify all clients about the rename
            this.broadcast({
              type: 'notification',
              method: 'file-renamed',
              params: { oldPath, newPath: path }
            });
          }
          break;
      }

      // Update cache
      this.cache.invalidate(path);
      
    } catch (error) {
      console.error(`Error handling file ${type}:`, error);
    }
  }

  async handleVaultSync(params) {
    console.log(`Vault sync: ${params.totalFiles} files`);
    
    // Don't start indexing if shutting down
    if (this.isShuttingDown) {
      console.log('Server is shutting down, skipping index build');
      return;
    }
    
    // Initialize or rebuild link index
    const hasIndex = await this.linkIndex.load();
    if (!hasIndex) {
      console.log('Building link index...');
      await this.linkIndex.buildIndex((progress) => {
        if (progress.current % 10 === 0) {
          console.log(`Indexing: ${progress.current}/${progress.total}`);
        }
      });
    }
  }

  async handleWorkspaceContext(params) {
    const { activeFile, recentFiles, openFiles, currentFolder } = params;
    
    console.log('Workspace context update:');
    console.log(`  Active: ${activeFile || 'none'}`);
    console.log(`  Recent: ${recentFiles.length} files`);
    console.log(`  Open: ${openFiles.length} files`);
    console.log(`  Folder: ${currentFolder || 'root'}`);
    
    // Store context for intelligent operations
    this.workspaceContext = params;
    
    // Could trigger intelligent suggestions based on context
    if (activeFile) {
      const backlinks = this.linkIndex.getBacklinks(activeFile);
      if (backlinks.length > 0) {
        console.log(`  Active file has ${backlinks.length} backlinks`);
      }
    }
  }

  async getVaultInfo() {
    const files = await this.cache.getVaultStructure();
    const stats = this.linkIndex.getStats();
    
    return {
      totalFiles: files.length,
      linkStats: stats,
      cacheAge: this.cache.getStats().cacheAge
    };
  }

  async searchContent(params) {
    const { query, maxResults = 10 } = params;
    const files = await this.cache.getVaultStructure();
    const results = [];

    for (const file of files) {
      if (results.length >= maxResults) break;
      
      try {
        const content = await this.cache.getFileContent(file.path);
        if (content.content.toLowerCase().includes(query.toLowerCase())) {
          results.push({
            path: file.path,
            preview: content.preview
          });
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }

    return { results, total: results.length };
  }

  async readNote(params) {
    const { path } = params;
    const fullPath = path.join(this.config.vaultPath, path);
    
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const { data: frontmatter, content: body } = matter(content);
      
      return {
        path,
        frontmatter,
        content: body,
        backlinks: this.linkIndex.getBacklinks(path)
      };
    } catch (error) {
      throw new Error(`Failed to read note: ${error.message}`);
    }
  }

  sendMessage(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  sendError(ws, id, error) {
    this.sendMessage(ws, {
      id,
      type: 'response',
      error: { message: error }
    });
  }

  broadcast(message) {
    for (const client of this.clients) {
      this.sendMessage(client, message);
    }
  }

  async previewMove(params) {
    const { from, to } = params;
    
    // Get all files that link to the file being moved
    const backlinks = this.linkIndex.getBacklinks(from);
    const linkUpdates = [];
    
    // Calculate what links would need to be updated
    for (const linkingFile of backlinks) {
      const linkDetails = this.linkIndex.index.linkDetails[`${linkingFile}->${from}`] || [];
      
      for (const detail of linkDetails) {
        linkUpdates.push({
          file: linkingFile,
          oldLink: detail.raw,
          newLink: detail.raw.replace(path.basename(from, '.md'), path.basename(to, '.md')),
          line: detail.line
        });
      }
    }
    
    return {
      from,
      to,
      affectedFiles: backlinks,
      linkUpdates
    };
  }

  async start() {
    // Load or build link index
    const hasIndex = await this.linkIndex.load();
    if (!hasIndex) {
      console.log('No link index found, will build on first sync');
    } else {
      console.log('Link index loaded');
    }
  }

  async shutdown() {
    this.isShuttingDown = true;
    
    // Cancel any ongoing index build
    if (this.linkIndex.isBuilding) {
      console.log('Cancelling index build...');
      this.linkIndex.cancelBuild();
    }
    
    // Close all connections
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.close(1000, 'Server shutting down');
      }
    });
    
    // Clear clients
    this.clients.clear();
  }
}

// Start the server
async function main() {
  const config = await loadConfig();
  
  if (!config.vaultPath) {
    console.error('Error: No vault path configured');
    console.error('Set OBSIDIAN_VAULT_PATH environment variable or update config.json');
    process.exit(1);
  }

  const server = new VaultWebSocketServer(config);
  await server.start();
  
  console.log('Vault WebSocket server ready');
  console.log(`Vault path: ${config.vaultPath}`);
  console.log(`WebSocket port: ${server.port}`);
  
  // Handle graceful shutdown
  let isShuttingDown = false;
  
  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    console.log('\nShutting down...');
    
    // Tell server to shutdown
    await server.shutdown();
    
    // Close the WebSocket server
    await new Promise((resolve) => {
      server.wss.close(() => {
        console.log('WebSocket server closed');
        resolve();
      });
    });
    
    // Exit cleanly
    console.log('Shutdown complete');
    process.exit(0);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(console.error);