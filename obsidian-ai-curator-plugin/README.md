# Obsidian AI Curator Plugin

AI-powered knowledge consolidation plugin for Obsidian that integrates with the MCP server.

## Features

- **Real-time Sync**: Automatically syncs file changes with the MCP server
- **Connection Management**: Robust WebSocket connection with auto-reconnect
- **Rich Metadata**: Shares links, tags, headings, and frontmatter with AI
- **Status Indicator**: Visual connection status in the status bar

## Installation

### Option 1: Development Setup (Recommended)

1. Clone the repository to your projects directory:
   ```bash
   git clone https://github.com/nwant/obsidian-ai-curator.git
   cd obsidian-ai-curator/obsidian-ai-curator-plugin
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the plugin:
   ```bash
   npm run build
   ```

4. Create a symbolic link to your Obsidian vault:
   ```bash
   # Replace /path/to/vault with your actual vault path
   ln -s "$(pwd)" /path/to/vault/.obsidian/plugins/obsidian-ai-curator
   ```

5. Reload Obsidian or enable the plugin in Settings → Community plugins

### Option 2: Direct Installation

1. Navigate to your vault's plugins directory:
   ```bash
   cd /path/to/vault/.obsidian/plugins
   ```

2. Clone the repository:
   ```bash
   git clone https://github.com/nwant/obsidian-ai-curator.git temp
   mv temp/obsidian-ai-curator-plugin obsidian-ai-curator
   rm -rf temp
   ```

3. Install and build:
   ```bash
   cd obsidian-ai-curator
   npm install
   npm run build
   ```

4. Enable the plugin in Obsidian Settings → Community plugins

### Option 3: Manual Installation

1. Download the latest release from GitHub
2. Extract `main.js`, `manifest.json`, and `styles/main.css` 
3. Create folder `your-vault/.obsidian/plugins/obsidian-ai-curator/`
4. Copy the files into this folder
5. Enable the plugin in Obsidian Settings → Community plugins

### Development Mode

For hot-reload during development:
```bash
# In the plugin directory
cd /path/to/obsidian-ai-curator/obsidian-ai-curator-plugin
npm run dev
```

**Note**: The plugin must be built from the `obsidian-ai-curator-plugin` subdirectory, not the root repository directory.

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

The plugin is located in the `obsidian-ai-curator-plugin` subdirectory of the main repository:

```
obsidian-ai-curator/                 # Main repository
└── obsidian-ai-curator-plugin/      # Plugin directory
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

Always run build commands from the plugin directory:

```bash
# Navigate to plugin directory first
cd /path/to/obsidian-ai-curator/obsidian-ai-curator-plugin

# Development build with sourcemaps
npm run dev

# Production build
npm run build
```

### Common Issues

**"Missing script: build" error**: You're likely in the wrong directory. Make sure you're in the `obsidian-ai-curator-plugin` subdirectory, not the root repository directory.

**Plugin not appearing in Obsidian**: Ensure the symbolic link or copied files are in the correct location: `your-vault/.obsidian/plugins/obsidian-ai-curator/`

## Roadmap

- [ ] Visual consolidation interface
- [ ] Conversation memory persistence
- [ ] Link validation warnings
- [ ] Batch operation support
- [ ] Knowledge density indicators

## License

MIT