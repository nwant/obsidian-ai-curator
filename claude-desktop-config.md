# Claude Desktop Configuration for Obsidian AI Curator

## Setup Instructions

### Option 1: Use Project Mode (Recommended)
1. Open Claude Desktop
2. Create a new project or use an existing one for your Obsidian vault
3. Add these files to the project:
   - `/Users/nathan/projects/obsidian-ai-curator/CLAUDE.md`
   - `/Users/nathan/projects/obsidian-ai-curator/LLM_INSTRUCTIONS.md`
   - Any other relevant documentation

Claude will automatically reference these files when working in that project.

### Option 2: Include in Every Prompt
Start your prompts with:
```
Please follow the instructions in LLM_INSTRUCTIONS.md when working with my Obsidian vault.
```

### Option 3: Create a Custom Prompt Template
Save this as your standard vault interaction prompt:
```
I need help with my Obsidian vault. Please:
1. Follow all formatting rules in LLM_INSTRUCTIONS.md
2. Use MCP tools for all vault operations
3. Ensure dates use yyyy-MM-dd format
4. Never use hashtags in frontmatter tags
5. Avoid complex nested structures in frontmatter

[Your actual request here]
```

### Option 4: Use MCP Context Injection
The MCP server could be enhanced to automatically inject the instructions. Add to your MCP config:

```json
{
  "mcpServers": {
    "obsidian-vault": {
      "command": "node",
      "args": ["/path/to/mcp-server.js"],
      "env": {
        "AUTO_INJECT_INSTRUCTIONS": "true",
        "INSTRUCTIONS_PATH": "/path/to/LLM_INSTRUCTIONS.md"
      }
    }
  }
}
```

## Best Practices

1. **Always mention you're working with your Obsidian vault** in your prompts
2. **Reference specific formatting requirements** when relevant
3. **Use the write_note MCP tool** instead of direct file writes
4. **Check the MCP server responses** for any warnings about formatting

## Quick Reference Card

Include this in your prompts when needed:

```
Working with Obsidian vault - remember:
- Date format: yyyy-MM-dd
- Tags: no # in frontmatter
- Frontmatter: simple structures only
- Links: use [[wikilinks]]
- Always use MCP tools
```