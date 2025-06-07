# Convert Obsidian AI Curator to MCP Server

## Context
I have a working Obsidian vault analyzer project that identifies consolidation candidates (fragmentary notes, duplicates, etc.). I want to convert this into an MCP server that Claude Desktop can use to actually perform AI-powered note consolidations.

## Current Project State
- ✅ Vault analysis working (identifies fragments, duplicates, similar titles)
- ✅ CLI interface for reviewing candidates  
- ✅ Git integration for safety
- ✅ Configuration management
- ❌ No actual consolidation logic yet
- ❌ No LLM integration

## Goal: MCP Server Architecture
Convert this to an MCP server that exposes tools for Claude Desktop to:
1. Analyze vaults and identify consolidation opportunities
2. Generate consolidated notes from fragments/duplicates
3. Safely apply changes with git commits
4. Provide human review interfaces

## Required MCP Tools to Implement

### 1. `analyze_vault`
- **Purpose**: Scan vault and return consolidation candidates
- **Input**: vault path (optional, use config default)
- **Output**: Analysis report with fragments, duplicates, etc.
- **Reuse**: Existing VaultAnalyzer class

### 2. `get_consolidation_candidates` 
- **Purpose**: Get specific candidates ready for consolidation
- **Input**: candidate type (fragments, duplicates, all)
- **Output**: Detailed candidate list with file contents
- **New**: Enhanced version that includes full file contents

### 3. `preview_consolidation`
- **Purpose**: Generate consolidated note content without saving
- **Input**: list of note paths to consolidate, consolidation strategy
- **Output**: Proposed consolidated note content in target format
- **New**: This is where Claude API integration happens

### 4. `apply_consolidation`
- **Purpose**: Save consolidated note and archive originals
- **Input**: consolidated content, original file paths, new file path
- **Output**: Git commit details and file locations
- **New**: Git safety + file operations

### 5. `get_note_content`
- **Purpose**: Retrieve full content of specific notes
- **Input**: list of note paths
- **Output**: Note contents with metadata
- **Helper**: For Claude to examine notes before consolidating

### 6. `rollback_consolidation`
- **Purpose**: Undo a consolidation using git
- **Input**: commit hash or consolidation ID
- **Output**: Rollback status
- **Safety**: Git-based undo

## Technical Requirements

### MCP Server Setup
```javascript
// Use @modelcontextprotocol/sdk-typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Convert existing analyzer to MCP tools
// Integrate Claude API for consolidation generation
// Maintain git safety workflows
```

### Key Changes Needed
1. **Remove CLI interface** - Replace with MCP tool responses
2. **Add consolidation engine** - New class that uses Claude API to merge notes
3. **Enhanced file operations** - Read full note contents for MCP responses
4. **Git workflow integration** - Commit before/after consolidations
5. **Claude API integration** - For generating consolidated content

### Consolidation Strategy
The consolidation engine should:
- Accept multiple note contents as input
- Use Claude API to merge them preserving user's voice
- Generate structured output in the target format (with metadata)
- Maintain relationships and links between notes
- Preserve important frontmatter

### Target Note Format (from CLAUDE.md)
```markdown
# Consolidated Topic Title
**Project**: [Auto-detected or user specified]
**Consolidation Date**: 2025-06-07
**Confidence**: [AI assessment of consolidation quality]

## Context
[Merged context from original notes]

## Key Points
[Organized main content]

## Next Steps
[Extracted action items]

---
<!-- AI Metadata -->
consolidated_from: ["note1.md", "note2.md", "note3.md"]
original_archive_location: "_archived/2025-06-07-consolidation-1/"
consolidation_strategy: "fragment_merge" | "duplicate_resolve" | "topic_synthesis"
```

## Implementation Plan

### Phase 1: Basic MCP Server
1. Set up MCP server infrastructure
2. Convert vault analyzer to MCP tools
3. Implement note content retrieval tools
4. Test with Claude Desktop

### Phase 2: Consolidation Engine  
1. Add Claude API integration for content generation
2. Implement preview_consolidation tool
3. Add structured output formatting
4. Test consolidation quality

### Phase 3: Safety & Git Integration
1. Implement apply_consolidation with git commits
2. Add rollback capabilities
3. Archive original files safely
4. Full end-to-end testing

## Existing Code to Leverage
- `VaultAnalyzer` class - Convert methods to MCP tools
- Configuration system - Reuse as-is
- File operations in `vault-analyzer.js` - Enhance for MCP
- Git integration potential in existing structure

## New Dependencies Needed
```json
{
  "@modelcontextprotocol/sdk": "latest",
  "@anthropic-ai/sdk": "^0.32.1" // Already have this
}
```

## Success Criteria
1. Claude Desktop can discover and analyze my vault
2. Claude can generate high-quality consolidated notes
3. All changes are git-tracked with easy rollback
4. Consolidations preserve my writing voice and style
5. System reduces note count while improving organization

## Questions for Implementation
1. Should we keep the CLI as a backup interface?
2. How should we handle MCP server authentication/configuration?
3. What's the best way to test MCP tools during development?
4. Should consolidations happen in a staging area first?

---

Please help me implement this MCP server conversion, starting with the basic server setup and tool definitions. Focus on getting the analyze_vault and get_note_content tools working first, then we can add the consolidation engine.