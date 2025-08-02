# Obsidian AI Curator Project Instructions

You are working on the Obsidian AI Curator project, an AI-powered system that actively manages and consolidates notes in an Obsidian vault.

## Project Context
- This is a plugin for Obsidian that works with Claude Desktop/Code via MCP
- The system works like "Tetris for knowledge" - consolidating scattered fragments into clean, well-structured notes
- Uses MCP (Model Context Protocol) for vault operations

## Key Components
1. **Obsidian Plugin**: Provides API server (port 3001) and consolidation UI
2. **MCP Server**: Provides tools for vault operations
3. **Obsidian API Client**: Automatically uses Obsidian APIs when available
4. **Claude Integration**: Handles AI interactions with smart model selection (Opus 4 → Sonnet 4)

## Development Guidelines
- Prefer TypeScript for plugin code
- Use ES modules for server-side code
- Always handle errors gracefully
- Maintain clean separation between Obsidian plugin and server components
- Ensure console output goes to stderr for MCP compatibility

## Current Focus Areas
- CLAUDE.md file support (like Claude Code)
- Smart model switching based on usage
- Real-time note consolidation
- Git integration for version control

## Important Notes
- The vault path is configured in `config/config.json`
- Obsidian API server runs on port 3001 by default
- Claude CLI must be installed and accessible in PATH for consolidation features
- **Date Format**: Always use `yyyy-MM-dd` format for date fields (e.g., `2025-08-01`)

## CRITICAL VAULT WRITE RULES
- **NEVER write files directly to the vault path** (e.g., using Write tool on /Users/*/obsidian/*)
- **ALWAYS use MCP server tools** for ALL vault operations:
  - Use `write_note` for creating/updating notes
  - Use `update_tags` or `update_frontmatter` for metadata changes
  - Use `append_to_daily_note` for daily notes
- **The MCP tools ensure**:
  - Proper tag validation and intelligence
  - Automatic date/timestamp management
  - Link formatting to wikilinks
  - Vault conventions are followed
- **Direct writes bypass ALL safeguards** and violate the project's core purpose

## Obsidian Conventions

### Internal Links
- **ALWAYS use wikilink format**: `[[Note Name]]` for internal links
- **DO NOT use markdown links with paths**: `[text](path/to/note.md)`
- **For aliases**: Use `[[Note Name|Display Text]]`
- **Examples**:
  - ✅ Correct: `[[AI Project Index]]`
  - ✅ Correct: `[[Meeting Notes 2024-01-15|Yesterday's Meeting]]`
  - ❌ Wrong: `[AI Project Index](Projects/AI Project Index.md)`
  - ❌ Wrong: `/Projects/AI Project Index.md`

### Tags
- **NEVER include `#` prefix in frontmatter tags** (Obsidian convention)
- **ONLY use `#` for inline tags** in the note body
- Use hierarchical tags when appropriate: `type/project-index` (in frontmatter)
- Follow vault's tag taxonomy
- **Critical**: Hashtags in frontmatter YAML are treated as comments and become `null`

#### ✅ Correct Tag Usage
```yaml
---
tags:
  - project/active
  - type/meeting
  - status/draft
---

# Meeting Notes

This is about the #project/active work.
Related tags: #type/meeting #important
```

#### ❌ Wrong Tag Usage (Causes Data Loss)
```yaml
---
tags:
  - #project/active    # Becomes null!
  - #type/meeting      # Becomes null!
---
```

## Critical Instructions Import
**IMPORTANT**: Always follow the formatting rules in `/Users/nathan/projects/obsidian-ai-curator/LLM_INSTRUCTIONS.md` when working with this vault. Key rules:

1. **Dates**: Always use `yyyy-MM-dd` format
2. **Tags**: Never use `#` in frontmatter
3. **Frontmatter**: Only simple structures (no arrays of objects)
4. **Links**: Always use `[[wikilinks]]` format
5. **Writes**: Always use MCP tools, never direct file writes

For complete instructions, always reference: `LLM_INSTRUCTIONS.md`