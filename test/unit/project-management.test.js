import { describe, it, beforeEach, afterEach, expect } from '@jest/globals';
import { ProjectManager } from '../../src/tools/project-management.js';
import { testHarness } from '../test-harness.js';

describe('ProjectManager', () => {
  let manager;
  let config;
  
  beforeEach(async () => {
    await testHarness.setup();
    
    config = {
      vaultPath: testHarness.testVaultPath,
      projectsFolder: 'Projects',
      templates: {
        default: {
          name: 'Default Template',
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
          structure: {
            'Index.md': '# {{projectName}} - AI Agent',
            'Requirements.md': '# Requirements',
            'Architecture.md': '# Architecture',
            'Implementation.md': '# Implementation'
          }
        }
      }
    };
    
    manager = new ProjectManager(config);
  });
  
  afterEach(async () => {
    await testHarness.teardown();
  });
  
  describe('initialization', () => {
    it('should initialize with config', () => {
      expect(manager.config).toBe(config);
      expect(manager.projectsFolder).toBe('Projects');
      expect(manager.templates).toBeDefined();
    });
    
    it('should use defaults when not provided', () => {
      const minimalManager = new ProjectManager({
        vaultPath: testHarness.testVaultPath
      });
      
      expect(minimalManager.projectsFolder).toBe('Projects');
      expect(minimalManager.templates.default).toBeDefined();
    });
  });
  
  describe('initProject', () => {
    it('should create project with default template', async () => {
      const result = await manager.initProject({
        projectName: 'Test Project',
        description: 'A test project'
      });
      
      expect(result.success).toBe(true);
      expect(result.projectPath).toBe('Projects/Test Project');
      expect(result.created).toContain('Projects/Test Project/Index.md');
      expect(result.created).toContain('Projects/Test Project/Tasks.md');
      
      await testHarness.assertFileExists('Projects/Test Project/Index.md');
    });
    
    it('should use specified template', async () => {
      const result = await manager.initProject({
        projectName: 'AI Assistant',
        description: 'AI project',
        template: 'ai-agent'
      });
      
      expect(result.success).toBe(true);
      expect(result.created).toContain('Projects/AI Assistant/Requirements.md');
      expect(result.created).toContain('Projects/AI Assistant/Architecture.md');
    });
    
    it('should populate template variables', async () => {
      const result = await manager.initProject({
        projectName: 'My Project',
        description: 'Project description',
        targetDate: '2024-12-31',
        stakeholders: ['John Doe', 'Jane Smith']
      });
      
      expect(result.success).toBe(true);
      
      const index = await testHarness.readNote('Projects/My Project/Index.md');
      expect(index.raw).toContain('# My Project');
      expect(index.raw).toContain('Project description');
      expect(index.raw).toContain('2024-12-31');
      expect(index.raw).toContain('John Doe');
      expect(index.raw).toContain('Jane Smith');
    });
    
    it('should handle existing project', async () => {
      // Create project first
      await manager.initProject({
        projectName: 'Existing',
        description: 'Already exists'
      });
      
      // Try to create again
      await expect(manager.initProject({
        projectName: 'Existing',
        description: 'Duplicate'
      })).rejects.toThrow('already exists');
    });
    
    it('should create nested project folders', async () => {
      const result = await manager.initProject({
        projectName: 'Category/Subcategory/Project',
        description: 'Nested project'
      });
      
      expect(result.success).toBe(true);
      expect(result.projectPath).toBe('Projects/Category/Subcategory/Project');
      await testHarness.assertFileExists('Projects/Category/Subcategory/Project/Index.md');
    });
  });
  
  describe('listProjects', () => {
    beforeEach(async () => {
      // Create some test projects
      await manager.initProject({
        projectName: 'Project A',
        description: 'First project',
        projectType: 'ai-agent',
        status: 'active'
      });
      
      await manager.initProject({
        projectName: 'Project B',
        description: 'Second project',
        status: 'completed'
      });
      
      await manager.initProject({
        projectName: 'Archive/Old Project',
        description: 'Archived project',
        status: 'archived'
      });
    });
    
    it('should list all projects', async () => {
      const projects = await manager.listProjects();
      
      expect(projects.length).toBe(3);
      expect(projects.some(p => p.name === 'Project A')).toBe(true);
      expect(projects.some(p => p.name === 'Project B')).toBe(true);
      expect(projects.some(p => p.name === 'Archive/Old Project')).toBe(true);
    });
    
    it('should filter by status', async () => {
      const activeProjects = await manager.listProjects({ status: 'active' });
      
      expect(activeProjects.length).toBe(1);
      expect(activeProjects[0].name).toBe('Project A');
    });
    
    it('should filter by type', async () => {
      const aiProjects = await manager.listProjects({ type: 'ai-agent' });
      
      expect(aiProjects.length).toBe(1);
      expect(aiProjects[0].name).toBe('Project A');
    });
    
    it('should include metadata when requested', async () => {
      const projects = await manager.listProjects({ includeMetadata: true });
      
      expect(projects[0].metadata).toBeDefined();
      expect(projects[0].metadata.description).toBeDefined();
    });
  });
  
  describe('getProject', () => {
    beforeEach(async () => {
      await manager.initProject({
        projectName: 'Test Project',
        description: 'For testing',
        status: 'active',
        phase: 'development'
      });
    });
    
    it('should get project details', async () => {
      const project = await manager.getProject('Test Project');
      
      expect(project.name).toBe('Test Project');
      expect(project.path).toBe('Projects/Test Project');
      expect(project.files).toContain('Index.md');
      expect(project.metadata.description).toBe('For testing');
      expect(project.metadata.status).toBe('active');
    });
    
    it('should handle missing project', async () => {
      await expect(manager.getProject('Nonexistent'))
        .rejects.toThrow('not found');
    });
  });
  
  describe('updateProject', () => {
    beforeEach(async () => {
      await manager.initProject({
        projectName: 'Update Test',
        description: 'Original description',
        status: 'planning'
      });
    });
    
    it('should update project metadata', async () => {
      const result = await manager.updateProject('Update Test', {
        status: 'active',
        phase: 'implementation'
      });
      
      expect(result.success).toBe(true);
      
      const project = await manager.getProject('Update Test');
      expect(project.metadata.status).toBe('active');
      expect(project.metadata.phase).toBe('implementation');
    });
    
    it('should preserve existing metadata', async () => {
      const result = await manager.updateProject('Update Test', {
        newField: 'value'
      });
      
      expect(result.success).toBe(true);
      
      const project = await manager.getProject('Update Test');
      expect(project.metadata.description).toBe('Original description');
      expect(project.metadata.newField).toBe('value');
    });
  });
  
  describe('addProjectFile', () => {
    beforeEach(async () => {
      await manager.initProject({
        projectName: 'File Test',
        description: 'Testing file operations'
      });
    });
    
    it('should add file to project', async () => {
      const result = await manager.addProjectFile('File Test', 'Meeting Notes.md', 
        '# Meeting Notes\n\n## 2024-01-15\n- Discussed requirements'
      );
      
      expect(result.success).toBe(true);
      expect(result.path).toBe('Projects/File Test/Meeting Notes.md');
      
      await testHarness.assertFileExists('Projects/File Test/Meeting Notes.md');
    });
    
    it('should create subdirectories', async () => {
      const result = await manager.addProjectFile('File Test', 'docs/API.md',
        '# API Documentation'
      );
      
      expect(result.success).toBe(true);
      await testHarness.assertFileExists('Projects/File Test/docs/API.md');
    });
    
    it('should update index with link', async () => {
      await manager.addProjectFile('File Test', 'New Document.md',
        '# New Document',
        { updateIndex: true }
      );
      
      const index = await testHarness.readNote('Projects/File Test/Index.md');
      expect(index.raw).toContain('[[New Document]]');
    });
  });
  
  describe('template handling', () => {
    it('should list available templates', () => {
      const templates = manager.listTemplates();
      
      expect(templates.length).toBe(2);
      expect(templates.some(t => t.id === 'default')).toBe(true);
      expect(templates.some(t => t.id === 'ai-agent')).toBe(true);
    });
    
    it('should get template details', () => {
      const template = manager.getTemplate('ai-agent');
      
      expect(template.name).toBe('AI Agent Template');
      expect(template.structure).toBeDefined();
      expect(Object.keys(template.structure)).toContain('Requirements.md');
    });
    
    it('should handle missing template', () => {
      expect(() => manager.getTemplate('nonexistent')).toThrow();
    });
    
    it('should validate template structure', () => {
      const valid = manager.validateTemplate({
        name: 'Test',
        structure: {
          'Index.md': 'content'
        }
      });
      
      expect(valid).toBe(true);
      
      const invalid = manager.validateTemplate({
        name: 'Test'
        // Missing structure
      });
      
      expect(invalid).toBe(false);
    });
  });
  
  describe('processTemplate', () => {
    it('should process simple variables', () => {
      const template = 'Hello {{name}}, welcome to {{project}}';
      const result = manager.processTemplate(template, {
        name: 'John',
        project: 'Test Project'
      });
      
      expect(result).toBe('Hello John, welcome to Test Project');
    });
    
    it('should process arrays', () => {
      const template = `Members:\n{{#members}}\n- {{.}}\n{{/members}}`;
      const result = manager.processTemplate(template, {
        members: ['Alice', 'Bob', 'Charlie']
      });
      
      expect(result).toContain('- Alice');
      expect(result).toContain('- Bob');
      expect(result).toContain('- Charlie');
    });
    
    it('should handle missing variables', () => {
      const template = 'Hello {{name}}, {{missing}}';
      const result = manager.processTemplate(template, {
        name: 'John'
      });
      
      expect(result).toBe('Hello John, ');
    });
    
    it('should process dates', () => {
      const template = 'Created on {{date}}';
      const result = manager.processTemplate(template, {
        date: '2024-01-15'
      });
      
      expect(result).toBe('Created on 2024-01-15');
    });
  });
  
  describe('archiveProject', () => {
    beforeEach(async () => {
      await manager.initProject({
        projectName: 'To Archive',
        description: 'Will be archived'
      });
    });
    
    it('should archive project', async () => {
      const result = await manager.archiveProject('To Archive');
      
      expect(result.success).toBe(true);
      expect(result.archivedPath).toBe('Projects/Archive/To Archive');
      
      await testHarness.assertFileExists('Projects/Archive/To Archive/Index.md');
      await testHarness.assertFileNotExists('Projects/To Archive/Index.md');
    });
    
    it('should update project status', async () => {
      await manager.archiveProject('To Archive');
      
      const project = await manager.getProject('Archive/To Archive');
      expect(project.metadata.status).toBe('archived');
      expect(project.metadata.archivedDate).toBeDefined();
    });
  });
  
  describe('error handling', () => {
    it('should validate project names', async () => {
      await expect(manager.initProject({
        projectName: '../../../etc/passwd',
        description: 'Invalid'
      })).rejects.toThrow();
    });
    
    it('should handle template errors gracefully', async () => {
      manager.templates.broken = {
        name: 'Broken',
        structure: {
          'Bad.md': '{{unclosed'
        }
      };
      
      // Should still create project even with template errors
      const result = await manager.initProject({
        projectName: 'With Broken Template',
        description: 'Test',
        template: 'broken'
      });
      
      expect(result.success).toBe(true);
    });
  });
});