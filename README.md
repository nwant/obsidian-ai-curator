# Obsidian AI Curator

[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-7c3aed)](https://obsidian.md)
[![Claude AI](https://img.shields.io/badge/Claude-AI-blue)](https://claude.ai)
[![MCP Server](https://img.shields.io/badge/MCP-Server-green)](https://modelcontextprotocol.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **The knowledge fragmentation problem**: Your insights are scattered across hundreds of notes. 
> **The solution**: AI-powered consolidation that actively merges related fragments into coherent knowledge.
> **How it works**: Claude AI analyzes your Obsidian vault via MCP and intelligently combines scattered thoughts.

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
- **Tag Management**: Analyze usage, validate tags, rename globally
- **Project Playbooks**: Customizable structures for different project types
- **Git Integration**: Checkpoint and rollback capabilities
- **Daily Notes**: Quick capture and task management
- **🚀 Automated Workflow**: Claude Desktop → GitHub Issues → Claude Code → Pull Requests

See [Examples](docs/EXAMPLES.md) for detailed use cases.

## 🚀 NEW: Automated Claude Code Integration

**Turn errors into fixes and ideas into features - automatically!**

This project now includes TWO ways to automate development with Claude Code:

### Option 1: Local Execution (Recommended)
**Run Claude Code on your machine - no GitHub Actions needed!**

```bash
# Quick setup
bash scripts/setup-local-claude.sh

# Requirements:
# 1. Install Claude Code CLI from https://claude.ai/code
# 2. Install GitHub CLI: brew install gh
# 3. Authenticate both tools
```

**Benefits:**
- ✅ No GitHub Actions costs
- ✅ Runs immediately on your machine  
- ✅ Full control and visibility
- ✅ Easy debugging

See [Local Claude Code Guide](docs/LOCAL_CLAUDE_CODE.md) for setup.

### Option 2: GitHub Actions Automation
**Use GitHub Actions to run Claude Code in the cloud**

```bash
# Setup GitHub Actions workflow
bash scripts/setup-automation.sh

# Requires Claude Code OAuth token in GitHub Secrets
```

**Benefits:**
- ✅ Runs in cloud, not on your machine
- ✅ Triggered automatically by issues
- ✅ Works even when you're offline

See [GitHub Actions Workflow Guide](docs/AUTOMATED_WORKFLOW.md) for setup.

## Documentation

- [Quick Start Guide](docs/QUICK_START.md) - Get running in 5 minutes
- [**Local Claude Code**](docs/LOCAL_CLAUDE_CODE.md) - Run Claude Code locally (recommended)
- [**GitHub Actions Workflow**](docs/AUTOMATED_WORKFLOW.md) - Cloud-based automation
- [Troubleshooting](docs/TROUBLESHOOTING.md) - Common issues and solutions
- [Configuration Guide](docs/CONFIGURATION.md) - All configuration options
- [MCP Tools Reference](docs/MCP_TOOLS.md) - Complete tool API documentation  
- [Examples](docs/EXAMPLES.md) - Common use cases and workflows
- [Project Playbooks](docs/PROJECT_PLAYBOOKS.md) - Creating custom project playbooks
- [Obsidian Plugin Guide](docs/OBSIDIAN_PLUGIN.md) - Plugin features and setup
- [Formatting Rules](docs/FORMATTING_RULES.md) - Important Obsidian formatting guidelines


## Project Structure

This repository contains:
- **MCP Server** (`src/`) - Core functionality for Claude integration
- **Obsidian Plugin** (`obsidian-ai-curator-plugin/`) - Enhanced API performance
- **Documentation** (`docs/`) - Comprehensive guides

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

## Testing

This project uses **Jest** as the test runner with a comprehensive test suite:

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit        # Unit tests (parallel execution)
npm run test:integration # Integration tests (sequential execution)
npm run test:coverage    # With coverage report
npm run test:watch       # Watch mode for development
npm run test:verbose     # Detailed output

# Additional testing tools
npm run test:benchmark   # Performance benchmarks
npm run test:harness     # Verify test infrastructure
```

**Jest Benefits:**
- ✅ **Reliable integration tests** - No vault conflicts
- ✅ **Fast unit tests** - 4x parallel execution
- ✅ **Enhanced error messages** - Better debugging
- ✅ **Modern tooling** - Watch mode, coverage, verbose output

See [test documentation](test/README.md) for details on writing and running tests.

## Contributing

Contributions welcome! Please read our [contributing guidelines](CONTRIBUTING.md) before submitting PRs.

## License

MIT