# Client-Driven Architecture Refactor Plan

## Overview
Transform the MCP server from an "intelligent analyzer" to a "powerful file system interface" that Claude Desktop orchestrates.

## Current vs. New Architecture

### Current (Server-Driven)
```
Claude Desktop → MCP Server → Claude API → Result
                     ↓
              Heavy Analysis
              API Key Required
              Complex Logic
```

### New (Client-Driven)
```
Claude Desktop → MCP Server → File System
      ↓              ↓
   Intelligence   Simple I/O
   Orchestration  No API Keys
   User Dialog    Fast & Local
```

## Refactored Tool Set

### 1. File Operations
```javascript
// Get vault structure and basic stats
tool: 'vault_scan'
input: { 
  patterns?: string[],  // glob patterns to match
  stats?: boolean       // include file stats
}
output: {
  files: [{
    path: string,
    size: number,
    modified: Date,
    wordCount?: number
  }]
}

// Bulk read notes with content
tool: 'read_notes'
input: { paths: string[] }
output: {
  notes: [{
    path: string,
    content: string,
    frontmatter: object,
    headings: string[],
    links: string[]
  }]
}

// Write or update a note
tool: 'write_note'
input: { path: string, content: string }
output: { success: boolean, path: string }

// Move/archive notes
tool: 'archive_notes'
input: { 
  moves: [{ from: string, to: string }] 
}
output: { 
  results: [{ from: string, to: string, success: boolean }] 
}
```

### 2. Search Operations
```javascript
// Content search with context
tool: 'search_content'
input: { 
  query: string,
  maxResults?: number,
  contextLines?: number 
}
output: {
  matches: [{
    path: string,
    line: number,
    match: string,
    context: string
  }]
}

// Find by metadata
tool: 'find_by_metadata'
input: { 
  frontmatter?: object,  // Match frontmatter fields
  minWords?: number,
  maxWords?: number,
  modifiedAfter?: Date
}
output: { paths: string[] }
```

### 3. Git Operations  
```javascript
// Create safety checkpoint
tool: 'git_checkpoint'
input: { message: string }
output: { commit: string }

// Get changes since checkpoint
tool: 'git_changes'
input: { since?: string }
output: { 
  added: string[],
  modified: string[],
  deleted: string[]
}

// Rollback to checkpoint
tool: 'git_rollback'
input: { commit: string }
output: { success: boolean }
```

## Claude's New Workflows

### Example: Intelligent Consolidation
```markdown
User: "Help me consolidate my project meeting notes"

Claude's Process:
1. Use `search_content` to find all notes mentioning "project meeting"
2. Use `read_notes` to examine the content
3. Analyze patterns, identify duplicates, extract key decisions
4. Show user a consolidation plan with reasoning
5. Upon approval:
   - Use `git_checkpoint` to create safety point
   - Use `write_note` to create consolidated note
   - Use `archive_notes` to move originals
   - Provide summary of changes
```

### Example: Smart Duplicate Detection
```markdown
Claude's Process:
1. Use `vault_scan` to get all notes
2. Group by similar names/dates
3. Use `read_notes` on suspected duplicates
4. Apply semantic analysis (using Claude's own NLP)
5. Present findings with confidence levels
6. Offer consolidation strategies based on content type
```

## Benefits of This Approach

### 1. **Simpler Server**
- Remove Anthropic SDK dependency
- No API keys needed
- Faster operations (all local)
- Easier to test and debug

### 2. **Smarter Claude**
- Uses native language understanding
- Can explain reasoning to user
- Interactive refinement
- Learns user's writing style

### 3. **Better UX**
- Real-time feedback
- Natural language control
- Preview before apply
- Undo/redo workflows

### 4. **More Flexible**
- Claude can implement any analysis strategy
- Easy to add new workflows
- No server updates needed for new intelligence

## Migration Path

### Phase 1: Simplify Existing Tools
1. Keep current tools working
2. Add new simplified tools alongside
3. Deprecation warnings on complex tools

### Phase 2: Remove Intelligence
1. Extract file operations to utilities
2. Remove Claude API integration
3. Simplify tool interfaces

### Phase 3: Enhance Claude Workflows
1. Create Claude-side analysis scripts
2. Build interactive consolidation flows
3. Add batch processing capabilities

## Example Refactored Tool

### Before (Complex)
```javascript
server.tool('preview_consolidation', {
  description: 'Preview AI consolidation',
  inputSchema: //...
}, async ({ notePaths, strategy }) => {
  // Read files
  // Analyze content
  // Call Claude API
  // Generate consolidation
  // Return preview
});
```

### After (Simple)
```javascript
server.tool('read_notes', {
  description: 'Read note contents',
  inputSchema: //...
}, async ({ paths }) => {
  const notes = await Promise.all(
    paths.map(path => ({
      path,
      content: await fs.readFile(path, 'utf-8'),
      metadata: matter(content).data,
      stats: await fs.stat(path)
    }))
  );
  return { notes };
});
```

Claude handles all intelligence, server just provides data access.