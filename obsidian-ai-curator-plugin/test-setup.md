# Testing the AI Curator Plugin

## Prerequisites

1. **MCP Server Running**: Ensure the MCP server is running on `ws://localhost:3000` (or your configured URL)
   ```bash
   cd /Users/nathan/projects/obsidian-ai-curator
   npm start
   ```

2. **Obsidian Installed**: Have Obsidian installed on your system

## Setup Test Vault

### Option 1: Manual Setup

1. Create a new vault in Obsidian or use an existing test vault
2. Navigate to the vault's `.obsidian/plugins` directory
3. Create a folder called `obsidian-ai-curator`
4. Copy the built files:
   ```bash
   cp manifest.json main.js styles/main.css /path/to/vault/.obsidian/plugins/obsidian-ai-curator/
   ```
5. Restart Obsidian
6. Enable the plugin in Settings → Community plugins

### Option 2: Development Setup

1. Create a test vault:
   ```bash
   mkdir -p ~/obsidian-test-vault/.obsidian/plugins
   ```

2. Create a symbolic link for development:
   ```bash
   ln -s /Users/nathan/projects/obsidian-ai-curator/obsidian-ai-curator-plugin ~/obsidian-test-vault/.obsidian/plugins/obsidian-ai-curator
   ```

3. Open the test vault in Obsidian
4. Enable the plugin in Settings → Community plugins

## Testing Checklist

### Initial Setup
- [ ] Plugin appears in Community plugins list
- [ ] Plugin can be enabled without errors
- [ ] Settings tab appears under Plugin Options

### Connection Testing
- [ ] Status bar shows connection status
- [ ] Connect button in settings works
- [ ] Auto-connect works on startup (if enabled)
- [ ] Disconnect button works
- [ ] Connection persists through plugin reload

### File Operations
1. **Create a new note**
   - [ ] MCP server receives create notification
   - [ ] Metadata (frontmatter, links, tags) is included

2. **Modify a note**
   - [ ] MCP server receives modify notification
   - [ ] Changes are debounced (not sent on every keystroke)

3. **Delete a note**
   - [ ] MCP server receives delete notification

4. **Rename a note**
   - [ ] MCP server receives rename notification with old and new paths

### Error Handling
- [ ] Disconnection shows appropriate status
- [ ] Reconnection attempts work
- [ ] Invalid server URL shows error
- [ ] Network interruption is handled gracefully

### Commands
- [ ] "Connect to MCP server" command works
- [ ] "Disconnect from MCP server" command works  
- [ ] "Sync vault state" command sends all files

## Debugging

### Enable Debug Mode
1. Go to Settings → AI Curator
2. Toggle "Debug mode"
3. Open Developer Console (Ctrl/Cmd + Shift + I)
4. Look for `[AI Curator]` log messages

### Common Issues

**Plugin doesn't appear:**
- Check that all files are in the correct location
- Ensure manifest.json is valid JSON
- Try restarting Obsidian

**Connection fails:**
- Verify MCP server is running
- Check the WebSocket URL in settings
- Look for error messages in console

**File changes not detected:**
- Ensure the file watcher started (check console)
- Verify you're editing .md files
- Check if plugin is enabled

## Test Data

Create these test files to verify functionality:

### Test Note 1 (test-note-1.md)
```markdown
---
tags: [test, ai-curator]
created: 2025-01-20
---

# Test Note 1

This is a test note with [[Test Note 2|a link]] and #test-tag.

## Section 1
Content here

## Section 2
More content with another [[Test Note 3]].
```

### Test Note 2 (test-note-2.md)
```markdown
# Test Note 2

This note is referenced by [[Test Note 1]].
```

### Test Note 3 (test-note-3.md)
```markdown
# Test Note 3

Final test note in the chain.
```