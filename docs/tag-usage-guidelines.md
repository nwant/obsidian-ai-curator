# Tag Usage Guidelines for AI Assistant

## ⚠️ Critical: Frontmatter Tag Format

**NEVER use hashtags (#) in frontmatter tags!**

```yaml
# ❌ WRONG - Becomes null in YAML
---
tags:
  - #project/active
---

# ✅ CORRECT - Obsidian convention
---
tags:
  - project/active
---
```

Only use hashtags for inline tags: `#project/active`

## Core Principles

1. **Check Before Creating**: Always use existing tags when possible
2. **Maintain Consistency**: Follow established patterns and conventions
3. **Prefer Hierarchy**: Use nested tags for categorization
4. **Avoid Duplication**: Never create variations of existing tags

## Required Workflow

### Before Creating Any Note

1. **Analyze Existing Tags**
   ```
   Use: analyze_tags
   Purpose: Understand the current tag landscape
   ```

2. **Check Content Relevance**
   ```
   Use: suggest_tags with the note content
   Purpose: Get AI-powered suggestions based on content
   ```

### When Assigning Tags

1. **First Priority**: Use suggested tags that match > 70%
2. **Second Priority**: Use existing tags from the same category
3. **Last Resort**: Create new tags only when absolutely necessary

### Tag Creation Rules

When you MUST create a new tag:

1. **Check Similarity First**
   - Search for similar tags (use analyze_tags)
   - Look for: typos, plurals, abbreviations, synonyms
   - If similarity > 80%, use the existing tag instead

2. **Follow Conventions**
   - Lowercase only: #machine-learning (not #Machine-Learning)
   - Use hyphens: #best-practices (not #best_practices)
   - Be concise: #ml (not #machine-learning-algorithms)

3. **Consider Hierarchy**
   - Place in existing hierarchy when possible
   - Examples:
     - New: #project/website-redesign
     - Not: #website-redesign-project

4. **Require Justification**
   - Document why a new tag is needed
   - Explain why existing tags don't suffice
   - Consider if it will be reused

## Common Patterns to Avoid

### ❌ Don't Create Variations
- #task, #tasks, #todo, #to-do → Use ONE consistent form
- #ai, #AI, #artificial-intelligence → Pick one and stick to it
- #dev, #development, #developing → Standardize on one

### ❌ Don't Create Ultra-Specific Tags
- #meeting-with-john-2024-01-15 → Use #meeting + date in content
- #bug-in-login-page → Use #bug + details in content

### ✅ Do Use Combinations
- Instead of #urgent-task → Use #task #urgent
- Instead of #python-project → Use #project #python

## Tag Hierarchies

Respect established hierarchies:

```
#project/
  #project/active
  #project/completed
  #project/on-hold

#area/
  #area/work
  #area/personal
  #area/learning

#type/
  #type/meeting
  #type/decision
  #type/reference
```

## Validation Checklist

Before finalizing tags on any note:

- [ ] Ran analyze_tags to see current landscape
- [ ] Ran suggest_tags to get recommendations
- [ ] Checked for similar existing tags
- [ ] Followed naming conventions
- [ ] Placed in appropriate hierarchy
- [ ] Justified any new tags created

## Example Scenarios

### Scenario 1: Writing a Meeting Note
```
Content: "Discussed Q1 roadmap with product team"

1. Run suggest_tags → Suggests: #meeting (90%), #product (75%), #roadmap (82%)
2. Check hierarchy → Find #type/meeting exists
3. Final tags: #type/meeting #product #roadmap #q1-2025
```

### Scenario 2: Creating a Bug Report
```
Content: "Login page shows error when..."

1. Run suggest_tags → Suggests: #bug (95%), #login (70%), #frontend (65%)
2. Check existing → Find #issue/bug hierarchy
3. Final tags: #issue/bug #login #frontend
```

### Scenario 3: New Project Documentation
```
Content: "Setting up new ML pipeline for..."

1. Run suggest_tags → Suggests: #ml (88%), #pipeline (60%)
2. Check hierarchy → Find #project/ exists
3. Create: #project/ml-pipeline (justified: recurring project)
4. Final tags: #project/ml-pipeline #ml #documentation
```

## Integration with Tools

### Using analyze_tags
```json
{
  "totalTags": 150,
  "hierarchy": { ... },
  "similarTags": [
    { "tag1": "#task", "tag2": "#tasks", "similarity": 0.89 }
  ],
  "recommendations": [
    { "type": "similar-tags", "action": "Consider consolidating" }
  ]
}
```

### Using suggest_tags
```json
{
  "suggestions": [
    { "tag": "#project/active", "score": 0.92, "reason": "Direct keyword match: 'project'" },
    { "tag": "#development", "score": 0.78, "reason": "High content relevance" }
  ]
}
```

## Remember

- **Quality over Quantity**: Fewer, well-chosen tags are better than many specific ones
- **Think Long-term**: Will this tag be useful in 6 months?
- **Stay Consistent**: When in doubt, check how similar content was tagged
- **Document Decisions**: Note why you created new tags in your commit messages