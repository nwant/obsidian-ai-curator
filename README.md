# Obsidian AI Curator

An AI-powered knowledge management system for Obsidian that enables Claude Desktop and Claude Code to intelligently interact with your vault. This project includes both an MCP server for vault operations and an Obsidian plugin that provides optimized API access and consolidation features.

## Features

### Core Capabilities
- **Vault Operations**: Scan, read, write, and archive notes with validation
- **File Operations**: Rename and move files with automatic link updates
- **Project Management**: Initialize projects with customizable templates and structure
- **Intelligent Search**: Content search with Obsidian API optimization
- **Tag Intelligence**: Smart tag management with similarity detection and suggestions
- **Tag Renaming**: Global tag rename across entire vault with preview mode
- **Date Management**: Automatic timestamp handling and daily note operations
- **Link Formatting**: Automatically converts links to Obsidian wikilink format with API-powered resolution
- **Git Integration**: Version control with checkpoint/rollback capabilities
- **Metadata Support**: Advanced frontmatter queries with operators
- **Dataview Rendering**: Execute Dataview queries and see results
- **Context Management**: Load focused context for specific work sessions
- **Performance**: Sub-50ms operations with intelligent caching

### Tag Intelligence System (ENHANCED)
- **Taxonomy-Aware**: Reads your vault's tag taxonomy document to understand your system
- **Auto-Tagging**: Applies rules from your taxonomy automatically
- **Hierarchy Enforcement**: Ensures tags follow established patterns
- **Duplicate Prevention**: Detects and prevents similar tag variations
- **Context-Aware Suggestions**: Based on both content and your vault's conventions
- **Fully Configurable**: Control every aspect of tag behavior

### Link Intelligence
- **Automatic Wikilink Conversion**: Converts markdown links and paths to `[[Note Name]]` format
- **Obsidian API Resolution**: Uses native link resolution when plugin is running
- **Alias Support**: Properly formats `[[Note|Display Text]]` syntax
- **Link Validation**: Checks if linked files exist and suggests alternatives

### Obsidian Plugin
- **API Server**: Exposes Obsidian's native APIs on port 3001
- **Link Resolution**: Provides proper link formatting and resolution endpoints
- **Metadata Cache**: Fast access to frontmatter and tags via Obsidian's cache
- **Consolidation UI**: Find and merge related notes
- **Automatic Optimization**: MCP server uses Obsidian APIs when available

## Installation

1. Clone this repository:
```bash
git clone https://github.com/yourusername/obsidian-mcp-server.git
cd obsidian-mcp-server
```

2. Install dependencies:
```bash
npm install
```

3. Configure your vault:
```bash
cp config/config.example.json config/config.json
# Edit config/config.json to customize:
# - Vault path
# - Daily notes location and format
# - Date formats
# - Templates
```

See [Configuration Guide](docs/configuration-guide.md) for all options.

## Project Templates

The `init_project` tool uses customizable templates to create standardized project structures. 

### Built-in Templates
- **default**: Full project structure with CLAUDE.md, instructions, and implementation tracking
- **minimal**: Lightweight structure for quick projects
- **research**: Academic research project with literature and data organization

### Customizing Templates

You have two options for customizing templates:

1. **Personal Templates** (Recommended): Create `config/project-templates.json` for your custom templates. This file is gitignored and won't affect the repository.
   ```bash
   cp config/project-templates.example.json config/project-templates.json
   # Edit config/project-templates.json with your templates
   ```

2. **Default Templates**: Modify `config/project-templates.default.json` (tracked in git, affects all users).

Templates support:
- Custom directory structures
- File templates with variables
- Project types specific to your workflow
- Validation rules for project names and dates

See documentation:
- [Custom Project Templates](docs/CUSTOM_PROJECT_TEMPLATES.md) - Create your own templates
- [Project Templates Guide](docs/PROJECT_TEMPLATES.md) - Modify default templates

### Example Usage
```javascript
// Initialize with default template
init_project({
  projectName: "My New Project",
  description: "Project description",
  stakeholders: ["Alice (PM)", "Bob (Dev)"],
  targetDate: "2025-12-31"
})

// Use a different template
init_project({
  projectName: "Quick Research",
  description: "Research into AI patterns",
  template: "research"
})
```

### Evergreen Claude Desktop Instructions
The `init_project` tool generates evergreen instructions that never need updating:

- **CLAUDE.md**: Contains ALL dynamic content (dates, stakeholders, status)
- **PROJECT_INSTRUCTIONS.md**: Contains ONLY static workflows
- **Claude Desktop Instructions**: Simple pointer to current state

Example generated instructions:
```
# My New Project

Building an AI assistant for customer support

Current state: Projects/My New Project/CLAUDE.md

Rule: MCP tools only.
```

## Configuration

### Claude Desktop Setup

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "obsidian-vault": {
      "command": "node",
      "args": ["/path/to/obsidian-mcp-server/src/mcp-server.js"]
    }
  }
}
```

### Claude Code Setup

For Claude Code, create a `.mcp.json` file in your project root:

```json
{
  "mcpServers": {
    "obsidian-vault": {
      "command": "node",
      "args": ["/path/to/obsidian-ai-curator/src/mcp-server.js"],
      "env": {
        "OBSIDIAN_VAULT_PATH": "/path/to/your/vault"
      }
    }
  }
}
```

### Config File

Edit `config/config.json`:

```json
{
  "vaultPath": "/path/to/your/obsidian/vault",
  "ignorePatterns": [".obsidian", ".git", ".trash"],
  "dateFormat": "yyyy-MM-dd",
  "dailyNotesPath": "Daily",
  "dailyNoteDateFormat": "yyyy-MM-dd",
  "researchContext": {
    "description": "Your custom AI research partner context",
    "contextDocuments": {
      "workflow": "Meta/workflow.md",
      "guidelines": "Meta/guidelines.md",
      "activeProjects": "Projects/active.md"
    },
    "systemCapabilities": {
      "atomicRecords": true,
      "autonomousOperation": false
    },
    "customInstructions": "Additional instructions for your AI partner"
  }
}
```

See the [Configuration Guide](docs/configuration-guide.md) for all available options including daily note templates.

#### Research Context Configuration

The `researchContext` field allows you to customize how Claude interacts with your vault:

- **contextDocuments**: Reference markdown files in your vault that define workflows, guidelines, or project context. Paths can be:
  - Relative to your vault root (e.g., `"Meta/workflow.md"`)
  - Absolute paths (e.g., `"/Users/you/documents/guidelines.md"`)
  
- **systemCapabilities**: Toggle features like atomic records or autonomous operation

- **customInstructions**: Add any specific instructions for how Claude should work with your vault

When you use the `get_research_context` tool, it will read these documents and provide them to Claude for context.

## Available Tools

### `vault_scan`
Scan vault for files with statistics
- Parameters: `patterns`, `includeStats`

### `read_notes`
Read multiple notes with content and metadata
- Parameters: `paths` (array of note paths)

### `write_note`
Write or update a note
- Parameters: `path`, `content`

### `archive_notes`
Move notes to archive locations
- Parameters: `moves` (array of from/to paths)

### `search_content`
Search for content across all notes
- Parameters: `query`, `maxResults`, `contextLines`

### `find_by_metadata`
Find notes by frontmatter or file properties with advanced query support
- Parameters: `frontmatter`, `minWords`, `maxWords`, `modifiedAfter`, `modifiedBefore`

#### Advanced Query Operators:

**Basic Queries:**
```json
{ "frontmatter": { "status": "active" } }  // Find notes with status: active
{ "frontmatter": { "tags": "research" } }  // Find notes where tags includes "research"
```

**Existence Queries:**
```json
{ "frontmatter": { "description": { "$exists": false } } }  // Find notes missing description
{ "frontmatter": { "author": { "$exists": true } } }       // Find notes with author field
```

**Empty Value Queries:**
```json
{ "frontmatter": { "summary": { "$empty": true } } }   // Find notes with empty summary
{ "frontmatter": { "tags": { "$empty": false } } }     // Find notes with non-empty tags
```

**Pattern Matching:**
```json
{ "frontmatter": { "title": { "$regex": "^Project.*2025$" } } }  // Regex match
{ "frontmatter": { "content": { "$regex": "TODO", "$flags": "i" } } }  // Case-insensitive
```

**Negation:**
```json
{ "frontmatter": { "status": { "$not": "archived" } } }  // Find notes NOT archived
{ "frontmatter": { "priority": { "$not": 5 } } }         // Find notes with priority != 5
```

**Range Queries (numbers/dates):**
```json
{ "frontmatter": { "priority": { "$gt": 3 } } }          // Priority > 3
{ "frontmatter": { "created": { "$gte": "2025-01-01" } } }  // Created after Jan 1
{ "frontmatter": { "score": { "$lt": 100, "$gte": 50 } } }  // Score between 50-99
```

**Array Inclusion:**
```json
{ "frontmatter": { "status": { "$in": ["active", "pending"] } } }  // Status is one of these
```

**Combined Queries:**
```json
{
  "frontmatter": {
    "status": "active",
    "description": { "$exists": true },
    "priority": { "$gte": 3 },
    "tags": { "$empty": false }
  },
  "minWords": 100,
  "modifiedAfter": "2025-01-01"
}
```

### `git_checkpoint`
Create a git commit checkpoint
- Parameters: `message`

### `git_changes`
Get changed files since a commit
- Parameters: `since`

### `git_rollback`
Rollback to a previous commit
- Parameters: `commit`

### `get_research_context`
Get configured research context and guidelines from your config.json. Reads and returns the content of any configured context documents.

### `get_tags`
Get all tags in the vault or tags for a specific file
- Parameters: `path` (optional - file path for specific file's tags)

### `get_links`
Get outgoing links from a specific file
- Parameters: `path` (file path)

### `get_backlinks`
Get files that link to a specific file
- Parameters: `path` (file path)

### `analyze_tags`
Comprehensive tag analysis with statistics and recommendations
- Returns: tag frequency, hierarchy, similar tags, and improvement suggestions

### `suggest_tags`
Get AI-powered tag suggestions based on content
- Parameters: `content` (text to analyze), `existingTags` (already assigned tags)
- Returns: ranked suggestions with relevance scores

### `query_dataview`
Execute Dataview queries directly without reading entire notes
- Parameters: `query` (Dataview query string), `renderMode` (output format), `contextPath` (for relative queries)
- Example: `TABLE status, created FROM "Records" WHERE type = "decision"`

### `get_working_context`
Load focused context for specific work sessions
- Parameters: `scope` (project/topic/recent/linked), `identifier`, `maxNotes`, `depth`
- Useful for loading project-specific or topic-focused information

### `view_search_metrics`
View performance metrics for search operations
- Parameters: `timeWindow` (hours), `exportReport` (boolean)
- Returns: aggregated metrics, performance trends, and usage patterns

### `run_benchmark`
Execute search benchmark scenarios and track performance metrics
- Parameters: `scenario` (scenario name or 'all' or 'list'), `compare` (boolean to compare with baseline)

### `get_daily_note`
Get or create daily note for a specific date
- Parameters: `date` (optional - 'today', 'yesterday', 'tomorrow', or yyyy-MM-dd format)
- Returns: daily note content, path, and metadata
- Automatically creates from template if missing

### `append_to_daily_note`
Append content to a specific section of daily note
- Parameters: `content` (required), `date` (optional), `section` (optional - default: 'Notes')
- Adds timestamped entries to the specified section
- Creates section if it doesn't exist

### `add_daily_task`
Add a task to the daily note's task section
- Parameters: `task` (required), `date` (optional), `completed` (boolean), `priority` (high/medium/low)
- Formats as proper checkbox task
- Includes priority markers if specified

### `get_frontmatter`
Get frontmatter metadata for a note
- Parameters: `path` (required - note path)
- Returns: frontmatter fields, tags, and source (obsidian-api or file-system)
- Uses Obsidian's cached metadata when available

### `update_frontmatter`
Update frontmatter fields for a note
- Parameters: `path` (required), `updates` (object), `merge` (boolean - default: true)
- Merges with existing frontmatter by default
- Set `merge: false` to replace entirely
- Preserves note body content

### `update_tags`
Efficiently update tags for a note
- Parameters: `path` (required), `add` (array), `remove` (array), `replace` (array)
- Use `add` to append new tags
- Use `remove` to delete specific tags
- Use `replace` to set all tags at once
- Automatically adds # prefix to tags

### `rename_file`
Rename a file and automatically update all links throughout the vault
- Parameters: `oldPath` (required), `newPath` (required)
- Uses Obsidian API when available for guaranteed link preservation
- Falls back to manual link updates if API unavailable
- Prevents overwriting existing files
- Returns: success status, paths, link update info

### `move_file`
Move a file to a new location and automatically update all links
- Parameters: `sourcePath` (required), `targetPath` (required)
- Uses Obsidian API when available for guaranteed link preservation
- Creates target directories automatically
- Updates all wikilinks and markdown links
- Returns: success status, paths, link update info

### `rename_tag`
Rename a tag globally across the entire vault
- Parameters: `oldTag` (required), `newTag` (required), `preview` (optional), `includeInline` (optional), `includeFrontmatter` (optional)
- Renames tags in both frontmatter and inline content
- Preview mode shows what would change without applying
- Uses Obsidian API when available for better performance
- Handles hierarchical tags (e.g., `project/old` → `project/new`)
- Returns: files modified, changes per file, method used

## Automatic Metrics Collection

The MCP server now automatically collects performance metrics for all search operations. This feature runs in the background without affecting normal operations.

### What's Collected
- **Operation timing**: Duration of each search operation
- **Result counts**: Number of results returned by each search
- **Success rates**: Tracking of successful vs failed operations
- **Tool usage patterns**: Which tools are used most frequently

### Storage
- Metrics are stored in `data/search-metrics.json`
- Only the last 1000 operations are kept to prevent unbounded growth
- Data is saved asynchronously to avoid performance impact

### Daily Reports
The system can generate daily performance reports that are automatically saved to your vault:
- Location: `{vault}/Benchmarks/Daily-Reports/search-metrics-YYYY-MM-DD.md`
- Includes performance summaries, trends, and raw metrics
- Reports can be generated programmatically via the metrics collector

### Privacy & Security
- Sensitive content is sanitized before storage
- Search queries are truncated to 50 characters
- File contents are replaced with placeholder text
- No personal information is included in metrics

### Benefits
- **Performance monitoring**: Track search performance over time
- **Optimization insights**: Identify slow operations or patterns
- **Quality assurance**: Monitor success rates and result quality
- **Usage analytics**: Understand how different search tools are being used

## Usage Examples

Once configured in Claude Desktop or Claude Code, you can use natural language to interact with your vault:

**Basic Operations:**
- "Scan my vault and show me notes modified in the last week"
- "Find all notes with status 'active' in frontmatter"
- "Search for notes mentioning 'project planning'"
- "Create a git checkpoint before making changes"

**Project Management:**
- "Initialize a new project called 'Email Automation' using the default template"
- "List available project templates"
- "Create a research project with minimal structure"
- "Set up a new AI agent project with stakeholders John and Jane"

**Advanced Metadata Queries:**
- "Find all notes missing a description field"
- "Show me notes with empty tags"
- "Find notes with priority greater than 3"
- "Find all notes NOT marked as archived"
- "Show me notes created in 2025 with more than 500 words"
- "Find notes where the title matches 'Project.*2025' regex"

**Tag Intelligence:**
- "Analyze all tags in my vault"
- "Find similar or duplicate tags"
- "Suggest tags for this content: [content]"
- "Show me tags that are rarely used"
- "Rename tag 'old-project' to 'new-project' globally"
- "Preview what would change if I rename tag 'typo' to 'correct'"

**Dataview Queries:**
- "Run this Dataview query: TABLE file.name, status FROM #project WHERE status = 'active'"
- "Show all tasks from my daily notes: TASK FROM 'Daily'"
- "List all notes with incomplete todos"

**Context Loading:**
- "Load context for my current project"
- "Get recent files I've been working on"
- "Show me notes linked to this topic"

**Daily Notes:**
- "Get today's daily note"
- "Add to daily note: Had productive meeting with AI team"
- "Add task: Review and merge pull requests"
- "Show me yesterday's daily note"
- "Add high priority task: Prepare presentation for tomorrow"

**Performance Monitoring:**
- "Show search performance metrics for the last 24 hours"
- "Export a performance report to my vault"
- "View usage patterns for MCP tools"

**Benchmark & Performance:**
- "Run all benchmarks to test search performance"
- "List available benchmark scenarios"
- "Run the find_recent_files benchmark and compare with baseline"
- "Show me the vault_scan_performance benchmark results"

**File Operations:**
- "Rename 'Notes/Old Project.md' to 'Notes/Current Project.md'"
- "Move 'Ideas/Random Thought.md' to 'Archive/2024/Random Thought.md'"
- "Rename the daily note from yesterday to include 'Important'"
- "Move all completed project notes to the archive folder"

## Obsidian Plugin Installation

1. Build the plugin:
```bash
cd obsidian-ai-curator-plugin
npm install
npm run build
```

2. Copy to your vault:
```bash
# Create plugin directory
mkdir -p /path/to/vault/.obsidian/plugins/obsidian-ai-curator

# Copy built files
cp main.js manifest.json main.css /path/to/vault/.obsidian/plugins/obsidian-ai-curator/
```

3. Enable the plugin in Obsidian settings

## Development

Run the MCP server:
```bash
npm start
```

Develop the plugin with hot reload:
```bash
./start-dev.sh
```

## Architecture

```
Claude Desktop/Code → MCP Server → Obsidian API Server (port 3001)
                                ↗
                    Direct file system (fallback)
```

The MCP server automatically detects and uses the Obsidian API server when available, providing optimized access to Obsidian's cached metadata, search index, and link resolution.

## Important Notes

- **Claude Desktop/Code Restart**: After installing or updating, completely quit and restart Claude Desktop/Code to load new tools
- **Plugin Rebuild**: Run `npm run build` in the plugin directory after making TypeScript changes
- **Tag Intelligence**: Requires a tag taxonomy document in your vault for full functionality
- **Link Formatting**: Automatically converts all internal links to Obsidian's `[[wikilink]]` format

### ⚠️ Critical: Tag Formatting Convention

**NEVER use hashtags (#) in frontmatter tags!** This is an Obsidian convention and YAML limitation.

```yaml
# ❌ WRONG - These become null!
---
tags:
  - #project/active
  - #important
---

# ✅ CORRECT - Obsidian convention
---
tags:
  - project/active
  - important
---
```

**Why this matters:**
- YAML treats `#` as a comment marker
- Unquoted `#tag` in frontmatter becomes `null` 
- Obsidian expects frontmatter tags without hashtags
- Only use `#` for inline tags in the note body

See [LLM_INSTRUCTIONS.md](LLM_INSTRUCTIONS.md) for complete tag usage guidelines.

## License

MIT