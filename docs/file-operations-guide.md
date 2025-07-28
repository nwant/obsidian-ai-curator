# File Operations Guide

## Overview

The Obsidian AI Curator provides powerful file operation tools that preserve all links throughout your vault. When you rename or move files, all references are automatically updated.

## Available Operations

### 1. Rename File

Rename a file while preserving all links:

```javascript
{
  "tool": "rename_file",
  "arguments": {
    "oldPath": "Notes/Old Name.md",
    "newPath": "Notes/New Name.md"
  }
}
```

### 2. Move File

Move a file to a new location:

```javascript
{
  "tool": "move_file", 
  "arguments": {
    "sourcePath": "Inbox/Quick Note.md",
    "targetPath": "Projects/Research/Quick Note.md"
  }
}
```

## How It Works

### With Obsidian Plugin Running

When the Obsidian plugin is active (API server on port 3001):

1. **Native API Usage**: Uses Obsidian's `fileManager.renameFile()` method
2. **Automatic Updates**: Obsidian automatically updates ALL references:
   - Wikilinks: `[[Old Name]]` → `[[New Name]]`
   - Aliases: `[[Old Name|Custom Text]]` → `[[New Name|Custom Text]]`
   - Embedded files: `![[Old Name]]` → `![[New Name]]`
   - Backlinks: All files linking to the renamed file
3. **Instant**: Updates happen instantly across entire vault

### Fallback Mode (No Plugin)

If Obsidian plugin isn't running:

1. **Manual Scanning**: Scans all vault files for references
2. **Pattern Matching**: Finds various link formats:
   - `[[Note Name]]`
   - `[[path/to/Note Name]]`
   - `[text](path/to/note.md)`
3. **Batch Updates**: Updates all found references
4. **File Operation**: Performs the actual rename/move

## Link Types Preserved

### Wikilinks
- `[[Note Name]]` - Basic wikilink
- `[[Folder/Note Name]]` - With path
- `[[Note Name|Alias]]` - With custom display text
- `[[Note Name#Heading]]` - With heading reference
- `[[Note Name#^block-id]]` - With block reference

### Markdown Links
- `[text](note.md)` - Relative link
- `[text](folder/note.md)` - With path
- `[text](../other/note.md)` - Relative paths

### Embeds
- `![[Image.png]]` - Embedded images
- `![[Note.md]]` - Embedded notes
- `![[PDF.pdf#page=3]]` - Embedded PDFs

## Best Practices

### 1. Use Descriptive Names
When renaming, use clear, descriptive names:
```
❌ "Meeting Notes.md" → "Notes1.md"
✅ "Meeting Notes.md" → "2025-07-28 Team Standup.md"
```

### 2. Organize While Moving
Use moves to better organize your vault:
```
"Inbox/Random Thought.md" → "Ideas/Project Ideas/AI Assistant Concept.md"
```

### 3. Batch Operations
Plan multiple operations together:
1. First rename for clarity
2. Then move to proper location
3. Update tags and metadata after

### 4. Safety Checks
The tools include safety features:
- Prevents overwriting existing files
- Validates paths before operations
- Returns detailed success/error info

## Examples

### Example 1: Project Reorganization
```
// Rename for clarity
rename_file: "Projects/Untitled.md" → "Projects/AI Research Assistant.md"

// Move to active projects
move_file: "Projects/AI Research Assistant.md" → "Projects/Active/AI Research Assistant.md"
```

### Example 2: Archive Completed Work
```
// Move completed notes to archive
move_file: "Daily/2024-01-15.md" → "Archive/2024/Daily/2024-01-15.md"
```

### Example 3: Standardize Naming
```
// Standardize date format
rename_file: "Meeting 1-15-24.md" → "2024-01-15 Meeting.md"
```

## Error Handling

### Common Errors

1. **File Not Found**
   - Ensure the source file exists
   - Check for typos in the path
   - Paths are case-sensitive

2. **Target Already Exists**
   - Choose a different name
   - Or move existing file first

3. **Invalid Path**
   - Don't use special characters: `<>:"|?*`
   - Avoid leading/trailing spaces

### Error Response Format
```json
{
  "success": false,
  "error": "File not found: Notes/Missing.md",
  "oldPath": "Notes/Missing.md",
  "newPath": "Notes/Found.md"
}
```

## Performance

### With Obsidian API
- **Speed**: Instant (< 100ms)
- **Reliability**: 100% - Obsidian handles everything
- **Scope**: Entire vault updated atomically

### Manual Fallback
- **Speed**: Depends on vault size (typically 1-5 seconds)
- **Reliability**: Very high with pattern matching
- **Scope**: All markdown files scanned

## Integration with Other Tools

### After Renaming/Moving

1. **Update Tags**: Use `update_tags` if needed
2. **Update Frontmatter**: Use `update_frontmatter` for metadata
3. **Git Commit**: Use `git_checkpoint` to save changes

### Workflow Example
```javascript
// 1. Rename for clarity
await rename_file({
  oldPath: "Untitled.md",
  newPath: "Project Specification.md"
});

// 2. Update metadata
await update_frontmatter({
  path: "Project Specification.md",
  updates: {
    status: "active",
    type: "specification"
  }
});

// 3. Commit changes
await git_checkpoint({
  message: "Organized project documentation"
});
```

## Tips

1. **Test First**: Try on non-critical files first
2. **Backup**: Use git checkpoints before major reorganizations
3. **Plan Ahead**: Think about your vault structure
4. **Use Consistently**: Regular organization prevents chaos

## Troubleshooting

### Links Not Updating?

1. Check if Obsidian plugin is running
2. Verify file paths are correct
3. Look for unusual link formats
4. Check error messages for details

### Slow Performance?

1. Ensure Obsidian API server is running
2. Large vaults may take longer in fallback mode
3. Consider breaking into smaller operations

### Can't Find Moved Files?

1. Check the exact path provided
2. Use `vault_scan` to find files
3. Verify no typos in paths

## Future Enhancements

- Bulk operations support
- Regex-based renaming
- Template-based naming
- Automatic organization rules

Remember: These tools are designed to make vault organization painless while preserving your carefully crafted link structure!