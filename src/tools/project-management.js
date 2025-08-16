import { loadConfig } from '../utils/config-loader.js';
import { ProjectInitializer } from './project-init.js';
import { initProject as simpleInit, listStarters } from './simple-project-init.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Project management tools - wrapper functions for MCP compatibility
 * 
 * Now uses simplified implementation by default.
 * Complex playbook system still available via useComplexPlaybooks flag.
 */

/**
 * ProjectManager class for backward compatibility with tests
 * @stub - Basic implementation for test compatibility
 */
export class ProjectManager {
  constructor(config) {
    this.config = config;
    this.vaultPath = config.vaultPath;
    this.projectsFolder = config.projectsFolder || 'Projects';
    this.templates = config.templates || {
      default: {
        name: 'Default Template',
        structure: {
          'Index.md': '# {{projectName}}\n\n## Overview\n{{description}}'
        }
      }
    };
  }
  
  async initProject(args) {
    const { projectName, description, template = 'default', targetDate, stakeholders } = args;
    
    // Get template
    const tmpl = this.templates[template];
    if (!tmpl) {
      throw new Error(`Template not found: ${template}`);
    }
    
    // Create project path
    const projectPath = path.join(this.projectsFolder, projectName);
    const fullPath = path.join(this.vaultPath, projectPath);
    
    // Check if exists
    try {
      await fs.access(fullPath);
      throw new Error(`Project already exists: ${projectName}`);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    
    // Create directory
    await fs.mkdir(fullPath, { recursive: true });
    
    // Process templates
    const created = [];
    for (const [file, content] of Object.entries(tmpl.structure)) {
      let processedContent = content
        .replace(/{{projectName}}/g, projectName)
        .replace(/{{description}}/g, description || '')
        .replace(/{{phase}}/g, 'planning')
        .replace(/{{status}}/g, 'active')
        .replace(/{{targetDate}}/g, targetDate || 'TBD');
      
      // Handle stakeholders with simple replacement
      if (stakeholders && stakeholders.length > 0) {
        const stakeholderList = stakeholders.map(s => `- ${s}`).join('\n');
        processedContent = processedContent.replace(/{{#stakeholders}}[\s\S]*?{{\/stakeholders}}/g, stakeholderList);
      } else {
        processedContent = processedContent.replace(/{{#stakeholders}}[\s\S]*?{{\/stakeholders}}/g, '');
      }
      
      const filePath = path.join(fullPath, file);
      await fs.writeFile(filePath, processedContent, 'utf8');
      created.push(path.join(projectPath, file));
    }
    
    return {
      success: true,
      projectPath,
      created,
      message: `Project "${projectName}" created successfully`
    };
  }
  
  async listProjects(args = {}) {
    const projectsPath = path.join(this.vaultPath, this.projectsFolder);
    
    try {
      const entries = await fs.readdir(projectsPath, { withFileTypes: true });
      const projects = entries.filter(e => e.isDirectory()).map(e => ({
        name: e.name,
        path: path.join(this.projectsFolder, e.name),
        status: args.status || 'active'
      }));
      
      if (args.status) {
        return projects.filter(p => p.status === args.status);
      }
      
      return projects;
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
  }
}

/**
 * Initialize a new project
 * 
 * @param {Object} args - Project initialization arguments
 * @param {string} args.projectName - Name of the project
 * @param {string} args.description - Project description
 * @param {string} [args.playbook] - Starter template to use (backward compat)
 * @param {string} [args.starter] - Starter template to use (new name)
 * @param {boolean} [args.useComplexPlaybooks] - Use the complex playbook system
 */
export async function init_project(args) {
  // Check if user explicitly wants complex playbooks
  if (args.useComplexPlaybooks || args.repository || args.repositories) {
    // Use complex system for multi-repo or explicit request
    const config = await loadConfig();
    const initializer = new ProjectInitializer(config);
    return await initializer.initProject(args);
  }
  
  // Use simple system by default
  // Map "playbook" to "starter" for backward compatibility
  const starter = args.starter || args.playbook || 'default';
  
  return await simpleInit({
    projectName: args.projectName,
    description: args.description,
    starter: starter,
    targetDate: args.targetDate
  });
}

/**
 * List available project templates/playbooks
 */
export async function list_project_templates() {
  // Return simple starters by default
  const { starters } = await listStarters();
  
  // Format for backward compatibility
  return {
    playbooks: starters.map(s => ({
      key: s.key,
      name: s.name,
      description: s.description,
      directories: 2, // Documentation and Resources
      files: 1 // Just the main file
    }))
  };
}

/**
 * Alias for list_project_templates (new name)
 */
export async function list_playbooks() {
  return await list_project_templates();
}

/**
 * Get system info - shows which implementation is active
 */
export async function getProjectSystemInfo() {
  const config = await loadConfig();
  
  return {
    mode: config.useComplexPlaybooks ? 'complex' : 'simple',
    message: config.useComplexPlaybooks ? 
      'Using complex playbook system with multi-repo support' :
      'Using simplified starter system (default)',
    features: config.useComplexPlaybooks ? 
      ['Multi-repository', 'Validation', 'Fallback system', 'Variable substitution'] :
      ['Simple starters', 'Basic variables', 'Minimal structure'],
    recommendation: 'Simple mode recommended for most projects'
  };
}
