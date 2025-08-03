import { describe, it, beforeEach, afterEach, expect } from '@jest/globals';
import { git_checkpoint, git_changes, git_rollback } from '../../src/tools/git-integration.js';
import simpleGit from 'simple-git';
import { testHarness } from '../test-harness.js';

describe('Git Integration', () => {
  let config;
  
  beforeEach(async () => {
    await testHarness.setup();
    config = {
      vaultPath: testHarness.testVaultPath,
      testMode: true // Use test mode to avoid actual git operations
    };
  });
  
  afterEach(async () => {
    await testHarness.teardown();
  });
  
  describe('git_checkpoint', () => {
    it('should return test mode response when in test mode', async () => {
      const result = await git_checkpoint(config, { message: 'Test commit' });
      
      expect(result.success).toBe(true);
      expect(result.testMode).toBe(true);
      expect(result.message).toBe('Test commit');
      expect(result.commit).toBe('test-commit-hash');
    });
    
    it('should handle missing message', async () => {
      const result = await git_checkpoint(config, {});
      
      expect(result.success).toBe(true);
      expect(result.message).toMatch(/Checkpoint/);
    });
    
    it('should validate config', async () => {
      await expect(git_checkpoint({}, { message: 'Test' }))
        .rejects.toThrow('vaultPath is required');
    });
    
    it('should validate message parameter', async () => {
      await expect(git_checkpoint(config, { message: 123 }))
        .rejects.toThrow('must be a string');
    });
  });
  
  describe('git_changes', () => {
    it('should return test mode response when in test mode', async () => {
      const result = await git_changes(config, { since: 'HEAD' });
      
      expect(result.success).toBe(true);
      expect(result.testMode).toBe(true);
      expect(result.changes).toEqual([]);
    });
    
    it('should use HEAD as default', async () => {
      const result = await git_changes(config, {});
      
      expect(result.success).toBe(true);
      expect(result.since).toBe('HEAD');
    });
    
    it('should validate config', async () => {
      await expect(git_changes({}, {}))
        .rejects.toThrow('vaultPath is required');
    });
  });
  
  describe('git_rollback', () => {
    it('should return test mode response when in test mode', async () => {
      const result = await git_rollback(config, { commit: 'abc123' });
      
      expect(result.success).toBe(true);
      expect(result.testMode).toBe(true);
      expect(result.rolledBackTo).toBe('abc123');
    });
    
    it('should validate commit parameter', async () => {
      await expect(git_rollback(config, {}))
        .rejects.toThrow('commit is required');
    });
    
    it('should validate config', async () => {
      await expect(git_rollback({}, { commit: 'abc123' }))
        .rejects.toThrow('vaultPath is required');
    });
  });
  
  describe('real git operations (when not in test mode)', () => {
    let git;
    let realConfig;
    
    beforeEach(async () => {
      realConfig = {
        vaultPath: testHarness.testVaultPath,
        testMode: false
      };
      
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
      // Add a new file
      await testHarness.createNote('new-file.md', 'New content');
      
      const result = await git_checkpoint(realConfig, {
        message: 'Add new file'
      });
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Add new file');
      expect(result.filesChanged).toBe(1);
      expect(result.commit).toBeTruthy();
      expect(result.testMode).toBeUndefined();
    });
    
    it('should get real changes', async () => {
      // Make some changes
      await testHarness.createNote('file1.md', 'Content 1');
      await testHarness.createNote('file2.md', 'Content 2');
      await git.add('.');
      const commit = await git.commit('Add files');
      
      const result = await git_changes(realConfig, {
        since: 'HEAD~1'
      });
      
      expect(result.success).toBe(true);
      expect(result.changes.length).toBe(2);
      expect(result.changes.some(c => c.includes('file1.md'))).toBe(true);
      expect(result.changes.some(c => c.includes('file2.md'))).toBe(true);
    });
    
    it('should handle nothing to commit', async () => {
      const result = await git_checkpoint(realConfig, {
        message: 'Nothing to commit'
      });
      
      expect(result.success).toBe(true);
      expect(result.filesChanged).toBe(0);
    });
    
    it('should handle git errors gracefully', async () => {
      // Try to get changes with invalid ref
      const result = await git_changes(realConfig, {
        since: 'invalid-ref'
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });
  
  describe('edge cases', () => {
    it('should handle very long commit messages', async () => {
      const longMessage = 'x'.repeat(1000);
      const result = await git_checkpoint(config, { message: longMessage });
      
      expect(result.success).toBe(true);
      expect(result.message).toBe(longMessage);
    });
    
    it('should handle special characters in messages', async () => {
      const specialMessage = 'Test: "quotes" & special\nchars';
      const result = await git_checkpoint(config, { message: specialMessage });
      
      expect(result.success).toBe(true);
      expect(result.message).toBe(specialMessage);
    });
    
    it('should handle unicode in messages', async () => {
      const unicodeMessage = 'Test 😀 emoji and 中文';
      const result = await git_checkpoint(config, { message: unicodeMessage });
      
      expect(result.success).toBe(true);
      expect(result.message).toBe(unicodeMessage);
    });
  });
});