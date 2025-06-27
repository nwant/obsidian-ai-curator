# Obsidian MCP Server

A Model Context Protocol (MCP) server that enables Claude Desktop to interact with your Obsidian vault. This server provides tools for reading, writing, searching, and managing notes programmatically.

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
Find notes by frontmatter or file properties
- Parameters: `frontmatter`, `minWords`, `maxWords`, `modifiedAfter`

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

## Usage Example

Once configured in Claude Desktop, you can use natural language to interact with your vault:

- "Scan my vault and show me notes modified in the last week"
- "Find all notes with status 'active' in frontmatter"
- "Search for notes mentioning 'project planning'"
- "Create a git checkpoint before making changes"

## Development

Run the server directly:
```bash
npm start
```

## License

MIT