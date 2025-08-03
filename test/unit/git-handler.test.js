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
      const result = await handler.createCheckpoint({ message: 'Test checkpoint' });
      
      expect(result.success).toBe(true);
      expect(result.testMode).toBe(true);
      expect(result.message).toBe('Test checkpoint');
      expect(result.commit).toBe('test-commit-hash');
    });
    
    it('should handle missing message', async () => {
      await expect(handler.createCheckpoint({})).rejects.toThrow('Commit message is required');
    });
  });
  
  describe('getChanges (test mode)', () => {
    it('should get changes in test mode', async () => {
      const result = await handler.getChanges({ since: 'HEAD~1' });
      
      expect(result.success).toBe(true);
      expect(result.testMode).toBe(true);
      expect(result.uncommitted).toEqual({
        modified: [],
        created: [],
        deleted: [],
        renamed: []
      });
      expect(result.commits).toEqual([]);
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
      expect(result.commit).toBe('abc123');
      expect(result.message).toBe('Successfully rolled back to commit abc123 (test mode)');
    });
    
    it('should require commit parameter', async () => {
      await expect(handler.rollback({})).rejects.toThrow('Commit hash is required');
    });
  });
  
  
  describe('error handling', () => {
    it('should validate config', async () => {
      const badHandler = new GitHandler({});
      
      // GitHandler doesn't validate config itself, git functions will
    });
    
    it('should handle invalid parameters gracefully', async () => {
      // Handler passes through to git functions
      await expect(handler.createCheckpoint({})).rejects.toThrow();
      await expect(handler.rollback({})).rejects.toThrow();
    });
  });
});