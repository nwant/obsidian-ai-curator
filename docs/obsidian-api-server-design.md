# Obsidian API Server Design

## Overview

Enable the MCP server to leverage Obsidian APIs even when used through Claude Desktop by creating an API server within the Obsidian plugin.

## Architecture

```
Claude Desktop
      ↓
MCP Server (enhanced)
      ↓
[Check if API available]
   ↙        ↘
File System  HTTP API → Obsidian Plugin API Server
(fallback)              (when Obsidian is running)
```

## Implementation Plan

### 1. Obsidian Plugin API Server

Add to the Obsidian plugin:

```typescript
// src/api-server.ts
export class ObsidianAPIServer {
  private server: Server;
  private port = 3001;
  
  constructor(private app: App) {}
  
  async start() {
    this.server = createServer((req, res) => {
      // CORS for localhost only
      res.setHeader('Access-Control-Allow-Origin', 'http://localhost:*');
      
      // Route API calls to Obsidian methods
      this.handleRequest(req, res);
    });
    
    this.server.listen(this.port);
  }
  
  private async handleRequest(req: Request, res: Response) {
    const url = new URL(req.url, `http://localhost:${this.port}`);
    
    switch(url.pathname) {
      case '/api/search':
        return this.handleSearch(url.searchParams, res);
      case '/api/tags':
        return this.handleTags(url.searchParams, res);
      case '/api/links':
        return this.handleLinks(url.searchParams, res);
      case '/api/metadata':
        return this.handleMetadata(url.searchParams, res);
      case '/health':
        return res.end(JSON.stringify({ status: 'ok', version: '1.0' }));
    }
  }
}
```

### 2. Enhanced MCP Server

Modify the MCP server to check for API availability:

```javascript
// src/mcp-server.js
class ObsidianAPIClient {
  constructor() {
    this.apiUrl = 'http://localhost:3001';
    this.available = false;
    this.checkAvailability();
  }
  
  async checkAvailability() {
    try {
      const response = await fetch(`${this.apiUrl}/health`);
      this.available = response.ok;
    } catch {
      this.available = false;
    }
    
    // Re-check periodically
    setTimeout(() => this.checkAvailability(), 5000);
  }
  
  async search(query, options) {
    if (!this.available) return null;
    
    try {
      const response = await fetch(`${this.apiUrl}/api/search?${new URLSearchParams({
        query,
        ...options
      })}`);
      
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('API call failed, falling back to file system');
    }
    
    return null;
  }
}

// In the MCP server's search handler:
async searchContent({ query, maxResults, contextLines }) {
  // Try Obsidian API first
  const apiResult = await this.obsidianAPI.search(query, { maxResults, contextLines });
  
  if (apiResult) {
    return { content: apiResult };
  }
  
  // Fall back to file system search
  return this.fileSystemSearch({ query, maxResults, contextLines });
}
```

### 3. Security Considerations

- **Localhost only**: API server only accepts connections from localhost
- **Read-only by default**: Write operations require explicit enablement
- **Token authentication**: Optional token for additional security
- **Rate limiting**: Prevent abuse of API endpoints

### 4. API Endpoints

#### GET /api/search
Search using Obsidian's search index
```
?query=machine+learning&maxResults=10&contextLines=2
```

#### GET /api/tags
Get tags using Obsidian's tag cache
```
?path=Notes/AI.md  // Tags for specific file
```

#### GET /api/links
Get links and backlinks
```
?path=Notes/Project.md&type=backlinks
```

#### GET /api/metadata
Get metadata for files
```
?paths=Notes/AI.md,Notes/ML.md
```

#### GET /health
Check if API server is running

### 5. Benefits

1. **Automatic optimization**: When Obsidian is running, MCP server gets faster operations
2. **Graceful degradation**: Falls back to file system when Obsidian is closed
3. **No configuration needed**: Works automatically when available
4. **Preserves standalone functionality**: MCP server still works without Obsidian

### 6. Implementation Steps

1. Add API server to Obsidian plugin
2. Add startup option in plugin settings
3. Enhance MCP server with API client
4. Add fallback logic to all operations
5. Test with Obsidian open/closed
6. Add performance metrics

### 7. Alternative: WebSocket Enhancement

Instead of HTTP, enhance the existing WebSocket server to accept MCP server connections:

```javascript
// In websocket-server.js
class VaultWebSocketServer {
  async handleMessage(ws, message) {
    if (message.type === 'mcp-api-request') {
      // Forward to Obsidian if connected
      if (this.obsidianConnection) {
        return this.forwardToObsidian(message);
      }
      // Otherwise handle locally
      return this.handleLocally(message);
    }
  }
}
```

This would allow bidirectional communication and real-time updates.