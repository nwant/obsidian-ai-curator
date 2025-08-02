# MCP Tools Reference

Complete reference for all Model Context Protocol (MCP) tools available in Obsidian AI Curator.

## Table of Contents

- [Vault Operations](#vault-operations)
- [Search Tools](#search-tools)
- [Writing Tools](#writing-tools)
- [Tag Management](#tag-management)
- [File Operations](#file-operations)
- [Daily Notes](#daily-notes)
- [Git Integration](#git-integration)
- [Project Management](#project-management)
- [Context Tools](#context-tools)

## Vault Operations

### vault_scan
Scan vault for files with optional filtering and statistics.

```javascript
vault_scan({
  patterns: ["**/*.md"],          // Glob patterns (default: all markdown)
  includeStats: true,             // Include word count and size
  includePreview: true,           // Include content preview
  includeFrontmatter: true,       // Include frontmatter fields
  sortBy: "modified",             // Sort by: modified, path, size
  limit: 50,                      // Maximum results
  useCache: true                  // Use cached results
})
```

### read_notes
Read multiple notes with full content and metadata.

```javascript
read_notes({
  paths: ["Daily/2024-01-01.md", "Projects/AI.md"],
  renderDataview: true,           // Render Dataview queries
  dataviewMode: "smart"           // smart, summary, count, table, compact
})
```

## Search Tools

### search_content
Search for content across all notes.

```javascript
search_content({
  query: "machine learning",      // Search query
  contextLines: 2,                // Lines of context around match
  maxResults: 20                  // Maximum results
})
```

### find_by_metadata
Find notes by frontmatter with advanced queries.

```javascript
find_by_metadata({
  frontmatter: {
    status: "active",             // Exact match
    priority: { "$gte": 3 },      // Greater than or equal
    tags: { "$in": ["important"] }, // Array contains
    description: { "$exists": true }, // Field exists
    title: { "$regex": "^Project" }  // Regex match
  },
  minWords: 100,                  // Minimum word count
  modifiedAfter: "2024-01-01"     // Date filter
})
```

Query operators:
- `$exists`: Check field existence
- `$empty`: Check if empty
- `$regex`: Pattern matching
- `$not`: Negation
- `$gt`, `$gte`, `$lt`, `$lte`: Comparisons
- `$in`: Array inclusion

### query_dataview
Execute Dataview queries directly.

```javascript
query_dataview({
  query: "TABLE file.name, status FROM #project WHERE status = \"active\"",
  renderMode: "smart",            // smart, summary, count, table, compact
  contextPath: "Projects/"        // Context for relative queries
})
```

## Writing Tools

### write_note
Create or update a note with intelligent formatting.

```javascript
write_note({
  path: "Projects/New Project.md",
  content: "# New Project\n\nThis links to [[Existing Note]]"
})
```

Features:
- Automatic wikilink formatting
- Tag validation
- Frontmatter compatibility checking
- Date management

### update_frontmatter
Update frontmatter fields without touching content.

```javascript
update_frontmatter({
  path: "Notes/Project.md",
  updates: {
    status: "completed",
    modified: "2024-01-15"
  },
  merge: true                     // Merge with existing (default: true)
})
```

### append_to_daily_note
Add content to daily note sections.

```javascript
append_to_daily_note({
  content: "Met with team about project",
  date: "today",                  // today, yesterday, tomorrow, yyyy-MM-dd
  section: "Notes"                // Section to append to
})
```

## Tag Management

### get_tags
Get all tags or tags for a specific file.

```javascript
get_tags({
  path: "Notes/Project.md"        // Optional: specific file
})
```

### analyze_tags  
Comprehensive tag analysis with recommendations.

```javascript
analyze_tags()
// Returns frequency, hierarchy, similar tags, improvements
```

### suggest_tags
Get AI-powered tag suggestions based on content.

```javascript
suggest_tags({
  content: "This is about machine learning and Python",
  existingTags: ["programming"]   // Already assigned tags
})
```

### update_tags
Efficiently update tags without rewriting files.

```javascript
update_tags({
  path: "Notes/Meeting.md",
  add: ["status/active", "type/meeting"],
  remove: ["status/draft"],
  replace: ["project/ai"]         // Replace all tags
})
```

### rename_tag
Rename a tag globally across the vault.

```javascript
rename_tag({
  oldTag: "projecy",              // Typo tag
  newTag: "project",              // Correct tag
  preview: false,                 // Preview changes first
  includeInline: true,            // Rename in content
  includeFrontmatter: true        // Rename in frontmatter
})
```

## File Operations

### rename_file
Rename a file with automatic link updates.

```javascript
rename_file({
  oldPath: "Notes/Old Name.md",
  newPath: "Notes/Better Name.md"
})
```

### move_file  
Move a file with automatic link updates.

```javascript
move_file({
  sourcePath: "Inbox/New Idea.md",
  targetPath: "Projects/Active/New Idea.md"
})
```

### archive_notes
Move multiple notes to archive locations.

```javascript
archive_notes({
  moves: [
    { from: "Projects/Old.md", to: "Archive/2024/Old.md" },
    { from: "Notes/Done.md", to: "Archive/2024/Done.md" }
  ]
})
```

## Daily Notes

### get_daily_note
Get or create daily note for any date.

```javascript
get_daily_note({
  date: "today"                   // today, yesterday, tomorrow, yyyy-MM-dd
})
```

### add_daily_task
Add a task to daily note.

```javascript
add_daily_task({
  task: "Review pull requests",
  date: "today",
  completed: false,
  priority: "high"                // high, medium, low
})
```

## Git Integration

### git_checkpoint
Create a git commit checkpoint.

```javascript
git_checkpoint({
  message: "Before major refactoring"
})
```

### git_changes
Get changed files since a commit.

```javascript
git_changes({
  since: "HEAD"                   // Commit hash or HEAD
})
```

### git_rollback
Rollback to a previous commit.

```javascript
git_rollback({
  commit: "abc123"                // Commit hash
})
```

## Project Management

### init_project
Initialize a new project with templates.

```javascript
init_project({
  projectName: "AI Assistant",
  description: "Building an AI assistant",
  projectType: "software",        // general, software, research, etc.
  phase: "planning",              // planning, active, review, etc.
  stakeholders: ["Alice", "Bob"],
  targetDate: "2024-12-31",
  template: "default"             // default, minimal, structured
})
```

### list_project_templates
List available project templates.

```javascript
list_project_templates()
```

## Context Tools

### get_research_context
Load configured research context and guidelines.

```javascript
get_research_context()
```

### get_working_context
Load focused context for specific work.

```javascript
get_working_context({
  scope: "project",               // project, topic, recent, linked
  identifier: "AI Assistant",     // Project name or topic
  depth: "preview",               // preview, summary, full
  maxNotes: 10
})
```

## Performance Monitoring

### view_search_metrics
View search performance metrics.

```javascript
view_search_metrics({
  timeWindow: 24,                 // Hours
  exportReport: true              // Export to vault
})
```

### run_benchmark
Run performance benchmarks.

```javascript
run_benchmark({
  scenario: "all",                // all, list, or specific scenario
  compare: true                   // Compare with baseline
})
```

## Tips for Claude Usage

When using these tools in Claude, you can use natural language:

- "Search for notes about machine learning"
- "Find all active projects"
- "Create a new project called AI Assistant"
- "Rename the tag 'todo' to 'task' everywhere"
- "Show me today's daily note"

Claude will automatically translate your requests to the appropriate tool calls.