# Obsidian API Server Usage Guide

## Overview

The Obsidian API Server allows the MCP server to leverage Obsidian's native APIs for improved performance when using Claude Desktop. This provides automatic optimization without any configuration changes.

## How It Works

```
Claude Desktop → MCP Server → Check API availability
                     ↓                    ↓
              Use Obsidian API     Use file system
              (if available)        (if not available)
```

## Setup

### 1. Enable in Obsidian

1. Open Obsidian Settings → AI Curator
2. Under "API Server" section:
   - Toggle "Enable API server" ON
   - Default port is 3001 (change if needed)
3. The server starts automatically

### 2. Verify It's Working

Check the status bar or run the test script:

```bash
node test-api-integration.js
```

You should see:
- API Available: true
- Health check successful
- Vault information displayed

### 3. Use Claude Desktop Normally

No changes needed! The MCP server automatically detects and uses the API when available.

## Benefits

### When Obsidian is Open:
- **Faster searches**: Uses Obsidian's search index
- **Accurate tags**: Direct access to tag cache
- **Better links**: Resolved links and backlinks
- **No file parsing**: Metadata from cache

### When Obsidian is Closed:
- Everything still works normally
- Falls back to file system operations
- No errors or interruptions

## Supported Operations

Currently optimized operations:
- `search_content` - Full-text search
- `get_tags` - Tag retrieval (coming soon)
- `get_links` - Link analysis (coming soon)

More operations will be optimized over time.

## Security

- **Localhost only**: API only accepts connections from your machine
- **Read-only**: No write operations through the API
- **Port range**: Must use ports 1024-65535

## Troubleshooting

### API Server Won't Start

1. Check if port is already in use:
   ```bash
   lsof -i :3001
   ```

2. Try a different port in settings

3. Check Obsidian console for errors (Ctrl/Cmd+Shift+I)

### MCP Server Not Using API

1. Verify API server is enabled in Obsidian
2. Check firewall isn't blocking localhost connections
3. Run test script to verify connectivity

### Performance Not Improved

The API provides most benefit for:
- Large vaults (1000+ notes)
- Complex searches
- Tag-heavy vaults

Small vaults may not see significant improvement.

## Technical Details

### API Endpoints

- `GET /health` - Server status
- `GET /api/search` - Search with Obsidian's index
- `GET /api/tags` - Get tags from cache
- `GET /api/links` - Get links and backlinks
- `GET /api/metadata` - Get note metadata
- `GET /api/vault-info` - Vault statistics

### Request Format

```bash
curl http://localhost:3001/api/search?query=test&maxResults=10
```

### Response Format

```json
{
  "success": true,
  "data": {
    // Results here
  }
}
```

## Future Enhancements

Planned optimizations:
- Graph view data access
- Plugin integration (Dataview, etc.)
- Write operations (with safety checks)
- WebSocket for real-time updates