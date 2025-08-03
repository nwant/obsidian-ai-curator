import { describe, it, beforeEach, expect } from '@jest/globals';
import { FrontmatterManager } from '../../src/tools/frontmatter-manager.js';
import { testHarness } from '../test-harness.js';

describe('FrontmatterManager', () => {
  let manager;
  let config;
  
  beforeEach(async () => {
    await testHarness.setup();
    
    config = {
      vaultPath: testHarness.testVaultPath,
      dateFields: ['created', 'modified', 'due'],
      requiredFields: ['title'],
      defaultValues: {
        status: 'draft',
        tags: []
      }
    };
    
    manager = new FrontmatterManager(config);
  });
  
  afterEach(async () => {
    await testHarness.teardown();
  });
  
  describe('initialization', () => {
    it('should initialize with config', () => {
      expect(manager.config).toBe(config);
      expect(manager.dateFields).toEqual(['created', 'modified', 'due']);
      expect(manager.requiredFields).toEqual(['title']);
    });
    
    it('should use defaults when not provided', () => {
      const minimalManager = new FrontmatterManager({
        vaultPath: testHarness.testVaultPath
      });
      
      expect(minimalManager.dateFields).toEqual(['created', 'modified']);
      expect(minimalManager.requiredFields).toEqual([]);
      expect(minimalManager.defaultValues).toEqual({});
    });
  });
  
  describe('extractFrontmatter', () => {
    it('should extract valid frontmatter', () => {
      const content = `---
title: Test Note
tags: [test, example]
created: 2024-01-15
---

# Content

Body text`;
      
      const result = manager.extractFrontmatter(content);
      
      expect(result.frontmatter.title).toBe('Test Note');
      expect(result.frontmatter.tags).toEqual(['test', 'example']);
      expect(result.content).toBe('\n# Content\n\nBody text');
      expect(result.raw).toBe(content);
    });
    
    it('should handle missing frontmatter', () => {
      const content = '# No Frontmatter\n\nJust content';
      
      const result = manager.extractFrontmatter(content);
      
      expect(result.frontmatter).toEqual({});
      expect(result.content).toBe(content);
    });
    
    it('should handle empty frontmatter', () => {
      const content = `---
---

# Content`;
      
      const result = manager.extractFrontmatter(content);
      
      expect(result.frontmatter).toEqual({});
      expect(result.content).toBe('\n# Content');
    });
    
    it('should handle malformed frontmatter gracefully', () => {
      const content = `---
title: Test
invalid yaml: [unclosed
---

# Content`;
      
      const result = manager.extractFrontmatter(content);
      
      // Should still extract what it can
      expect(result.frontmatter.title).toBe('Test');
      expect(result.error).toBeDefined();
    });
  });
  
  describe('updateFrontmatter', () => {
    it('should update existing frontmatter', async () => {
      await testHarness.createNote('update.md', '# Test', {
        title: 'Original',
        status: 'draft'
      });
      
      const result = await manager.updateFrontmatter('update.md', {
        status: 'published',
        author: 'John Doe'
      });
      
      expect(result.success).toBe(true);
      
      const note = await testHarness.readNote('update.md');
      expect(note.frontmatter.title).toBe('Original'); // Preserved
      expect(note.frontmatter.status).toBe('published'); // Updated
      expect(note.frontmatter.author).toBe('John Doe'); // Added
    });
    
    it('should add frontmatter if missing', async () => {
      await testHarness.createNote('no-fm.md', '# Content Only');
      
      const result = await manager.updateFrontmatter('no-fm.md', {
        title: 'Added Title',
        tags: ['new']
      });
      
      expect(result.success).toBe(true);
      
      const note = await testHarness.readNote('no-fm.md');
      expect(note.frontmatter.title).toBe('Added Title');
      expect(note.raw).toMatch(/^---/);
    });
    
    it('should handle merge vs replace', async () => {
      await testHarness.createNote('merge.md', '# Test', {
        keep: 'this',
        change: 'old'
      });
      
      // Test merge (default)
      await manager.updateFrontmatter('merge.md', {
        change: 'new',
        add: 'field'
      });
      
      let note = await testHarness.readNote('merge.md');
      expect(note.frontmatter.keep).toBe('this');
      expect(note.frontmatter.change).toBe('new');
      expect(note.frontmatter.add).toBe('field');
      
      // Test replace
      await manager.updateFrontmatter('merge.md', {
        only: 'this'
      }, { merge: false });
      
      note = await testHarness.readNote('merge.md');
      expect(note.frontmatter).toEqual({ only: 'this' });
    });
  });
  
  describe('validateFrontmatter', () => {
    it('should validate required fields', () => {
      const result = manager.validateFrontmatter({
        title: 'Valid',
        status: 'draft'
      });
      
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
    
    it('should detect missing required fields', () => {
      const result = manager.validateFrontmatter({
        status: 'draft'
        // Missing title
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: title');
    });
    
    it('should validate date fields', () => {
      const result = manager.validateFrontmatter({
        title: 'Test',
        created: '2024-01-15',
        due: 'invalid-date'
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid date'))).toBe(true);
    });
    
    it('should validate custom rules', () => {
      manager.customValidators = [
        (fm) => fm.status === 'published' && !fm.publishDate ? 
          'Published items must have publishDate' : null
      ];
      
      const result = manager.validateFrontmatter({
        title: 'Test',
        status: 'published'
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Published items must have publishDate');
    });
  });
  
  describe('formatFrontmatter', () => {
    it('should format frontmatter consistently', () => {
      const formatted = manager.formatFrontmatter({
        title: 'Test',
        tags: ['a', 'b'],
        nested: {
          value: 'deep'
        }
      });
      
      expect(formatted).toContain('title: Test');
      expect(formatted).toContain('tags:');
      expect(formatted).toContain('  - a');
      expect(formatted).toContain('  - b');
      expect(formatted).toContain('nested:');
      expect(formatted).toContain('  value: deep');
    });
    
    it('should handle special characters', () => {
      const formatted = manager.formatFrontmatter({
        title: 'Title: With Colon',
        description: 'Line 1\nLine 2'
      });
      
      expect(formatted).toContain('title: "Title: With Colon"');
      expect(formatted).toContain('description: |\n  Line 1\n  Line 2');
    });
    
    it('should format dates', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const formatted = manager.formatFrontmatter({
        created: date
      });
      
      expect(formatted).toMatch(/created: 2024-01-15/);
    });
  });
  
  describe('applyDefaults', () => {
    it('should apply default values', () => {
      const result = manager.applyDefaults({
        title: 'Test'
      });
      
      expect(result.title).toBe('Test');
      expect(result.status).toBe('draft');
      expect(result.tags).toEqual([]);
    });
    
    it('should not override existing values', () => {
      const result = manager.applyDefaults({
        title: 'Test',
        status: 'published',
        tags: ['existing']
      });
      
      expect(result.status).toBe('published');
      expect(result.tags).toEqual(['existing']);
    });
    
    it('should handle dynamic defaults', () => {
      manager.defaultValues.created = () => new Date().toISOString().split('T')[0];
      
      const result = manager.applyDefaults({
        title: 'Test'
      });
      
      expect(result.created).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
  
  describe('batch operations', () => {
    beforeEach(async () => {
      await testHarness.createNote('batch1.md', '# Note 1', { title: 'Note 1' });
      await testHarness.createNote('batch2.md', '# Note 2', { title: 'Note 2' });
      await testHarness.createNote('batch3.md', '# Note 3', { title: 'Note 3' });
    });
    
    it('should update multiple files', async () => {
      const result = await manager.batchUpdate([
        'batch1.md',
        'batch2.md',
        'batch3.md'
      ], {
        updated: new Date().toISOString().split('T')[0],
        status: 'reviewed'
      });
      
      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
      
      for (let i = 1; i <= 3; i++) {
        const note = await testHarness.readNote(`batch${i}.md`);
        expect(note.frontmatter.status).toBe('reviewed');
        expect(note.frontmatter.updated).toBeDefined();
      }
    });
    
    it('should handle partial failures', async () => {
      const result = await manager.batchUpdate([
        'batch1.md',
        'nonexistent.md',
        'batch3.md'
      ], {
        status: 'archived'
      });
      
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors.length).toBe(1);
    });
  });
  
  describe('frontmatter queries', () => {
    beforeEach(async () => {
      await testHarness.createNote('query1.md', '# 1', { 
        status: 'active', 
        priority: 5 
      });
      await testHarness.createNote('query2.md', '# 2', { 
        status: 'active', 
        priority: 3 
      });
      await testHarness.createNote('query3.md', '# 3', { 
        status: 'done', 
        priority: 5 
      });
    });
    
    it('should find by exact match', async () => {
      const results = await manager.findByFrontmatter({
        status: 'active'
      });
      
      expect(results.length).toBe(2);
      expect(results.every(r => r.frontmatter.status === 'active')).toBe(true);
    });
    
    it('should find by multiple criteria', async () => {
      const results = await manager.findByFrontmatter({
        status: 'active',
        priority: 5
      });
      
      expect(results.length).toBe(1);
      expect(results[0].path).toBe('query1.md');
    });
    
    it('should support operators', async () => {
      const results = await manager.findByFrontmatter({
        priority: { $gte: 4 }
      });
      
      expect(results.length).toBe(2);
      expect(results.every(r => r.frontmatter.priority >= 4)).toBe(true);
    });
  });
  
  describe('error handling', () => {
    it('should handle file not found', async () => {
      const result = await manager.updateFrontmatter('missing.md', {
        title: 'Test'
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
    
    it('should handle invalid YAML', async () => {
      await testHarness.createNote('invalid.md', `---
title: Test
invalid: [unclosed
---
Content`);
      
      const result = await manager.updateFrontmatter('invalid.md', {
        new: 'field'
      });
      
      // Should still try to update
      expect(result.success).toBe(true);
    });
  });
});