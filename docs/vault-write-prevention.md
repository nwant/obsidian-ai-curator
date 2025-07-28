# Vault Write Prevention System

## Overview

The Obsidian AI Curator implements a vault write prevention system to ensure all vault operations go through the MCP server tools, which apply proper validations, formatting, and conventions.

## Why This Matters

Direct writes to the vault bypass:
- **Tag Intelligence**: No validation against taxonomy, no duplicate prevention
- **Date Management**: Timestamps won't be automatically set/updated
- **Link Formatting**: Links won't be converted to wikilink format
- **Vault Conventions**: Project-specific rules aren't enforced

## Implementation

### 1. Vault Write Guard (`src/tools/vault-write-guard.js`)

Provides validation to check if a write operation targets the vault:

```javascript
const guard = new VaultWriteGuard(config);
const validation = guard.validateWrite(targetPath);

if (!validation.allowed) {
  // Block the operation
  throw new Error(guard.getErrorMessage(validation));
}
```

### 2. Configuration

Enable/disable in `config.json`:

```json
{
  "vaultWriteGuard": {
    "enabled": true,
    "logViolations": true
  }
}
```

### 3. CLAUDE.md Instructions

Added explicit rules:
- NEVER write files directly to vault path
- ALWAYS use MCP server tools

## Integration Points

### For Claude Desktop/Code

The system should intercept any attempt to use the Write tool on vault paths and suggest the appropriate MCP tool instead.

### For Developers

When extending the system:

1. **Before any file write operation**:
   ```javascript
   import { checkVaultWrite } from './tools/vault-write-guard.js';
   
   const validation = checkVaultWrite(config, targetPath);
   if (!validation.allowed) {
     // Redirect to appropriate MCP tool
   }
   ```

2. **In tool implementations**:
   ```javascript
   // Good - uses MCP tool
   await mcpServer.writeNote({ 
     path: 'Projects/MyProject.md', 
     content: '...' 
   });
   
   // Bad - direct write
   await fs.writeFile('/vault/Projects/MyProject.md', '...');
   ```

## Proper Vault Operations

### Creating/Updating Notes

```javascript
// Use write_note tool
{
  "tool": "write_note",
  "arguments": {
    "path": "Projects/My Project.md",
    "content": "..."
  }
}
```

### Updating Tags Only

```javascript
// Use update_tags tool
{
  "tool": "update_tags",
  "arguments": {
    "path": "Projects/My Project.md",
    "replace": ["#project", "#active"]
  }
}
```

### Updating Frontmatter

```javascript
// Use update_frontmatter tool
{
  "tool": "update_frontmatter",
  "arguments": {
    "path": "Projects/My Project.md",
    "updates": {
      "status": "in-progress",
      "modified": "2025-07-28"
    }
  }
}
```

### Daily Notes

```javascript
// Use append_to_daily_note tool
{
  "tool": "append_to_daily_note",
  "arguments": {
    "content": "Meeting notes...",
    "section": "Notes"
  }
}
```

## Error Messages

When a direct vault write is attempted, the system provides:

1. Clear error message explaining why it was blocked
2. List of what validations were bypassed
3. Suggestion of which MCP tool to use instead
4. Available tools reference

## Monitoring

Violations are logged to help identify patterns:
- Location: Adjacent to vault directory
- File: `vault-write-violations.log`
- Format: Timestamp, source, attempted path

## Future Enhancements

1. **Auto-redirect**: Automatically convert Write tool calls to appropriate MCP tools
2. **IDE Integration**: VS Code extension to warn before direct writes
3. **Git Hooks**: Pre-commit checks for direct vault modifications
4. **Metrics**: Track how often prevention saves from bypass

## Best Practices

1. **Always use MCP tools** for vault operations
2. **Check paths** before operations if unsure
3. **Review logs** periodically for violation patterns
4. **Update CLAUDE.md** with any new patterns discovered

This system ensures the AI curator maintains consistency and quality in all vault operations.