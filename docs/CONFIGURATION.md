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

For advanced users who want to customize behavior:

```bash
cp config/config.example.json config/config.json
```

This includes additional options like tag intelligence, research context, and thresholds.

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
  - Example: `/Users/you/Documents/MyVault` (macOS/Linux)
  - Example: `C:\\Users\\you\\Documents\\MyVault` (Windows - note double backslashes)

### Optional Settings

- `dateFormat`: Format for dates (default: "yyyy-MM-dd")
- `ignorePatterns`: Folders/files to exclude from operations (default: [".obsidian", ".git", ".trash"])

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
    "email": "your.email@example.com"
  }
}
```

**Note:** Git author info is optional. If not provided, it uses your system's git configuration.

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
- Documents are loaded when using the research context tool
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
2. Add your vault's `CLAUDE.md` file to the project (if you have one)
3. Claude will automatically follow Obsidian formatting conventions

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
  "vaultPath": "/path/to/your/vault",
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