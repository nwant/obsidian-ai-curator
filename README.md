# Obsidian AI Curator

An AI-powered MCP (Model Context Protocol) server that consolidates and manages notes in Obsidian vaults. Think of it as "Tetris for knowledge" - using Claude AI to automatically identify and merge scattered note fragments into well-structured, comprehensive documents while preserving your unique voice and style.

## Quick Start

```bash
# Install dependencies
npm install

# Configure your vault path
npm run config

# For CLI mode: Analyze your vault
npm run analyze

# For MCP mode: Add to Claude Desktop config and restart
```

## Overview

This tool provides both a CLI interface and an MCP server for Claude Desktop that can:
- **Analyze** - Scan your vault to identify consolidation opportunities
- **Preview** - Generate AI-powered consolidation previews using Claude
- **Apply** - Safely apply consolidations with full git version control
- **Archive** - Preserve original notes in timestamped archive folders

## Features

### 🔍 Vault Analysis
- Scans all markdown files in your vault
- Identifies consolidation opportunities:
  - **Fragmentary notes** - Short notes (<50 words) that could be merged
  - **Duplicate titles** - Multiple notes with identical names
  - **Similar titles** - Notes with >70% title similarity
  - **Related content** - Notes with >30% content overlap
- Respects `.obsidian`, `.git`, and other system folders
- Generates detailed JSON reports with actionable insights

### 🤖 AI-Powered Consolidation (NEW!)
- Uses Claude API to intelligently merge notes
- Preserves your writing voice and style
- Three consolidation strategies:
  - `fragment_merge` - Combines short, related notes
  - `duplicate_resolve` - Merges duplicate notes intelligently
  - `topic_synthesis` - Synthesizes notes on similar topics
- Structured output format with metadata tracking

### 🛡️ Git Safety
- Automatic git commits before and after consolidations
- Easy rollback if something goes wrong
- Original notes archived to `_archived/` folder
- Full audit trail of all AI changes

### 🖥️ Dual Interface
- **CLI Mode** - Interactive command-line interface for manual review
- **MCP Server** - Direct integration with Claude Desktop for AI-powered workflows

## Installation

```bash
# Clone the repository
git clone [repository-url]
cd obsidian-ai-curator

# Install dependencies
npm install

# Copy example config and customize with your vault path
cp config/config.example.json config/config.json
# Edit config/config.json with your actual vault path

# Or use the interactive config tool
npm run config
```

## Usage

### CLI Mode (Original Interface)

#### Analyze Your Vault
```bash
npm run analyze
```
This scans your vault and generates a report showing:
- Total notes and sizes
- Fragmentary notes with consolidation suggestions
- Duplicate and similar titles
- Empty notes

#### Review Consolidation Candidates
```bash
npm run review
```
Interactively review the analysis results and mark notes for consolidation.

#### Update Configuration
```bash
npm run config
```
Change vault path and analysis thresholds.

### MCP Server Mode (For Claude Desktop)

#### Setup
1. Configure your Claude Desktop settings (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "obsidian-ai-curator": {
      "command": "node",
      "args": ["/absolute/path/to/obsidian-ai-curator/src/mcp-server.js"],
      "cwd": "/absolute/path/to/obsidian-ai-curator",
      "env": {
        "OBSIDIAN_VAULT_PATH": "/path/to/your/obsidian/vault",
        "ANTHROPIC_API_KEY": "your-api-key-here"  // Only needed for AI consolidation features
      }
    }
  }
}
```

2. Alternatively, you can set these environment variables in your shell profile (e.g., `~/.zshrc` or `~/.bash_profile`):
```bash
export OBSIDIAN_VAULT_PATH="/path/to/your/obsidian/vault"
export ANTHROPIC_API_KEY="your-api-key"  # Only needed for AI consolidation features
```

3. Restart Claude Desktop

**Note about API Key**: The `ANTHROPIC_API_KEY` is only required for the AI-powered consolidation features (`preview_consolidation` and `apply_consolidation`). The MCP server itself will work without it for vault analysis and basic operations. When using Claude Desktop, you're already authenticated, but this server makes separate API calls to Claude for content generation.

Note: Environment variables in the Claude Desktop config take precedence over shell environment variables. The vault path can also be configured in `config/config.json`.

#### Getting Started with Claude Desktop

**🎯 AI Research Partner Mode**: This MCP server is designed to work as your AI research partner, not a manual copy-paste tool.

**Quick Start**: In any new Claude Desktop chat, type:
```
Load my research context
```

Claude will automatically:
1. Load your research partner vision and interaction guidelines
2. Understand that you want proactive pattern discovery
3. Focus on vault evolution through intelligent consolidation
4. Maintain git safety for all changes

#### Available MCP Tools

When connected through Claude Desktop, you can use these tools:

**🧠 Context & Discovery**
1. **get_research_context** - Load AI research partner guidelines
   - Defines proactive vault evolution approach
   - Sets git safety requirements and workflows
   - Establishes pattern discovery vs manual operations focus

2. **vault_scan** - Scan vault for files with statistics
   - Fast overview of vault structure and sizes
   - Identifies potential consolidation opportunities
   - Supports pattern filtering and stats inclusion

**📖 Content Analysis**
3. **read_notes** - Read multiple notes with full content and metadata  
   - Extracts frontmatter, headings, and links
   - Bulk content retrieval for pattern analysis

4. **search_content** - Search across all vault content
   - Full-text search with context lines
   - Pattern discovery across multiple notes
   - Configurable result limits

5. **find_by_metadata** - Find notes by properties
   - Filter by frontmatter fields, word counts, dates
   - Identify candidates for consolidation

**✍️ Vault Evolution**  
6. **write_note** - Create or update notes
   - Used for consolidated note creation
   - Supports full markdown with frontmatter

7. **archive_notes** - Move notes to archive locations
   - Bulk archiving of redundant notes
   - Maintains vault organization

**🛡️ Git Safety (Always Required)**
8. **git_checkpoint** - Create commit before changes
   - MANDATORY before any vault modifications
   - Descriptive commit messages for consolidations

9. **git_changes** - Review changes since commit
   - Audit trail of modifications
   - Verify consolidation results

10. **git_rollback** - Rollback if needed
    - Safety net for failed consolidations
    - Full vault state restoration

## Configuration

The `config/config.json` file contains:
```json
{
  "vaultPath": "/path/to/your/obsidian/vault",
  "ignorePatterns": [".obsidian", ".git", ".trash"],
  "thresholds": {
    "similarityScore": 0.7,      // Title similarity threshold
    "minNoteLength": 50,         // Words needed for complete note
    "maxFragmentLength": 500     // Max words for fragment
  }
}
```

## How It Works

### 1. **Scanning Phase**
- Reads all markdown files in your vault
- Extracts metadata, headings, links, and content
- Calculates word counts and relationships

### 2. **Analysis Phase**
- Identifies fragments (short notes under configured threshold)
- Finds duplicate/similar titles using word-based similarity
- Calculates content overlap between notes
- Generates consolidation suggestions

### 3. **AI Consolidation Phase** (MCP Mode)
- Claude analyzes multiple notes for semantic relationships
- Generates consolidated content preserving your voice
- Structures output with proper metadata tracking
- Maintains links and relationships

### 4. **Application Phase**
- Git commits current state for safety
- Creates new consolidated note
- Archives originals to timestamped folder
- Commits final changes with descriptive message

## Roadmap

### Phase 1: Vault Analysis ✅ (Complete)
- Basic project structure
- Vault scanning and analysis  
- Duplicate/fragment detection
- CLI review interface

### Phase 2: MCP Server ✅ (Complete)
- Converted to MCP server architecture
- Integrated Claude API for consolidation
- Implemented git safety workflows
- See MCP-IMPLEMENTATION.md for technical details

### Phase 3: Active Management
- Automated scheduling
- Real-time duplicate detection
- Knowledge graph visualization
- Multi-source integration (Apple Notes, OneNote, etc.)

## Project Structure

```
obsidian-ai-curator/
├── src/
│   ├── vault-analyzer.js    # Core analysis engine
│   ├── cli.js              # Command-line interface
│   └── mcp-server.js       # MCP server for Claude Desktop
├── config/
│   └── config.json         # Vault path and settings
├── mcp.json                # MCP server configuration
├── package.json
├── README.md
├── CLAUDE.md               # Detailed project context
└── MCP-IMPLEMENTATION.md   # MCP technical details
```

## Safety Features

- **Git Integration** - Automatic commits before and after changes
- **Archive System** - Original notes preserved in `_archived/` folders
- **Rollback Support** - Automatic rollback on errors
- **Human Control** - All consolidations require explicit approval
- **Audit Trail** - Complete history of all AI-generated changes

## Consolidated Note Format

The AI generates consolidated notes in this structure:

```markdown
# Consolidated Topic Title
**Project**: [Auto-detected or specified]
**Consolidation Date**: 2025-06-07
**Confidence**: [High/Medium/Low]

## Context
[Merged context from original notes]

## Key Points
[Organized main content]

## Next Steps
[Extracted action items]

---
<!-- AI Metadata -->
consolidated_from: ["note1.md", "note2.md"]
consolidation_strategy: "fragment_merge"
```

## Development

This project uses:
- **Node.js** (v18+) with ES modules
- **MCP SDK** for Claude Desktop integration
- **Anthropic SDK** for Claude API access
- **Simple-git** for version control operations
- **Gray-matter** for markdown frontmatter parsing
- **Commander.js** for CLI interface
- **Zod** for schema validation

## Future Vision

This tool will evolve into a comprehensive knowledge management system that:
- Continuously consolidates scattered thoughts
- Maintains clean, well-structured notes
- Preserves your unique voice and style
- Integrates with multiple note-taking apps
- Provides AI-powered insights and connections

## Contributing

This is currently a proof-of-concept for workplace knowledge management. Contributions and feedback are welcome! Please see CLAUDE.md for the full project vision and context.