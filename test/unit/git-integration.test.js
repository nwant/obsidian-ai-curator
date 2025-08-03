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
      const result = await git_checkpoint({ message: 'Test commit' });
      
      expect(result.success).toBe(true);
      expect(result.testMode).toBe(true);
      expect(result.message).toBe('Test commit');
      expect(result.commit).toBe('test-commit-hash');
    });
    
    it('should handle missing message', async () => {
      await expect(git_checkpoint({}))
        .rejects.toThrow('Commit message is required');
    });
    
    it('should handle missing message parameter', async () => {
      await expect(git_checkpoint())
        .rejects.toThrow();
    });
  });
  
  describe('git_changes', () => {
    it('should return test mode response when in test mode', async () => {
      const result = await git_changes({ since: 'HEAD' });
      
      expect(result.success).toBe(true);
      expect(result.testMode).toBe(true);
      expect(result.uncommitted).toEqual({
        modified: [],
        created: [],
        deleted: [],
        renamed: []
      });
      expect(result.commits).toEqual([]);
      expect(result.totalChanges).toBe(0);
      expect(result.totalCommits).toBe(0);
    });
    
    it('should use HEAD as default', async () => {
      const result = await git_changes({});
      
      expect(result.success).toBe(true);
      expect(result.since).toBe('HEAD');
    });
    
    it('should handle since parameter', async () => {
      const result = await git_changes({ since: 'HEAD~5' });
      
      expect(result.success).toBe(true);
      expect(result.since).toBe('HEAD~5');
    });
  });
  
  describe('git_rollback', () => {
    it('should return test mode response when in test mode', async () => {
      const result = await git_rollback({ commit: 'abc123' });
      
      expect(result.success).toBe(true);
      expect(result.testMode).toBe(true);
      expect(result.commit).toBe('abc123');
      expect(result.message).toBe('Successfully rolled back to commit abc123 (test mode)');
    });
    
    it('should validate commit parameter', async () => {
      await expect(git_rollback({}))
        .rejects.toThrow('Commit hash is required');
    });
    
    it('should handle missing parameter', async () => {
      await expect(git_rollback())
        .rejects.toThrow();
    });
  });
  
  
  describe('edge cases', () => {
    it('should handle very long commit messages', async () => {
      const longMessage = 'x'.repeat(1000);
      const result = await git_checkpoint({ message: longMessage });
      
      expect(result.success).toBe(true);
      expect(result.message).toBe(longMessage);
    });
    
    it('should handle special characters in messages', async () => {
      const specialMessage = 'Test: "quotes" & special\nchars';
      const result = await git_checkpoint({ message: specialMessage });
      
      expect(result.success).toBe(true);
      expect(result.message).toBe(specialMessage);
    });
    
    it('should handle unicode in messages', async () => {
      const unicodeMessage = 'Test 😀 emoji and 中文';
      const result = await git_checkpoint({ message: unicodeMessage });
      
      expect(result.success).toBe(true);
      expect(result.message).toBe(unicodeMessage);
    });
  });
});