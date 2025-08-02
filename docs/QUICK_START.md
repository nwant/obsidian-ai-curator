# Quick Start Guide

Get up and running with Obsidian AI Curator in 5 minutes.

## Prerequisites

- Node.js 18 or higher
- An Obsidian vault
- Claude Desktop or Claude Code

## Installation

### 1. Clone and Install

```bash
git clone https://github.com/nwant/obsidian-ai-curator.git
cd obsidian-ai-curator
npm install
```

### 2. Configure Your Vault

Create a minimal config file:

```bash
cp config/config.minimal.json config/config.json
```

Edit `config/config.json` - you only need one setting to start:

```json
{
  "vaultPath": "/Users/you/Documents/MyVault"
}
```

**Important**: Use the absolute path to your Obsidian vault folder.

### 3. Connect to Claude

#### For Claude Desktop

Edit your Claude Desktop config:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "obsidian-vault": {
      "command": "node",
      "args": ["/path/to/obsidian-ai-curator/src/mcp-server.js"]
    }
  }
}
```

#### For Claude Code

Create `.mcp.json` in your project:

```json
{
  "mcpServers": {
    "obsidian-vault": {
      "command": "node",
      "args": ["./obsidian-ai-curator/src/mcp-server.js"]
    }
  }
}
```

### 4. Restart Claude

Completely quit and restart Claude Desktop/Code to load the MCP server.

## Verify Installation

1. **Check MCP Connection**: In Claude, type:
   ```
   What MCP tools do you have access to?
   ```
   
   You should see tools like `vault_scan`, `write_note`, `search_content`, etc.

2. **Test Basic Commands**:
   ```
   Scan my vault and show me the 5 most recent notes
   ```
   
   ```
   Search for any notes containing "project"
   ```
   
   ```
   Create a test note at Test/Hello.md with content "Hello from Claude!"
   ```

3. **If Commands Don't Work**:
   - Make sure you restarted Claude completely
   - Check that your vault path in config.json is correct
   - Verify the MCP server path in claude_desktop_config.json is absolute

## Optional: Install Obsidian Plugin

For better performance and native API access:

1. Build the plugin:
   ```bash
   cd obsidian-ai-curator-plugin
   npm install
   npm run build
   ```

2. Copy to your vault:
   ```bash
   cp -r . /path/to/vault/.obsidian/plugins/obsidian-ai-curator/
   ```

3. Enable in Obsidian Settings → Community Plugins

## Troubleshooting

### "Tool not found" errors
- Ensure you restarted Claude completely (quit and reopen)
- Check the MCP server path is correct
- Verify Node.js is in your PATH

### Permission errors
- Ensure the vault path exists and is readable
- Check file permissions on your vault

### Plugin not working
- Ensure the plugin is enabled in Obsidian
- Check the console for errors (Ctrl/Cmd + Shift + I)

## Quick Reference Prompt

When starting a Claude Desktop session, you can use this template:

```
I'm working with my Obsidian vault using the Obsidian AI Curator MCP server. 

Please ensure you:
1. Use the MCP server tools for ALL vault operations (never direct file writes)
2. Follow these critical formatting rules:
   - Dates: yyyy-MM-dd format only
   - Tags: no hashtags in frontmatter
   - Frontmatter: simple structures only (no arrays of objects)
   - Links: [[wikilink]] format only

[Your specific request here]
```

## Next Steps

- Read the [Configuration Guide](CONFIGURATION.md) to customize settings
- Explore [MCP Tools](MCP_TOOLS.md) to see all available commands
- Set up [Project Templates](PROJECT_TEMPLATES.md) for your workflow