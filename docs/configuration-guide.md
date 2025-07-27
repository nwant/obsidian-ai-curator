# Configuration Guide

This guide explains all configuration options available in the Obsidian AI Curator.

## Configuration File

Copy `config/config.example.json` to `config/config.json` and customize it for your vault.

## Configuration Options

### Basic Settings

```json
{
  "vaultPath": "/path/to/your/obsidian/vault"
}
```
- **vaultPath**: (Required) Absolute path to your Obsidian vault

### Date Configuration

```json
{
  "dateFormat": "yyyy-MM-dd",
  "dailyNotesPath": "Daily",
  "dailyNoteDateFormat": "yyyy-MM-dd",
  "dailyNoteTemplate": "custom template..."
}
```

- **dateFormat**: Format for created/modified dates in notes
- **dailyNotesPath**: Folder where daily notes are stored
- **dailyNoteDateFormat**: Filename format for daily notes
- **dailyNoteTemplate**: Custom template for new daily notes

#### Date Format Options
Common formats using date-fns notation:
- `yyyy-MM-dd` → 2025-01-27
- `yyyy-MM-dd HH:mm` → 2025-01-27 15:30
- `dd/MM/yyyy` → 27/01/2025
- `MM-dd-yyyy` → 01-27-2025
- `yyyy-MM-dd'T'HH:mm:ss` → 2025-01-27T15:30:45

#### Daily Note Template Variables
- `{{date}}` - Formatted date
- `{{title}}` - Human-readable date (e.g., "Monday, January 27, 2025")
- `{{datetime}}` - ISO datetime

### File Management

```json
{
  "ignorePatterns": [
    ".obsidian",
    ".git",
    ".trash",
    "_archived"
  ]
}
```
- **ignorePatterns**: Folders/files to exclude from operations

### Consolidation Settings

```json
{
  "thresholds": {
    "similarityScore": 0.7,
    "minNoteLength": 50,
    "maxFragmentLength": 500
  },
  "consolidation": {
    "archiveFolder": "_archived",
    "maxConsolidationSize": 5000
  }
}
```

### Tag Intelligence

```json
{
  "tagIntelligence": {
    "taxonomyDocument": "/Meta/Tag Taxonomy Index.md",
    "autoTagging": true,
    "enforceHierarchy": true,
    "preventDuplicates": true,
    "suggestFromTaxonomy": true,
    "thresholds": {
      "similarity": 0.7,
      "suggestionRelevance": 0.3
    }
  }
}
```

- **taxonomyDocument**: Path to your vault's tag taxonomy document
- **autoTagging**: Automatically add tags based on content patterns
- **enforceHierarchy**: Require tags to follow defined hierarchies
- **preventDuplicates**: Prevent creation of similar tags
- **suggestFromTaxonomy**: Base suggestions on taxonomy rules
- **thresholds**: Fine-tune similarity and relevance thresholds

### Research Context

```json
{
  "researchContext": {
    "description": "Your role and context",
    "contextDocuments": {
      "workflow": "/Meta/workflow.md",
      "guidelines": "/Meta/guidelines.md",
      "tagGuidelines": "docs/tag-usage-guidelines.md"
    },
    "systemCapabilities": {
      "atomicRecords": true,
      "autonomousOperation": false
    },
    "customInstructions": "Additional AI instructions"
  }
}
```

## Example Configurations

### Personal Knowledge Base
```json
{
  "vaultPath": "/Users/you/Documents/ObsidianVault",
  "dailyNotesPath": "Journal",
  "dailyNoteDateFormat": "yyyy-MM-dd",
  "dateFormat": "yyyy-MM-dd HH:mm",
  "dailyNoteTemplate": "---\ndate: {{date}}\nmood: \nweather: \n---\n\n# {{title}}\n\n## Gratitude\n- \n\n## Today's Goals\n- [ ] \n\n## Notes\n\n## Tomorrow\n- [ ] "
}
```

### Work/Project Vault
```json
{
  "vaultPath": "/Users/you/Work/ProjectNotes",
  "dailyNotesPath": "Daily Standups",
  "dailyNoteDateFormat": "yyyy-MM-dd",
  "dateFormat": "yyyy-MM-dd",
  "dailyNoteTemplate": "---\ndate: {{date}}\ntype: standup\nproject: current\n---\n\n# {{title}}\n\n## Yesterday\n- \n\n## Today\n- [ ] \n\n## Blockers\n- \n"
}
```

### Research Vault
```json
{
  "vaultPath": "/Users/you/Research",
  "dailyNotesPath": "Lab Notes",
  "dailyNoteDateFormat": "yyyy-MM-dd",
  "dateFormat": "yyyy-MM-dd'T'HH:mm:ss",
  "dailyNoteTemplate": "---\ndate: {{datetime}}\ntype: lab-note\nexperiments: []\n---\n\n# Lab Notes - {{title}}\n\n## Experiments\n\n## Observations\n\n## Data\n\n## Next Steps\n"
}
```

## Migration from Existing Setup

If you already have daily notes in a different format:

1. Set `dailyNotesPath` to match your existing folder
2. Set `dailyNoteDateFormat` to match your filename pattern
3. The system will work with existing notes and create new ones consistently

## Environment Variables

You can also use environment variables:
```bash
export OBSIDIAN_VAULT_PATH=/path/to/vault
export OBSIDIAN_DAILY_PATH=DailyNotes
```

These override config.json values if set.

## Validation

The system validates all date-related operations:
- Ensures dates are valid
- Maintains consistent formatting
- Handles timezone correctly
- Prevents invalid date entries

## Tips

1. **Match Obsidian Settings**: Set `dailyNoteDateFormat` to match your Obsidian daily notes plugin format
2. **Template Design**: Create templates that match your workflow
3. **Path Separators**: Use forward slashes (/) even on Windows
4. **Relative Paths**: All vault paths are relative to `vaultPath`