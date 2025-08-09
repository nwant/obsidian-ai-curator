import fs from 'fs/promises';
import { loadConfig, getVaultPath } from '../utils/config-loader.js';
import path from 'path';
import matter from 'gray-matter';
import { ProjectInitializer } from './project-init.js';

/**
 * Project management tools - wrapper functions for MCP compatibility
 */

// ProjectManager class for test compatibility
export class ProjectManager {
  constructor(config) {
    this.config = config;
    this.vaultPath = config.vaultPath;
    this.projectsFolder = config.projectsFolder || 'Projects';
    this.templates = config.templates || this.getDefaultTemplates();
    this.projectInitializer = new ProjectInitializer(config);
  }

  getDefaultTemplates() {
    return {
      default: {
        name: 'Default Template',
        description: 'Basic project template',
        structure: {
          'Index.md': `# {{projectName}}

## Overview
{{description}}

## Status
- **Phase**: {{phase}}
- **Status**: {{status}}
- **Target Date**: {{targetDate}}

## Stakeholders
{{#stakeholders}}
- {{.}}
{{/stakeholders}}`,
          'Tasks.md': '# Tasks\n\n## Todo\n- [ ] ',
          'Notes.md': '# Notes\n\n',
          'Resources.md': '# Resources\n\n## Links\n\n## Documents'
        }
      },
      'ai-agent': {
        name: 'AI Agent Template',
        description: 'Template for AI agent projects',
        structure: {
          'Index.md': `# {{projectName}}

## Overview
{{description}}

## Status
- **Phase**: {{phase}}
- **Status**: {{status}}
- **Target Date**: {{targetDate}}`,
          'Requirements.md': '# Requirements\n\n## Functional Requirements\n\n## Technical Requirements',
          'Prompts.md': '# Prompts\n\n## System Prompts\n\n## User Prompts',
          'Testing.md': '# Testing\n\n## Test Cases\n\n## Results'
        }
      }
    };
  }

  async initProject(args) {
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
    
    const vaultPath = this.vaultPath;
    
    // Create project folder
    const projectFolder = path.join(this.projectsFolder, projectName);
    const projectPath = path.join(vaultPath, projectFolder);
    
    // Check if project already exists
    try {
      await fs.access(projectPath);
      throw new Error(`Project "${projectName}" already exists`);
    } catch (error) {
      if (error.message.includes('already exists')) {
        throw error;
      }
      // Path doesn't exist, which is what we want
    }
    
    await fs.mkdir(projectPath, { recursive: true });
    
    // Use template if available
    // If template is default but projectType is a valid template, use projectType
    let templateToUse = template;
    if (template === 'default' && this.templates[projectType]) {
      templateToUse = projectType;
    }
    const selectedTemplate = this.templates[templateToUse];
    if (selectedTemplate && selectedTemplate.structure) {
      const createdFiles = [];
      
      // Create files from template
      for (const [filename, content] of Object.entries(selectedTemplate.structure)) {
        const filePath = path.join(projectPath, filename);
        const relativePath = path.join(projectFolder, filename);
        
        const processedContent = this.processTemplate(content, {
          projectName,
          description,
          phase,
          status: args.status || 'Active',
          targetDate: targetDate || 'TBD',
          stakeholders
        });
        
        // If this is the Index.md file, add frontmatter with metadata
        if (filename === 'Index.md') {
          const contentWithFrontmatter = matter.stringify(processedContent, {
            type: projectType,
            status: args.status || 'Active',
            phase,
            description,
            created: new Date().toISOString(),
            targetDate: targetDate || null
          });
          await fs.writeFile(filePath, contentWithFrontmatter, 'utf-8');
        } else {
          await fs.writeFile(filePath, processedContent, 'utf-8');
        }
        createdFiles.push(relativePath);
      }
      
      return {
        success: true,
        projectPath: projectFolder,
        message: `Project "${projectName}" created successfully with ${templateToUse} template`,
        filesCreated: createdFiles.length,
        created: createdFiles
      };
    }
    
    // Default project creation if no template
    const indexContent = `# ${projectName}\n\n${description}\n\n## Status\n- Phase: ${phase}\n- Created: ${new Date().toISOString().split('T')[0]}`;
    const indexPath = path.join(projectPath, 'Index.md');
    
    const contentWithFrontmatter = matter.stringify(indexContent, {
      type: projectType,
      status: args.status || 'Active',
      phase,
      description,
      created: new Date().toISOString(),
      targetDate: targetDate || null
    });
    
    await fs.writeFile(indexPath, contentWithFrontmatter, 'utf-8');
    
    return {
      success: true,
      projectPath: projectFolder,
      message: `Project "${projectName}" created successfully with default template`,
      filesCreated: 1,
      created: [path.join(projectFolder, 'Index.md')]
    };
  }

  listTemplates() {
    const templates = [];
    
    for (const [key, template] of Object.entries(this.templates)) {
      templates.push({
        id: key,
        name: template.name || key,
        description: template.description || `${key} template`,
        structure: template.structure ? Object.keys(template.structure) : []
      });
    }
    
    return templates;
  }

  getTemplate(templateId) {
    const template = this.templates[templateId];
    if (!template) {
      throw new Error(`Template "${templateId}" not found`);
    }
    return {
      id: templateId,
      name: template.name || templateId,
      description: template.description || `${templateId} template`,
      structure: template.structure || {}
    };
  }

  validateTemplate(template) {
    if (!template || typeof template !== 'object') {
      return false;
    }
    if (!template.name || typeof template.name !== 'string') {
      return false;
    }
    if (!template.structure || typeof template.structure !== 'object') {
      return false;
    }
    return true;
  }

  async getWorkingContext(args) {
    return get_working_context({
      ...args,
      vaultPath: this.vaultPath
    });
  }

  async listProjects(filters = {}) {
    const projectsPath = path.join(this.vaultPath, this.projectsFolder);
    
    const findProjects = async (searchDir, relativePath = '') => {
      const projects = [];
      
      try {
        const entries = await fs.readdir(searchDir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const fullPath = path.join(searchDir, entry.name);
            const projectRelativePath = relativePath ? path.join(relativePath, entry.name) : entry.name;
            const indexPath = path.join(fullPath, 'Index.md');
            
            // Check if this directory has an Index.md (indicating it's a project)
            try {
              await fs.access(indexPath);
              
              let metadata = { name: projectRelativePath };
              try {
                const content = await fs.readFile(indexPath, 'utf-8');
                const parsed = matter(content);
                metadata = { ...metadata, ...parsed.data };
              } catch {
                // No index file or parsing error
              }
              
              // Apply filters
              if (filters.status && metadata.status !== filters.status) continue;
              if (filters.type && metadata.type !== filters.type) continue;
              
              projects.push({
                name: projectRelativePath,
                path: path.join(this.projectsFolder, projectRelativePath),
                ...(filters.includeMetadata ? { metadata } : {})
              });
            } catch {
              // No Index.md, check subdirectories
              const subProjects = await findProjects(fullPath, projectRelativePath);
              projects.push(...subProjects);
            }
          }
        }
      } catch (error) {
        // Directory doesn't exist or can't be read
      }
      
      return projects;
    };
    
    return await findProjects(projectsPath);
  }

  async getProject(projectName) {
    const projectPath = path.join(this.vaultPath, this.projectsFolder, projectName);
    
    try {
      await fs.access(projectPath);
      const indexPath = path.join(projectPath, 'Index.md');
      
      try {
        const content = await fs.readFile(indexPath, 'utf-8');
        const parsed = matter(content);
        
        // Get list of files in the project
        const files = await fs.readdir(projectPath);
        
        return {
          name: projectName,
          path: path.join(this.projectsFolder, projectName),
          content: parsed.content,
          metadata: parsed.data,
          exists: true,
          files
        };
      } catch {
        const files = await fs.readdir(projectPath);
        return {
          name: projectName,
          path: path.join(this.projectsFolder, projectName),
          exists: true,
          metadata: {},
          files
        };
      }
    } catch {
      throw new Error(`Project "${projectName}" not found`);
    }
  }

  async updateProject(projectName, updates) {
    const project = await this.getProject(projectName);
    const indexPath = path.join(this.vaultPath, project.path, 'Index.md');
    
    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      const parsed = matter(content);
      
      const newMetadata = { ...parsed.data, ...updates };
      const newContent = matter.stringify(parsed.content, newMetadata);
      
      await fs.writeFile(indexPath, newContent, 'utf-8');
      
      return {
        success: true,
        projectName,
        updated: Object.keys(updates)
      };
    } catch (error) {
      throw new Error(`Failed to update project: ${error.message}`);
    }
  }

  async addProjectFile(projectName, fileName, content = '', metadata = {}) {
    const project = await this.getProject(projectName);
    const filePath = path.join(this.vaultPath, project.path, fileName);
    
    // Create subdirectories if needed
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    
    const fileContent = matter.stringify(content, {
      project: projectName,
      created: new Date().toISOString(),
      ...metadata
    });
    
    await fs.writeFile(filePath, fileContent, 'utf-8');
    
    // Update project index with link
    const indexPath = path.join(this.vaultPath, project.path, 'Index.md');
    try {
      const indexContent = await fs.readFile(indexPath, 'utf-8');
      const linkName = path.basename(fileName, '.md');
      const newLink = `- [[${linkName}]]`;
      
      if (!indexContent.includes(newLink)) {
        const updatedContent = indexContent + `\n${newLink}`;
        await fs.writeFile(indexPath, updatedContent, 'utf-8');
      }
    } catch {
      // Index doesn't exist or can't be updated
    }
    
    return {
      success: true,
      projectName,
      fileName,
      path: path.join(project.path, fileName)
    };
  }

  async archiveProject(projectName) {
    const project = await this.getProject(projectName);
    const sourcePath = path.join(this.vaultPath, project.path);
    const archivePath = path.join(this.vaultPath, 'Projects/Archive', projectName);
    
    // Create archive directory
    await fs.mkdir(path.dirname(archivePath), { recursive: true });
    
    // Move project to archive
    await fs.rename(sourcePath, archivePath);
    
    // Update project status
    const indexPath = path.join(archivePath, 'Index.md');
    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      const parsed = matter(content);
      parsed.data.status = 'archived';
      parsed.data.archivedDate = new Date().toISOString();
      
      const newContent = matter.stringify(parsed.content, parsed.data);
      await fs.writeFile(indexPath, newContent, 'utf-8');
    } catch {
      // Can't update index
    }
    
    return {
      success: true,
      projectName,
      archivedPath: path.join('Projects/Archive', projectName)
    };
  }

  processTemplate(template, variables) {
    let result = template;
    
    // Simple variable substitution
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value);
    }
    
    // Handle arrays (simplified handlebars-like syntax)
    result = result.replace(/{{#(\w+)}}([\s\S]*?){{\/\1}}/g, (match, arrayName, content) => {
      const arrayValue = variables[arrayName];
      if (Array.isArray(arrayValue)) {
        return arrayValue.map(item => content.replace(/{{\.}}/g, item)).join('\n');
      }
      return '';
    });
    
    // Handle missing variables
    result = result.replace(/{{(\w+)}}/g, (match, varName) => {
      return variables[varName] || '';
    });
    
    // Handle dates
    result = result.replace(/{{date}}/g, new Date().toISOString().split('T')[0]);
    
    return result;
  }

  async validateProjectName(projectName) {
    if (!projectName || typeof projectName !== 'string') {
      throw new Error('Project name must be a non-empty string');
    }
    
    if (projectName.includes('/') || projectName.includes('\\')) {
      throw new Error('Project name cannot contain path separators');
    }
    
    if (projectName.includes('..')) {
      throw new Error('Project name cannot contain directory traversal');
    }
    
    return true;
  }
}

export async function init_project(args) {
  // Get vault path from config
  const config = await loadConfig();
  
  // Create project initializer instance
  const initializer = new ProjectInitializer(config);
  
  // Handle backward compatibility - rename 'template' to 'playbook'
  if (args.template && !args.playbook) {
    args.playbook = args.template;
  }
  
  // Call the new initializer
  return await initializer.initProject(args);
}

export async function list_project_templates(args = {}) {
  // Get vault path from config
  const config = await loadConfig();
  
  // Create project initializer instance
  const initializer = new ProjectInitializer(config);
  
  // List playbooks and format for backward compatibility
  const result = await initializer.listPlaybooks();
  
  // Return both old format (templates) and new format (playbooks) for compatibility
  return {
    playbooks: result.playbooks,
    templates: result.playbooks.map(p => ({
      id: p.key,
      name: p.name,
      description: p.description,
      directories: p.directories,
      files: p.files
    }))
  };
}

// Alias for new naming convention
export async function list_playbooks(args = {}) {
  return list_project_templates(args);
}

export async function get_working_context(args) {
  const { scope, identifier, depth = 'preview', maxNotes = 10 } = args;
  
  if (!scope) {
    throw new Error('scope parameter is required');
  }
  
  // Get vault path from config
  const vaultPath = await getVaultPath();
  
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