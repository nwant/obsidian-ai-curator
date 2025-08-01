# Solution for Obsidian Tag Issue

## The Problem
- Tags with `#` in frontmatter become `null` when parsed by YAML
- Our cleaning works, but hashtags are being re-added by the tag processing system
- Even tags without hashtags get them added, then the original ones with hashtags become null

## The Root Cause
The MCP server's tag intelligence system is designed to work with hashtags throughout, and various parts of the system add them back even after we clean them.

## Recommended Solutions

### 1. Instruct the LLM (Immediate Fix)
Add to your Claude.md or system prompt:
```
When writing Obsidian notes, NEVER use hashtags in frontmatter tags.
Use hashtags only for inline tags in the note body.

Example:
---
tags:
  - project/active  
  - meeting-notes
---
This note is about #project/active work.
```

### 2. Disable Tag Processing for Frontmatter (Code Fix)
Modify the MCP server to skip tag validation/formatting for frontmatter tags, only process inline tags.

### 3. Use Quoted Tags (Alternative)
If you must use hashtags, quote them:
```yaml
tags:
  - "#project/active"
  - '#meeting-notes'
```

## Why This Happens
1. YAML treats `#` as a comment marker
2. The MCP server's tag system expects all tags to have hashtags
3. Multiple parts of the system add hashtags back after cleaning