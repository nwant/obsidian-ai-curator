# Troubleshooting Guide

Common issues and solutions for Obsidian AI Curator.

## Installation Issues

### "Cannot find module" error

**Problem**: When running the MCP server, you get module not found errors.

**Solutions**:
1. Make sure you ran `npm install` in the project root
2. Check Node.js version: `node --version` (needs 18+)
3. Try deleting `node_modules` and reinstalling:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

### Claude doesn't see MCP tools

**Problem**: After setup, Claude doesn't have access to vault tools.

**Solutions**:
1. **Did you restart Claude?** You must completely quit and restart Claude Desktop
2. **Check your Claude config path**:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`
3. **Verify the path is absolute**:
   ```json
   {
     "mcpServers": {
       "obsidian-vault": {
         "command": "node",
         "args": ["/full/absolute/path/to/obsidian-ai-curator/src/mcp-server.js"]
       }
     }
   }
   ```
4. **Test in Claude**: Type "What MCP tools do you have access to?"

## Configuration Issues

### "ENOENT: no such file or directory" for vault

**Problem**: MCP server can't find your vault.

**Solutions**:
1. Check your `config/config.json` has the correct path
2. Use absolute paths, not relative:
   - ✅ Good: `/Users/john/Documents/MyVault`
   - ❌ Bad: `~/Documents/MyVault` or `./MyVault`
3. Verify the folder exists and contains `.obsidian` folder

### Permission denied errors

**Problem**: Can't read or write to vault files.

**Solutions**:
1. Check file permissions on your vault
2. Make sure Obsidian isn't locking files
3. On macOS, you may need to grant Terminal/Node.js file access in System Preferences

## Runtime Issues

### Claude creates notes with wrong formatting

**Problem**: Tags have hashtags in frontmatter, dates are wrong format.

**Solution**: Remind Claude about formatting rules:
```
Please follow Obsidian formatting rules:
- No hashtags in frontmatter tags
- Use yyyy-MM-dd date format
- Use [[wikilinks]] not markdown links
```

### Changes don't appear in Obsidian

**Problem**: Created/modified files don't show up.

**Solutions**:
1. Check if files are in an ignored folder (`.obsidian`, `.trash`, etc.)
2. Try refreshing Obsidian (Cmd/Ctrl + R)
3. Check the file actually exists on disk

### Search returns no results

**Problem**: Search commands find nothing even though notes exist.

**Solutions**:
1. Check your vault path is correct
2. Verify files aren't in ignored patterns
3. Try a broader search term
4. Use `vault_scan` to verify MCP can see your files

## Plugin Issues

### Plugin doesn't appear in Obsidian

**Problem**: After installation, plugin isn't in Community Plugins.

**Solutions**:
1. Verify files are in correct location:
   ```
   YourVault/.obsidian/plugins/obsidian-ai-curator/
   ├── main.js
   ├── manifest.json
   └── main.css
   ```
2. Reload Obsidian
3. Check Community Plugins → Installed Plugins
4. Make sure Safe Mode is disabled

### API server won't start

**Problem**: Plugin enabled but API features don't work.

**Solutions**:
1. Check console for errors (Ctrl/Cmd + Shift + I)
2. Verify port 3001 isn't in use
3. Disable and re-enable plugin
4. Check plugin settings

## Getting More Help

1. **Check logs**: The MCP server logs to stderr, visible in Claude's developer console
2. **Enable debug mode**: Set `DEBUG=*` environment variable
3. **File an issue**: https://github.com/nwant/obsidian-ai-curator/issues
4. **Include details**:
   - Your OS and Node.js version
   - Exact error messages
   - Your config (without sensitive paths)