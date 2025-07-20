# Link Preservation Integration Guide

## Overview
This guide shows how to integrate the link preservation system into the MCP server to maintain link integrity during file operations.

## Integration Steps

### 1. Update mcp-server.js Constructor
```javascript
import { LinkIndexManager } from './link-index.js';
import { EnhancedFileOperations } from './enhanced-file-ops.js';

class SimpleVaultServer {
  constructor() {
    // ... existing code ...
    this.linkIndex = new LinkIndexManager(config);
    this.fileOps = new EnhancedFileOperations(config, this.linkIndex, git);
    
    // Load or build link index on startup
    this.initializeLinkIndex();
  }
  
  async initializeLinkIndex() {
    const loaded = await this.linkIndex.load();
    if (!loaded) {
      console.log('Building link index for the first time...');
      await this.linkIndex.buildIndex((progress) => {
        console.log(`Indexing: ${progress.current}/${progress.total} files`);
      });
    }
  }
}
```

### 2. Add New Tools
Add these tools to the ListToolsRequestSchema handler:

```javascript
{
  name: 'move_note_safe',
  description: 'Move or rename a note with automatic link updates',
  inputSchema: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'Current note path' },
      to: { type: 'string', description: 'New note path' },
      updateLinks: { type: 'boolean', description: 'Update links in other files (default: true)' },
      dryRun: { type: 'boolean', description: 'Preview changes without applying (default: false)' }
    },
    required: ['from', 'to']
  }
},
{
  name: 'batch_move_notes',
  description: 'Move multiple notes with automatic link updates and rollback support',
  inputSchema: {
    type: 'object',
    properties: {
      moves: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' }
          },
          required: ['from', 'to']
        }
      },
      updateLinks: { type: 'boolean', description: 'Update links (default: true)' },
      dryRun: { type: 'boolean', description: 'Preview changes (default: false)' }
    },
    required: ['moves']
  }
},
{
  name: 'check_links',
  description: 'Check for broken links in the vault',
  inputSchema: {
    type: 'object',
    properties: {
      fix: { type: 'boolean', description: 'Automatically fix broken links with suggestions' },
      interactive: { type: 'boolean', description: 'Prompt for each fix (default: false)' }
    }
  }
},
{
  name: 'rebuild_link_index',
  description: 'Rebuild the link index from scratch',
  inputSchema: {
    type: 'object',
    properties: {}
  }
},
{
  name: 'get_backlinks',
  description: 'Get all notes that link to a specific note',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Note path to find backlinks for' }
    },
    required: ['path']
  }
}
```

### 3. Add Tool Handlers
In the CallToolRequestSchema handler:

```javascript
case 'move_note_safe':
  return await this.moveNoteSafe(args);
case 'batch_move_notes':
  return await this.batchMoveNotes(args);
case 'check_links':
  return await this.checkLinks(args);
case 'rebuild_link_index':
  return await this.rebuildLinkIndex();
case 'get_backlinks':
  return await this.getBacklinks(args);
```

### 4. Implement Tool Methods
```javascript
async moveNoteSafe(args) {
  const result = await this.fileOps.moveNoteWithLinkUpdate(args);
  return { 
    content: [{ 
      type: 'text', 
      text: JSON.stringify(result, null, 2) 
    }] 
  };
}

async batchMoveNotes(args) {
  const result = await this.fileOps.batchMoveNotes(args);
  return { 
    content: [{ 
      type: 'text', 
      text: JSON.stringify(result, null, 2) 
    }] 
  };
}

async checkLinks(args) {
  const result = await this.fileOps.checkAndFixBrokenLinks(args);
  return { 
    content: [{ 
      type: 'text', 
      text: JSON.stringify(result, null, 2) 
    }] 
  };
}

async rebuildLinkIndex() {
  const startTime = Date.now();
  await this.linkIndex.buildIndex();
  const stats = this.linkIndex.getStats();
  
  return { 
    content: [{ 
      type: 'text', 
      text: JSON.stringify({
        success: true,
        duration: Date.now() - startTime,
        stats
      }, null, 2) 
    }] 
  };
}

async getBacklinks({ path }) {
  const backlinks = this.linkIndex.getBacklinks(path);
  const details = [];
  
  for (const backlink of backlinks) {
    const linkDetails = this.linkIndex.index.linkDetails[`${backlink}->${path}`] || [];
    details.push({
      source: backlink,
      links: linkDetails
    });
  }
  
  return { 
    content: [{ 
      type: 'text', 
      text: JSON.stringify({
        path,
        backlinks: details,
        total: backlinks.length
      }, null, 2) 
    }] 
  };
}
```

### 5. Update Existing Operations
Enhance the existing `write_note` tool to update the link index:

```javascript
async writeNote({ path: notePath, content }) {
  const fullPath = path.join(config.vaultPath, notePath);
  const dir = path.dirname(fullPath);
  
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');
  
  // Update link index for this file
  await this.linkIndex.updateFileLinks(notePath);
  
  return { 
    content: [{ 
      type: 'text', 
      text: JSON.stringify({ success: true, path: notePath }, null, 2) 
    }] 
  };
}
```

## Usage Examples

### 1. Safe File Move with Link Updates
```javascript
// Move a file and update all links
{
  "tool": "move_note_safe",
  "arguments": {
    "from": "Projects/AI-Research.md",
    "to": "Archive/2025/AI-Research.md"
  }
}

// Preview changes without applying
{
  "tool": "move_note_safe",
  "arguments": {
    "from": "Daily/2025-01-15.md",
    "to": "Journal/2025/01/15.md",
    "dryRun": true
  }
}
```

### 2. Batch Reorganization
```javascript
{
  "tool": "batch_move_notes",
  "arguments": {
    "moves": [
      { "from": "Inbox/idea1.md", "to": "Ideas/ProductFeatures/idea1.md" },
      { "from": "Inbox/meeting.md", "to": "Meetings/2025/Q1/meeting.md" },
      { "from": "todo.md", "to": "Tasks/Backlog/todo.md" }
    ],
    "dryRun": true
  }
}
```

### 3. Link Maintenance
```javascript
// Check for broken links
{
  "tool": "check_links",
  "arguments": {}
}

// Fix broken links automatically
{
  "tool": "check_links",
  "arguments": {
    "fix": true
  }
}

// Get all notes linking to a specific note
{
  "tool": "get_backlinks",
  "arguments": {
    "path": "Projects/Important-Decision.md"
  }
}
```

## Benefits

1. **Safe Refactoring**: Move and rename files without breaking links
2. **Visibility**: See what will be affected before making changes
3. **Rollback**: Git integration provides safety net
4. **Performance**: Cached link index for fast operations
5. **Maintenance**: Tools to find and fix broken links

## Configuration
Add to config.json:
```json
{
  "linkManagement": {
    "autoUpdateLinks": true,
    "buildIndexOnStartup": true,
    "indexUpdateThrottle": 1000
  }
}
```

## Future Enhancements

1. **Real-time Updates**: Watch for file changes and update index automatically
2. **Link Graph Visualization**: Export link graph for visualization tools
3. **Smart Suggestions**: AI-powered link suggestions based on content
4. **Conflict Resolution**: Handle complex scenarios like circular references
5. **Performance Optimization**: Incremental index updates for large vaults