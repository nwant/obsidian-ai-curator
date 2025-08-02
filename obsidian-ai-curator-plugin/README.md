# Obsidian AI Curator Plugin

AI-powered knowledge consolidation for Obsidian. Works with Claude Desktop to intelligently merge scattered notes into structured knowledge.

## Features

- 🚀 **API Server**: Provides native Obsidian API access on port 3001
- 🔗 **Smart Link Resolution**: Handles aliases and relative links correctly
- 📊 **Performance Boost**: 10x faster vault scans with cached metadata
- 🎯 **Consolidation UI**: Visual interface for reviewing and merging notes
- 🤖 **Claude Integration**: Seamless connection with Claude Desktop via MCP

## Installation

### From Obsidian Community Plugins (Coming Soon)
1. Open Settings → Community Plugins
2. Search for "AI Curator"
3. Click Install
4. Enable the plugin

### Manual Installation
1. Download the latest release from [GitHub Releases](https://github.com/nwant/obsidian-ai-curator/releases)
2. Extract files to `.obsidian/plugins/obsidian-ai-curator/`
3. Reload Obsidian
4. Enable the plugin in Settings

## Requirements

- Obsidian 0.15.0 or higher
- [Obsidian AI Curator MCP Server](https://github.com/nwant/obsidian-ai-curator) installed
- Claude Desktop (for AI features)

## How It Works

This plugin enhances the MCP server with native Obsidian API access:

1. **Starts API server** on port 3001 when enabled
2. **MCP server detects** the API and uses it automatically
3. **Performance improves** dramatically with native APIs
4. **Link updates** work perfectly when renaming/moving files

## Usage

Once installed and enabled:
1. The plugin runs automatically in the background
2. Check the status bar for "AI Curator API: Running"
3. Use Claude Desktop normally - it will detect and use the enhanced API

## API Endpoints

The plugin provides these endpoints for the MCP server:
- `/api/health` - Check if API is running
- `/api/metadata/:path` - Get cached file metadata
- `/api/search` - Use Obsidian's search index
- `/api/rename` - Rename files with automatic link updates
- `/api/move` - Move files with automatic link updates
- `/api/consolidate/analyze` - Find consolidation candidates
- `/api/consolidate/preview` - Preview merge results

## Configuration

Access settings via Settings → Plugin Options → AI Curator:
- **API Port**: Default 3001 (change if conflicts)
- **Auto-start**: Enable/disable automatic API startup
- **Debug Mode**: Show detailed logs in console

## Support

- Report issues: [GitHub Issues](https://github.com/nwant/obsidian-ai-curator/issues)
- Documentation: [Full Documentation](https://github.com/nwant/obsidian-ai-curator)

## License

MIT