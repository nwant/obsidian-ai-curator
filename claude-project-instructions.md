# Claude Project Instructions - Obsidian AI Curator

## 🚨 CRITICAL: Tag Formatting Requirements

### The #1 Rule: NO Hashtags in Frontmatter Tags

**This will cause data loss:**
```yaml
---
tags:
  - #anything
---
```

**This is correct:**
```yaml
---
tags:
  - anything
---
```

## When Working with This Project

1. **Creating Notes via MCP**: 
   - Frontmatter tags: NO hashtags
   - Inline tags: YES hashtags

2. **Reading Existing Notes**:
   - If you see tags with hashtags in frontmatter, they need to be fixed
   - Report these as issues to be corrected

3. **Tag Suggestions**:
   - When suggesting tags for frontmatter, never include the # symbol
   - When suggesting inline tags, always include the # symbol

## Quick Examples

### ✅ Correct Note Format
```markdown
---
tags:
  - project/active
  - type/documentation  
  - priority/high
---

# Project Documentation

This relates to our #project/active work on #documentation.
```

### ❌ Incorrect Format (Will Break)
```markdown
---
tags:
  - #project/active      # <- This becomes null!
  - #type/documentation  # <- This becomes null!
---
```

## Why This Matters

- YAML treats `#` as a comment marker
- Unquoted `#tag` in YAML becomes `null`
- The MCP server expects tags without hashtags in frontmatter
- This is also Obsidian's native convention

## For Claude

When using the `mcp__obsidian-vault__write_note` tool:
- Strip any hashtags from tags before putting them in frontmatter
- Only use hashtags for tags in the note body
- If unsure, check the examples above

This ensures compatibility with both Obsidian and the MCP server.