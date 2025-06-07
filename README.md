# Obsidian AI Curator

An AI-powered system for consolidating and managing notes in Obsidian vaults. Think of it as "Tetris for knowledge" - automatically identifying and merging scattered note fragments into well-structured, comprehensive documents.

## Overview

This tool analyzes your Obsidian vault to identify:
- **Fragmentary notes** - Short notes (<50 words) that could be consolidated
- **Duplicate titles** - Multiple notes with the same or similar titles
- **Related content** - Notes with overlapping topics that could be merged

## Current Features

### Vault Analysis
- Scans all markdown files in your vault
- Identifies consolidation opportunities based on:
  - Note length (fragments under 50 words)
  - Title similarity (>70% match)
  - Content overlap (>30% shared words)
- Generates detailed reports with statistics and recommendations
- Respects `.obsidian`, `.git`, and other system folders

### Interactive Review
- CLI interface for reviewing consolidation candidates
- View note contents before making decisions
- Mark notes for future consolidation
- Saves consolidation queue for batch processing

## Installation

```bash
# Clone the repository
git clone [repository-url]
cd obsidian-ai-curator

# Install dependencies
npm install

# Configure your vault path
npm run config
```

## Usage

### Analyze Your Vault
```bash
npm run analyze
```
This scans your vault and generates a report showing:
- Total notes and sizes
- Fragmentary notes with consolidation suggestions
- Duplicate and similar titles
- Empty notes

### Review Consolidation Candidates
```bash
npm run review
```
Interactively review the analysis results and mark notes for consolidation.

### Update Configuration
```bash
npm run config
```
Change vault path and analysis thresholds.

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

1. **Scanning Phase**
   - Reads all markdown files in your vault
   - Extracts metadata, headings, links, and content
   - Calculates word counts and relationships

2. **Analysis Phase**
   - Identifies fragments (short notes)
   - Finds duplicate/similar titles using Jaccard similarity
   - Calculates content overlap between notes
   - Generates consolidation suggestions

3. **Review Phase**
   - Present findings in an interactive CLI
   - Allow viewing of note contents
   - Mark candidates for consolidation
   - Save decisions to a queue file

## Current Limitations

- **No actual consolidation yet** - Currently only identifies candidates
- **Basic similarity matching** - Uses word overlap, not semantic understanding
- **No AI integration** - Claude API integration coming in Phase 2
- **Manual process** - Requires human review for all decisions

## Roadmap

### Phase 1: Vault Analysis ✅
- Basic project structure
- Vault scanning and analysis
- Duplicate/fragment detection
- CLI review interface

### Phase 2: AI Consolidation (Next)
- Integrate Claude API for intelligent merging
- Generate consolidated notes preserving your voice
- Implement git safety (commit before changes)
- Add rollback capabilities

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
│   ├── consolidator.js     # (Coming) AI consolidation logic
│   └── git-manager.js      # (Coming) Version control
├── config/
│   └── config.json         # Vault path and settings
├── package.json
├── README.md
└── CLAUDE.md               # Detailed project context
```

## Safety Features

- Read-only analysis (no modifications yet)
- All changes will be git-committed before application
- Human approval required for all consolidations
- Preserves original notes in archive folder

## Development

This project uses:
- Node.js with ES modules
- Commander.js for CLI
- Inquirer for interactive prompts
- Gray-matter for markdown frontmatter
- Chalk/Ora for terminal styling

## Future Vision

This tool will evolve into a comprehensive knowledge management system that:
- Continuously consolidates scattered thoughts
- Maintains clean, well-structured notes
- Preserves your unique voice and style
- Integrates with multiple note-taking apps
- Provides AI-powered insights and connections