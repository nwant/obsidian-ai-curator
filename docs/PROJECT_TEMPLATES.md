# Project Templates Documentation

This guide explains how to use and customize project templates for the `init_project` tool.

## Quick Start

### Using Built-in Templates

```javascript
// Use default template
init_project({
  projectName: "My New Project",
  description: "Building an AI assistant",
  stakeholders: ["Alice (PM)", "Bob (Dev)"],
  targetDate: "2025-12-31"
})

// Use minimal template
init_project({
  projectName: "Quick Project",
  description: "A simple project",
  template: "minimal"
})

// Use research template
init_project({
  projectName: "AI Research",
  description: "Research into AI patterns",
  template: "research"
})

// List available templates
list_project_templates()
```

### Built-in Templates

1. **default** - Standard project structure with README and documentation folder
2. **minimal** - Minimal structure with just a README file
3. **structured** - More organized structure with planning, development, and meeting folders

## Creating Custom Templates

You can create your own templates without modifying the repository:

### Setup

1. **Copy the example configuration**:
   ```bash
   cp config/project-templates.example.json config/project-templates.json
   ```

2. **Edit your custom configuration**:
   ```bash
   # Edit with your preferred editor
   vim config/project-templates.json
   ```

3. **Your custom file is gitignored** - It won't be tracked or committed

### How It Works

- System tries to load `config/project-templates.json` first (your custom templates)
- Falls back to `config/project-templates.default.json` if custom doesn't exist
- Custom templates completely replace defaults (they don't merge)

## Template Configuration Structure

### Top-Level Structure

```json
{
  "version": "1.0",
  "description": "Your custom project templates",
  
  "projectTypes": { ... },      // Types of projects
  "phases": { ... },           // Project lifecycle phases  
  "validation": { ... },       // Input validation rules
  "templates": { ... },        // Template definitions
  "fileTemplates": { ... }     // File content templates
}
```

### Project Types

Define the types of projects you work with:

```json
"projectTypes": {
  "ai-agent": {
    "name": "AI Agent",
    "description": "AI-powered agent or assistant"
  },
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

Define project lifecycle phases:

```json
"phases": {
  "planning": {
    "name": "Planning",
    "description": "Requirements gathering and design"
  },
  "development": {
    "name": "Development",
    "description": "Active implementation"
  },
  "testing": {
    "name": "Testing",
    "description": "Quality assurance"
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

### Template Definitions

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
      },
      {
        "path": "Code/{{projectSlug}}.py",
        "template": "python-starter"
      }
    ]
  }
}
```

### File Content Templates

Define the content for each file:

```json
"fileTemplates": {
  "my-claude-context": {
    "content": "---\ncreated: {{currentDate}}\ntags:\n  - project/{{projectSlug}}\n---\n# {{projectName}}\n\n{{description}}\n\n## Current Status\n- Phase: {{phase}}\n- Started: {{currentDate}}\n\n## Stakeholders\n{{stakeholderList}}\n"
  },
  "python-starter": {
    "content": "#!/usr/bin/env python3\n\"\"\"\n{{projectName}}\n{{description}}\n\nCreated: {{currentDate}}\n\"\"\"\n\nclass {{projectName|capitalize}}:\n    pass\n"
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

### Variable Modifiers

- **Default values**: `{{variable|default value}}`
  - Example: `{{targetDate|TBD}}` outputs "TBD" if no target date provided
  
- **Filters**: `{{variable|filter}}`
  - `capitalize`: Capitalizes first letter (`planning` → `Planning`)
  - `uppercase`: Converts to uppercase (`planning` → `PLANNING`)
  - `lowercase`: Converts to lowercase (`Planning` → `planning`)

## Complete Example: API Microservice Template

```json
{
  "templates": {
    "api-microservice": {
      "name": "API Microservice",
      "description": "RESTful API microservice with documentation",
      
      "directories": [
        "src",
        "src/routes",
        "src/models", 
        "src/middleware",
        "tests",
        "docs",
        "config"
      ],
      
      "files": [
        {
          "path": "CLAUDE.md",
          "template": "api-claude"
        },
        {
          "path": "README.md",
          "template": "api-readme"
        },
        {
          "path": "src/index.js",
          "template": "api-index"
        },
        {
          "path": "docs/API.md",
          "template": "api-docs"
        },
        {
          "path": ".env.example",
          "template": "api-env"
        }
      ]
    }
  },
  
  "fileTemplates": {
    "api-claude": {
      "content": "---\ncreated: {{currentDate}}\nproject-type: api-microservice\ntags:\n  - project/{{projectSlug}}\n  - api/rest\n  - phase/{{phase}}\n---\n# {{projectName}} - API Context\n\n## Service Overview\n{{description}}\n\n## Current Status\n- **Phase**: {{phase}}\n- **Started**: {{currentDate}}\n- **Target**: {{targetDate}}\n- **Port**: 3000\n- **Version**: 0.1.0\n\n## Team\n{{stakeholderList}}\n\n## Endpoints\n- [ ] GET /health - Health check\n- [ ] GET /api/v1/resource - List resources\n- [ ] POST /api/v1/resource - Create resource\n\n## Architecture Decisions\n- Framework: Express.js\n- Database: [TBD]\n- Authentication: [TBD]\n\n## Environment Variables\n- `PORT` - Server port (default: 3000)\n- `NODE_ENV` - Environment (development/production)\n- `DATABASE_URL` - Database connection string\n"
    },
    
    "api-index": {
      "content": "const express = require('express');\nconst app = express();\nconst PORT = process.env.PORT || 3000;\n\n// Middleware\napp.use(express.json());\n\n// Health check\napp.get('/health', (req, res) => {\n  res.json({ \n    status: 'healthy',\n    service: '{{projectSlug}}',\n    version: '0.1.0'\n  });\n});\n\n// Start server\napp.listen(PORT, () => {\n  console.log(`{{projectName}} running on port ${PORT}`);\n});\n"
    }
  }
}
```

## Best Practices

### 1. Evergreen Templates
Follow the v2 pattern for evergreen instructions:
- **CLAUDE.md**: Contains ALL dynamic content (dates, status, stakeholders)
- **PROJECT_INSTRUCTIONS.md**: Contains ONLY static workflows
- This ensures Claude Desktop instructions never need updating

### 2. Naming Conventions
- Use descriptive template keys: `api-microservice`, `ml-experiment`, `frontend-app`
- Use consistent file template names: `component-readme`, `component-claude`

### 3. Directory Structure
- Keep directories organized by function
- Use consistent naming across templates
- Consider your team's conventions

### 4. Variable Usage
- Always provide sensible defaults for optional variables
- Use filters to ensure proper formatting
- Document any custom variables you add

## Sharing Templates

Since custom templates are gitignored, you can share them by:

1. **Team Repository**: Create a separate repo for shared templates
2. **Documentation**: Add templates to your team wiki
3. **Pull Request**: Submit useful templates to be added as built-in options

## Troubleshooting

### Templates Not Loading
```bash
# Check if custom file exists and is valid JSON
cat config/project-templates.json | jq .

# Check console output when running init_project
# Should see either:
# - "Loaded custom project templates"
# - "Loaded default project templates"
```

### Template Not Found
```javascript
// List all available templates
list_project_templates()

// Check exact template key
// Keys are case-sensitive
```

### Variables Not Replaced
- Check variable name matches exactly
- Ensure variable is provided in init_project parameters
- Verify syntax: `{{variableName}}` with double braces

### Validation Errors
- Project names must match validation pattern
- Dates must be in yyyy-MM-dd format
- Check validation rules in your template config

## Migration Guide

To migrate from defaults to custom templates:

1. Copy the default configuration:
   ```bash
   cp config/project-templates.default.json config/project-templates.json
   ```

2. Modify incrementally - test after each change

3. Remove templates you don't need

4. Add your custom templates

5. Test thoroughly before using in production

Remember: The system always falls back to defaults if your custom configuration fails to load.