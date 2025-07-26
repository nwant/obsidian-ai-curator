# Obsidian AI Curator Plugin

AI-powered knowledge consolidation plugin for Obsidian that works with Claude Desktop/Code via MCP.

## Features

- **API Server**: Exposes Obsidian's native APIs (search, tags, links) for MCP server optimization
- **Smart Consolidation**: Find and consolidate related notes with AI assistance
- **Git Integration**: Automatic commits before/after consolidation operations
- **Claude Desktop/Code Compatible**: Works seamlessly with Claude via MCP protocol

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
2. Configure API server settings (default port: 3001)
3. Set consolidation preferences (archive folder, auto-commit, etc.)
4. Choose Claude model for consolidation operations

## Usage

### Commands

- **Find notes to consolidate**: Analyze vault for consolidation opportunities

### API Server

The plugin runs an API server on port 3001 that exposes:
- `/api/search` - Obsidian's search with cached index
- `/api/tags` - All tags from metadata cache
- `/api/links` - Outgoing links from any note
- `/api/backlinks` - Incoming links to any note
- `/api/metadata` - Full metadata for notes
- `/api/swagger` - API documentation

### Using with Claude Desktop

1. Start Obsidian with the AI Curator plugin enabled
2. The API server starts automatically on port 3001
3. Use Claude Desktop with the MCP server - it will automatically detect and use Obsidian's APIs

## Development

### Project Structure

The plugin is located in the `obsidian-ai-curator-plugin` subdirectory of the main repository:

```
obsidian-ai-curator/                 # Main repository
└── obsidian-ai-curator-plugin/      # Plugin directory
    ├── src/
    │   ├── types.ts                # TypeScript type definitions
    │   ├── settings.ts             # Settings tab UI
    │   ├── obsidian-api-server.ts  # API server for MCP optimization
    │   ├── consolidation-service.ts # Note consolidation logic
    │   ├── consolidation-modal.ts  # UI for consolidation
    │   ├── git-service.ts          # Git integration
    │   └── openapi-spec.ts         # Swagger documentation
    ├── main.css                    # Plugin styles
    ├── main.ts                     # Plugin entry point
    └── manifest.json               # Plugin metadata
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

- [x] API server for Obsidian native APIs
- [x] Smart consolidation with Claude
- [x] Git integration for version control
- [ ] Batch consolidation operations
- [ ] Knowledge density visualization
- [ ] Custom consolidation rules

## License

MIT