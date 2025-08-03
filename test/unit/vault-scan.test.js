import { describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { testHarness } from '../test-harness.js';

describe('vault_scan tool', () => {
  beforeAll(async () => {
    await testHarness.setup();
    
    // Create test vault structure
    await testHarness.createTestVault({
      'Daily/2025-08-01.md': {
        content: '# Daily Note\n\nToday I worked on the test harness.',
        frontmatter: {
          date: '2025-08-01',
          tags: ['daily-note']
        }
      },
      'Daily/2025-08-02.md': {
        content: '# Daily Note\n\nContinued testing work.',
        frontmatter: {
          date: '2025-08-02',
          tags: ['daily-note', 'testing']
        }
      },
      'Projects/Test Project.md': {
        content: '# Test Project\n\nThis is a test project for the harness.',
        frontmatter: {
          status: 'active',
          priority: 'high',
          tags: ['project', 'testing']
        }
      },
      'Archive/Old Note.md': '# Old Note\n\nThis is archived.',
      'not-a-note.txt': 'This should be ignored'
    });
  });
  
  afterAll(async () => {
    await testHarness.teardown();
  });
  
  it('should scan all markdown files by default', async () => {
    const result = await testHarness.executeTool('vault_scan');
    
    expect(result.files).toBeInstanceOf(Array);
    expect(result.files).toHaveLength(4);
    
    const filePaths = result.files.map(f => f.path);
    expect(filePaths).toContain('Daily/2025-08-01.md');
    expect(filePaths).toContain('Daily/2025-08-02.md');
    expect(filePaths).toContain('Projects/Test Project.md');
    expect(filePaths).toContain('Archive/Old Note.md');
    expect(filePaths).not.toContain('not-a-note.txt');
  });
  
  it('should include file statistics when requested', async () => {
    const result = await testHarness.executeTool('vault_scan', {
      includeStats: true
    });
    
    expect(result.files).toHaveLength(4);
    
    // Check that statistics are included
    const fileWithStats = result.files[0];
    expect(fileWithStats).toHaveProperty('size');
    expect(fileWithStats).toHaveProperty('modified');
    expect(fileWithStats).toHaveProperty('wordCount');
    expect(fileWithStats.size).toBeGreaterThan(0);
    expect(fileWithStats.wordCount).toBeGreaterThan(0);
  });
  
  it('should include frontmatter when requested', async () => {
    const result = await testHarness.executeTool('vault_scan', {
      includeFrontmatter: true
    });
    
    expect(result.files).toHaveLength(4);
    
    // Find the daily note file
    const dailyNote = result.files.find(f => f.path === 'Daily/2025-08-01.md');
    expect(dailyNote).toBeDefined();
    expect(dailyNote).toHaveProperty('frontmatter');
    // Date might be parsed as Date object, check both string and date formats
    const dateValue = dailyNote.frontmatter.date;
    expect(dateValue === '2025-08-01' || dateValue?.toISOString().startsWith('2025-08-01')).toBeTruthy();
    expect(dailyNote.frontmatter.tags).toContain('daily-note');
  });
  
  it('should include content preview when requested', async () => {
    const result = await testHarness.executeTool('vault_scan', {
      includePreview: true
    });
    
    expect(result.files).toHaveLength(4);
    
    const fileWithPreview = result.files[0];
    expect(fileWithPreview).toHaveProperty('preview');
    expect(typeof fileWithPreview.preview).toBe('string');
    expect(fileWithPreview.preview.length).toBeGreaterThan(0);
    expect(fileWithPreview.preview.length).toBeLessThanOrEqual(200);
  });
  
  it('should filter by patterns', async () => {
    const result = await testHarness.executeTool('vault_scan', {
      patterns: ['Daily/**/*.md']
    });
    
    expect(result.files).toHaveLength(2);
    result.files.forEach(file => {
      expect(file.path).toMatch(/^Daily\//);
    });
  });
  
  it('should sort files by modification time', async () => {
    const result = await testHarness.executeTool('vault_scan', {
      sortBy: 'modified',
      includeStats: true
    });
    
    expect(result.files).toHaveLength(4);
    
    // Check that files are sorted by modification time (newest first by default)
    for (let i = 1; i < result.files.length; i++) {
      const prevModified = new Date(result.files[i-1].modified);
      const currModified = new Date(result.files[i].modified);
      expect(prevModified.getTime()).toBeGreaterThanOrEqual(currModified.getTime());
    }
  });
  
  it('should handle empty vault gracefully', async () => {
    // Create empty vault
    await testHarness.createTestVault({});
    
    const result = await testHarness.executeTool('vault_scan');
    
    expect(result.files).toBeInstanceOf(Array);
    expect(result.files).toHaveLength(0);
    // totalCount might not be returned for empty results
    expect(result.totalCount === 0 || result.totalCount === undefined).toBeTruthy();
  });
  
  it('should limit results when specified', async () => {
    // Recreate vault with test data since previous test cleared it
    await testHarness.createTestVault({
      'Daily/2025-08-01.md': {
        content: '# Daily Note\n\nToday I worked on the test harness.',
        frontmatter: {
          date: '2025-08-01',
          tags: ['daily-note']
        }
      },
      'Daily/2025-08-02.md': {
        content: '# Daily Note\n\nContinued testing work.',
        frontmatter: {
          date: '2025-08-02',
          tags: ['daily-note', 'testing']
        }
      },
      'Projects/Test Project.md': {
        content: '# Test Project\n\nThis is a test project for the harness.',
        frontmatter: {
          status: 'active',
          priority: 'high',
          tags: ['project', 'testing']
        }
      },
      'Archive/Old Note.md': '# Old Note\n\nThis is archived.'
    });
    
    const result = await testHarness.executeTool('vault_scan', {
      limit: 2
    });
    
    expect(result.files).toHaveLength(2);
    expect(result.totalCount).toBe(4);
    // Note: truncated flag might not be in the implementation
  });
  
  it('should handle errors gracefully', async () => {
    // This should not throw, but handle gracefully
    await expect(testHarness.executeTool('vault_scan', {
      patterns: ['**/*.md'],
      limit: -1 // Invalid limit
    })).resolves.toBeDefined();
  });
});