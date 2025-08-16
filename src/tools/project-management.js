import { loadConfig } from '../utils/config-loader.js';
import { ProjectInitializer } from './project-init.js';
import { initProject as simpleInit, listStarters } from './simple-project-init.js';

/**
 * Project management tools - wrapper functions for MCP compatibility
 * 
 * Now uses simplified implementation by default.
 * Complex playbook system still available via useComplexPlaybooks flag.
 */

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
