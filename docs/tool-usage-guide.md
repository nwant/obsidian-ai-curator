# Tool Usage Guide for Claude Desktop

## When to Use Each Tool

### Tag Management
**Use `update_tags`** for:
- Retagging documents
- Adding new tags to existing notes
- Removing outdated tags
- Replacing all tags with a new set
- Any tag-only modifications

**Use `update_frontmatter`** for:
- Updating multiple frontmatter fields at once
- Adding/modifying metadata beyond just tags
- Changing dates, titles, or custom fields

**Use `write_note`** for:
- Creating new notes
- Modifying note content (body text)
- Complete note rewrites
- When you need to change both content and metadata

### Examples

#### Retagging a note (CORRECT):
```
update_tags(
  path="AI Project Index.md",
  replace=["#type/project-index", "#domain/ai-coe", "#enablement"]
)
```

#### Retagging a note (INEFFICIENT):
```
// Don't use write_note for tag-only changes!
write_note(
  path="AI Project Index.md",
  content="[entire file content with new tags]"
)
```

#### Adding tags to a note:
```
update_tags(
  path="Meeting Notes.md",
  add=["#meeting/2024-01", "#project/ai-agents"]
)
```

#### Removing specific tags:
```
update_tags(
  path="Old Document.md",
  remove=["#status/draft", "#outdated"]
)
```

## Performance Benefits

- `update_tags`: ~10ms (only modifies frontmatter)
- `update_frontmatter`: ~15ms (only modifies frontmatter)
- `write_note`: ~100ms+ (rewrites entire file)

## Best Practices

1. **Always use the most specific tool** for the task
2. **Prefer metadata-only tools** when not changing content
3. **Batch operations** when updating multiple fields
4. **Use Obsidian API** integration for better performance