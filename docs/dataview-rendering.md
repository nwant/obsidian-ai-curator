# Dataview Rendering for AI Research Partner

## Overview
The AI Research Partner can now render Dataview queries when reading notes, allowing it to see actual data instead of just query syntax.

## Token Efficiency Considerations

Rendering full Dataview tables can significantly increase token consumption:
- Original query: ~20-50 tokens
- Rendered table with 20 rows: ~500-1000 tokens
- MOC with 5 queries: Could add 2500-5000 tokens

To address this, we've implemented multiple rendering modes.

## Rendering Modes

### 1. **Smart Mode** (Default)
- Automatically chooses the best format based on result count
- ≤10 results: Full table
- >10 results: Summary format

### 2. **Summary Mode**
- Shows grouped counts by first column
- Displays top 5 items
- Token usage: ~50-200 per query

### 3. **Count Mode**
- Shows only totals and distribution
- Most token-efficient
- Token usage: ~20-50 per query

### 4. **Table Mode**
- Full table with all results
- Best for small result sets
- Token usage: Varies with row count

### 5. **Compact Mode**
- Limited to 10 rows
- Shows only first 2 columns
- Token usage: ~200-300 per query

## Usage Options

### Option 1: Render in read_notes
```json
{
  "tool": "read_notes",
  "arguments": {
    "paths": ["Projects/AI Research Partner System/AI Research Partner System.md"],
    "renderDataview": true,
    "dataviewMode": "summary"  // or "count", "table", "compact", "smart"
  }
}
```

### Option 2: Query Directly (Most Efficient)
```json
{
  "tool": "query_dataview",
  "arguments": {
    "query": "TABLE status, created FROM \"Records\" WHERE type = \"decision\"",
    "renderMode": "summary"
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

## Example Transformations

### Summary Mode (>10 results)
**Before:**
```dataview
TABLE description as "Decision", status
FROM "Records" 
WHERE type = "decision"
```

**After:**
```
📊 **Summary**: 15 total results

- active: 8
- completed: 5
- pending: 2

**Recent items:**
- MCP Enhancement Phase 1 - Completed caching
- Phase 2 Postponement - Wait for usage data
- Implement token-efficient rendering
- Add query_dataview tool
- Document rendering modes
*...and 10 more*

*Dataview summary (15 results)*
```

### Count Mode (Most Efficient)
```
**Total**: 15 items
- active: 8
- completed: 5
- pending: 2

*Dataview count*
```

### Full Table Mode (≤10 results)
```
| Decision | status |
| --- | --- |
| MCP Enhancement Phase 1 - Completed caching | completed |
| Phase 2 Postponement - Wait for usage data | active |

*Rendered from Dataview query*
```

## Best Practices

1. **For AI Research Partner MOCs**: Use `summary` or `count` mode by default
2. **For Specific Data Needs**: Use `query_dataview` tool directly
3. **For Full Context**: Only use `table` mode when necessary
4. **For Overview**: `smart` mode provides good balance

## Token Usage Examples

For a query returning 20 decision records:

- **Count Mode**: ~30 tokens
  ```
  Total: 20 items
  - Active: 12
  - Completed: 8
  ```

- **Summary Mode**: ~150 tokens
  ```
  Summary: 20 total results
  - Active: 12
  - Completed: 8
  
  Recent items:
  - Decision about API design
  - Infrastructure scaling approach
  ...and 15 more
  ```

- **Full Table**: ~800 tokens
  (Complete markdown table with all rows)

## Benefits
1. AI understands current project status
2. Token-efficient rendering options
3. Direct query capability for specific needs
4. No changes needed to existing notes
5. Maintains dual-purpose MOC design
6. Graceful fallback if rendering fails

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
5. Query result caching
6. Streaming large results