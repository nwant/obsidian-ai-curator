import fs from 'fs/promises';
import path from 'path';
import { DateManager } from './date-manager.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class ProjectInitializer {
  constructor(config) {
    this.config = config;
    this.vaultPath = config.vaultPath;
    this.templatesPath = path.join(__dirname, '../../config/project-templates.json');
    this.templates = null;
  }

  /**
   * Load project templates configuration
   */
  async loadTemplates() {
    if (!this.templates) {
      try {
        const content = await fs.readFile(this.templatesPath, 'utf-8');
        this.templates = JSON.parse(content);
      } catch (error) {
        console.error('Failed to load project templates:', error);
        throw new Error('Failed to load project templates configuration');
      }
    }
    return this.templates;
  }

  /**
   * Initialize a new project with configurable template
   * 
   * Creates project structure with evergreen Claude Desktop instructions.
   * 
   * Design principle:
   * - CLAUDE.md: Contains ALL dynamic content (dates, status, stakeholders)
   * - PROJECT_INSTRUCTIONS.md: Contains ONLY static workflows
   * - This enables Claude Desktop instructions that never need updating
   */
  async initProject(params) {
    const {
      projectName,
      projectType = 'other',
      description,
      stakeholders = [],
      targetDate,
      phase = 'planning',
      template = 'default'
    } = params;

    // Load templates
    await this.loadTemplates();

    // Validate inputs
    const validation = this.validateInputs(params);
    if (!validation.valid) {
      return validation.error;
    }

    // Check if template exists
    if (!this.templates.templates[template]) {
      return {
        success: false,
        error: 'INVALID_TEMPLATE',
        message: `Template "${template}" not found`,
        availableTemplates: Object.keys(this.templates.templates),
        suggestion: 'Use one of the available templates or create a custom one'
      };
    }

    // Generate project slug for tags
    const projectSlug = this.generateSlug(projectName);
    const projectPath = path.join('Projects', projectName);
    const fullProjectPath = path.join(this.vaultPath, projectPath);

    // Check if project already exists
    try {
      await fs.access(fullProjectPath);
      return {
        success: false,
        error: 'PROJECT_EXISTS',
        message: `Project "${projectName}" already exists at ${projectPath}/`,
        suggestion: 'Use the existing project structure or choose a different name'
      };
    } catch (e) {
      // Project doesn't exist, continue
    }

    // Prepare template variables
    const currentDate = DateManager.getCurrentDate();
    const templateVars = {
      projectName,
      projectSlug,
      projectType,
      description,
      phase,
      currentDate,
      targetDate: targetDate || 'TBD',
      stakeholders: stakeholders.join(', '),
      stakeholderList: stakeholders.length > 0 
        ? stakeholders.map(s => `- ${s}`).join('\n')
        : '- [Add stakeholders]'
    };

    // Create project structure
    const selectedTemplate = this.templates.templates[template];
    const filesCreated = [];

    try {
      // Create base directory
      await fs.mkdir(fullProjectPath, { recursive: true });

      // Create directories from template
      for (const dir of selectedTemplate.directories || []) {
        const dirPath = this.processTemplate(dir, templateVars);
        await fs.mkdir(path.join(fullProjectPath, dirPath), { recursive: true });
      }

      // Create files from template
      for (const fileConfig of selectedTemplate.files || []) {
        const filePath = this.processTemplate(fileConfig.path, templateVars);
        const fileContent = this.generateFileContent(fileConfig.template, templateVars);
        
        const fullFilePath = path.join(fullProjectPath, filePath);
        const fileDir = path.dirname(fullFilePath);
        
        // Ensure directory exists
        await fs.mkdir(fileDir, { recursive: true });
        
        // Write file
        await fs.writeFile(fullFilePath, fileContent, 'utf-8');
        filesCreated.push(filePath);
      }

      // Generate evergreen Claude Desktop instructions
      const claudeDesktopInstructions = `# ${projectName}\n\n${description}\n\nCurrent state: Projects/${projectName}/CLAUDE.md\n\nRule: MCP tools only.`;

      return {
        success: true,
        projectPath: projectPath,
        filesCreated: filesCreated,
        template: template,
        templateName: selectedTemplate.name,
        nextSteps: this.getNextSteps(template, projectName),
        message: `Successfully initialized project: ${projectName} using ${selectedTemplate.name}`,
        projectSlug: projectSlug,
        claudeDesktopInstructions: claudeDesktopInstructions
      };

    } catch (error) {
      return {
        success: false,
        error: 'CREATION_ERROR',
        message: `Failed to create project: ${error.message}`,
        suggestion: 'Check permissions and try again'
      };
    }
  }

  /**
   * Process template strings with variables
   */
  processTemplate(templateString, variables) {
    let processed = templateString;
    
    // Replace variables with optional defaults
    processed = processed.replace(/\{\{(\w+)(?:\|([^}]+))?\}\}/g, (match, varName, defaultValue) => {
      return variables[varName] !== undefined ? variables[varName] : (defaultValue || match);
    });
    
    // Handle filters (e.g., {{variable|capitalize}})
    processed = processed.replace(/\{\{(\w+)\|(\w+)\}\}/g, (match, varName, filter) => {
      let value = variables[varName] || '';
      
      switch (filter) {
        case 'capitalize':
          return value.charAt(0).toUpperCase() + value.slice(1);
        case 'uppercase':
          return value.toUpperCase();
        case 'lowercase':
          return value.toLowerCase();
        default:
          return value;
      }
    });
    
    return processed;
  }

  /**
   * Generate file content from template
   */
  generateFileContent(templateName, variables) {
    const template = this.templates.fileTemplates[templateName];
    
    if (!template) {
      throw new Error(`File template "${templateName}" not found`);
    }
    
    return this.processTemplate(template.content, variables);
  }

  /**
   * Get next steps based on template
   */
  getNextSteps(template, projectName) {
    const defaultSteps = [
      'Review project structure and customize as needed',
      'Update project documentation with specific objectives',
      'Begin work according to the template guidelines'
    ];
    
    const templateSpecificSteps = {
      default: [
        'Read PROJECT_INSTRUCTIONS.md for complete workflow',
        'Update CLAUDE.md with initial objectives',
        'Begin logging work in Implementation Log'
      ],
      minimal: [
        'Add initial notes to the Notes folder',
        'Update README.md with project details'
      ],
      research: [
        'Review the Research Plan and refine research questions',
        'Begin literature review and add sources to Bibliography',
        'Set up data collection methods'
      ]
    };
    
    return templateSpecificSteps[template] || defaultSteps;
  }

  /**
   * Validate input parameters
   */
  validateInputs(params) {
    const { projectName, projectType, description, targetDate } = params;

    // Load validation rules
    const validation = this.templates.validation || {};

    // Validate project name
    if (!projectName || projectName.trim().length === 0) {
      return {
        valid: false,
        error: {
          success: false,
          error: 'MISSING_NAME',
          message: 'Project name is required',
          suggestion: 'Provide a valid project name'
        }
      };
    }

    if (validation.projectName) {
      const nameRegex = new RegExp(validation.projectName.pattern);
      if (!nameRegex.test(projectName)) {
        return {
          valid: false,
          error: {
            success: false,
            error: 'INVALID_NAME',
            message: validation.projectName.errorMessage,
            suggestion: "Try a name like 'My New Project' or 'api-integration'"
          }
        };
      }
      
      if (projectName.length < validation.projectName.minLength ||
          projectName.length > validation.projectName.maxLength) {
        return {
          valid: false,
          error: {
            success: false,
            error: 'INVALID_NAME_LENGTH',
            message: `Project name must be between ${validation.projectName.minLength} and ${validation.projectName.maxLength} characters`,
            suggestion: 'Use a shorter or longer project name'
          }
        };
      }
    }

    // Validate project type
    const validTypes = Object.keys(this.templates.projectTypes || {});
    if (projectType && !validTypes.includes(projectType)) {
      return {
        valid: false,
        error: {
          success: false,
          error: 'INVALID_TYPE',
          message: `Project type must be one of: ${validTypes.join(', ')}`,
          suggestion: 'Choose a valid project type or omit for "other"'
        }
      };
    }

    // Validate description
    if (!description || description.trim().length === 0) {
      return {
        valid: false,
        error: {
          success: false,
          error: 'MISSING_DESCRIPTION',
          message: 'Project description is required',
          suggestion: 'Provide a brief description of the project'
        }
      };
    }

    // Validate target date format
    if (targetDate && validation.dateFormat) {
      const dateRegex = new RegExp(validation.dateFormat.pattern);
      if (!dateRegex.test(targetDate)) {
        return {
          valid: false,
          error: {
            success: false,
            error: 'INVALID_DATE',
            message: validation.dateFormat.errorMessage,
            suggestion: 'Use format like 2025-09-15'
          }
        };
      }
    }

    return { valid: true };
  }

  /**
   * Generate slug from project name
   */
  generateSlug(projectName) {
    return projectName
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }

  /**
   * List available templates
   */
  async listTemplates() {
    await this.loadTemplates();
    
    const templateList = Object.entries(this.templates.templates).map(([key, template]) => ({
      key,
      name: template.name,
      description: template.description,
      directories: template.directories.length,
      files: template.files.length
    }));
    
    return {
      templates: templateList,
      projectTypes: Object.keys(this.templates.projectTypes),
      phases: Object.keys(this.templates.phases)
    };
  }

  /**
   * Get template details
   */
  async getTemplateDetails(templateKey) {
    await this.loadTemplates();
    
    const template = this.templates.templates[templateKey];
    if (!template) {
      return {
        success: false,
        error: 'Template not found'
      };
    }
    
    return {
      success: true,
      template: {
        ...template,
        variables: Object.keys(this.templates.templates.default.variables || {})
      }
    };
  }
}