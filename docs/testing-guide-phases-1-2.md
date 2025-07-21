# Complete Testing Guide for Phases 1 & 2

## Prerequisites

1. **Start the WebSocket Server**
   ```bash
   cd /Users/nathan/projects/obsidian-ai-curator
   npm run start:ws
   ```
   You should see:
   - "WebSocket server listening on port 3000"
   - "Vault path: /Users/nathan/obsidian"

2. **Build and Install the Plugin**
   ```bash
   cd /Users/nathan/projects/obsidian-ai-curator/obsidian-ai-curator-plugin
   npm install
   npm run build
   ```

3. **Install in Obsidian**
   - Copy the built files to your vault:
     ```bash
     cp manifest.json main.js styles/main.css /Users/nathan/obsidian/.obsidian/plugins/obsidian-ai-curator/
     ```
   - Or create a symbolic link for development:
     ```bash
     ln -sf /Users/nathan/projects/obsidian-ai-curator/obsidian-ai-curator-plugin /Users/nathan/obsidian/.obsidian/plugins/obsidian-ai-curator
     ```

4. **Enable the Plugin**
   - Open Obsidian
   - Settings → Community plugins → Enable "AI Curator"

## Phase 1 Testing: Foundation

### 1. Connection Testing

**Test WebSocket Connection:**
- Look at status bar - should show "🟢 Connected"
- Check settings (Settings → AI Curator)
  - Connection status should show "connected"
  - Try "Disconnect" then "Connect" buttons

**Test Auto-Connect:**
- Enable "Auto-connect on startup" in settings
- Restart Obsidian
- Should connect automatically within 2 seconds

**Test Connection Resilience:**
1. Stop the WebSocket server (Ctrl+C)
2. Status bar should show "🔴 Error"
3. Restart server
4. Should auto-reconnect (watch status bar)

### 2. File Sync Testing

**Test File Operations:**
Create a test file and watch the server console for each operation:

1. **Create**: Make a new note "test-note.md"
   - Server should log: "File create: test-note.md"

2. **Modify**: Add content and save
   - Server should log: "File modify: test-note.md"
   - Note: Debounced by 500ms

3. **Rename**: Right-click → Rename to "test-renamed.md"
   - Server should log: "File rename: test-renamed.md"

4. **Delete**: Delete the file
   - Server should log: "File delete: test-renamed.md"

### 3. Metadata Extraction

Create a test note with rich content:
```markdown
---
tags: [test, phase1]
author: Test User
created: 2025-01-20
---

# Test Note for Metadata

This note has [[Link to Another Note]] and #test-tag.

## Section 1
Content here with [[Another Link|Custom Display]].

## Section 2
More content.
```

When you save, the server should receive:
- Frontmatter fields
- Links with positions
- Tags
- Headings
- Backlinks (if any)

### 4. Commands Testing

Test each command (Cmd/Ctrl + P):

1. **"Connect to MCP server"**
   - Should establish connection
   - Shows success notice

2. **"Disconnect from MCP server"**
   - Should disconnect
   - Status bar updates

3. **"Sync vault state with MCP server"**
   - Sends all vault files to server
   - Shows count in notice

## Phase 2 Testing: Enhanced Intelligence

### 1. Context Tracking

**Test Active File Tracking:**
1. Open different files
2. Watch server console for "Workspace context update"
3. Should show:
   - Active file path
   - Recent files count
   - Open files count
   - Current folder

**Test Recent Files:**
1. Open 5-6 different files in sequence
2. Run command: "Show current workspace context"
3. Should list recently opened files in order

**Test Layout Detection:**
1. Try different layouts:
   - Single pane
   - Split vertical (drag tab to side)
   - Split horizontal (drag tab to bottom)
   - Multiple tabs
2. Server should log layout changes

### 2. Link Validation

**Create Test Files:**

File 1: `broken-links-test.md`
```markdown
# Broken Links Test

This has some broken links:
- [[Non-Existent Note]]
- [[Missing File]]
- [[Typo in Naem]]

And some valid links:
- [[valid-note]]
```

File 2: `valid-note.md`
```markdown
# Valid Note
This exists!
```

**Test Validation:**
1. Open `broken-links-test.md`
2. Run command: "Validate links in current file"
3. Should show modal with:
   - 3 broken links
   - Suggestions if similar files exist
   - Line numbers

### 3. Move Preview

**Setup Test Files:**

File 1: `source-note.md`
```markdown
# Source Note

This links to [[target-note]].
Also see [[target-note|Target]] for more info.
```

File 2: `target-note.md`
```markdown
# Target Note

This will be renamed.
```

**Test Move Preview:**
1. Try to rename `target-note.md` to `renamed-target.md`
2. Should show preview modal:
   - "This will update 2 links in 1 file"
   - Shows affected files
   - Cancel or proceed options
3. If you proceed, check that links in `source-note.md` updated

### 4. Link Index Testing

**Test Backlinks:**
1. Create several notes that link to each other
2. The server maintains a link index
3. When you rename, it knows which files to update

**Test Index Building:**
1. First vault sync builds the index
2. Server logs: "Building link index..."
3. Shows progress for large vaults

## Debugging Tips

### Enable Debug Mode
1. Settings → AI Curator → Enable "Debug mode"
2. Open Developer Console (Cmd/Opt + I on Mac, Ctrl+Shift+I on Windows)
3. Look for `[AI Curator]` messages

### Common Issues

**"WebSocket connection failed"**
- Check server is running
- Verify port 3000 is free
- Check URL in settings (should be `ws://localhost:3000`)

**No metadata sent**
- Ensure you're editing `.md` files
- Check file watcher started (see console)
- Try disconnect/reconnect

**Context not updating**
- Context updates are debounced (500ms)
- Check console for errors
- Try "Show current workspace context" command

**Move preview not showing**
- Only shows if file has backlinks
- Check link index is built
- Try manual sync first

## Performance Testing

### Large Vault Test
1. Test with many files (100+)
2. Initial sync should handle gracefully
3. Link index building shows progress

### Rapid Operations
1. Quickly switch between files
2. Context updates should debounce
3. No duplicate file events

### Memory Usage
1. Monitor Obsidian's memory
2. Should remain stable
3. Cache is managed efficiently

## Integration Testing

### Full Workflow Test
1. Start server
2. Connect plugin
3. Create a project with multiple linked notes
4. Edit, rename, and reorganize
5. Validate links
6. Check all features work together

### Server Restart Test
1. Work normally
2. Stop and restart server
3. Plugin should reconnect
4. Link index reloads
5. Continue working

## Success Criteria

Phase 1 & 2 are working correctly if:
- ✅ Real-time file sync works
- ✅ Rich metadata is extracted
- ✅ Context tracking follows your work
- ✅ Link validation finds broken links
- ✅ Move preview prevents breaking links
- ✅ Server maintains persistent link index
- ✅ Reconnection is automatic
- ✅ Performance is smooth

## Next Steps

Once all tests pass, you're ready for Phase 3:
- Visual consolidation interface
- Knowledge density indicators
- The "Tetris" experience!