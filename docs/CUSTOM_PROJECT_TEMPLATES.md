# Custom Project Templates Configuration

This guide explains how to create and configure your own project templates for the `init_project` tool.

## Overview

The Obsidian AI Curator supports custom project templates that allow you to define your own project structures, file templates, and initialization rules. The system will automatically use your custom templates if available, or fall back to the default templates.

## Setup

1. **Copy the example configuration**:
   ```bash
   cp config/project-templates.example.json config/project-templates.json
   ```

2. **Edit your custom configuration**:
   ```bash
   # Edit with your preferred editor
   vim config/project-templates.json
   ```

3. **Test your templates**:
   ```javascript
   init_project({
     projectName: "Test Project",
     description: "Testing my custom template",
     template: "my-custom-template"
   })
   ```

## Configuration Structure

### Top-Level Structure

```json
{
  "version": "1.0",
  "description": "Your custom project templates",
  
  "projectTypes": { ... },
  "phases": { ... },
  "validation": { ... },
  "templates": { ... },
  "fileTemplates": { ... }
}
```

### Project Types

Define the types of projects you work with:

```json
"projectTypes": {
  "api": {
    "name": "API Development",
    "description": "REST/GraphQL API projects"
  },
  "ml-model": {
    "name": "Machine Learning Model",
    "description": "ML model development and training"
  }
}
```

### Phases

Define your project lifecycle phases:

```json
"phases": {
  "research": {
    "name": "Research",
    "description": "Initial research and exploration"
  },
  "poc": {
    "name": "Proof of Concept",
    "description": "Building initial prototype"
  }
}
```

### Validation Rules

Set rules for project names and dates:

```json
"validation": {
  "projectName": {
    "pattern": "^[a-zA-Z0-9\\s-]+$",
    "minLength": 3,
    "maxLength": 100,
    "errorMessage": "Project name can only contain letters, numbers, spaces, and hyphens"
  },
  "dateFormat": {
    "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
    "errorMessage": "Date must be in yyyy-MM-dd format"
  }
}
```

### Templates

Define your project templates:

```json
"templates": {
  "my-template": {
    "name": "My Custom Template",
    "description": "Template for my specific workflow",
    
    "directories": [
      "Documentation",
      "Code",
      "Tests",
      "Meetings"
    ],
    
    "files": [
      {
        "path": "CLAUDE.md",
        "template": "my-claude-context"
      },
      {
        "path": "README.md",
        "template": "my-readme"
      }
    ]
  }
}
```

### File Templates

Define the content for each file template:

```json
"fileTemplates": {
  "my-claude-context": {
    "content": "---\ncreated: {{currentDate}}\ntags:\n  - project/{{projectSlug}}\n---\n# {{projectName}}\n\n{{description}}\n\n## Current Status\n- Phase: {{phase}}\n- Started: {{currentDate}}\n\n## Stakeholders\n{{stakeholderList}}\n"
  }
}
```

## Template Variables

Available variables for use in templates:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{projectName}}` | Project name as provided | "My New Project" |
| `{{projectSlug}}` | URL-safe version of project name | "my-new-project" |
| `{{projectType}}` | Selected project type | "ai-agent" |
| `{{description}}` | Project description | "Building an AI assistant" |
| `{{phase}}` | Current project phase | "planning" |
| `{{currentDate}}` | Today's date in configured format | "2025-08-02" |
| `{{targetDate}}` | Target completion date | "2025-12-31" |
| `{{stakeholders}}` | Comma-separated stakeholder list | "Alice, Bob, Charlie" |
| `{{stakeholderList}}` | Formatted stakeholder list | "- Alice\n- Bob\n- Charlie" |

## Variable Defaults and Filters

You can provide defaults and apply filters to variables:

- **Default values**: `{{variable|default value}}`
  - Example: `{{targetDate|TBD}}`
  
- **Filters**: `{{variable|filter}}`
  - `capitalize`: Capitalizes first letter
  - `uppercase`: Converts to uppercase
  - `lowercase`: Converts to lowercase
  - Example: `{{phase|capitalize}}`

## Example: Custom Research Template

Here's a complete example of adding a custom research template:

```json
{
  "templates": {
    "academic-research": {
      "name": "Academic Research Project",
      "description": "Template for academic research with citations",
      
      "directories": [
        "Literature",
        "Data",
        "Analysis",
        "Papers",
        "Presentations"
      ],
      
      "files": [
        {
          "path": "CLAUDE.md",
          "template": "research-claude"
        },
        {
          "path": "RESEARCH_PLAN.md",
          "template": "research-plan"
        },
        {
          "path": "Literature/README.md",
          "template": "literature-readme"
        }
      ]
    }
  },
  
  "fileTemplates": {
    "research-claude": {
      "content": "---\ncreated: {{currentDate}}\nproject-type: academic-research\ntags:\n  - research/{{projectSlug}}\n  - phase/{{phase}}\n---\n# {{projectName}} - Research Context\n\n## Research Question\n{{description}}\n\n## Current Status\n- **Phase**: {{phase}}\n- **Started**: {{currentDate}}\n- **Target**: {{targetDate}}\n\n## Research Team\n{{stakeholderList}}\n\n## Key Hypotheses\n1. [Define during planning]\n2. [Add as identified]\n\n## Methods\n- [Document research methods]\n\n## Key Papers\n- [[Literature/README]] - Literature organization\n- [Add key papers as found]\n"
    },
    
    "research-plan": {
      "content": "# {{projectName}} - Research Plan\n\n## Abstract\n{{description}}\n\n## Timeline\n- Start: {{currentDate}}\n- Target: {{targetDate}}\n\n## Methodology\n[Describe research methodology]\n\n## Expected Outcomes\n[Define expected outcomes]\n"
    }
  }
}
```

## Best Practices

1. **Keep Templates Evergreen**: Follow the v2 pattern where dynamic content goes in CLAUDE.md and static workflows in other files.

2. **Use Meaningful Names**: Choose template keys that clearly indicate their purpose (e.g., `ml-experiment`, `api-microservice`).

3. **Validate Your JSON**: Ensure your configuration is valid JSON before saving.

4. **Test Incrementally**: Test each new template as you add it.

5. **Document Custom Variables**: If you add custom logic, document any new variables.

## Sharing Templates

Custom templates are ignored by git (in `.gitignore`), allowing you to maintain personal workflows without affecting the repository. To share templates with your team:

1. Create a separate repository for shared templates
2. Or add them to your team's documentation
3. Or submit a PR to add them as additional default template options

## Troubleshooting

### Templates Not Loading

If your custom templates aren't loading:
1. Check that `config/project-templates.json` exists
2. Validate the JSON syntax
3. Check console output for error messages
4. Ensure file permissions allow reading

### Template Not Found

If a specific template isn't found:
1. Verify the template key matches exactly
2. Use `list_project_templates` to see available templates
3. Check that the template is defined in the `templates` section

### Variable Not Replaced

If variables remain as `{{variable}}`:
1. Check variable name spelling
2. Ensure the variable is provided in the parameters
3. Verify the variable is in the available variables list

## Migration from Default Templates

To migrate from default templates:

1. Start with a copy of the default templates
2. Modify incrementally
3. Test each change
4. Keep the default templates as a reference

Remember: The system will always fall back to default templates if your custom configuration has issues, ensuring the tool remains functional.