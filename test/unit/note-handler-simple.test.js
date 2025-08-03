import { describe, it, beforeEach, afterEach, expect } from '@jest/globals';
import { NoteHandler } from '../../src/handlers/note-handler.js';
import { testHarness } from '../test-harness.js';
import fs from 'fs/promises';
import path from 'path';

describe('NoteHandler', () => {
  let handler;
  let config;
  let cache;
  let apiClient;
  
  beforeEach(async () => {
    await testHarness.setup();
    
    config = {
      vaultPath: testHarness.testVaultPath
    };
    
    // Mock cache
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
      },
      invalidateFile: (path) => {}
    };
    
    // Mock API client
    apiClient = {
      isConnected: () => false,
      request: async () => ({ success: false })
    };
    
    handler = new NoteHandler(config, cache, apiClient);
  });
  
  afterEach(async () => {
    await testHarness.teardown();
  });
  
  describe('readNotes', () => {
    beforeEach(async () => {
      await testHarness.createTestVault({
        'note1.md': {
          content: '# Note 1\n\nContent here',
          frontmatter: { id: 1, tags: ['test'] }
        },
        'folder/note2.md': {
          content: '# Note 2\n\nMore content with [[link]]',
          frontmatter: { id: 2, status: 'active' }
        }
      });
    });
    
    it('should read single note', async () => {
      const result = await handler.readNotes({ paths: ['note1.md'] });
      
      expect(result.notes.length).toBe(1);
      expect(result.notes[0].path).toBe('note1.md');
      expect(result.notes[0].content).toContain('# Note 1');
      expect(result.notes[0].frontmatter.id).toBe(1);
    });
    
    it('should read multiple notes', async () => {
      const result = await handler.readNotes({ 
        paths: ['note1.md', 'folder/note2.md'] 
      });
      
      expect(result.notes.length).toBe(2);
      expect(result.notes[0].path).toBe('note1.md');
      expect(result.notes[1].path).toBe('folder/note2.md');
    });
    
    it('should handle missing notes', async () => {
      const result = await handler.readNotes({ 
        paths: ['missing.md'] 
      });
      
      expect(result.notes.length).toBe(1);
      expect(result.notes[0].error).toBeDefined();
      expect(result.notes[0].path).toBe('missing.md');
    });
    
    it('should extract headings and links', async () => {
      const result = await handler.readNotes({ 
        paths: ['folder/note2.md'] 
      });
      
      const note = result.notes[0];
      expect(note.headings).toContain('Note 2');
      expect(note.links).toContain('link');
    });
    
    it('should handle renderDataview option', async () => {
      await testHarness.createNote('dataview.md', 
        '# Dataview Test\n\n```dataview\nTABLE status FROM ""\n```'
      );
      
      const result = await handler.readNotes({ 
        paths: ['dataview.md'],
        renderDataview: true
      });
      
      expect(result.notes[0].content).toContain('Dataview Test');
    });
  });
  
  describe('writeNote', () => {
    it('should create new note', async () => {
      const result = await handler.writeNote({
        path: 'new-note.md',
        content: '# New Note\n\nContent'
      });
      
      expect(result.success).toBe(true);
      expect(result.path).toBe('new-note.md');
      
      await testHarness.assertFileExists('new-note.md');
    });
    
    it('should update existing note', async () => {
      await testHarness.createNote('existing.md', 'Old content');
      
      const result = await handler.writeNote({
        path: 'existing.md',
        content: 'New content'
      });
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('updated');
      
      const content = await testHarness.readNote('existing.md');
      expect(content.raw).toBe('New content');
    });
    
    it('should create nested directories', async () => {
      const result = await handler.writeNote({
        path: 'deep/nested/folder/note.md',
        content: 'Nested content'
      });
      
      expect(result.success).toBe(true);
      await testHarness.assertFileExists('deep/nested/folder/note.md');
    });
    
    it('should format links', async () => {
      const result = await handler.writeNote({
        path: 'formatted.md',
        content: 'Link to [note](path/to/note.md)'
      });
      
      expect(result.success).toBe(true);
      
      const content = await testHarness.readNote('formatted.md');
      expect(content.raw).toContain('[[note|note]]');
    });
    
    it('should handle write errors', async () => {
      // Try to write to invalid path
      await expect(handler.writeNote({
        path: '../outside-vault.md',
        content: 'Should fail'
      })).rejects.toThrow();
    });
  });
  
  describe('updateFrontmatter', () => {
    beforeEach(async () => {
      await testHarness.createNote('update-fm.md', '# Note\n\nContent', {
        existing: 'value',
        number: 42
      });
    });
    
    it('should update frontmatter fields', async () => {
      const result = await handler.updateFrontmatter({
        path: 'update-fm.md',
        updates: {
          existing: 'new value',
          added: 'new field'
        }
      });
      
      expect(result.success).toBe(true);
      
      const note = await testHarness.readNote('update-fm.md');
      expect(note.frontmatter.existing).toBe('new value');
      expect(note.frontmatter.added).toBe('new field');
      expect(note.frontmatter.number).toBe(42); // Preserved
    });
    
    it('should replace frontmatter when merge is false', async () => {
      const result = await handler.updateFrontmatter({
        path: 'update-fm.md',
        updates: {
          only: 'this'
        },
        merge: false
      });
      
      expect(result.success).toBe(true);
      
      const note = await testHarness.readNote('update-fm.md');
      expect(note.frontmatter).toEqual({ only: 'this' });
    });
    
    it('should handle note without frontmatter', async () => {
      await testHarness.createNote('no-fm.md', 'Just content');
      
      const result = await handler.updateFrontmatter({
        path: 'no-fm.md',
        updates: {
          new: 'frontmatter'
        }
      });
      
      expect(result.success).toBe(true);
      
      const note = await testHarness.readNote('no-fm.md');
      expect(note.frontmatter.new).toBe('frontmatter');
    });
  });
  
  describe('archiveNotes', () => {
    beforeEach(async () => {
      await testHarness.createTestVault({
        'active/note1.md': { content: 'Note 1' },
        'active/note2.md': { content: 'Note 2' },
        'active/note3.md': { content: 'Note 3' }
      });
    });
    
    it('should archive single note', async () => {
      const result = await handler.archiveNotes({
        moves: [{
          from: 'active/note1.md',
          to: 'archive/note1.md'
        }]
      });
      
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(0);
      
      await testHarness.assertFileExists('archive/note1.md');
      await testHarness.assertFileNotExists('active/note1.md');
    });
    
    it('should archive multiple notes', async () => {
      const result = await handler.archiveNotes({
        moves: [
          { from: 'active/note1.md', to: 'archive/note1.md' },
          { from: 'active/note2.md', to: 'archive/note2.md' },
          { from: 'active/note3.md', to: 'archive/note3.md' }
        ]
      });
      
      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
    });
    
    it('should handle partial failures', async () => {
      const result = await handler.archiveNotes({
        moves: [
          { from: 'active/note1.md', to: 'archive/note1.md' },
          { from: 'missing.md', to: 'archive/missing.md' },
          { from: 'active/note3.md', to: 'archive/note3.md' }
        ]
      });
      
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors.length).toBe(1);
    });
  });
  
  describe('getDailyNote', () => {
    it('should get today\'s daily note', async () => {
      const today = new Date().toISOString().split('T')[0];
      await testHarness.createNote(`Daily Notes/${today}.md`, '# Today');
      
      const result = await handler.getDailyNote({ date: 'today' });
      
      expect(result.success).toBe(true);
      expect(result.path).toContain(today);
      expect(result.content).toContain('# Today');
    });
    
    it('should create daily note if missing', async () => {
      const result = await handler.getDailyNote({ 
        date: 'today',
        create: true 
      });
      
      expect(result.success).toBe(true);
      expect(result.created).toBe(true);
      expect(result.content).toContain(new Date().toISOString().split('T')[0]);
    });
    
    it('should handle specific dates', async () => {
      const result = await handler.getDailyNote({ 
        date: '2024-01-15' 
      });
      
      expect(result.path).toContain('2024-01-15');
    });
  });
  
  describe('appendToDailyNote', () => {
    it('should append to daily note', async () => {
      const today = new Date().toISOString().split('T')[0];
      await testHarness.createNote(`Daily Notes/${today}.md`, 
        `# ${today}\n\n## Notes\n\nExisting content`
      );
      
      const result = await handler.appendToDailyNote({
        content: 'New content',
        section: 'Notes'
      });
      
      expect(result.success).toBe(true);
      
      const note = await testHarness.readNote(`Daily Notes/${today}.md`);
      expect(note.raw).toContain('Existing content');
      expect(note.raw).toContain('New content');
    });
    
    it('should create section if missing', async () => {
      const today = new Date().toISOString().split('T')[0];
      await testHarness.createNote(`Daily Notes/${today}.md`, `# ${today}`);
      
      const result = await handler.appendToDailyNote({
        content: 'Task content',
        section: 'Tasks'
      });
      
      expect(result.success).toBe(true);
      
      const note = await testHarness.readNote(`Daily Notes/${today}.md`);
      expect(note.raw).toContain('## Tasks');
      expect(note.raw).toContain('Task content');
    });
  });
});