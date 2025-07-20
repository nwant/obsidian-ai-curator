# Obsidian AI Curator Plugin

AI-powered knowledge consolidation plugin for Obsidian that integrates with the MCP server.

## Features

- **Real-time Sync**: Automatically syncs file changes with the MCP server
- **Connection Management**: Robust WebSocket connection with auto-reconnect
- **Rich Metadata**: Shares links, tags, headings, and frontmatter with AI
- **Status Indicator**: Visual connection status in the status bar

## Installation

### Development Setup

1. Clone this repo into your vault's `.obsidian/plugins/` directory:
   ```bash
   cd /path/to/vault/.obsidian/plugins
   git clone https://github.com/nwant/obsidian-ai-curator obsidian-ai-curator
   ```

2. Install dependencies:
   ```bash
   cd obsidian-ai-curator
   npm install
   ```

3. Build the plugin:
   ```bash
   npm run build
   ```

4. Reload Obsidian or enable the plugin in Settings → Community plugins

### Development Mode

For hot-reload during development:
```bash
npm run dev
```

## Configuration

1. Open Settings → AI Curator
2. Set the MCP Server URL (default: `ws://localhost:3000`)
3. Toggle auto-connect and other preferences

## Usage

### Commands

- **Connect to MCP server**: Manually connect to the server
- **Disconnect from MCP server**: Disconnect from the server
- **Sync vault state**: Send current vault state to the server

### File Operations

The plugin automatically tracks:
- File creation
- File modification
- File deletion
- File renaming

All changes are sent to the MCP server in real-time with rich metadata.

## Development

### Project Structure
```
obsidian-ai-curator-plugin/
├── src/
│   ├── types.ts         # TypeScript type definitions
│   ├── mcp-client.ts    # WebSocket client implementation
│   ├── file-watcher.ts  # File change detection
│   └── settings.ts      # Settings tab UI
├── styles/
│   └── main.css        # Plugin styles
├── main.ts             # Plugin entry point
└── manifest.json       # Plugin metadata
```

### Building

```bash
# Development build with sourcemaps
npm run dev

# Production build
npm run build
```

## Roadmap

- [ ] Visual consolidation interface
- [ ] Conversation memory persistence
- [ ] Link validation warnings
- [ ] Batch operation support
- [ ] Knowledge density indicators

## License

MIT