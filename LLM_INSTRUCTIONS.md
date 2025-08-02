# LLM Instructions for Obsidian AI Curator

## Critical: Date Formatting Rules

### Always Use Vault's Date Format
The vault is configured to use `yyyy-MM-dd` format for all date fields.

```yaml
---
created: 2025-08-01    # ✅ Correct format
modified: 2025-08-01   # ✅ Correct format
---
```

**NOT**:
```yaml
---
created: 08/01/2025    # ❌ Wrong - will be auto-corrected
modified: 8/1/2025     # ❌ Wrong - will be auto-corrected
---
```

The MCP server will automatically reformat dates, but using the correct format from the start ensures consistency.

## Critical: Tag Formatting Rules

### ❌ NEVER Do This (Causes Data Loss)
```yaml
---
tags:
  - #project/active
  - #meeting-notes
  - #important
---
```
**Why**: Unquoted hashtags in YAML are treated as comments and become `null` values

### ✅ ALWAYS Do This
```yaml
---
tags:
  - project/active
  - meeting-notes
  - important
---
```

### ✅ Alternative (If You Must Use Hashtags)
```yaml
---
tags:
  - "#project/active"
  - '#meeting-notes'
  - '#important'
---
```
**Note**: Quotes prevent YAML from treating # as a comment

## Complete Tag Usage Guide

### 1. Frontmatter Tags (Metadata Section)
- **Location**: Between `---` markers at the start of the file
- **Format**: NO hashtags (Obsidian convention)
- **Purpose**: For organization, filtering, and graph views

```yaml
---
tags:
  - type/meeting
  - project/obsidian-curator
  - status/active
  - priority/high
created: 2025-07-30
---
```

### 2. Inline Tags (Note Body)
- **Location**: Within the note content
- **Format**: WITH hashtags
- **Purpose**: For linking and contextual references

```markdown
# Meeting Notes

Discussed the #obsidian-curator project with the team.
Key decisions about #api-design and #performance.

Related: #type/meeting #status/active
```

## Common Patterns

### Hierarchical Tags
```yaml
---
tags:
  - area/development/frontend
  - type/documentation/api
  - project/obsidian/plugin
---
```

### Mixed Usage Example
```yaml
---
tags:
  - meeting/standup
  - project/alpha
  - team/engineering
---

# Daily Standup - July 30

## Yesterday
- Completed #feature/authentication
- Fixed #bug/memory-leak in the #api-module

## Today  
- Working on #project/alpha dashboard
- Review PR for #security/update
```

## Why This Matters

1. **Data Integrity**: Hashtags in frontmatter can become `null` and lose your tag data
2. **Obsidian Conventions**: Obsidian expects frontmatter tags without hashtags
3. **Search & Filter**: Properly formatted tags ensure reliable search and filtering
4. **Graph View**: Consistent formatting ensures tags appear correctly in graph view

## Quick Reference

| Location | Hashtag? | Example |
|----------|----------|---------|
| Frontmatter | NO | `tags: [project, meeting]` |
| Frontmatter | NO | `tags:`<br>`  - project`<br>`  - meeting` |
| Note Body | YES | `Related to #project and #meeting` |
| Wiki Links | NO | `[[Project Notes]]` |

## Special Cases

### Tag with Special Characters
```yaml
tags:
  - "c++"          # Plus signs
  - "v1.0.0"       # Dots
  - "q&a"          # Ampersands
  - "2025-goals"   # Numbers and dashes (no quotes needed)
```

### Empty or No Tags
```yaml
---
tags: []
---
# OR simply omit the tags field
```

## Validation Checklist

Before saving a note through the MCP server:
- [ ] Frontmatter tags have NO hashtags
- [ ] Inline tags in content HAVE hashtags  
- [ ] Special characters in tags are quoted if needed
- [ ] No duplicate tags in frontmatter
- [ ] Tag hierarchy uses forward slashes (`/`)

## Examples of Complete Notes

### Research Note
```yaml
---
tags:
  - research/ai/llm
  - status/in-progress
  - priority/medium
created: 2025-07-30
---

# LLM Context Window Research

Investigating context window limitations in #ai/llm systems.

## Key Findings
- Modern #llm models like #gpt-4 support larger contexts
- Trade-offs between context size and #performance

#research #technical-debt #optimization
```

### Project Index
```yaml
---
tags:
  - index
  - project/obsidian-curator
  - type/overview
aliases:
  - Obsidian Curator
  - AI Curator Project
---

# Obsidian AI Curator Project

Central index for the #obsidian-curator project.

## Related Notes
- [[Architecture Overview]] #architecture
- [[API Documentation]] #api #documentation  
- [[Development Setup]] #setup #development
```

## Error Prevention

### Common Mistakes to Avoid

1. **Mixed Formats**
   ```yaml
   # WRONG - Inconsistent
   tags:
     - #project/active
     - meeting-notes
   ```

2. **Quotes Around Non-Special Tags**
   ```yaml
   # UNNECESSARY (but not harmful)
   tags:
     - "simple-tag"
     - "another-tag"
   ```

3. **Spaces in Tags**
   ```yaml
   # WRONG
   tags:
     - my tag      # Spaces not allowed
   
   # CORRECT
   tags:
     - my-tag      # Use dashes
     - my_tag      # Or underscores
   ```

## Remember

**When in doubt, omit hashtags from frontmatter tags!**

The MCP server and Obsidian will handle them correctly, and your data will be preserved.