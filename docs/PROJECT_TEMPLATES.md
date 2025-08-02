# Project Templates Documentation

## Overview

The Obsidian AI Curator's `init_project` tool uses a configurable template system that allows you to customize project structures for your specific needs. Templates are defined in `config/project-templates.json`.

> **Note**: For creating your own custom templates that won't be tracked by git, see [Custom Project Templates Configuration](CUSTOM_PROJECT_TEMPLATES.md). This guide covers modifying the default templates.

## Quick Start

### Using Templates

```javascript
// Use default template
init_project({
  projectName: "My Project",
  description: "Project description"
})

// Use minimal template
init_project({
  projectName: "Quick Project",
  description: "A simple project",
  template: "minimal"
})

// List available templates
list_project_templates()
```

## Template Configuration Structure

The configuration file has the following main sections:

### 1. Project Types
Define the types of projects you work with:

```json
"projectTypes": {
  "ai-agent": {
    "name": "AI Agent",
    "description": "AI-powered agent or assistant"
  },
  "custom-type": {
    "name": "Custom Type",
    "description": "Your custom project type"
  }
}
```

### 2. Phases
Define project lifecycle phases:

```json
"phases": {
  "planning": {
    "name": "Planning",
    "description": "Requirements gathering and design"
  },
  "custom-phase": {
    "name": "Custom Phase",
    "description": "Your custom phase"
  }
}
```

### 3. Validation Rules
Set validation rules for inputs:

```json
"validation": {
  "projectName": {
    "pattern": "^[a-zA-Z0-9\\s-]+$",
    "minLength": 3,
    "maxLength": 100,
    "errorMessage": "Project name can only contain letters, numbers, spaces, and hyphens"
  }
}
```

### 4. Templates
Define project structures:

```json
"templates": {
  "custom-template": {
    "name": "My Custom Template",
    "description": "Template for specific project type",
    
    "directories": [
      "Documents",
      "Code",
      "Tests"
    ],
    
    "files": [
      {
        "path": "README.md",
        "template": "custom-readme"
      },
      {
        "path": "Documents/{{projectName}} - Overview.md",
        "template": "custom-overview"
      }
    ]
  }
}
```

### 5. File Templates
Define content for each file:

```json
"fileTemplates": {
  "custom-readme": {
    "content": "# {{projectName}}\\n\\n## Description\\n{{description}}\\n\\nCreated: {{currentDate}}"
  }
}
```

## Template Variables

Available variables for use in templates:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{projectName}}` | Name of the project | "Email Automation" |
| `{{projectSlug}}` | URL-safe version of name | "email-automation" |
| `{{projectType}}` | Selected project type | "automation" |
| `{{description}}` | Project description | "Automated email system" |
| `{{phase}}` | Current project phase | "planning" |
| `{{currentDate}}` | Today's date (yyyy-MM-dd) | "2025-08-02" |
| `{{targetDate}}` | Target completion date | "2025-09-15" |
| `{{stakeholders}}` | Comma-separated list | "John, Jane" |
| `{{stakeholderList}}` | Formatted list | "- John\\n- Jane" |

### Variable Modifiers

- **Default values**: `{{variable|default value}}`
  - Example: `{{targetDate|TBD}}`
  
- **Filters**: `{{variable|filter}}`
  - `capitalize`: First letter uppercase
  - `uppercase`: All uppercase
  - `lowercase`: All lowercase
  - Example: `{{phase|capitalize}}`

## Creating Custom Templates

### Step 1: Plan Your Structure

Decide on:
- What directories you need
- What files to create
- What content each file should have

### Step 2: Add Template Definition

Edit `config/project-templates.json`:

```json
{
  "templates": {
    "my-template": {
      "name": "My Custom Template",
      "description": "For my specific workflow",
      
      "directories": [
        "Source",
        "Documentation",
        "Tests",
        "Meetings"
      ],
      
      "files": [
        {
          "path": "{{projectName}} - README.md",
          "template": "my-readme"
        },
        {
          "path": "Documentation/Setup.md",
          "template": "my-setup"
        }
      ]
    }
  }
}
```

### Step 3: Define File Templates

Add to `fileTemplates` section:

```json
{
  "fileTemplates": {
    "my-readme": {
      "content": "---\\ncreated: {{currentDate}}\\ntags:\\n  - project/{{projectSlug}}\\n---\\n# {{projectName}}\\n\\n{{description}}"
    },
    "my-setup": {
      "content": "# Setup Instructions\\n\\nProject: {{projectName}}\\nType: {{projectType}}\\n\\n## Requirements\\n- [Add requirements]"
    }
  }
}
```

### Step 4: Test Your Template

```javascript
// List templates to verify yours appears
list_project_templates()

// Create a test project
init_project({
  projectName: "Test Project",
  description: "Testing my template",
  template: "my-template"
})
```

## Advanced Examples

### Research Project Template

```json
{
  "templates": {
    "research": {
      "name": "Research Project",
      "description": "Academic research structure",
      
      "directories": [
        "Literature",
        "Data/Raw",
        "Data/Processed",
        "Analysis",
        "Figures",
        "Manuscripts"
      ],
      
      "files": [
        {
          "path": "{{projectName}} - Research Plan.md",
          "template": "research-plan"
        },
        {
          "path": "Literature/Bibliography.md",
          "template": "bibliography"
        },
        {
          "path": "Analysis/Methods.md",
          "template": "methods"
        }
      ]
    }
  }
}
```

### Software Development Template

```json
{
  "templates": {
    "software": {
      "name": "Software Project",
      "description": "Full software development structure",
      
      "directories": [
        "src",
        "tests",
        "docs",
        "config",
        "scripts",
        ".github/workflows"
      ],
      
      "files": [
        {
          "path": "README.md",
          "template": "software-readme"
        },
        {
          "path": "CONTRIBUTING.md",
          "template": "contributing"
        },
        {
          "path": ".gitignore",
          "template": "gitignore"
        },
        {
          "path": "docs/ARCHITECTURE.md",
          "template": "architecture"
        }
      ]
    }
  }
}
```

## Best Practices

### 1. Naming Conventions
- Use descriptive template keys: `software-dev` not `template1`
- Keep file template names clear: `project-readme` not `readme`

### 2. Directory Structure
- Start simple, add complexity as needed
- Group related content together
- Consider future growth

### 3. File Content
- Include helpful placeholders and examples
- Add TODO items for common tasks
- Link between related files
- Use consistent formatting

### 4. Variables
- Use meaningful default values
- Apply filters for proper formatting
- Document any custom variables

### 5. Validation
- Set reasonable length limits
- Use clear error messages
- Test edge cases

## Sharing Templates

To share your templates:

1. Export your `project-templates.json`
2. Document any special requirements
3. Include example usage
4. Consider creating a GitHub gist or repo

## Troubleshooting

### Template Not Found
- Check template key spelling
- Verify JSON syntax is valid
- Restart Claude/MCP server after changes

### Variables Not Replaced
- Check variable name spelling
- Ensure double curly braces: `{{var}}`
- Verify variable is provided

### Files Not Created
- Check file paths are valid
- Ensure directories exist or are created first
- Verify template references are correct

## FAQ

**Q: Can I use subdirectories in file paths?**
A: Yes, use paths like `Documents/Subfolder/file.md`

**Q: How do I include special characters in templates?**
A: Escape with backslash: `\\n` for newline, `\\"` for quotes

**Q: Can I conditionally create files?**
A: Not directly, but you can create multiple templates for different scenarios

**Q: How do I update existing templates?**
A: Edit `project-templates.json` and restart the MCP server

**Q: Can I use external template files?**
A: Currently templates must be in the JSON file, but you can use long multi-line strings

## Template Ideas

- **Blog Post**: Structure for blog writing projects
- **Course Development**: Online course creation
- **Client Project**: Client work with contracts and deliverables
- **Book Writing**: Chapters, research, and revision tracking
- **Event Planning**: Timeline, vendors, and logistics
- **Product Launch**: Marketing, development, and release planning