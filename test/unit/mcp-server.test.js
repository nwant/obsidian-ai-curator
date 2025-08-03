import { describe, it, beforeEach, afterEach, expect } from '@jest/globals';
import { McpServer } from '../../src/mcp-server-refactored.js';
import { testHarness } from '../test-harness.js';

describe('McpServer', () => {
  let server;
  let config;
  
  beforeEach(async () => {
    await testHarness.setup();
    
    config = {
      vaultPath: testHarness.testVaultPath,
      serverName: 'test-server',
      serverVersion: '1.0.0',
      cacheEnabled: true,
      testMode: true
    };
    
    server = new McpServer(config);
  });
  
  afterEach(async () => {
    await testHarness.teardown();
  });
  
  describe('initialization', () => {
    it('should initialize with config', () => {
      expect(server.config).toBe(config);
      expect(server.config.vaultPath).toBe(testHarness.testVaultPath);
    });
    
    it('should initialize handlers', () => {
      expect(server.vaultHandler).toBeDefined();
      expect(server.noteHandler).toBeDefined();
      expect(server.searchHandler).toBeDefined();
      expect(server.gitHandler).toBeDefined();
      expect(server.tagHandler).toBeDefined();
    });
    
    it('should initialize cache when enabled', () => {
      expect(server.cache).toBeDefined();
    });
    
    it('should work without cache', () => {
      const noCacheServer = new McpServer({
        ...config,
        cacheEnabled: false
      });
      
      expect(noCacheServer.cache).toBeDefined(); // Still created but disabled
    });
  });
  
  describe('getTools', () => {
    it('should return all available tools', () => {
      const tools = server.getTools();
      
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
      
      // Check for essential tools
      const toolNames = tools.map(t => t.name);
      expect(toolNames).toContain('vault_scan');
      expect(toolNames).toContain('read_notes');
      expect(toolNames).toContain('write_note');
      expect(toolNames).toContain('search_content');
      expect(toolNames).toContain('git_checkpoint');
      expect(toolNames).toContain('get_tags');
    });
    
    it('should include performance metrics tool when available', () => {
      const tools = server.getTools();
      const toolNames = tools.map(t => t.name);
      
      if (server.performanceMonitor) {
        expect(toolNames).toContain('view_performance_metrics');
      }
    });
  });
  
  describe('handleToolCall - vault operations', () => {
    it('should handle vault_scan', async () => {
      await testHarness.createNote('test.md', 'Content');
      
      const result = await server.handleToolCall('vault_scan', {});
      
      expect(result.files).toBeDefined();
      expect(Array.isArray(result.files)).toBe(true);
      expect(result.total).toBeGreaterThanOrEqual(0);
    });
    
    it('should handle vault_scan with patterns', async () => {
      await testHarness.createNote('test.md', 'Markdown');
      await testHarness.createNote('data.json', '{}');
      
      const result = await server.handleToolCall('vault_scan', {
        patterns: ['*.md']
      });
      
      expect(result.files.every(f => f.path.endsWith('.md'))).toBe(true);
    });
  });
  
  describe('handleToolCall - note operations', () => {
    it('should handle read_notes', async () => {
      await testHarness.createNote('note.md', '# Test Note', {
        tags: ['test']
      });
      
      const result = await server.handleToolCall('read_notes', {
        paths: ['note.md']
      });
      
      expect(result.notes).toBeDefined();
      expect(result.notes.length).toBe(1);
      expect(result.notes[0].content).toContain('Test Note');
    });
    
    it('should handle write_note', async () => {
      const result = await server.handleToolCall('write_note', {
        path: 'new-note.md',
        content: '# New Note\n\nContent'
      });
      
      expect(result.success).toBe(true);
      await testHarness.assertFileExists('new-note.md');
    });
    
    it('should handle update_frontmatter', async () => {
      await testHarness.createNote('update.md', 'Content', {
        existing: 'value'
      });
      
      const result = await server.handleToolCall('update_frontmatter', {
        path: 'update.md',
        updates: { new: 'field' }
      });
      
      expect(result.success).toBe(true);
      
      const note = await testHarness.readNote('update.md');
      expect(note.frontmatter.new).toBe('field');
      expect(note.frontmatter.existing).toBe('value');
    });
  });
  
  describe('handleToolCall - search operations', () => {
    beforeEach(async () => {
      await testHarness.createTestVault({
        'doc1.md': { content: 'JavaScript programming' },
        'doc2.md': { content: 'Python programming' },
        'doc3.md': { content: 'Rust systems programming' }
      });
    });
    
    it('should handle search_content', async () => {
      const result = await server.handleToolCall('search_content', {
        query: 'programming'
      });
      
      expect(result.matches).toBeDefined();
      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.totalMatches).toBe(result.matches.length);
    });
    
    it('should handle find_by_metadata', async () => {
      await testHarness.createNote('meta.md', 'Content', {
        status: 'active',
        priority: 5
      });
      
      const result = await server.handleToolCall('find_by_metadata', {
        frontmatter: { status: 'active' }
      });
      
      expect(result.files).toBeDefined();
      expect(result.files.some(f => f.path === 'meta.md')).toBe(true);
    });
  });
  
  describe('handleToolCall - git operations', () => {
    it('should handle git_checkpoint in test mode', async () => {
      const result = await server.handleToolCall('git_checkpoint', {
        message: 'Test commit'
      });
      
      expect(result.success).toBe(true);
      expect(result.testMode).toBe(true);
    });
    
    it('should handle git_changes', async () => {
      const result = await server.handleToolCall('git_changes', {
        since: 'HEAD'
      });
      
      expect(result.success).toBe(true);
      expect(result.changes).toBeDefined();
    });
  });
  
  describe('handleToolCall - tag operations', () => {
    beforeEach(async () => {
      await testHarness.createNote('tagged.md', '#tag1 #tag2', {
        tags: ['frontmatter-tag']
      });
    });
    
    it('should handle get_tags', async () => {
      const result = await server.handleToolCall('get_tags', {});
      
      expect(result.tags).toBeDefined();
      expect(result.tags).toContain('tag1');
      expect(result.tags).toContain('tag2');
      expect(result.tags).toContain('frontmatter-tag');
    });
    
    it('should handle analyze_tags', async () => {
      const result = await server.handleToolCall('analyze_tags', {});
      
      expect(result.tags).toBeDefined();
      expect(result.totalUsage).toBeGreaterThan(0);
      expect(result.hierarchy).toBeDefined();
    });
    
    it('should handle update_tags', async () => {
      const result = await server.handleToolCall('update_tags', {
        path: 'tagged.md',
        add: ['new-tag']
      });
      
      expect(result.success).toBe(true);
      
      const note = await testHarness.readNote('tagged.md');
      expect(note.frontmatter.tags).toContain('new-tag');
    });
  });
  
  describe('handleToolCall - daily notes', () => {
    it('should handle get_daily_note', async () => {
      const result = await server.handleToolCall('get_daily_note', {
        date: 'today'
      });
      
      expect(result.path).toBeDefined();
      expect(result.path).toContain(new Date().toISOString().split('T')[0]);
    });
    
    it('should handle append_to_daily_note', async () => {
      const result = await server.handleToolCall('append_to_daily_note', {
        content: 'New note entry'
      });
      
      expect(result.success).toBe(true);
    });
    
    it('should handle add_daily_task', async () => {
      const result = await server.handleToolCall('add_daily_task', {
        task: 'Complete tests'
      });
      
      expect(result.success).toBe(true);
    });
  });
  
  describe('handleToolCall - project operations', () => {
    it('should handle init_project', async () => {
      const result = await server.handleToolCall('init_project', {
        projectName: 'Test Project',
        description: 'A test project'
      });
      
      expect(result.success).toBe(true);
      expect(result.created).toBeDefined();
      expect(result.created.length).toBeGreaterThan(0);
    });
    
    it('should handle list_project_templates', async () => {
      const result = await server.handleToolCall('list_project_templates', {});
      
      expect(result.templates).toBeDefined();
      expect(Array.isArray(result.templates)).toBe(true);
    });
  });
  
  describe('handleToolCall - file operations', () => {
    it('should handle move_file', async () => {
      await testHarness.createNote('source.md', 'Content');
      
      const result = await server.handleToolCall('move_file', {
        sourcePath: 'source.md',
        targetPath: 'target.md'
      });
      
      expect(result.success).toBe(true);
      await testHarness.assertFileExists('target.md');
      await testHarness.assertFileNotExists('source.md');
    });
    
    it('should handle rename_file', async () => {
      await testHarness.createNote('old-name.md', 'Content');
      
      const result = await server.handleToolCall('rename_file', {
        oldPath: 'old-name.md',
        newPath: 'new-name.md'
      });
      
      expect(result.success).toBe(true);
      await testHarness.assertFileExists('new-name.md');
    });
  });
  
  describe('error handling', () => {
    it('should handle unknown tool', async () => {
      await expect(server.handleToolCall('unknown_tool', {}))
        .rejects.toThrow('Unknown tool');
    });
    
    it('should handle missing required parameters', async () => {
      await expect(server.handleToolCall('read_notes', {}))
        .rejects.toThrow();
    });
    
    it('should handle invalid paths', async () => {
      await expect(server.handleToolCall('read_notes', {
        paths: ['../../../etc/passwd']
      })).rejects.toThrow();
    });
  });
  
  describe('performance tracking', () => {
    it('should track operation performance when monitor is available', async () => {
      if (server.performanceMonitor) {
        await server.handleToolCall('vault_scan', {});
        
        const metrics = server.performanceMonitor.getMetrics();
        expect(Object.keys(metrics).length).toBeGreaterThan(0);
      }
    });
  });
});