# Obsidian MCP Server

A Model Context Protocol (MCP) server that enables Claude Desktop and Claude Code to interact with your Obsidian vault. This server provides tools for reading, writing, searching, and managing notes programmatically.

## Features

- **Vault Operations**: Scan, read, write, and archive notes
- **Search**: Content search and metadata filtering
- **Git Integration**: Version control with checkpoint/rollback capabilities
- **Metadata Support**: Parse and query frontmatter fields
- **Pattern Matching**: Find notes by various criteria

## Installation

1. Clone this repository:
```bash
git clone https://github.com/yourusername/obsidian-mcp-server.git
cd obsidian-mcp-server
```

2. Install dependencies:
```bash
npm install
```

3. Configure your vault path:
```bash
cp config/config.example.json config/config.json
# Edit config/config.json to set your vault path
```

## Configuration

### Claude Desktop Setup

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "obsidian-vault": {
      "command": "node",
      "args": ["/path/to/obsidian-mcp-server/src/mcp-server.js"]
    }
  }
}
```

### Claude Code Setup

Add to your Claude Code configuration (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "obsidian-vault": {
      "command": "node",
      "args": ["/path/to/obsidian-mcp-server/src/mcp-server.js"]
    }
  }
}
```

### Config File

Edit `config/config.json`:

```json
{
  "vaultPath": "/path/to/your/obsidian/vault",
  "ignorePatterns": [".obsidian", ".git", ".trash"],
  "researchContext": {
    "description": "Your custom AI research partner context",
    "contextDocuments": {
      "workflow": "Meta/workflow.md",
      "guidelines": "Meta/guidelines.md",
      "activeProjects": "Projects/active.md"
    },
    "systemCapabilities": {
      "atomicRecords": true,
      "autonomousOperation": false
    },
    "customInstructions": "Additional instructions for your AI partner"
  }
}
```

#### Research Context Configuration

The `researchContext` field allows you to customize how Claude interacts with your vault:

- **contextDocuments**: Reference markdown files in your vault that define workflows, guidelines, or project context. Paths can be:
  - Relative to your vault root (e.g., `"Meta/workflow.md"`)
  - Absolute paths (e.g., `"/Users/you/documents/guidelines.md"`)
  
- **systemCapabilities**: Toggle features like atomic records or autonomous operation

- **customInstructions**: Add any specific instructions for how Claude should work with your vault

When you use the `get_research_context` tool, it will read these documents and provide them to Claude for context.

## Available Tools

### `vault_scan`
Scan vault for files with statistics
- Parameters: `patterns`, `includeStats`

### `read_notes`
Read multiple notes with content and metadata
- Parameters: `paths` (array of note paths)

### `write_note`
Write or update a note
- Parameters: `path`, `content`

### `archive_notes`
Move notes to archive locations
- Parameters: `moves` (array of from/to paths)

### `search_content`
Search for content across all notes
- Parameters: `query`, `maxResults`, `contextLines`

### `find_by_metadata`
Find notes by frontmatter or file properties with advanced query support
- Parameters: `frontmatter`, `minWords`, `maxWords`, `modifiedAfter`, `modifiedBefore`

#### Advanced Query Operators:

**Basic Queries:**
```json
{ "frontmatter": { "status": "active" } }  // Find notes with status: active
{ "frontmatter": { "tags": "research" } }  // Find notes where tags includes "research"
```

**Existence Queries:**
```json
{ "frontmatter": { "description": { "$exists": false } } }  // Find notes missing description
{ "frontmatter": { "author": { "$exists": true } } }       // Find notes with author field
```

**Empty Value Queries:**
```json
{ "frontmatter": { "summary": { "$empty": true } } }   // Find notes with empty summary
{ "frontmatter": { "tags": { "$empty": false } } }     // Find notes with non-empty tags
```

**Pattern Matching:**
```json
{ "frontmatter": { "title": { "$regex": "^Project.*2025$" } } }  // Regex match
{ "frontmatter": { "content": { "$regex": "TODO", "$flags": "i" } } }  // Case-insensitive
```

**Negation:**
```json
{ "frontmatter": { "status": { "$not": "archived" } } }  // Find notes NOT archived
{ "frontmatter": { "priority": { "$not": 5 } } }         // Find notes with priority != 5
```

**Range Queries (numbers/dates):**
```json
{ "frontmatter": { "priority": { "$gt": 3 } } }          // Priority > 3
{ "frontmatter": { "created": { "$gte": "2025-01-01" } } }  // Created after Jan 1
{ "frontmatter": { "score": { "$lt": 100, "$gte": 50 } } }  // Score between 50-99
```

**Array Inclusion:**
```json
{ "frontmatter": { "status": { "$in": ["active", "pending"] } } }  // Status is one of these
```

**Combined Queries:**
```json
{
  "frontmatter": {
    "status": "active",
    "description": { "$exists": true },
    "priority": { "$gte": 3 },
    "tags": { "$empty": false }
  },
  "minWords": 100,
  "modifiedAfter": "2025-01-01"
}
```

### `git_checkpoint`
Create a git commit checkpoint
- Parameters: `message`

### `git_changes`
Get changed files since a commit
- Parameters: `since`

### `git_rollback`
Rollback to a previous commit
- Parameters: `commit`

### `get_research_context`
Get configured research context and guidelines from your config.json. Reads and returns the content of any configured context documents.

## Usage Examples

Once configured in Claude Desktop or Claude Code, you can use natural language to interact with your vault:

**Basic Operations:**
- "Scan my vault and show me notes modified in the last week"
- "Find all notes with status 'active' in frontmatter"
- "Search for notes mentioning 'project planning'"
- "Create a git checkpoint before making changes"

**Advanced Metadata Queries:**
- "Find all notes missing a description field"
- "Show me notes with empty tags"
- "Find notes with priority greater than 3"
- "Find all notes NOT marked as archived"
- "Show me notes created in 2025 with more than 500 words"
- "Find notes where the title matches 'Project.*2025' regex"

## Development

Run the server directly:
```bash
npm start
```

## License

MIT