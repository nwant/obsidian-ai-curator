# Obsidian AI Curator

AI-powered tools for Obsidian that enable Claude Desktop and Claude Code to intelligently manage your knowledge vault through the Model Context Protocol (MCP).

## What It Does

Gives Claude direct access to your Obsidian vault. Ask Claude to:
- 🔍 "Search for notes about machine learning"
- 📝 "Create a new project note with proper formatting"
- 🏷️ "Find all notes tagged #active that need review"
- 📁 "Move completed projects to archive"
- 🔄 "Create a git checkpoint before making changes"
- 🔗 "Rename this file and update all links"
- 📅 "Add a task to today's daily note"

## Quick Start

### 1. Install MCP Server

```bash
git clone https://github.com/nwant/obsidian-ai-curator.git
cd obsidian-ai-curator
npm install
```

### 2. Configure Your Vault Path

```bash
cp config/config.minimal.json config/config.json
```

Edit `config/config.json` and set your vault path:
```json
{
  "vaultPath": "/path/to/your/obsidian/vault"
}
```

### 3. Add to Claude Desktop

Edit your Claude Desktop config:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "obsidian-vault": {
      "command": "node",
      "args": ["/absolute/path/to/obsidian-ai-curator/src/mcp-server.js"]
    }
  }
}
```

**Important**: Use the full absolute path, not relative paths or ~

### 4. Restart Claude Desktop

Completely quit and restart Claude Desktop to load the MCP server.

### 5. Verify Installation

In Claude, type:
```
What MCP tools do you have access to?
```

You should see tools like `vault_scan`, `write_note`, `search_content`, etc.

See [Quick Start Guide](docs/QUICK_START.md) for detailed instructions and optional plugin setup.

## Features

- **Search & Query**: Natural language search, metadata queries, Dataview integration
- **Smart Writing**: Auto-formats links, validates tags, manages frontmatter
- **File Management**: Rename/move files with automatic link updates
- **Tag Intelligence**: Analyze usage, suggest tags, rename globally
- **Project Templates**: Customizable structures for different project types
- **Git Integration**: Checkpoint and rollback capabilities
- **Daily Notes**: Quick capture and task management

See [Examples](docs/EXAMPLES.md) for detailed use cases.

## Documentation

- [Quick Start Guide](docs/QUICK_START.md) - Get running in 5 minutes
- [Troubleshooting](docs/TROUBLESHOOTING.md) - Common issues and solutions
- [Configuration Guide](docs/CONFIGURATION.md) - All configuration options
- [MCP Tools Reference](docs/MCP_TOOLS.md) - Complete tool API documentation  
- [Examples](docs/EXAMPLES.md) - Common use cases and workflows
- [Project Templates](docs/PROJECT_TEMPLATES.md) - Creating custom project templates
- [Obsidian Plugin Guide](docs/OBSIDIAN_PLUGIN.md) - Plugin features and setup
- [Formatting Rules](docs/FORMATTING_RULES.md) - Important Obsidian formatting guidelines


## Requirements

- Node.js 18+
- Obsidian (for vault)
- Claude Desktop or Claude Code
- Git (optional, for version control features)

## Common Issues

**"Claude doesn't see the MCP tools"**
- Did you restart Claude completely after editing the config?
- Is the path to `mcp-server.js` absolute in your Claude config?

**"Permission denied" errors**
- Check that your vault path in `config.json` is correct
- Ensure you have read/write permissions to your vault

**"Cannot find module" errors**
- Run `npm install` in the project directory
- Make sure you're using Node.js 18 or higher

See [Troubleshooting Guide](docs/TROUBLESHOOTING.md) for more help.

## Contributing

Contributions welcome! Please read our [contributing guidelines](CONTRIBUTING.md) before submitting PRs.

## License

MIT