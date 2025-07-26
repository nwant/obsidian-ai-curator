# MCP Server Obsidian API Optimization

This document describes the optimization of MCP server tools to leverage Obsidian's native API for improved performance and functionality.

## Overview

Previously, the MCP server performed all operations using direct file system access. The new implementation leverages Obsidian's powerful APIs for:

- **Search**: Uses Obsidian's metadata cache and search capabilities
- **Tags**: Accesses Obsidian's tag index directly
- **Links**: Utilizes Obsidian's resolved links and backlinks cache

## Architecture

```
Obsidian Plugin → WebSocket Server → MCP Bridge Handler → Claude CLI
      ↓                                      ↓
  Obsidian API                        MCP Server (fallback)
```

## Key Components

### 1. MCPObsidianBridge (`mcp-obsidian-bridge.ts`)

A dedicated bridge that handles MCP requests within Obsidian:

- Processes search, tag, and link operations using Obsidian APIs
- Provides context-aware responses
- Falls back to MCP server for file operations

### 2. Enhanced MCPClient (`mcp-client.ts`)

Extended with new capabilities:

- `mcpRequest()` method for MCP-specific requests
- `gatherObsidianContext()` collects relevant Obsidian metadata
- Automatic context enrichment based on tool type

### 3. MCP Bridge Handler (`mcp-bridge-handler.js`)

Server-side component that:

- Routes requests to Obsidian API when context is available
- Falls back to MCP server for standard operations
- Handles both optimized and standard requests

## Optimized Operations

### Search (`search_content`)

**Before**: File system traversal and regex matching
**After**: Obsidian's indexed search with:
- Cached metadata
- Pre-calculated scores
- Efficient context extraction

### Tags (`get_tags`)

**Before**: Parse frontmatter from each file
**After**: Direct access to Obsidian's tag cache:
- Instant tag counts
- File-specific tag queries
- No file parsing required

### Links (`get_links`, `get_backlinks`)

**Before**: Manual link parsing and tracking
**After**: Uses Obsidian's resolved links:
- Pre-computed backlinks
- Accurate link resolution
- Handles aliases and references

## Usage Examples

### 1. Optimized Search Request

```javascript
// In Obsidian plugin
const results = await this.mpcClient.mcpRequest('search_content', {
  query: 'machine learning',
  maxResults: 10
});
```

The plugin automatically:
1. Performs Obsidian search
2. Sends results as context
3. Returns enriched results

### 2. Tag Management

```javascript
// Get all tags with counts
const tags = await this.mpcClient.mcpRequest('get_tags', {});

// Get tags for specific file
const fileTags = await this.mpcClient.mcpRequest('get_tags', {
  path: 'Notes/AI Research.md'
});
```

### 3. Link Analysis

```javascript
// Get outgoing links
const links = await this.mpcClient.mcpRequest('get_links', {
  path: 'Notes/Project Overview.md'
});

// Get backlinks
const backlinks = await this.mpcClient.mcpRequest('get_backlinks', {
  path: 'Notes/Key Concepts.md'  
});
```

## Performance Benefits

1. **Reduced Latency**: No file system operations for metadata queries
2. **Better Accuracy**: Uses Obsidian's understanding of links and references
3. **Live Updates**: Reflects real-time vault state
4. **Memory Efficiency**: Leverages existing Obsidian caches

## Implementation Notes

- The system gracefully falls back to MCP server when Obsidian context is unavailable
- All operations maintain compatibility with existing MCP tools
- WebSocket communication includes context data for optimized processing

## Future Enhancements

1. **Graph API Integration**: Leverage Obsidian's graph view data
2. **Plugin Integration**: Access data from other Obsidian plugins
3. **Advanced Search**: Utilize Obsidian's query syntax
4. **Live Sync**: Real-time updates as vault changes