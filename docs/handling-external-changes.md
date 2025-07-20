# Handling External Changes in Link Preservation System

## The Problem

When files and links are modified outside the MCP server (via Obsidian, file system, or other tools), the link index becomes stale. This can lead to:

- Incorrect link updates
- Missing backlink information
- Broken link detection failures
- Orphaned entries in the index

## Current Implementation & Solutions

### 1. **Startup Validation** (Implemented)
The `LinkIndexValidator` class provides validation on server startup:

```javascript
// In mcp-server.js constructor
async initializeLinkIndex() {
  const loaded = await this.linkIndex.load();
  
  if (loaded) {
    // Validate and update the existing index
    const validator = new LinkIndexValidator(this.linkIndex, config);
    const validation = await validator.validateAndUpdate();
    
    console.log(`Index validated: ${validation.totalChanges} changes detected`);
    if (validation.changes.movedFiles.length > 0) {
      console.log(`Detected ${validation.changes.movedFiles.length} moved files`);
    }
  } else {
    // Build fresh index
    await this.linkIndex.buildIndex();
  }
}
```

### 2. **Change Detection Strategy**
The validator detects:
- **New Files**: Present in file system but not in index
- **Deleted Files**: In index but not in file system
- **Modified Files**: Timestamp newer than index record
- **Moved Files**: Heuristic matching based on link patterns

### 3. **Smart Move Detection**
When files are moved outside MCP:
```javascript
// The validator uses link fingerprints to detect moves
// If a file disappears and a new file appears with similar links,
// it's likely a move operation
{
  oldFile: "Projects/AI-Research.md",
  newFile: "Archive/2025/AI-Research.md",
  confidence: 0.95 // Based on shared links
}
```

### 4. **Incremental Updates**
Instead of rebuilding the entire index, only changed files are processed:
```javascript
// Only reindex modified files
for (const modifiedFile of changes.modifiedFiles) {
  await this.linkIndex.updateFileLinks(modifiedFile);
}
```

## Usage Patterns

### 1. **Add Validation Tool**
```javascript
{
  name: 'validate_index',
  description: 'Check and update link index for external changes',
  inputSchema: {
    type: 'object',
    properties: {
      autoFix: { type: 'boolean', description: 'Automatically fix detected issues' }
    }
  }
}

// Implementation
async validateIndex({ autoFix = true }) {
  const validator = new LinkIndexValidator(this.linkIndex, config);
  const result = await validator.validateAndUpdate();
  
  if (autoFix && result.changes.movedFiles.length > 0) {
    // Update links for detected moves
    for (const move of result.changes.movedFiles) {
      await this.updateMovedFileLinks(move.from, move.to);
    }
  }
  
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}
```

### 2. **Periodic Validation**
Configure automatic validation:
```json
{
  "linkManagement": {
    "validateOnStartup": true,
    "validationInterval": 300000, // 5 minutes
    "autoDetectMoves": true
  }
}
```

### 3. **Manual Sync Command**
Users can manually trigger validation:
```javascript
// After making changes in Obsidian
{
  "tool": "validate_index",
  "arguments": {
    "autoFix": true
  }
}
```

## Best Practices

### 1. **Always Validate After External Operations**
- After using Obsidian's file operations
- After git operations (pull, merge, checkout)
- After bulk file system changes

### 2. **Use MCP Tools When Possible**
- Prefer `move_note_safe` over Obsidian's move
- Use `batch_move_notes` for reorganization
- This ensures immediate index updates

### 3. **Monitor Index Health**
```javascript
{
  "tool": "get_index_stats",
  "response": {
    "totalFiles": 523,
    "totalLinks": 1847,
    "lastFullScan": "2025-01-20T10:30:00Z",
    "lastValidation": "2025-01-20T14:45:00Z",
    "staleFiles": 3 // Files modified after last index update
  }
}
```

## Future Enhancements

### 1. **File System Watching**
```javascript
// Real-time updates using file watchers
watcher.on('change', async (filePath) => {
  if (filePath.endsWith('.md')) {
    await linkIndex.updateFileLinks(filePath);
  }
});
```

### 2. **Obsidian Plugin Integration**
- Direct communication with Obsidian for instant updates
- Hook into Obsidian's file operations
- Sync index state bidirectionally

### 3. **Conflict Resolution**
- Handle cases where same file is modified in multiple places
- Merge link changes intelligently
- Provide UI for resolving ambiguous moves

### 4. **Performance Optimization**
- Incremental index updates
- Lazy loading for large vaults
- Background validation without blocking operations

## Summary

The link preservation system now handles external changes through:
1. **Startup validation** to catch changes between sessions
2. **Smart move detection** using link fingerprints
3. **Incremental updates** for better performance
4. **Manual sync tools** for user control

This ensures link integrity is maintained even when files are modified outside the MCP server context.