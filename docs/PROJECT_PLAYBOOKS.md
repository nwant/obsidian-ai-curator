# Project Playbooks Documentation

This guide explains how to use and customize project playbooks for the `init_project` tool.

> **Note on Backward Compatibility**: Previous versions used "templates" terminology. The system still supports the old "templates" key in configuration files for backward compatibility, but "playbooks" is now the preferred term.

## Quick Start

### Using Built-in Playbooks

Ask Claude to create projects:

**Default playbook** (comprehensive structure):
- "Create a new project called 'My AI Assistant' for building a helpful AI"

**Minimal playbook** (just essentials):
- "Set up a minimal project called 'Quick Experiment'"

**Research playbook** (academic structure):
- "Initialize a research project about machine learning patterns"

**See available playbooks**:
- "What project playbooks are available?"

### Built-in Playbooks

1. **default** - Standard project structure with README and documentation folder
2. **minimal** - Minimal structure with just a README file
3. **structured** - More organized structure with planning, development, and meeting folders

## Creating Custom Playbooks

You can create your own playbooks without modifying the repository:

### Setup

1. **Copy the example configuration**:
   ```bash
   cp config/project-playbooks.example.json config/project-playbooks.json
   ```

2. **Edit your custom configuration**:
   ```bash
   # Edit with your preferred editor
   vim config/project-playbooks.json
   ```

3. **Your custom file is gitignored** - It won't be tracked or committed

### How It Works

- System tries to load `config/project-playbooks.json` first (your custom playbooks)
- Falls back to `config/project-playbooks.default.json` if custom doesn't exist
- Custom playbooks completely replace defaults (they don't merge)
- Supports graceful error recovery - if configs are invalid, falls back to minimal hardcoded playbook

## Playbook Configuration Structure

### Top-Level Structure

```json
{
  "version": "2.0",
  "description": "Your custom project playbooks",
  
  "projectTypes": { ... },      // Types of projects
  "phases": { ... },           // Project lifecycle phases  
  "validation": { ... },       // Input validation rules
  "playbooks": { ... },        // Playbook definitions
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

### Playbook Definitions

Define your project playbooks:

```json
"playbooks": {
  "my-playbook": {
    "name": "My Custom Playbook",
    "description": "Playbook for my specific workflow",
    
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

File templates define the content of files created by playbooks. You can define file templates in two ways:

#### Method 1: Inline Content
Embed the template content directly in the JSON:

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

#### Method 2: File Reference
Reference a template file in your vault:

```json
"fileTemplates": {
  "my-readme": {
    "file": "Templates/Project README.md"
  },
  "my-meeting-template": {
    "file": "/absolute/path/to/template.md"
  },
  "api-docs": {
    "file": "Meta/Templates/API Documentation.md"
  }
}
```

**File Reference Notes**:
- Paths are relative to your vault root unless they start with `/`
- The referenced file can use all the same variables ({{projectName}}, etc.)
- Easier to maintain large templates in separate files
- Can use your existing Obsidian templates

#### Choosing Between Methods

**Use Inline Content when**:
- Templates are small and simple
- You want everything in one configuration file
- Templates are specific to project initialization

**Use File References when**:
- Templates are large or complex
- You want to edit templates in Obsidian with syntax highlighting
- You already have template files in your vault
- You want to share templates between different tools
- You need version control for template files separately

#### Mixed Approach Example

You can mix both methods in the same configuration:

```json
"fileTemplates": {
  "readme": {
    "content": "# {{projectName}}\n\n{{description}}"  // Simple, inline
  },
  "complex-template": {
    "file": "Templates/Complex Project Template.md"    // Complex, external
  }
}
```

## Template Variables

Available variables for use in playbook templates:

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

## Complete Example: API Microservice Playbook

```json
{
  "playbooks": {
    "api-microservice": {
      "name": "API Microservice Playbook",
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
    
    "api-readme": {
      "file": "Templates/API README.md"
    },
    
    "api-index": {
      "content": "const express = require('express');\nconst app = express();\nconst PORT = process.env.PORT || 3000;\n\n// Middleware\napp.use(express.json());\n\n// Health check\napp.get('/health', (req, res) => {\n  res.json({ \n    status: 'healthy',\n    service: '{{projectSlug}}',\n    version: '0.1.0'\n  });\n});\n\n// Start server\napp.listen(PORT, () => {\n  console.log(`{{projectName}} running on port ${PORT}`);\n});\n"
    },
    
    "api-docs": {
      "file": "Meta/Templates/API Documentation Template.md"
    },
    
    "api-env": {
      "content": "PORT=3000\nNODE_ENV=development\nDATABASE_URL=\nAPI_KEY=\n"
    }
  }
}
```

## Best Practices

### 1. Evergreen Playbooks
Follow the v2 pattern for evergreen instructions:
- **CLAUDE.md**: Contains ALL dynamic content (dates, status, stakeholders)
- **PROJECT_INSTRUCTIONS.md**: Contains ONLY static workflows
- This ensures Claude Desktop instructions never need updating

### 2. Naming Conventions
- Use descriptive playbook keys: `api-microservice`, `ml-experiment`, `frontend-app`
- Use consistent file template names: `component-readme`, `component-claude`

### 3. Directory Structure
- Keep directories organized by function
- Use consistent naming across playbooks
- Consider your team's conventions

### 4. Variable Usage
- Always provide sensible defaults for optional variables
- Use filters to ensure proper formatting
- Document any custom variables you add

## Sharing Playbooks

Since custom playbooks are gitignored, you can share them by:

1. **Team Repository**: Create a separate repo for shared playbooks
2. **Documentation**: Add playbooks to your team wiki
3. **Pull Request**: Submit useful playbooks to be added as built-in options

## Troubleshooting

### Playbooks Not Loading
```bash
# Check if custom file exists and is valid JSON
cat config/project-playbooks.json | jq .

# Check console output when running init_project
# Should see either:
# - "No custom playbooks config found, using defaults"
# - "Using deprecated 'templates' key in config"
# - Warnings about configuration issues
```

### Playbook Not Found

Ask Claude:
- "List all available project playbooks"
- "What playbooks can I use for projects?"

Note: Playbook keys are case-sensitive.

### Variables Not Replaced
- Check variable name matches exactly
- Ensure variable is provided in init_project parameters
- Verify syntax: `{{variableName}}` with double braces

### Validation Errors
- Project names must match validation pattern
- Dates must be in yyyy-MM-dd format
- Check validation rules in your playbook config

## Migration Guide

### From Templates to Playbooks (v1.0 to v2.0)

If you have existing custom templates:
1. Rename the "templates" key to "playbooks" in your config
2. Update version to "2.0"
3. The system will still accept "templates" for backward compatibility

### To Create Custom Playbooks

1. Copy the example configuration:
   ```bash
   cp config/project-playbooks.example.json config/project-playbooks.json
   ```

2. Modify incrementally - test after each change

3. Remove playbooks you don't need

4. Add your custom playbooks

5. Test thoroughly before using in production

Remember: The system has multiple fallback levels:
1. Custom playbooks (project-playbooks.json)
2. Default playbooks (project-playbooks.default.json)
3. Minimal hardcoded playbook (if all configs fail)

This ensures your projects can always be created, even with configuration issues.