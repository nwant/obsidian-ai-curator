# Obsidian AI Curator Project

## Project Goal
Build an AI-powered system that actively manages and consolidates notes in an Obsidian vault. The system should work like "Tetris for knowledge" - continuously consolidating scattered fragments into clean, well-structured notes while maintaining both human readability and AI accessibility.

## Context & Vision
- **Problem**: Notes are scattered across multiple apps (Apple Notes, OneNote, Obsidian, Raycast), leading to cognitive fragmentation and duplicate/incomplete thoughts
- **Solution**: AI system that ingests, consolidates, and actively manages knowledge base
- **Tetris Analogy**: Clear "complete lines" (consolidated knowledge) to prevent cognitive overflow and maintain clean foundation
- **End Goal**: This will become a proof-of-concept for workplace knowledge management (90-day AI task force incubator)

## Current State
- Obsidian vault exists and is already git-versioned
- Starting with Obsidian first because it's local filesystem (easy programmatic access)
- Will expand to other sources later (email, calendar, other note apps)

## Technical Approach

### Architecture
1. **Data Ingestion**: Read markdown files from Obsidian vault
2. **AI Processing**: Use Claude API to identify related/duplicate content and consolidate
3. **Active Curation**: Generate new consolidated notes, archive/delete originals
4. **Version Control**: Git tracking of all AI changes for safety and rollback
5. **Dual Interface**: Human-readable documents with embedded AI metadata

### Tech Stack
- **Language**: JavaScript/Node.js (preferred over Python)
- **Claude API**: Anthropic's JS SDK for content analysis and consolidation
- **File Operations**: Node.js `fs/promises`
- **Markdown**: `gray-matter` for frontmatter parsing
- **Git**: `simple-git` for version control integration
- **CLI**: Interactive review interface for approving AI changes

### Target Note Format
```markdown
# Decision/Topic Title
**Project**: AI Task Force
**Decision Date**: 2025-06-07
**Confidence**: High
**Status**: Active

## Context
[Human readable narrative]

## Decision/Outcome
[Clear conclusion]

## Next Steps
[Actionable items]

---
<!-- AI Metadata -->
related_notes: ["note-id-1", "note-id-2"]
consolidated_from: ["fragment-1.md", "fragment-2.md"]
last_ai_update: "2025-06-07"
```

## Immediate Next Steps

### Phase 1: Vault Analysis (This Week)
1. Set up basic Node.js project structure
2. Build vault analyzer to:
   - Count total files and sizes
   - Identify notes with similar titles/content
   - Find incomplete or fragmentary notes
   - Generate consolidation candidates
3. Create CLI interface for reviewing suggestions

### Phase 2: AI Consolidation
1. Integrate Claude API for content analysis
2. Build consolidation logic to merge related notes
3. Implement git safety (commit before changes, review interface)
4. Test with 2-3 note consolidations

### Phase 3: Active Management
1. Automated duplicate detection
2. Proactive consolidation suggestions
3. Knowledge graph relationships
4. Integration with other data sources

## Success Metrics
- **Week 1**: Successfully identify consolidation candidates in vault
- **Week 2**: Generate first AI-consolidated note that feels authentic and useful
- **Month 1**: Regular automated consolidation reducing total note count while improving knowledge density

## Project Structure (Suggested)
```
obsidian-ai-curator/
├── src/
│   ├── vault-analyzer.js    // File analysis and duplicate detection
│   ├── consolidator.js      // AI merging and generation logic
│   ├── git-manager.js       // Version control safety
│   └── cli.js              // Interactive review interface
├── config/
│   └── config.json         // API keys, vault paths, settings
├── CLAUDE.md               // This file
├── package.json
└── README.md
```

## Important Notes
- **Safety First**: Always git commit before AI modifications
- **Human Control**: AI suggests, human approves all changes
- **Iterative**: Start small, prove concept, then expand
- **Voice Preservation**: Consolidated notes should feel like "my voice", not robotic

## Current Vault Location
[User should specify their Obsidian vault path]

## AI Research Partner Vision

### Core Interaction Philosophy
**What I Want**: An AI research partner that proactively works with your vault, NOT a manual copy-paste interface.

### The Research Collaboration Loop
1. **AI Discovery**: Scan vault → identify patterns across notes
2. **Human Guidance**: You steer insights → direct consolidation priorities  
3. **AI Execution**: Automatically refine vault structure
4. **Knowledge Evolution**: Vault becomes living research database

### Example Ideal Workflow
```
AI: "I analyzed your 180 Calendar files and found recurring patterns:
     • 12 incidents with similar root causes
     • 8 project decision frameworks 
     • 15 technical architecture insights
     
     Should I extract 'Incident Response Patterns' from these notes?"

You: "Yes, but also look for monitoring strategies"

AI: "Found 6 monitoring approaches. Creating 'System Monitoring Strategy' 
     note and linking it to your existing 'Reliability in atom.md'. 
     Also archiving 23 redundant daily notes. Approve?"

You: "Perfect. What other patterns do you see?"
```

### Claude Interaction Guidelines for New Chats

#### Always Start With
1. Use `get_research_context` MCP tool to load this vision
2. Scan vault with `vault_scan` to understand current state
3. Proactively identify consolidation opportunities
4. Focus on pattern discovery, not manual operations

#### Default Behavior
- **Discovery-First**: Look for patterns across multiple notes
- **Consolidation-Focused**: Suggest merging related content
- **Execution-Ready**: Automatically create refined notes when approved
- **Evolution-Minded**: Help vault become smarter research corpus

#### What Success Looks Like
- "I found these 5 patterns across your meeting notes..."
- "Should I extract that incident response pattern and combine it with monitoring insights?"
- "Creating consolidated note and archiving 23 redundant fragments"
- Vault density improves through intelligent consolidation

## Questions for Implementation
1. What's the current structure/size of the Obsidian vault?
2. Are there specific note patterns or templates already in use?
3. Any particular types of notes that should be prioritized for consolidation?
4. Preferred CLI interaction style (prompts, flags, interactive menus)?