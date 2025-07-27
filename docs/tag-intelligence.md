# Tag Intelligence System

The Obsidian AI Curator now includes an enhanced tag intelligence system that reads and respects your vault's tag taxonomy, preventing tag proliferation and ensuring consistent tagging across your knowledge base.

## Features

### 1. Tag Taxonomy Reader
- Automatically discovers and reads your vault's tag taxonomy document
- Parses hierarchies, auto-tagging rules, and common patterns
- Falls back to intelligent defaults if no taxonomy is found

### 2. Auto-Tagging
- Applies rules from your taxonomy document automatically
- Example: Notes containing "workshop" or "training" get tagged with #enablement
- Configurable via `tagIntelligence.autoTagging` setting

### 3. Hierarchy Enforcement
- Validates new tags against defined hierarchies
- Suggests proper hierarchy placement (e.g., #project-index → #type/project-index)
- Prevents creation of tags outside established patterns

### 4. Duplicate Prevention
- Detects similar tags using advanced similarity algorithms
- Prevents variations like #project vs #projects
- Configurable similarity threshold

### 5. Context-Aware Suggestions
- Suggests tags based on both content and taxonomy rules
- Learns from existing tag patterns in your vault
- Respects your vault's specific conventions

## Configuration

Add to your `config/config.json`:

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

### Configuration Options

- **taxonomyDocument**: Path to your tag taxonomy document (relative to vault root)
- **autoTagging**: Enable automatic tag application based on content patterns
- **enforceHierarchy**: Require tags to follow established hierarchies
- **preventDuplicates**: Prevent creation of similar/duplicate tags
- **suggestFromTaxonomy**: Base suggestions on taxonomy rules
- **thresholds.similarity**: How similar tags must be to be considered duplicates (0-1)
- **thresholds.suggestionRelevance**: Minimum relevance score for tag suggestions (0-1)

## Tag Taxonomy Document Format

The system understands various formats in your taxonomy document:

### Hierarchy Definitions
```markdown
## Tag Hierarchies

#type/* - Document types
- #type/note - Regular notes
- #type/moc - Maps of Content
- #type/index - Index pages

#status/* - Document status
- #status/draft - Work in progress
- #status/review - Needs review
- #status/complete - Finished
```

### Auto-Tagging Rules
```markdown
## Auto-Tagging Rules

- When "architecture" and "decision" → add #adr, #technical-standard
- When "workshop" or "training" → add #enablement, #training-material
- When "project" and "index" → add #type/project-index
```

### Common Patterns
```markdown
## Common Tag Combinations

- Decision Records: #adr, #decision, #technical-standard
- Project Documentation: #project/*, #status/*, #type/doc
- Meeting Notes: #type/meeting, #date/*, relevant project tags
```

## How It Works

1. **On Startup**: The system loads your tag taxonomy document
2. **When Writing Notes**: 
   - Validates proposed tags against the taxonomy
   - Applies auto-tagging rules based on content
   - Suggests corrections for similar tags
   - Adds tags to proper hierarchies
3. **Tag Suggestions**: Based on:
   - Taxonomy rules and patterns
   - Content analysis
   - Existing tag usage in your vault
   - Configured thresholds

## Benefits

1. **Consistency**: All notes follow the same tagging conventions
2. **Discoverability**: Proper hierarchies make finding related content easier
3. **Automation**: Less manual work deciding which tags to use
4. **Quality**: Prevents typos, duplicates, and inconsistent variations
5. **Learning**: The system adapts to your vault's specific patterns

## Example Usage

When you create a note about a new project index:

```markdown
---
title: AI Enablement Project Index
tags: [project-index]
---
```

The system will:
1. Detect "project-index" is not in the standard hierarchy
2. Suggest using #type/project-index instead
3. Auto-add relevant tags based on content
4. Validate against existing project tags
5. Ensure consistency with other project documentation

## Troubleshooting

If tags aren't being suggested or validated properly:

1. Check that your taxonomy document path is correct in config.json
2. Ensure your taxonomy document follows the expected format
3. Verify tag intelligence is enabled in your configuration
4. Check the MCP server logs for any parsing errors
5. Try lowering similarity thresholds if matches are too strict

## Best Practices

1. **Maintain Your Taxonomy**: Keep your tag taxonomy document updated
2. **Use Hierarchies**: Organize related tags under common parents
3. **Document Patterns**: Record common tag combinations
4. **Set Clear Rules**: Define when specific tags should be applied
5. **Review Suggestions**: The system learns from your choices