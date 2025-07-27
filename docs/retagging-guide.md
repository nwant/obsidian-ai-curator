# Retagging Guide for AI-Related Documents

This guide shows the proper hierarchical tags for all AI-related documents based on your vault's tag taxonomy.

## Tag Taxonomy Structure

Based on your vault's system, here's how tags should be organized:

### Core Hierarchies
- `#type/*` - Document types (project-index, case-study, pattern, etc.)
- `#project/*` - Specific projects
- `#domain/*` - Domain areas (ai-agents, ai-coe, etc.)
- `#pattern/*` - Pattern types (engineering, strategic, etc.)
- `#status/*` - Document status

## Document Retagging Structure

### 1. AI Agent Evaluation Results.md
**Current tags:** `[#ai-agent-results]`
**Proper tags:**
```yaml
tags:
  - #type/evaluation-results
  - #domain/ai-agents
  - #project/ai-agent-evaluation
  - #pattern/evaluation
  - #status/complete
```

### 2. AI Project Index.md
**Current tags:** `[#ai-projects-index]`
**Proper tags:**
```yaml
tags:
  - #type/project-index
  - #domain/ai-coe
  - #enablement
```

### 3. Agent Framework Comparison.md
**Current tags:** `[#agent-framework-comparison]`
**Proper tags:**
```yaml
tags:
  - #type/comparison
  - #domain/ai-agents
  - #pattern/engineering
  - #technical-standard
```

### 4. AI Agent Architecture Decisions.md
**Current tags:** `[#ai-agent-architecture]`
**Proper tags:**
```yaml
tags:
  - #adr
  - #type/decision
  - #domain/ai-agents
  - #pattern/architecture
  - #technical-standard
```

### 5. Custom Agent Implementation.md
**Current tags:** `[#custom-agent-implementation]`
**Proper tags:**
```yaml
tags:
  - #type/implementation-guide
  - #domain/ai-agents
  - #pattern/engineering
  - #enablement
```

### 6. Claude Projects Implementation Guide.md
**Current tags:** `[#claude-projects-guide]`
**Proper tags:**
```yaml
tags:
  - #type/implementation-guide
  - #project/claude-projects
  - #pattern/implementation
  - #enablement
```

### 7. AI CoE Workshop Patterns.md
**Current tags:** `[#ai-coe-workshop-patterns]`
**Proper tags:**
```yaml
tags:
  - #type/pattern
  - #domain/ai-coe
  - #pattern/enablement
  - #enablement
  - #training-material
```

### 8. Agentic Systems Decision Matrix.md
**Current tags:** `[#agentic-systems-decision-matrix]`
**Proper tags:**
```yaml
tags:
  - #type/decision-matrix
  - #domain/ai-agents
  - #pattern/strategic
  - #decision-support
```

### 9. OpenAI vs Claude Project Analysis.md
**Current tags:** `[#openai-claude-analysis]`
**Proper tags:**
```yaml
tags:
  - #type/comparison
  - #project/claude-projects
  - #project/openai-projects
  - #pattern/evaluation
```

### 10. AI Solution Architecture Patterns.md
**Current tags:** `[#ai-solution-architecture]`
**Proper tags:**
```yaml
tags:
  - #type/pattern
  - #pattern/architecture
  - #domain/ai-coe
  - #technical-standard
  - #reference-architecture
```

## Cross-Project Linkages

### AI Project Index should link to:
- [[Claude Projects Implementation Guide]]
- [[AI Agent Architecture Decisions]]
- [[AI CoE Workshop Patterns]]

### Agent Framework Comparison should link to:
- [[Custom Agent Implementation]]
- [[Agentic Systems Decision Matrix]]
- [[AI Agent Architecture Decisions]]

### AI CoE Workshop Patterns should link to:
- [[AI Solution Architecture Patterns]]
- [[Claude Projects Implementation Guide]]

## Auto-Tagging Rules

Based on your vault's patterns, these rules should apply:

1. Documents with "workshop" or "training" → add `#enablement`, `#training-material`
2. Documents with "architecture" and "decision" → add `#adr`, `#technical-standard`
3. Documents with "implementation" → add `#type/implementation-guide`, `#enablement`
4. Documents with "comparison" or "vs" → add `#type/comparison`, `#pattern/evaluation`
5. Documents with "project" and "index" → add `#type/project-index`

## Manual Update Process

To update each document:

1. Open the document in Obsidian
2. Replace the existing tags in the frontmatter with the proper tags listed above
3. Add cross-links to related documents as suggested
4. Ensure all tags follow the hierarchical structure

## Benefits of Proper Tagging

- **Consistency**: All documents follow the same tagging conventions
- **Discoverability**: Easy to find related content through tag hierarchies
- **Automation**: Future documents will auto-tag based on these patterns
- **Organization**: Clear structure for different types of AI-related content