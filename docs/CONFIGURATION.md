# Configuration Guide

Complete reference for configuring Obsidian AI Curator.

## Quick Start Configuration

For most users, this minimal configuration is all you need:

```json
{
  "vaultPath": "/Users/you/Documents/MyObsidianVault"
}
```

That's it! The system will use sensible defaults for everything else.

## Advanced Configuration

If you want to customize behavior, you can copy the full example:

```bash
cp config/config.example.json config/config.json
```

## All Configuration Options

```json
{
  "vaultPath": "/path/to/your/obsidian/vault",
  "dateFormat": "yyyy-MM-dd",
  "ignorePatterns": [".obsidian", ".git", ".trash"]
}
```

### Required Settings

- `vaultPath`: Absolute path to your Obsidian vault

### Optional Settings

- `dateFormat`: Format for dates (default: "yyyy-MM-dd")
- `ignorePatterns`: Folders/files to exclude from operations

## Daily Notes

Configure daily note handling:

```json
{
  "dailyNotesPath": "Daily",
  "dailyNoteDateFormat": "yyyy-MM-dd",
  "dailyNoteTemplate": "---\ndate: {{date}}\n---\n\n# {{title}}\n\n## Notes\n\n## Tasks\n- [ ] "
}
```

### Settings

- `dailyNotesPath`: Folder for daily notes (default: "Daily")
- `dailyNoteDateFormat`: Filename format for daily notes
- `dailyNoteTemplate`: Template for new daily notes

### Template Variables

- `{{date}}`: Formatted date
- `{{title}}`: Human-readable date
- `{{datetime}}`: ISO datetime

## Tag Intelligence

Configure tag behavior:

```json
{
  "tagIntelligence": {
    "taxonomyDocument": "Meta/Tag Taxonomy.md",
    "autoTagging": true,
    "enforceHierarchy": true,
    "preventDuplicates": true,
    "thresholds": {
      "similarity": 0.7,
      "suggestionRelevance": 0.3
    }
  }
}
```

### Settings

- `taxonomyDocument`: Path to your tag taxonomy document
- `autoTagging`: Automatically apply tags based on content
- `enforceHierarchy`: Require tags to follow defined hierarchies
- `preventDuplicates`: Prevent creation of similar tags
- `thresholds`: Similarity thresholds for tag operations

## Git Integration

Enable version control features:

```json
{
  "gitCheckpoints": true,
  "gitAuthor": {
    "name": "Your Name",
    "email": "you@example.com"
  }
}
```

## Research Context

Configure AI research partner context:

```json
{
  "researchContext": {
    "description": "AI research assistant for academic work",
    "contextDocuments": {
      "workflow": "Meta/Research Workflow.md",
      "guidelines": "Meta/Writing Guidelines.md"
    },
    "customInstructions": "Focus on academic rigor and citations"
  }
}
```

### Context Documents

- Can be relative to vault or absolute paths
- Documents are loaded when using `get_research_context()`
- Provide workflow guidelines and conventions

## Project Templates

Project templates are configured separately:

1. **Custom Templates**: Create `config/project-templates.json`
2. **Default Templates**: Modify `config/project-templates.default.json`

See [Project Templates Documentation](PROJECT_TEMPLATES.md) for details.

## Performance

Configure caching and performance:

```json
{
  "cache": {
    "enabled": true,
    "ttl": 300000,
    "maxSize": 100
  },
  "performance": {
    "maxConcurrentOps": 10,
    "scanBatchSize": 100
  }
}
```

## Claude Desktop Integration

### Project Mode (Recommended)
1. Create a new project in Claude Desktop for your vault
2. Add these files to the project:
   - Project instructions: `CLAUDE.md`
   - Formatting rules: `docs/FORMATTING_RULES.md`
3. Claude will automatically reference these files when working in that project

### Custom Prompt Template
Save this as your standard vault interaction prompt:
```
I need help with my Obsidian vault. Please:
1. Follow formatting rules (yyyy-MM-dd dates, no # in frontmatter tags)
2. Use MCP tools for all vault operations
3. Use [[wikilink]] format for links
4. Never write files directly to the vault path

[Your actual request here]
```

### Quick Reference
Include in prompts when needed:
```
Working with Obsidian vault - remember:
- Date format: yyyy-MM-dd
- Tags: no # in frontmatter
- Frontmatter: simple structures only
- Links: use [[wikilinks]]
- Always use MCP tools
```

## Vault Write Guard

Ensure all writes go through MCP tools:

```json
{
  "vaultWriteGuard": {
    "enabled": true,
    "logViolations": true
  }
}
```

## Complete Example

```json
{
  "vaultPath": "/Users/me/Documents/ObsidianVault",
  "dateFormat": "yyyy-MM-dd",
  "ignorePatterns": [".obsidian", ".git", ".trash", "_archived"],
  
  "dailyNotesPath": "Daily Notes",
  "dailyNoteDateFormat": "yyyy-MM-dd",
  "dailyNoteTemplate": "---\ndate: {{date}}\ntags: [daily]\n---\n\n# {{title}}\n\n## Tasks\n- [ ] ",
  
  "tagIntelligence": {
    "taxonomyDocument": "Meta/Tags.md",
    "autoTagging": true,
    "enforceHierarchy": false,
    "thresholds": {
      "similarity": 0.7,
      "suggestionRelevance": 0.3
    }
  },
  
  "gitCheckpoints": true,
  
  "researchContext": {
    "description": "Personal knowledge management",
    "contextDocuments": {
      "workflow": "Meta/Workflow.md"
    }
  },
  
  "vaultWriteGuard": {
    "enabled": true,
    "logViolations": true
  }
}
```

## Environment Variables

You can also use environment variables:

```bash
export OBSIDIAN_VAULT_PATH=/path/to/vault
export OBSIDIAN_DAILY_PATH=Daily
```

Environment variables override config.json values.

## Validation

The system validates configuration on startup:
- Checks vault path exists
- Validates date formats
- Ensures required fields are present

## Tips

1. **Use absolute paths** for vaultPath
2. **Match Obsidian settings** for daily notes format
3. **Keep ignore patterns minimal** for better performance
4. **Test templates** before using in production