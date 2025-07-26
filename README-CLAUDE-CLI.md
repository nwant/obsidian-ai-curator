# Using Claude CLI with Obsidian AI Curator

## Quick Start

1. **Ensure Claude Code is installed and logged in**
   ```bash
   claude --version
   ```

2. **Configure MCP server in Claude Code**
   - The Obsidian MCP server should be configured in your Claude Code settings

3. **Build and reload the plugin**
   ```bash
   ./start.sh
   ```

4. **Use the consolidation feature**
   - Open Command Palette (Cmd/Ctrl + P)
   - Search for "AI Curator: Find notes to consolidate"
   - Follow the prompts

## How It Works

The plugin uses Claude CLI instead of the API, which means:
- ✅ No API key required
- ✅ Uses your Claude Max subscription
- ✅ No additional costs
- ✅ Full access to MCP tools

## Commands

### Find Consolidation Candidates
```
Cmd/Ctrl + P → "AI Curator: Find notes to consolidate"
```

This will:
1. Analyze your vault using Claude
2. Find groups of related notes
3. Show consolidation suggestions
4. Let you review and approve consolidations

## Configuration

In Obsidian Settings → AI Curator:
- **Claude CLI path**: Leave empty to use `claude` from PATH, or specify full path

## Troubleshooting

### "Failed to analyze vault. Is Claude CLI available?"

1. Check Claude is installed:
   ```bash
   which claude
   ```

2. Make sure you're logged in:
   ```bash
   claude --help
   ```

3. Set the path in plugin settings if needed

### Testing the Integration

Run the test script:
```bash
node test-claude-cli.js
```

## Current Limitations

- The consolidation UI currently shows results in a notice (modal UI coming in Phase 3)
- Progress updates are logged to console (streaming UI coming soon)

## Next Steps

1. Phase 3 will add a proper consolidation UI with:
   - Visual consolidation preview
   - Real-time streaming progress
   - Approve/reject interface
   
2. Phase 4 will add:
   - Conversation persistence
   - Multi-step consolidations
   - Batch operations