# LLM Tag Guidelines for Obsidian

When writing Obsidian notes through the MCP server, follow these tag conventions:

## Frontmatter Tags (YAML)
**NEVER use hashtags in frontmatter tags**

✅ CORRECT:
```yaml
---
tags:
  - project/active
  - meeting-notes
  - important
---
```

❌ INCORRECT:
```yaml
---
tags:
  - #project/active
  - #meeting-notes
  - #important
---
```

## Inline Tags (Body)
**ALWAYS use hashtags for inline tags**

✅ CORRECT:
```markdown
This is a note about #project/active work.
Related: #meeting-notes #important
```

## Why This Matters
- Unquoted hashtags in YAML are treated as comments and become `null`
- Obsidian's native convention is no hashtags in frontmatter
- The MCP server expects tags without hashtags in frontmatter