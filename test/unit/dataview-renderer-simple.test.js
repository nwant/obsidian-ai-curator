import { describe, it, beforeEach, expect } from '@jest/globals';
import { DataviewRenderer } from '../../src/dataview/renderer.js';
import { testHarness } from '../test-harness.js';
import fs from 'fs/promises';
import path from 'path';

describe('DataviewRenderer', () => {
  let renderer;
  let cache;
  
  beforeEach(async () => {
    await testHarness.setup();
    
    // Create a simple mock cache
    cache = {
      getVaultStructure: async () => {
        const notePaths = await testHarness.getAllNotes();
        return {
          files: notePaths.map(notePath => ({
            path: notePath,
            name: path.basename(notePath),
            extension: path.extname(notePath)
          })),
          total: notePaths.length
        };
      },
      getFileContent: async (filePath) => {
        try {
          const fullPath = path.join(testHarness.testVaultPath, filePath);
          const content = await fs.readFile(fullPath, 'utf-8');
          return content;
        } catch (error) {
          throw new Error(`File not found: ${fullPath}`);
        }
      }
    };
    
    renderer = new DataviewRenderer(cache);
  });
  
  afterEach(async () => {
    await testHarness.teardown();
  });
  
  describe('initialization', () => {
    it('should initialize with cache', () => {
      expect(renderer.cache).toBe(cache);
    });
  });
  
  describe('renderQuery', () => {
    it('should parse basic TABLE query', async () => {
      const query = 'TABLE status, created FROM "Projects"';
      const result = await renderer.renderQuery(query);
      
      expect(result.type).toBe('table');
      expect(result.headers).toContain('File');
      expect(result.headers).toContain('status');
      expect(result.headers).toContain('created');
    });
    
    it('should parse LIST query', async () => {
      const query = 'LIST FROM #important';
      const result = await renderer.renderQuery(query);
      
      expect(result.type).toBe('list');
      expect(result.items).toBeDefined();
    });
    
    it('should parse TASK query', async () => {
      const query = 'TASK WHERE !completed';
      const result = await renderer.renderQuery(query);
      
      expect(result.type).toBe('task');
      expect(result.tasks).toBeDefined();
    });
    
    it('should handle empty query', async () => {
      const result = await renderer.renderQuery('');
      
      expect(result.type).toBe('empty');
      expect(result.error).toContain('Empty query');
    });
    
    it('should handle invalid query', async () => {
      const result = await renderer.renderQuery('INVALID QUERY FORMAT');
      
      expect(result.type).toBe('error');
      expect(result.error).toBeDefined();
    });
  });
  
  describe('parseQuery', () => {
    it('should parse TABLE with fields', () => {
      const parsed = renderer.parseQuery('TABLE name, status, date FROM "folder"');
      
      expect(parsed.type).toBe('TABLE');
      expect(parsed.fields).toEqual(['name', 'status', 'date']);
      expect(parsed.from).toBe('"folder"');
    });
    
    it('should parse WHERE clause', () => {
      const parsed = renderer.parseQuery('TABLE FROM "Tasks" WHERE status = "active"');
      
      expect(parsed.where).toBe('status = "active"');
    });
    
    it('should parse SORT clause', () => {
      const parsed = renderer.parseQuery('LIST FROM #tag SORT date DESC');
      
      expect(parsed.sort).toBe('date DESC');
    });
    
    it('should parse LIMIT clause', () => {
      const parsed = renderer.parseQuery('TABLE FROM "Notes" LIMIT 10');
      
      expect(parsed.limit).toBe('10');
    });
    
    it('should parse complex query', () => {
      const query = 'TABLE title, status FROM "Projects" WHERE status != "completed" SORT created DESC LIMIT 5';
      const parsed = renderer.parseQuery(query);
      
      expect(parsed.type).toBe('TABLE');
      expect(parsed.fields).toEqual(['title', 'status']);
      expect(parsed.from).toBe('"Projects"');
      expect(parsed.where).toBe('status != "completed"');
      expect(parsed.sort).toBe('created DESC');
      expect(parsed.limit).toBe('5');
    });
  });
  
  describe('extractFields', () => {
    it('should extract simple fields', () => {
      const fields = renderer.extractFields('name, date, status');
      expect(fields).toEqual(['name', 'date', 'status']);
    });
    
    it('should handle extra spaces', () => {
      const fields = renderer.extractFields('  field1  ,  field2  ,  field3  ');
      expect(fields).toEqual(['field1', 'field2', 'field3']);
    });
    
    it('should handle AS aliases', () => {
      const fields = renderer.extractFields('file.name AS "Name", date AS Created');
      expect(fields).toEqual(['file.name AS "Name"', 'date AS Created']);
    });
    
    it('should handle empty input', () => {
      const fields = renderer.extractFields('');
      expect(fields).toEqual([]);
    });
  });
  
  describe('evaluateFrom', () => {
    beforeEach(async () => {
      // Create test vault structure
      await testHarness.createTestVault({
        'Projects/Project1.md': {
          content: '# Project 1',
          frontmatter: { tags: ['project'] }
        },
        'Tasks/Task1.md': {
          content: '# Task 1',
          frontmatter: { tags: ['task', 'urgent'] }
        },
        'Notes/Note1.md': {
          content: '# Note 1',
          frontmatter: { tags: ['note'] }
        }
      });
      
      // Update cache mock
      cache.getVaultStructure = async () => ({
        files: [
          { path: 'Projects/Project1.md', size: 100, mtime: new Date() },
          { path: 'Tasks/Task1.md', size: 100, mtime: new Date() },
          { path: 'Notes/Note1.md', size: 100, mtime: new Date() }
        ],
        total: 3
      });
    });
    
    it('should filter by folder', async () => {
      const files = await renderer.evaluateFrom('"Projects"');
      
      expect(files.length).toBe(1);
      expect(files[0].path).toContain('Project1.md');
    });
    
    it('should filter by tag', async () => {
      const files = await renderer.evaluateFrom('#task');
      
      expect(files.length).toBe(1);
      expect(files[0].path).toContain('Task1.md');
    });
    
    it('should handle OR conditions', async () => {
      const files = await renderer.evaluateFrom('"Projects" OR "Tasks"');
      
      expect(files.length).toBe(2);
    });
    
    it('should return all files for empty FROM', async () => {
      const files = await renderer.evaluateFrom('');
      
      expect(files.length).toBe(3);
    });
  });
  
  describe('smart rendering modes', () => {
    it('should choose summary mode for large result sets', async () => {
      // Mock large dataset
      const manyFiles = Array(200).fill(null).map((_, i) => ({
        path: `file${i}.md`,
        frontmatter: { status: i % 3 === 0 ? 'active' : 'done' }
      }));
      
      const result = await renderer.renderTableQuery(
        { fields: ['status'], from: '' },
        manyFiles,
        { mode: 'smart' }
      );
      
      expect(result.renderMode).toBe('summary');
      expect(result.rows.length).toBeLessThan(50); // Summarized
    });
    
    it('should choose table mode for small result sets', async () => {
      const fewFiles = Array(5).fill(null).map((_, i) => ({
        path: `file${i}.md`,
        frontmatter: { name: `File ${i}` }
      }));
      
      const result = await renderer.renderTableQuery(
        { fields: ['name'], from: '' },
        fewFiles,
        { mode: 'smart' }
      );
      
      expect(result.renderMode).toBe('table');
      expect(result.rows.length).toBe(5);
    });
  });
  
  describe('error handling', () => {
    it('should handle missing frontmatter gracefully', async () => {
      const files = [{
        path: 'no-frontmatter.md',
        frontmatter: null
      }];
      
      const result = await renderer.renderTableQuery(
        { fields: ['status'], from: '' },
        files
      );
      
      expect(result.rows.length).toBe(1);
      expect(result.rows[0]).toContain('—'); // Empty value placeholder
    });
    
    it('should handle circular references', async () => {
      const circular = { a: 'value' };
      circular.self = circular;
      
      const files = [{
        path: 'circular.md',
        frontmatter: { data: circular }
      }];
      
      const result = await renderer.renderTableQuery(
        { fields: ['data'], from: '' },
        files
      );
      
      expect(result.error).toBeUndefined();
      expect(result.rows.length).toBe(1);
    });
  });
});