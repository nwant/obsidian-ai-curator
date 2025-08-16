import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * ProjectInitializer class for creating projects with playbooks and repository integration
 */
export class ProjectInitializer {
  constructor(config) {
    this.config = config;
    this.vaultPath = config.vaultPath;
    this.projectsFolder = config.projectsFolder || 'Projects';
    this.playbooksConfigPath = path.join(__dirname, '..', '..', 'config', 
      process.env.NODE_ENV === 'test' ? 'project-playbooks.default.json' : 
      (config.playbooksConfig || 'project-playbooks.default.json'));
  }

  /**
   * Load playbooks configuration with graceful fallback
   */
  async loadPlaybooks() {
    let config = null;
    const warnings = [];
    
    // Try to load user's custom playbooks first
    const customPath = path.join(__dirname, '..', '..', 'config', 'project-playbooks.json');
    try {
      const customConfig = await fs.readFile(customPath, 'utf-8');
      config = JSON.parse(customConfig);
      
      // Validate and potentially fix the config
      const validation = this.validatePlaybookConfig(config);
      if (!validation.isValid) {
        warnings.push(`Custom config validation issues: ${validation.errors.join(', ')}`);
        if (!validation.canRecover) {
          config = null;
          warnings.push('Falling back to default configuration');
        }
      }
    } catch (e) {
      // Custom config doesn't exist or is invalid - this is normal
      if (process.env.NODE_ENV !== 'test') {
        console.warn('No custom playbooks config found, using defaults');
      }
    }
    
    // Try default config if custom failed or doesn't exist
    if (!config) {
      try {
        const defaultConfig = await fs.readFile(this.playbooksConfigPath, 'utf-8');
        config = JSON.parse(defaultConfig);
        
        const validation = this.validatePlaybookConfig(config);
        if (!validation.isValid && !validation.canRecover) {
          warnings.push(`Default config validation issues: ${validation.errors.join(', ')}`);
          config = null;
        }
      } catch (error) {
        warnings.push(`Failed to load default config: ${error.message}`);
        config = null;
      }
    }
    
    // Final fallback - hardcoded minimal config
    if (!config) {
      warnings.push('Using hardcoded fallback configuration');
      config = this.getMinimalFallbackConfig();
    }
    
    // Support backward compatibility - "templates" to "playbooks"
    if (!config.playbooks && config.templates) {
      if (process.env.NODE_ENV !== 'test') {
        console.warn('⚠️  Using deprecated "templates" key in config. Please rename to "playbooks".');
      }
      config.playbooks = config.templates;
      delete config.templates;
    }
    
    // Store warnings for later retrieval
    this.configWarnings = warnings;
    
    return config;
  }
  
  /**
   * Validate playbook configuration structure
   */
  validatePlaybookConfig(config) {
    const errors = [];
    let canRecover = true;
    
    if (!config || typeof config !== 'object') {
      errors.push('Config is not a valid object');
      return { isValid: false, canRecover: false, errors };
    }
    
    // Check for either playbooks or templates (backward compatibility)
    if (!config.playbooks && !config.templates) {
      errors.push('Missing "playbooks" or "templates" key');
      canRecover = false;
    }
    
    const playbooks = config.playbooks || config.templates || {};
    
    // Validate each playbook has required fields
    for (const [key, playbook] of Object.entries(playbooks)) {
      if (!playbook.name) {
        errors.push(`Playbook "${key}" missing name`);
      }
      if (!playbook.description) {
        errors.push(`Playbook "${key}" missing description`);
      }
      
      // Directories and files are optional but should be arrays if present
      if (playbook.directories && !Array.isArray(playbook.directories)) {
        errors.push(`Playbook "${key}" directories must be an array`);
        canRecover = false;
      }
      if (playbook.files && !Array.isArray(playbook.files)) {
        errors.push(`Playbook "${key}" files must be an array`);
        canRecover = false;
      }
    }
    
    // Check for file templates if files are defined
    if (config.fileTemplates) {
      const allTemplateRefs = new Set();
      for (const playbook of Object.values(playbooks)) {
        if (playbook.files) {
          playbook.files.forEach(f => allTemplateRefs.add(f.template));
        }
      }
      
      for (const templateRef of allTemplateRefs) {
        if (templateRef && !config.fileTemplates[templateRef]) {
          errors.push(`Missing file template: "${templateRef}"`);
        }
      }
    }
    
    return {
      isValid: errors.length === 0,
      canRecover,
      errors
    };
  }
  
  /**
   * Get minimal fallback configuration
   */
  getMinimalFallbackConfig() {
    return {
      version: "2.0",
      description: "Minimal fallback configuration",
      playbooks: {
        default: {
          name: "Basic Project",
          description: "A basic project structure",
          directories: ["Documentation", "Resources"],
          files: []
        }
      },
      fileTemplates: {}
    };
  }

  /**
   * List available playbooks
   */
  async listPlaybooks() {
    const config = await this.loadPlaybooks();
    const playbooks = config.playbooks || {};
    
    return {
      playbooks: Object.entries(playbooks).map(([key, playbook]) => ({
        key,
        name: playbook.name,
        description: playbook.description,
        directories: playbook.directories?.length || 0,
        files: playbook.files?.length || 0
      }))
    };
  }

  /**
   * Initialize a new project with playbook and optional repository integration
   */
  async initProject(params) {
    const {
      projectName,
      description,
      playbook = 'default',
      repository,  // Single repo (backward compatible)
      repositories,  // Multiple repos (new feature)
      localPath,   // For single repo
      targetDate,
      stakeholders = [],
      phase = 'planning'
    } = params;

    if (!projectName || !description) {
      throw new Error('projectName and description are required');
    }

    // Load playbooks configuration
    const playbooksConfig = await this.loadPlaybooks();
    const selectedPlaybook = playbooksConfig.playbooks?.[playbook];
    
    if (!selectedPlaybook) {
      const availablePlaybooks = Object.keys(playbooksConfig.playbooks || {}).join(', ');
      throw new Error(`Playbook '${playbook}' not found. Available playbooks: ${availablePlaybooks || 'none'}`);
    }
    
    // Log what we're creating (not in test mode)
    if (process.env.NODE_ENV !== 'test') {
      console.log(`\n📚 Creating project "${projectName}" with playbook "${selectedPlaybook.name}"`);
      if (this.configWarnings && this.configWarnings.length > 0) {
        console.warn('⚠️  Configuration warnings:');
        this.configWarnings.forEach(w => console.warn(`   - ${w}`));
      }
    }

    // Handle repository configuration - support both single and multi-repo
    let repoConfig = {};
    
    if (repositories && typeof repositories === 'object') {
      // Multi-repo configuration
      repoConfig = repositories;
    } else if (repository) {
      // Single repo (backward compatible)
      repoConfig = {
        main: {
          url: repository,
          local: localPath || this.inferLocalPath(repository, projectName),
          branch: 'main',
          purpose: 'Main project repository'
        }
      };
    }

    // Create project folder structure
    const projectFolder = path.join(this.projectsFolder, projectName);
    const projectPath = path.join(this.vaultPath, projectFolder);
    
    // Check if project already exists
    try {
      await fs.access(projectPath);
      throw new Error(`Project "${projectName}" already exists`);
    } catch (error) {
      if (error.message.includes('already exists')) {
        throw error;
      }
      // Path doesn't exist, which is what we want - continue
    }
    
    await fs.mkdir(projectPath, { recursive: true });

    // Create directories from playbook
    if (selectedPlaybook.directories) {
      for (const dir of selectedPlaybook.directories) {
        await fs.mkdir(path.join(projectPath, dir), { recursive: true });
      }
    }

    // Add Implementation folder structure for repositories
    if (Object.keys(repoConfig).length > 0) {
      await fs.mkdir(path.join(projectPath, 'Implementation'), { recursive: true });
      
      // Create subfolder for each repository
      for (const repoKey of Object.keys(repoConfig)) {
        await fs.mkdir(path.join(projectPath, 'Implementation', repoKey), { recursive: true });
        
        // Create README for each repo folder
        const repoReadme = `# ${repoKey} Repository

**Purpose**: ${repoConfig[repoKey].purpose || 'Repository implementation'}
**GitHub**: ${repoConfig[repoKey].url || 'Not configured'}
**Local**: ${repoConfig[repoKey].local || 'Not configured'}

## Structure

This folder contains references and documentation for the ${repoKey} repository.

## Quick Links

- [GitHub Repository](${repoConfig[repoKey].url || '#'})
- Local Path: \`${repoConfig[repoKey].local || 'Not configured'}\`

## Implementation Notes

Add implementation notes and code references here.
`;
        await fs.writeFile(
          path.join(projectPath, 'Implementation', repoKey, 'README.md'),
          repoReadme
        );
      }
    }

    // Prepare template variables
    const currentDate = new Date().toISOString().split('T')[0];
    const templateVars = {
      projectName,
      description,
      phase,
      targetDate: targetDate || 'TBD',
      currentDate,
      stakeholders,
      stakeholderList: stakeholders.length > 0 ? stakeholders.map(s => `- ${s}`).join('\n') : '- To be determined',
      hasRepositories: Object.keys(repoConfig).length > 0,
      isSingleRepo: Object.keys(repoConfig).length === 1,
      isMultiRepo: Object.keys(repoConfig).length > 1,
      repositories: repoConfig
    };

    // Create CLAUDE.md file
    const claudeMdContent = this.generateClaudeMd(templateVars);
    await fs.writeFile(path.join(projectPath, 'CLAUDE.md'), claudeMdContent);

    // Create PROJECT_PLAYBOOK.md file
    const playbookMdContent = this.generateProjectPlaybook(templateVars);
    await fs.writeFile(path.join(projectPath, 'PROJECT_PLAYBOOK.md'), playbookMdContent);

    // Create main project index
    const indexContent = this.generateProjectIndex(templateVars);
    await fs.writeFile(path.join(projectPath, `${projectName}.md`), indexContent);

    // Create files from playbook templates
    const filesCreated = [`${projectName}.md`, 'CLAUDE.md', 'PROJECT_PLAYBOOK.md'];
    
    if (selectedPlaybook.files) {
      const fileTemplates = playbooksConfig.fileTemplates || {};
      
      for (const fileSpec of selectedPlaybook.files) {
        const template = fileTemplates[fileSpec.template];
        if (template) {
          const content = this.processTemplate(template.content, templateVars);
          const fullPath = path.join(projectPath, fileSpec.path);
          
          // Ensure directory exists
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          
          // Write file with frontmatter
          const fileContent = matter.stringify(content, {
            type: 'project-document',
            project: projectName,
            created: currentDate,
            modified: currentDate,
            tags: [`project/${projectName.toLowerCase().replace(/\s+/g, '-')}`]
          });
          
          await fs.writeFile(fullPath, fileContent);
          filesCreated.push(fileSpec.path);
        }
      }
    }

    // Generate .clauderc files for each repository
    if (Object.keys(repoConfig).length > 0) {
      await this.generateClaudeRCFiles(projectPath, projectName, this.vaultPath, repoConfig);
    }

    // Log completion (not in test mode)
    if (process.env.NODE_ENV !== 'test') {
      console.log(`✅ Project "${projectName}" created successfully!`);
      console.log(`   - Location: ${projectFolder}`);
      console.log(`   - Files created: ${filesCreated.length}`);
      if (Object.keys(repoConfig).length > 0) {
        console.log(`   - Repositories configured: ${Object.keys(repoConfig).length}`);
      }
    }
    
    return {
      success: true,
      projectName,
      projectPath: projectFolder,
      playbook: selectedPlaybook.name,
      filesCreated: filesCreated.length,
      files: filesCreated,
      repositories: Object.keys(repoConfig),
      structure: {
        directories: selectedPlaybook.directories || [],
        files: filesCreated,
        repositories: repoConfig
      },
      warnings: this.configWarnings || []
    };
  }

  /**
   * Infer local path from repository URL
   */
  inferLocalPath(repoUrl, projectName) {
    if (!repoUrl) return null;
    
    // Extract repo name from URL
    const match = repoUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)(\.git)?$/);
    if (match) {
      const repoName = match[2];
      // Use a sensible default path
      return path.join(process.env.HOME || '~', 'projects', repoName);
    }
    
    // Fallback to project name
    return path.join(process.env.HOME || '~', 'projects', projectName.toLowerCase().replace(/\s+/g, '-'));
  }

  /**
   * Generate CLAUDE.md content
   */
  generateClaudeMd(vars) {
    const template = `# Project: ${vars.projectName}

## Description
${vars.description}

${vars.hasRepositories ? `## Repositories

${vars.isSingleRepo ? 
  Object.entries(vars.repositories).map(([key, repo]) => `- **GitHub**: ${repo.url || 'Not configured'}
- **Local**: ${repo.local || 'Not configured'}
- **Branch**: ${repo.branch || 'main'}
- **Purpose**: ${repo.purpose || 'Repository'}`).join('\n') :
  Object.entries(vars.repositories).map(([key, repo]) => `### ${key} Repository${repo.visibility ? ` (${repo.visibility})` : ''}
- **GitHub**: ${repo.url || 'Not configured'}
- **Local**: ${repo.local || 'Not configured'}
- **Branch**: ${repo.branch || 'main'}
- **Purpose**: ${repo.purpose || 'Repository'}`).join('\n\n')}

## Claude Code Context
${vars.isSingleRepo ? 
  `Working directory: ${vars.repositories.main?.local || 'Not configured'}` :
  `Active repositories:
${Object.entries(vars.repositories).map(([key, repo]) => `- **${key}**: ${repo.local || 'Not configured'}`).join('\n')}`}

See [[PROJECT_PLAYBOOK]] for coordination instructions
` : ''}

## Current Context
- Project initialized on ${vars.currentDate}
- Phase: ${vars.phase}
- Target date: ${vars.targetDate}
- Next step: Define project objectives

## Where to Work
- Daily notes: Daily/${vars.currentDate}.md
- New tasks: Tasks/Inbox/
- Documentation: Documentation/
${vars.hasRepositories ? '- Implementation: Implementation/' : ''}

## How to Work
1. Read this file first for context
2. Check today's daily note
3. Review active tasks
4. Continue from "Next step" above

## Quick Links
- [[${vars.projectName}]] - Project index
- [[PROJECT_PLAYBOOK]] - Project playbook
`;

    return template;
  }

  /**
   * Generate PROJECT_PLAYBOOK.md content
   */
  generateProjectPlaybook(vars) {
    const template = `# Project Playbook: ${vars.projectName}

## Overview
${vars.description}

${vars.hasRepositories ? `## Repository Structure

${vars.isSingleRepo ? 
  `This project uses a single repository:
${Object.entries(vars.repositories).map(([key, repo]) => `- **${key}**: ${repo.purpose || 'Repository'}
  - GitHub: ${repo.url || 'Not configured'}
  - Local: ${repo.local || 'Not configured'}`).join('\n')}` :
  `This project uses multiple repositories:
${Object.entries(vars.repositories).map(([key, repo]) => `
### ${key} Repository
- **Purpose**: ${repo.purpose || 'Repository'}
- **GitHub**: ${repo.url || 'Not configured'}
- **Local**: ${repo.local || 'Not configured'}
- **Visibility**: ${repo.visibility || 'Not specified'}`).join('\n')}`}

### Repository Coordination
See Implementation/ folder for cross-repository references and documentation.
` : ''}

## Workspace Coordination

### For Claude Desktop (Knowledge Management)
1. Read CLAUDE.md for current state
2. Document in Documentation/
3. Reference code with: \`Implementation/[repo]/path/to/file\`
4. Track tasks and progress

### For Claude Code (Implementation)
${vars.isSingleRepo ? 
  `1. Work in: ${vars.repositories.main?.local || 'Repository path'}` :
  vars.hasRepositories ? 
  `1. Check CLAUDE.md for active repository
2. Work in appropriate repository based on task` :
  '1. Implementation details to be added'}
3. Reference docs with: \`vault://Projects/${vars.projectName}/path/to/doc.md\`
4. Update implementation links in vault after creating files

## Information Architecture
- Append daily progress to: Daily/[date].md
- Create new tasks in: Tasks/Inbox/
- Document features in: Documentation/Technical/
- Record decisions in: Documentation/Decisions/

## Workflow Rules
1. Always update CLAUDE.md#Current Context after major work
2. Move tasks through: Inbox → Active → Completed
3. Link all new documents to relevant index files
4. Use ISO dates (YYYY-MM-DD) everywhere
5. Maintain bidirectional links between vault and code

## Project Phases
- **Planning**: Define objectives, scope, and approach
- **Active**: Implementation and development
- **Review**: Testing and refinement
- **Completed**: Project delivered
- **Archived**: Project closed

Current phase: **${vars.phase}**

## Success Criteria
- [ ] Define measurable success criteria
- [ ] Set up project structure
- [ ] Configure repositories (if applicable)
- [ ] Create initial documentation

## Stakeholders
${vars.stakeholderList}

## Target Date
${vars.targetDate}
`;

    return template;
  }

  /**
   * Generate project index content
   */
  generateProjectIndex(vars) {
    return matter.stringify(`# ${vars.projectName}

${vars.description}

## Project Information
- **Phase**: ${vars.phase}
- **Created**: ${vars.currentDate}
- **Target Date**: ${vars.targetDate}

## Stakeholders
${vars.stakeholderList}

${vars.hasRepositories ? `## Repositories
${Object.entries(vars.repositories).map(([key, repo]) => 
  `- **${key}**: [${repo.url || 'Repository'}](${repo.url || '#'}) - ${repo.purpose || 'Repository'}`
).join('\n')}

See [[Implementation/]] for repository documentation.
` : ''}

## Quick Links
- [[CLAUDE.md]] - Claude context file
- [[PROJECT_PLAYBOOK]] - Project playbook
- [[Documentation/]] - Project documentation
- [[Resources/]] - External resources

## Status

Current phase: **${vars.phase}**

### Recent Updates
- ${vars.currentDate}: Project initialized with ${vars.isSingleRepo ? 'repository' : vars.isMultiRepo ? 'multiple repositories' : 'playbook'}

## Next Steps
1. Review project playbook
2. Define project objectives
3. Set up development environment
${vars.hasRepositories ? '4. Configure repository access' : ''}
`, {
      type: 'project-index',
      project: vars.projectName,
      phase: vars.phase,
      created: vars.currentDate,
      modified: vars.currentDate,
      tags: ['project/active', `project/${vars.phase}`]
    });
  }

  /**
   * Process template with variables
   */
  processTemplate(template, vars) {
    let result = template;
    
    // Simple variable replacement
    for (const [key, value] of Object.entries(vars)) {
      if (typeof value === 'string' || typeof value === 'number') {
        const regex = new RegExp(`{{${key}(\\|[^}]+)?}}`, 'g');
        result = result.replace(regex, (match, defaultValue) => {
          return value || (defaultValue ? defaultValue.substring(1) : '');
        });
      }
    }
    
    // Handle arrays (stakeholders)
    if (vars.stakeholders && Array.isArray(vars.stakeholders)) {
      const stakeholderRegex = /{{#stakeholders}}([\s\S]*?){{\/stakeholders}}/g;
      result = result.replace(stakeholderRegex, (match, content) => {
        if (vars.stakeholders.length === 0) return '';
        return vars.stakeholders.map(s => content.replace('{{.}}', s)).join('');
      });
    }
    
    // Handle conditionals
    const conditionalRegex = /{{#if\s+(\w+)}}([\s\S]*?){{\/if}}/g;
    result = result.replace(conditionalRegex, (match, condition, content) => {
      return vars[condition] ? content : '';
    });
    
    // Handle each loops for repositories
    const eachRegex = /{{#each\s+repositories}}([\s\S]*?){{\/each}}/g;
    result = result.replace(eachRegex, (match, content) => {
      if (!vars.repositories) return '';
      return Object.entries(vars.repositories).map(([key, repo]) => {
        let itemContent = content;
        itemContent = itemContent.replace(/{{@key}}/g, key);
        itemContent = itemContent.replace(/{{this\.(\w+)}}/g, (m, prop) => repo[prop] || '');
        return itemContent;
      }).join('');
    });
    
    return result;
  }

  /**
   * Generate .clauderc files for each repository
   */
  async generateClaudeRCFiles(projectPath, projectName, vaultPath, repositories) {
    if (!repositories || Object.keys(repositories).length === 0) return;
    
    for (const [repoKey, repo] of Object.entries(repositories)) {
      if (!repo.local) continue;
      
      const claudeRC = {
        project: projectName,
        repository: repoKey,
        repositoryPurpose: repo.purpose,
        vault: vaultPath,
        documentation: path.join('Projects', projectName),
        otherRepositories: Object.keys(repositories).filter(k => k !== repoKey),
        rules: [
          `This is the ${repoKey} repository: ${repo.purpose}`,
          repo.visibility ? `Repository visibility: ${repo.visibility}` : null,
          "Reference vault documentation when making architectural decisions",
          `Update vault://Implementation/${repoKey}/ when creating new components`,
          "Follow patterns in vault://PROJECT_PLAYBOOK.md"
        ].filter(Boolean),
        context: [
          "vault://CLAUDE.md",
          "vault://PROJECT_PLAYBOOK.md"
        ]
      };
      
      // Note: We're creating the .clauderc content but not writing it to the actual repo path
      // since we may not have access to that path yet. Instead, we'll save it in the vault.
      const rcContent = JSON.stringify(claudeRC, null, 2);
      const rcPath = path.join(projectPath, 'Implementation', repoKey, '.clauderc');
      await fs.writeFile(rcPath, rcContent);
      
      // Also create instructions for setting up the actual repo
      const setupInstructions = `# Repository Setup Instructions for ${repoKey}

## 1. Clone or Create Repository
\`\`\`bash
# If repository exists:
git clone ${repo.url || '[REPO_URL]'} ${repo.local}

# If creating new:
mkdir -p ${repo.local}
cd ${repo.local}
git init
\`\`\`

## 2. Add .clauderc File
Copy the .clauderc file from this directory to the repository root:
\`\`\`bash
cp ${rcPath} ${repo.local}/.clauderc
\`\`\`

## 3. Configure Git Remote
\`\`\`bash
cd ${repo.local}
git remote add origin ${repo.url || '[REPO_URL]'}
\`\`\`

## 4. Initial Commit
\`\`\`bash
git add .clauderc
git commit -m "Add Claude configuration for ${projectName} project"
git push -u origin ${repo.branch || 'main'}
\`\`\`
`;
      
      await fs.writeFile(
        path.join(projectPath, 'Implementation', repoKey, 'SETUP.md'),
        setupInstructions
      );
    }
  }
}