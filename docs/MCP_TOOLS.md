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

**Examples:**
- "Scan my vault for the 10 most recent notes"
- "Show me all markdown files in the Projects folder with word counts"
- "Find all notes modified this week with previews"

**Options:**
- Patterns: Glob patterns (default: all markdown files)
- Stats: Include word count and file size
- Preview: Show first 200 characters of content
- Frontmatter: Include metadata fields
- Sort: By modified date, path, or size
- Limit: Maximum number of results

### read_notes
Read multiple notes with full content and metadata.

**Examples:**
- "Read my daily note from January 1st and my AI project note"
- "Show me the content of all my active project notes"
- "Read these notes and render any Dataview queries in them"

**Options:**
- Render Dataview queries to show actual data
- Display modes: smart (auto-decide), summary, table, or compact

## Search Tools

### search_content
Search for content across all notes.

**Examples:**
- "Search for 'machine learning' in my vault"
- "Find all mentions of 'project deadline' with 3 lines of context"
- "Search for 'TODO' and show me the first 50 results"

**Options:**
- Context lines: How many lines to show around each match
- Max results: Limit the number of results returned

### find_by_metadata
Find notes by frontmatter with advanced queries.

**Examples:**
- "Find all notes with status 'active' and priority 3 or higher"
- "Show me notes tagged 'important' that have a description field"
- "Find all project notes (title starts with 'Project') modified after January 1st"
- "Find notes without a 'reviewed' field that are over 100 words"

**Advanced query capabilities:**
- Exact matches: "status is 'active'"
- Comparisons: "priority greater than 3", "created before 2024-01-01"
- Field existence: "has a description field", "missing reviewed field"
- Pattern matching: "title starts with 'Project'", "content matches regex"
- Array operations: "tags include 'important'"
- Word count filters: "at least 100 words", "between 50 and 200 words"

### query_dataview
Execute Dataview queries directly.

**Examples:**
- "Run a Dataview query to show all active projects as a table"
- "Query for all tasks due this week grouped by project"
- "Show me a Dataview list of notes created in the last 7 days"

**Note:** You can describe what you want to see, and Claude will create the appropriate Dataview query.

**Options:**
- Display mode: Let Claude decide (smart), or specify table/list/summary
- Context path: For queries relative to a specific folder

## Writing Tools

### write_note
Create or update a note with intelligent formatting.

**Examples:**
- "Create a new project note called 'Mobile App Redesign' in the Projects folder"
- "Write a note about today's meeting with proper formatting and tags"
- "Update my 'Ideas' note with a new section about automation"

**Automatic features:**
- Converts markdown links to [[wikilinks]]
- Validates and formats tags properly
- Ensures frontmatter compatibility
- Manages dates in correct format (yyyy-MM-dd)

### update_frontmatter
Update frontmatter fields without touching content.

**Examples:**
- "Update the status of my Project.md note to 'completed'"
- "Add a 'reviewed' field with today's date to all my active notes"
- "Change the priority from 'low' to 'high' in my task note"

**Options:**
- Merge: Updates existing fields while preserving others (default)
- Replace: Completely replaces all frontmatter

### append_to_daily_note
Add content to daily note sections.

**Examples:**
- "Add 'Met with team about project timeline' to today's daily note"
- "Append a task about reviewing PRs to tomorrow's daily note"
- "Add meeting notes to yesterday's daily note under the Meetings section"

**Options:**
- Date: today, yesterday, tomorrow, or specific date (yyyy-MM-dd)
- Section: Which section to append to (default: Notes)

## Tag Management

### get_tags
Get all tags or tags for a specific file.

**Examples:**
- "Show me all tags used in my vault"
- "What tags are on my Project.md note?"
- "List all tags with their usage counts"

### analyze_tags  
Comprehensive tag analysis with recommendations.

**Examples:**
- "Analyze my tag usage and suggest improvements"
- "Show me tag statistics and find similar or duplicate tags"
- "Review my tag hierarchy and recommend consolidations"

**Returns:**
- Usage frequency for each tag
- Tag hierarchy visualization
- Similar tags that might be consolidated
- Improvement recommendations

### suggest_tags
Get AI-powered tag suggestions based on content.

**Examples:**
- "Suggest tags for this note about machine learning and Python"
- "What tags should I add to my meeting notes from today?"
- "Analyze this content and recommend appropriate tags"

**Note:** Claude will analyze the content and suggest relevant tags based on your vault's existing tag taxonomy.

### update_tags
Efficiently update tags without rewriting files.

**Examples:**
- "Add tags 'active' and 'important' to my Meeting.md note"
- "Remove the 'draft' tag from all completed projects"
- "Replace all tags on this note with just 'archive' and 'reference'"

**Options:**
- Add: Tags to add to existing ones
- Remove: Tags to remove
- Replace: Completely replace all tags

### rename_tag
Rename a tag globally across the vault.

**Examples:**
- "Rename the tag 'projecy' to 'project' everywhere in my vault"
- "Change all 'todo' tags to 'task'"
- "Preview what would change if I renamed 'ml' to 'machine-learning'"

**Options:**
- Preview mode: See what would change without applying
- Scope: Rename in frontmatter, inline tags, or both

## File Operations

### rename_file
Rename a file with automatic link updates.

**Examples:**
- "Rename 'Old Name.md' to 'Better Name.md' in the Notes folder"
- "Change 'Untitled.md' to 'Project Planning.md'"
- "Rename my daily note to include a descriptive title"

**Note:** All links to this file throughout your vault will be automatically updated.

### move_file  
Move a file with automatic link updates.

**Examples:**
- "Move 'New Idea.md' from Inbox to Projects/Active"
- "File this note under Archive/2024"
- "Move all completed project notes to the Archive folder"

**Note:** All links to this file throughout your vault will be automatically updated.

### archive_notes
Move multiple notes to archive locations.

**Examples:**
- "Archive my completed project notes to Archive/2024"
- "Move all notes tagged 'obsolete' to the Archive folder"
- "Archive these 5 old meeting notes to their respective year folders"

**Note:** Links are preserved and updated automatically for all moved files.

## Daily Notes

### get_daily_note
Get or create daily note for any date.

**Examples:**
- "Show me today's daily note"
- "Open yesterday's daily note"
- "Create a daily note for January 15, 2024"

**Options:**
- Date: today, yesterday, tomorrow, or specific date (yyyy-MM-dd)

### add_daily_task
Add a task to daily note.

**Examples:**
- "Add a high-priority task to review pull requests to today's note"
- "Create a task for tomorrow to prepare meeting agenda"
- "Add a completed task about finishing the report to yesterday's note"

**Options:**
- Priority: high, medium, or low
- Status: completed or not
- Date: today, yesterday, tomorrow, or specific date

## Git Integration

### git_checkpoint
Create a git commit checkpoint.

**Examples:**
- "Create a git checkpoint before I reorganize my notes"
- "Commit current changes with message 'Before adding new project structure'"
- "Save a checkpoint of my vault's current state"

### git_changes
Get changed files since a commit.

**Examples:**
- "Show me what files have changed since the last commit"
- "What notes have I modified in the last 5 commits?"
- "List all changes since yesterday's checkpoint"

### git_rollback
Rollback to a previous commit.

**Examples:**
- "Rollback to the checkpoint from this morning"
- "Restore my vault to the state from commit abc123"
- "Undo all changes since the last checkpoint"

**Warning:** This will discard all changes made after the specified commit.

## Project Management

### init_project
Initialize a new project with templates.

**Examples:**
- "Create a new software project called 'AI Assistant' for building an AI tool"
- "Set up a research project about machine learning with default structure"
- "Initialize a minimal project for quick experiments"

**Options:**
- Project types: software, research, general, etc.
- Phases: planning, active, review, completed
- Templates: default (full structure), minimal (just essentials), structured (organized folders)
- Include stakeholders and target completion date

### list_project_templates
List available project templates.

**Examples:**
- "Show me all available project templates"
- "What project templates can I use?"
- "List the different project structures available"

## Context Tools

### get_research_context
Load configured research context and guidelines.

**Examples:**
- "Load my research context and guidelines"
- "Show me the AI research partner instructions"
- "Get the configured workflow for research tasks"

### get_working_context
Load focused context for specific work.

**Examples:**
- "Load context for my 'AI Assistant' project"
- "Show me recent notes I've been working on"
- "Get all notes linked to machine learning topic"
- "Load full context for the mobile app project"

**Options:**
- Scope: project (specific project), topic (by subject), recent (latest work), linked (related notes)
- Depth: preview (titles only), summary (with excerpts), full (complete content)
- Limit: Maximum number of notes to include

## Performance Monitoring

### view_search_metrics
View search performance metrics.

**Examples:**
- "Show me search performance metrics for the last 24 hours"
- "Export a search metrics report to my vault"
- "Analyze search performance over the past week"

### run_benchmark
Run performance benchmarks.

**Examples:**
- "Run all performance benchmarks"
- "Test vault scan performance"
- "Compare current performance with baseline metrics"

**Available scenarios:**
- all: Run all benchmarks
- list: Show available benchmark scenarios
- Specific scenarios: vault scan, search, metadata queries, etc.

## GitHub Integration Tools

### create_github_issue
Create a GitHub issue that can trigger Claude Code automation.

**Parameters:**
- `title` (required): Issue title
- `body` (required): Issue description
- `labels`: Array of labels (e.g., ["bug", "enhancement"])
- `assignees`: Array of GitHub usernames
- `milestone`: Milestone name

**Examples:**
- "Create an issue for the search performance bug"
- "File a feature request for smart tag suggestions"
- "Create an issue with the claude-fix label to trigger automation"

**Note:** Issues with `claude-fix` or `claude-feature` labels will automatically trigger Claude Code to work on them.

### create_bug_report
Automatically create a bug report from an error.

**Parameters:**
- `error`: The error object or message
- `context`: Additional context about when the error occurred
- `toolName`: Which tool failed
- `args`: Arguments that were passed to the tool
- `stackTrace`: Full stack trace

**Examples:**
- "Create a bug report for the error that just occurred"
- "File an automated bug report with full stack trace"

**Note:** This tool is typically called automatically when errors occur.

### create_feature_request
Create a feature request with design documentation.

**Parameters:**
- `featureName` (required): Name of the feature
- `description` (required): Feature description
- `specifications`: Detailed specifications
- `designDecisions`: Array of design decisions made
- `acceptanceCriteria`: Array of acceptance criteria
- `technicalRequirements`: Array of technical requirements
- `userStory`: User story format description
- `priority`: "low", "medium", or "high"

**Examples:**
- "Create a feature request for AI-powered tag suggestions"
- "Document and request implementation of the smart merge feature"
- "File a high-priority feature for real-time collaboration"

**Note:** This creates both a design document in your vault and a GitHub issue.

### document_design_decision
Document a design decision in the vault.

**Parameters:**
- `feature` (required): Feature name
- `decisions`: Array of decisions made
- `rationale`: Why these decisions were made
- `technicalDetails`: Object with technical specifications
- `alternatives`: Array of alternatives considered
- `consequences`: Array of expected consequences

**Examples:**
- "Document our design decisions for the new search algorithm"
- "Create a design doc for the tag intelligence feature"
- "Record the architecture decisions for the MCP server refactor"

**Note:** Design documents are stored in `docs/design-decisions/` in your vault.

### check_issue_status
Check the status of a GitHub issue.

**Parameters:**
- `issueNumber` (required): Issue number to check

**Examples:**
- "Check the status of issue #42"
- "Is issue 15 still open?"
- "Show me details about issue number 23"

## Claude Code Local Execution Tools

### check_claude_code_status
Verify Claude Code CLI is installed and configured.

**Returns:**
- Installation status
- Version information  
- Authentication status
- Available models
- GitHub CLI status

**Examples:**
- "Check if Claude Code is installed and ready"
- "Verify Claude Code setup"
- "Is Claude Code authenticated?"

### execute_claude_code_fix
Run Claude Code locally to fix a bug.

**Parameters:**
- `issueNumber` (required): Issue number to reference
- `issueTitle` (required): Title describing the issue
- `issueBody` (required): Detailed issue description
- `errorDetails`: Error information if available
- `customPrompt`: Override the default prompt

**Examples:**
- "Use Claude Code to fix the search bug we just discussed"
- "Run Claude Code locally to fix issue #42"
- "Fix the tag formatting error using Claude Code"

**How it works:**
1. Clones repo to temporary directory
2. Runs `claude -p "fix prompt"` with issue details
3. Runs tests to verify fix
4. Creates branch and commits changes
5. Pushes branch and creates PR
6. Returns PR URL

### execute_claude_code_feature  
Run Claude Code locally to implement a feature.

**Parameters:**
- `featureName` (required): Name of the feature
- `description` (required): Feature description
- `specifications`: Detailed specifications
- `designDecisions`: Array of design decisions
- `acceptanceCriteria`: Array of success criteria
- `technicalRequirements`: Array of technical constraints
- `customPrompt`: Override the default prompt

**Examples:**
- "Use Claude Code to implement the smart tag suggestion feature"
- "Run Claude Code to build the auto-archive functionality"
- "Implement the search improvements we designed"

**How it works:**
1. Documents design decisions in vault
2. Clones repo to temporary directory
3. Runs `claude -p "feature prompt"` with specifications
4. Implements feature with tests and docs
5. Creates branch and commits changes
6. Pushes branch and creates draft PR
7. Returns PR URL for review

### cleanup_temp_directories
Clean up temporary directories created by Claude Code.

**Returns:**
- Number of directories cleaned
- Total directories found

**Examples:**
- "Clean up Claude Code temp directories"
- "Remove temporary work folders"
- "Clear Claude Code workspace"

**Note:** Temp directories are created in your system's temp folder and named `claude-code-*`.

