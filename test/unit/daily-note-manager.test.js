import { describe, it, beforeEach, afterEach, expect } from '@jest/globals';
import { DailyNoteManager } from '../../src/tools/daily-note-manager.js';
import { testHarness } from '../test-harness.js';

describe('DailyNoteManager', () => {
  let manager;
  let config;
  
  beforeEach(async () => {
    await testHarness.setup();
    
    config = {
      vaultPath: testHarness.testVaultPath,
      dailyNotesFolder: 'Daily Notes',
      dateFormat: 'yyyy-MM-dd',
      template: `# {{date}}

## Tasks
- [ ] 

## Notes


## Log
`
    };
    
    manager = new DailyNoteManager(config);
  });
  
  afterEach(async () => {
    await testHarness.teardown();
  });
  
  describe('initialization', () => {
    it('should initialize with config', () => {
      expect(manager.config).toBe(config);
      expect(manager.dailyNotesFolder).toBe('Daily Notes');
      expect(manager.dateFormat).toBe('yyyy-MM-dd');
    });
    
    it('should use defaults when not provided', () => {
      const minimalManager = new DailyNoteManager({
        vaultPath: testHarness.testVaultPath
      });
      
      expect(minimalManager.dailyNotesFolder).toBe('Daily Notes');
      expect(minimalManager.dateFormat).toBe('yyyy-MM-dd');
      expect(minimalManager.template).toBeDefined();
    });
  });
  
  describe('parseDate', () => {
    it('should parse today', () => {
      const date = manager.parseDate('today');
      const today = new Date();
      
      expect(date.toDateString()).toBe(today.toDateString());
    });
    
    it('should parse yesterday', () => {
      const date = manager.parseDate('yesterday');
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      expect(date.toDateString()).toBe(yesterday.toDateString());
    });
    
    it('should parse tomorrow', () => {
      const date = manager.parseDate('tomorrow');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      expect(date.toDateString()).toBe(tomorrow.toDateString());
    });
    
    it('should parse ISO date', () => {
      const date = manager.parseDate('2024-01-15');
      
      expect(date.getFullYear()).toBe(2024);
      expect(date.getMonth()).toBe(0); // January
      expect(date.getDate()).toBe(15);
    });
    
    it('should handle invalid dates', () => {
      expect(() => manager.parseDate('invalid')).toThrow();
    });
  });
  
  describe('formatDate', () => {
    it('should format date correctly', () => {
      const date = new Date('2024-01-15');
      const formatted = manager.formatDate(date);
      
      expect(formatted).toBe('2024-01-15');
    });
    
    it('should handle different formats', () => {
      manager.dateFormat = 'dd-MM-yyyy';
      const date = new Date('2024-01-15');
      const formatted = manager.formatDate(date);
      
      expect(formatted).toBe('15-01-2024');
    });
  });
  
  describe('getDailyNotePath', () => {
    it('should generate correct path', () => {
      const date = new Date('2024-01-15');
      const path = manager.getDailyNotePath(date);
      
      expect(path).toBe('Daily Notes/2024-01-15.md');
    });
    
    it('should handle nested folders', () => {
      manager.dailyNotesFolder = 'Journal/Daily';
      const date = new Date('2024-01-15');
      const path = manager.getDailyNotePath(date);
      
      expect(path).toBe('Journal/Daily/2024-01-15.md');
    });
  });
  
  describe('getDailyNote', () => {
    it('should get existing daily note', async () => {
      const today = new Date();
      const todayStr = manager.formatDate(today);
      const content = `# ${todayStr}\n\n## Notes\nExisting content`;
      
      await testHarness.createNote(`Daily Notes/${todayStr}.md`, content);
      
      const result = await manager.getDailyNote('today');
      
      expect(result.exists).toBe(true);
      expect(result.path).toContain(todayStr);
      expect(result.content).toContain('Existing content');
    });
    
    it('should handle missing daily note', async () => {
      const result = await manager.getDailyNote('today');
      
      expect(result.exists).toBe(false);
      expect(result.path).toBeDefined();
      expect(result.content).toBe('');
    });
    
    it('should create daily note when requested', async () => {
      const result = await manager.getDailyNote('today', true);
      
      expect(result.exists).toBe(true);
      expect(result.created).toBe(true);
      expect(result.content).toContain(manager.formatDate(new Date()));
      
      await testHarness.assertFileExists(result.path);
    });
  });
  
  describe('appendToSection', () => {
    it('should append to existing section', async () => {
      const content = `# Today\n\n## Notes\nExisting content\n\n## Tasks`;
      await testHarness.createNote('Daily Notes/test.md', content);
      
      const result = await manager.appendToSection(
        'Daily Notes/test.md',
        content,
        'Notes',
        'New content'
      );
      
      expect(result).toContain('Existing content');
      expect(result).toContain('New content');
      expect(result.indexOf('New content')).toBeGreaterThan(result.indexOf('Existing content'));
    });
    
    it('should create section if missing', async () => {
      const content = `# Today\n\n## Tasks`;
      
      const result = await manager.appendToSection(
        'Daily Notes/test.md',
        content,
        'Notes',
        'New content'
      );
      
      expect(result).toContain('## Notes');
      expect(result).toContain('New content');
    });
    
    it('should append to end if no sections exist', async () => {
      const content = `# Today`;
      
      const result = await manager.appendToSection(
        'Daily Notes/test.md',
        content,
        'Notes',
        'New content'
      );
      
      expect(result).toContain('## Notes');
      expect(result).toContain('New content');
    });
    
    it('should handle empty content', async () => {
      const result = await manager.appendToSection(
        'Daily Notes/test.md',
        '',
        'Notes',
        'New content'
      );
      
      expect(result).toContain('## Notes');
      expect(result).toContain('New content');
    });
  });
  
  describe('addTask', () => {
    it('should add task to daily note', async () => {
      const today = manager.formatDate(new Date());
      await testHarness.createNote(`Daily Notes/${today}.md`, 
        `# ${today}\n\n## Tasks\n- [ ] Existing task`
      );
      
      const result = await manager.addTask('New task', 'today');
      
      expect(result.success).toBe(true);
      
      const note = await testHarness.readNote(`Daily Notes/${today}.md`);
      expect(note.raw).toContain('- [ ] New task');
      expect(note.raw).toContain('- [ ] Existing task');
    });
    
    it('should add task with priority', async () => {
      const result = await manager.addTask('High priority task', 'today', {
        priority: 'high'
      });
      
      expect(result.success).toBe(true);
      
      const note = await testHarness.readNote(result.path);
      expect(note.raw).toContain('- [ ] 🔴 High priority task');
    });
    
    it('should add completed task', async () => {
      const result = await manager.addTask('Completed task', 'today', {
        completed: true
      });
      
      expect(result.success).toBe(true);
      
      const note = await testHarness.readNote(result.path);
      expect(note.raw).toContain('- [x] Completed task');
    });
    
    it('should add task with due date', async () => {
      const result = await manager.addTask('Task with due date', 'today', {
        due: '2024-12-31'
      });
      
      expect(result.success).toBe(true);
      
      const note = await testHarness.readNote(result.path);
      expect(note.raw).toContain('📅 2024-12-31');
    });
  });
  
  describe('addNote', () => {
    it('should add note to daily note', async () => {
      const result = await manager.addNote('Important observation', 'today');
      
      expect(result.success).toBe(true);
      
      const note = await testHarness.readNote(result.path);
      expect(note.raw).toContain('Important observation');
    });
    
    it('should add note to specific section', async () => {
      const result = await manager.addNote('Log entry', 'today', 'Log');
      
      expect(result.success).toBe(true);
      
      const note = await testHarness.readNote(result.path);
      expect(note.raw).toContain('## Log');
      expect(note.raw).toContain('Log entry');
    });
    
    it('should add timestamped note', async () => {
      const result = await manager.addNote('Timestamped entry', 'today', 'Log', {
        timestamp: true
      });
      
      expect(result.success).toBe(true);
      
      const note = await testHarness.readNote(result.path);
      expect(note.raw).toMatch(/\d{2}:\d{2} - Timestamped entry/);
    });
  });
  
  describe('formatTask', () => {
    it('should format basic task', () => {
      const task = manager.formatTask('Basic task');
      expect(task).toBe('- [ ] Basic task');
    });
    
    it('should format completed task', () => {
      const task = manager.formatTask('Done', { completed: true });
      expect(task).toBe('- [x] Done');
    });
    
    it('should format task with high priority', () => {
      const task = manager.formatTask('Important', { priority: 'high' });
      expect(task).toBe('- [ ] 🔴 Important');
    });
    
    it('should format task with medium priority', () => {
      const task = manager.formatTask('Normal', { priority: 'medium' });
      expect(task).toBe('- [ ] 🟡 Normal');
    });
    
    it('should format task with low priority', () => {
      const task = manager.formatTask('Later', { priority: 'low' });
      expect(task).toBe('- [ ] 🟢 Later');
    });
    
    it('should format task with due date', () => {
      const task = manager.formatTask('Deadline', { due: '2024-12-31' });
      expect(task).toBe('- [ ] Deadline 📅 2024-12-31');
    });
    
    it('should format task with tags', () => {
      const task = manager.formatTask('Tagged', { tags: ['work', 'urgent'] });
      expect(task).toBe('- [ ] Tagged #work #urgent');
    });
    
    it('should format task with all options', () => {
      const task = manager.formatTask('Complex', {
        priority: 'high',
        due: '2024-12-31',
        tags: ['project']
      });
      expect(task).toBe('- [ ] 🔴 Complex 📅 2024-12-31 #project');
    });
  });
  
  describe('getDailyNotes', () => {
    it('should get daily notes for date range', async () => {
      // Create some daily notes
      await testHarness.createNote('Daily Notes/2024-01-15.md', '# 2024-01-15');
      await testHarness.createNote('Daily Notes/2024-01-16.md', '# 2024-01-16');
      await testHarness.createNote('Daily Notes/2024-01-17.md', '# 2024-01-17');
      
      const result = await manager.getDailyNotes(
        new Date('2024-01-15'),
        new Date('2024-01-17')
      );
      
      expect(result.length).toBe(3);
      expect(result[0].date).toBe('2024-01-15');
      expect(result[2].date).toBe('2024-01-17');
    });
    
    it('should handle missing notes in range', async () => {
      await testHarness.createNote('Daily Notes/2024-01-15.md', '# 2024-01-15');
      // Skip 16th
      await testHarness.createNote('Daily Notes/2024-01-17.md', '# 2024-01-17');
      
      const result = await manager.getDailyNotes(
        new Date('2024-01-15'),
        new Date('2024-01-17')
      );
      
      expect(result.length).toBe(3);
      expect(result[1].exists).toBe(false);
      expect(result[1].date).toBe('2024-01-16');
    });
  });
  
  describe('extractTasks', () => {
    it('should extract tasks from content', () => {
      const content = `## Tasks
- [ ] Task 1
- [x] Completed task
- [ ] Task 2
Some text
- [ ] Task 3`;
      
      const tasks = manager.extractTasks(content);
      
      expect(tasks.length).toBe(4);
      expect(tasks[0].task).toBe('Task 1');
      expect(tasks[0].completed).toBe(false);
      expect(tasks[1].task).toBe('Completed task');
      expect(tasks[1].completed).toBe(true);
    });
    
    it('should extract tasks with metadata', () => {
      const content = `- [ ] 🔴 High priority 📅 2024-12-31 #work`;
      
      const tasks = manager.extractTasks(content);
      
      expect(tasks[0].task).toBe('High priority');
      expect(tasks[0].priority).toBe('high');
      expect(tasks[0].due).toBe('2024-12-31');
      expect(tasks[0].tags).toEqual(['work']);
    });
  });
  
  describe('error handling', () => {
    it('should handle invalid dates', async () => {
      await expect(manager.getDailyNote('invalid-date'))
        .rejects.toThrow();
    });
    
    it('should handle file system errors gracefully', async () => {
      // Try to write to invalid path
      manager.dailyNotesFolder = '../../../invalid';
      
      await expect(manager.getDailyNote('today', true))
        .rejects.toThrow();
    });
  });
});