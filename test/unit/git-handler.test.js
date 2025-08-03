import { describe, it, beforeEach, afterEach, expect } from '@jest/globals';
import { GitHandler } from '../../src/handlers/git-handler.js';
import { testHarness } from '../test-harness.js';
import simpleGit from 'simple-git';

describe('GitHandler', () => {
  let handler;
  let config;
  
  beforeEach(async () => {
    await testHarness.setup();
    
    config = {
      vaultPath: testHarness.testVaultPath,
      testMode: true // Use test mode by default
    };
    
    handler = new GitHandler(config);
  });
  
  afterEach(async () => {
    await testHarness.teardown();
  });
  
  describe('initialization', () => {
    it('should initialize with config', () => {
      expect(handler.config).toBe(config);
      expect(handler.config.vaultPath).toBe(testHarness.testVaultPath);
    });
  });
  
  describe('checkpoint (test mode)', () => {
    it('should create checkpoint in test mode', async () => {
      const result = await handler.checkpoint({ message: 'Test checkpoint' });
      
      expect(result.success).toBe(true);
      expect(result.testMode).toBe(true);
      expect(result.message).toBe('Test checkpoint');
      expect(result.commit).toBe('test-commit-hash');
    });
    
    it('should handle missing message', async () => {
      const result = await handler.checkpoint({});
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Checkpoint');
    });
  });
  
  describe('getChanges (test mode)', () => {
    it('should get changes in test mode', async () => {
      const result = await handler.getChanges({ since: 'HEAD~1' });
      
      expect(result.success).toBe(true);
      expect(result.testMode).toBe(true);
      expect(result.changes).toEqual([]);
      expect(result.since).toBe('HEAD~1');
    });
    
    it('should default to HEAD', async () => {
      const result = await handler.getChanges({});
      
      expect(result.success).toBe(true);
      expect(result.since).toBe('HEAD');
    });
  });
  
  describe('rollback (test mode)', () => {
    it('should rollback in test mode', async () => {
      const result = await handler.rollback({ commit: 'abc123' });
      
      expect(result.success).toBe(true);
      expect(result.testMode).toBe(true);
      expect(result.rolledBackTo).toBe('abc123');
    });
    
    it('should require commit parameter', async () => {
      await expect(handler.rollback({})).rejects.toThrow('commit is required');
    });
  });
  
  describe('real git operations', () => {
    let realHandler;
    let git;
    
    beforeEach(async () => {
      // Create handler without test mode
      const realConfig = {
        ...config,
        testMode: false
      };
      realHandler = new GitHandler(realConfig);
      
      // Initialize git repo
      git = simpleGit(testHarness.testVaultPath);
      await git.init();
      await git.addConfig('user.name', 'Test User');
      await git.addConfig('user.email', 'test@example.com');
      
      // Create initial commit
      await testHarness.createNote('initial.md', 'Initial content');
      await git.add('.');
      await git.commit('Initial commit');
    });
    
    it('should create real checkpoint', async () => {
      await testHarness.createNote('new-file.md', 'New content');
      
      const result = await realHandler.checkpoint({ 
        message: 'Add new file' 
      });
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Add new file');
      expect(result.filesChanged).toBe(1);
      expect(result.commit).toBeTruthy();
      expect(result.commit).not.toBe('test-commit-hash');
    });
    
    it('should get real changes', async () => {
      // Make changes
      await testHarness.createNote('file1.md', 'Content 1');
      await testHarness.createNote('file2.md', 'Content 2');
      await git.add('.');
      await git.commit('Add files');
      
      const result = await realHandler.getChanges({ since: 'HEAD~1' });
      
      expect(result.success).toBe(true);
      expect(result.changes.length).toBe(2);
      expect(result.changes.some(c => c.includes('file1.md'))).toBe(true);
      expect(result.changes.some(c => c.includes('file2.md'))).toBe(true);
    });
    
    it('should handle no changes', async () => {
      const result = await realHandler.checkpoint({ 
        message: 'Nothing to commit' 
      });
      
      expect(result.success).toBe(true);
      expect(result.filesChanged).toBe(0);
    });
    
    it('should handle git errors', async () => {
      // Try invalid operation
      const result = await realHandler.getChanges({ 
        since: 'invalid-ref' 
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });
  
  describe('error handling', () => {
    it('should validate config', async () => {
      const badHandler = new GitHandler({});
      
      await expect(badHandler.checkpoint({ message: 'Test' }))
        .rejects.toThrow('vaultPath is required');
    });
    
    it('should handle invalid parameters gracefully', async () => {
      // Invalid message type
      await expect(handler.checkpoint({ message: 123 }))
        .rejects.toThrow('must be a string');
      
      // Invalid since type
      await expect(handler.getChanges({ since: true }))
        .rejects.toThrow('must be a string');
    });
  });
});