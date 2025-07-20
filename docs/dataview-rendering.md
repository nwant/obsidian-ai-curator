# Dataview Rendering for AI Research Partner

## Overview
The AI Research Partner can now render Dataview queries when reading notes, allowing it to see actual data instead of just query syntax.

## Usage
When calling `read_notes`, add the `renderDataview` parameter:

```json
{
  "tool": "read_notes",
  "arguments": {
    "paths": ["Projects/AI Research Partner System/AI Research Partner System.md"],
    "renderDataview": true
  }
}
```

## Supported Patterns

### TABLE Queries
```dataview
TABLE field1 as "Column 1", field2, field3
FROM "folder/path"
WHERE type = "value" AND contains(tags, "tag-name")
SORT date DESC
```

Supported features:
- Column selection with aliases
- FROM path filtering
- WHERE conditions: type, status, tags
- SORT by any field (ASC/DESC)

## Example Transformation

**Before (AI sees):**
```
```dataview
TABLE description as "Decision", status
FROM "Records" 
WHERE type = "decision"
```
```

**After (AI sees):**
```
| Decision | status |
| --- | --- |
| MCP Enhancement Phase 1 - Completed caching | completed |
| Phase 2 Postponement - Wait for usage data | active |

*Rendered from Dataview query*
```

## Benefits
1. AI understands current project status
2. No changes needed to existing notes
3. Maintains dual-purpose MOC design
4. Graceful fallback if rendering fails

## Limitations
- Basic TABLE query support only
- No inline queries
- No complex functions
- LIST and TASK queries not yet supported

## Future Enhancements
1. LIST query support for recent files
2. TASK query support for task tracking
3. More WHERE clause operators
4. Inline query rendering
5. Performance optimization with caching