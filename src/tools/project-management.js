import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

/**
 * Project management tools
 */

export async function init_project(args) {
  const {
    projectName,
    description,
    projectType = 'other',
    template = 'default',
    targetDate,
    stakeholders = [],
    phase = 'planning'
  } = args;
  
  if (!projectName || !description) {
    throw new Error('projectName and description are required');
  }
  
  // Get vault path from config
  const configPath = path.join(process.cwd(), 'config', process.env.NODE_ENV === 'test' ? 'test-config.json' : 'config.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
  const vaultPath = config.vaultPath;
  
  // Create project folder
  const projectFolder = path.join('Projects', projectName);
  const projectPath = path.join(vaultPath, projectFolder);
  await fs.mkdir(projectPath, { recursive: true });
  
  // Create project index
  const indexContent = matter.stringify(`# ${projectName}

${description}

## Overview

- **Type**: ${projectType}
- **Phase**: ${phase}
- **Target Date**: ${targetDate || 'TBD'}
- **Created**: ${new Date().toISOString().split('T')[0]}

## Stakeholders

${stakeholders.map(s => `- ${s}`).join('\n') || '- TBD'}

## Quick Links

- [[${projectName} Planning]]
- [[${projectName} Tasks]]
- [[${projectName} Notes]]
- [[${projectName} Resources]]

## Status

Current phase: **${phase}**

### Recent Updates

- ${new Date().toISOString().split('T')[0]}: Project initialized

## Next Steps

1. Complete project planning
2. Define success criteria
3. Create task breakdown

`, {
    type: 'project-index',
    project: projectName,
    projectType,
    phase,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    tags: [`project/${projectType}`, 'project/active']
  });
  
  await fs.writeFile(path.join(projectPath, `${projectName}.md`), indexContent);
  
  // Create sub-pages based on template
  const pages = getTemplatePages(template, projectType);
  
  for (const page of pages) {
    const pageContent = matter.stringify(page.content.replace(/{{PROJECT_NAME}}/g, projectName), {
      type: page.type,
      project: projectName,
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      tags: page.tags
    });
    
    await fs.writeFile(
      path.join(projectPath, `${projectName} ${page.name}.md`),
      pageContent
    );
  }
  
  return {
    projectName,
    projectPath: projectFolder,
    filesCreated: pages.length + 1,
    template,
    structure: {
      index: `${projectName}.md`,
      pages: pages.map(p => `${projectName} ${p.name}.md`)
    }
  };
}

export async function list_project_templates(args = {}) {
  return {
    templates: [
      {
        id: 'default',
        name: 'Default Project',
        description: 'Basic project structure with planning, tasks, notes, and resources',
        pages: ['Planning', 'Tasks', 'Notes', 'Resources']
      },
      {
        id: 'ai-agent',
        name: 'AI Agent Project',
        description: 'Template for AI agent development with prompts, testing, and evaluation',
        pages: ['Planning', 'Tasks', 'Prompts', 'Testing', 'Evaluation', 'Resources']
      },
      {
        id: 'integration',
        name: 'Integration Project',
        description: 'Template for system integration projects with API docs and testing',
        pages: ['Planning', 'Tasks', 'Architecture', 'API Documentation', 'Testing', 'Resources']
      },
      {
        id: 'automation',
        name: 'Automation Project',
        description: 'Template for automation projects with workflows and monitoring',
        pages: ['Planning', 'Tasks', 'Workflows', 'Configuration', 'Monitoring', 'Resources']
      }
    ]
  };
}

export async function get_working_context(args) {
  const { scope, identifier, depth = 'preview', maxNotes = 10 } = args;
  
  if (!scope) {
    throw new Error('scope parameter is required');
  }
  
  // Get vault path from config
  const configPath = path.join(process.cwd(), 'config', process.env.NODE_ENV === 'test' ? 'test-config.json' : 'config.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
  const vaultPath = config.vaultPath;
  
  // This is a simplified implementation
  // In reality, this would analyze project relationships and provide relevant context
  
  switch (scope) {
    case 'project':
      if (!identifier) {
        throw new Error('identifier is required for project scope');
      }
      return {
        scope: 'project',
        identifier,
        context: `Working on project: ${identifier}`,
        relatedNotes: [],
        suggestions: ['Review project objectives', 'Check recent tasks']
      };
      
    case 'recent':
      return {
        scope: 'recent',
        context: 'Recent work context',
        relatedNotes: [],
        suggestions: ['Continue where you left off']
      };
      
    default:
      return {
        scope,
        context: 'General context',
        relatedNotes: [],
        suggestions: []
      };
  }
}

// Helper function to get template pages
function getTemplatePages(template, projectType) {
  const basePages = [
    {
      name: 'Planning',
      type: 'project-planning',
      tags: ['project/planning'],
      content: `# {{PROJECT_NAME}} Planning

## Goals & Objectives

### Primary Goals
1. 

### Success Criteria
- 

## Scope

### In Scope
- 

### Out of Scope
- 

## Timeline

### Milestones
- 

### Key Dates
- 

## Risks & Mitigation

### Identified Risks
1. 

### Mitigation Strategies
- 

`
    },
    {
      name: 'Tasks',
      type: 'project-tasks',
      tags: ['project/tasks'],
      content: `# {{PROJECT_NAME}} Tasks

## Current Sprint

### In Progress
- [ ] 

### Todo
- [ ] 

### Blocked
- [ ] 

## Backlog

### High Priority
- [ ] 

### Medium Priority
- [ ] 

### Low Priority
- [ ] 

## Completed

### This Week
- [x] 

`
    },
    {
      name: 'Notes',
      type: 'project-notes',
      tags: ['project/notes'],
      content: `# {{PROJECT_NAME}} Notes

## Meeting Notes

## Research

## Ideas & Insights

## Questions

`
    },
    {
      name: 'Resources',
      type: 'project-resources',
      tags: ['project/resources'],
      content: `# {{PROJECT_NAME}} Resources

## Documentation

## Tools & Technologies

## References

## Contacts

`
    }
  ];
  
  // Add template-specific pages
  if (template === 'ai-agent' || projectType === 'ai-agent') {
    basePages.push(
      {
        name: 'Prompts',
        type: 'project-prompts',
        tags: ['project/prompts', 'ai/prompts'],
        content: `# {{PROJECT_NAME}} Prompts

## System Prompts

## User Prompts

## Test Cases

`
      },
      {
        name: 'Evaluation',
        type: 'project-evaluation',
        tags: ['project/evaluation', 'ai/evaluation'],
        content: `# {{PROJECT_NAME}} Evaluation

## Metrics

## Test Results

## Performance Analysis

`
      }
    );
  }
  
  return basePages;
}