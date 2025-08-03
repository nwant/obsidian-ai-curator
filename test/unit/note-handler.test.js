import { describe, it, beforeEach, afterEach, expect } from '@jest/globals';
import { NoteHandler } from '../../src/handlers/note-handler.js';
import { VaultCache } from '../../src/cache/vault-cache.js';
import { ObsidianAPIClient } from '../../src/obsidian-api-client.js';
import fs from 'fs/promises';
import path from 'path';

// Mock dependencies
jest.mock('../../src/cache/vault-cache.js');
jest.mock('../../src/obsidian-api-client.js');
jest.mock('fs/promises');
jest.mock('../../src/tools/path-validator.js', () => ({
  validatePath: jest.fn()
}));
jest.mock('../../src/tools/link-formatter.js', () => ({
  LinkFormatter: jest.fn().mockImplementation(() => ({
    convertToWikilinks: jest.fn(content => content)
  }))
}));
jest.mock('../../src/tools/tag-formatter.js', () => ({
  TagFormatter: jest.fn().mockImplementation(() => ({
    formatTags: jest.fn(tags => tags)
  }))
}));
jest.mock('../../src/tools/frontmatter-manager.js', () => ({
  FrontmatterManager: jest.fn().mockImplementation(() => ({
    getFrontmatter: jest.fn(),
    updateFrontmatter: jest.fn()
  }))
}));

import { validatePath } from '../../src/tools/path-validator.js';

describe('NoteHandler - Error Conditions and Edge Cases', () => {
  let handler;
  let mockConfig;
  let mockCache;
  let mockApiClient;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    mockConfig = {
      vaultPath: '/test/vault',
      dateFormat: 'yyyy-MM-dd'
    };
    
    mockCache = {
      getFileContent: jest.fn(),
      invalidateFile: jest.fn()
    };
    
    mockApiClient = {
      isConnected: jest.fn().mockReturnValue(false),
      request: jest.fn()
    };
    
    VaultCache.mockImplementation(() => mockCache);
    ObsidianAPIClient.mockImplementation(() => mockApiClient);
    
    handler = new NoteHandler(mockConfig, mockCache, mockApiClient);
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('readNotes - Error Conditions', () => {
    it('should handle path validation errors', async () => {
      validatePath.mockImplementation(() => {
        throw new Error('Invalid path: traversal detected');
      });
      
      const result = await handler.readNotes({ 
        paths: ['../../../etc/passwd', 'normal.md'] 
      });
      
      expect(result.notes).toHaveLength(2);
      expect(result.notes[0].error).toBe('Invalid path: traversal detected');
      expect(result.notes[1].path).toBe('normal.md');
    });
    
    it('should handle file read errors gracefully', async () => {
      validatePath.mockImplementation(() => {});
      mockCache.getFileContent
        .mockResolvedValueOnce('# Good note')
        .mockRejectedValueOnce(new Error('Permission denied'))
        .mockResolvedValueOnce('# Another good note');
      
      const result = await handler.readNotes({
        paths: ['good1.md', 'forbidden.md', 'good2.md']
      });
      
      expect(result.notes).toHaveLength(3);
      expect(result.notes[0].content).toBeDefined();
      expect(result.notes[1].error).toBe('Permission denied');
      expect(result.notes[2].content).toBeDefined();
    });
    
    it('should handle malformed frontmatter', async () => {
      validatePath.mockImplementation(() => {});
      mockCache.getFileContent.mockResolvedValue(`---
invalid yaml: [unclosed
---
Content here`);
      
      const result = await handler.readNotes({ paths: ['malformed.md'] });
      
      expect(result.notes).toHaveLength(1);
      // Should still return something, even if frontmatter parsing fails
      expect(result.notes[0].path).toBe('malformed.md');
    });
    
    it('should handle missing file stats gracefully', async () => {
      validatePath.mockImplementation(() => {});
      mockCache.getFileContent.mockResolvedValue('# Content');
      fs.stat.mockRejectedValue(new Error('ENOENT'));
      
      const result = await handler.readNotes({ paths: ['missing-stats.md'] });
      
      expect(result.notes[0].content).toBe('# Content');
      expect(result.notes[0].stats).toBeUndefined();
    });
    
    it('should handle empty paths array', async () => {
      const result = await handler.readNotes({ paths: [] });
      
      expect(result.notes).toEqual([]);
    });
    
    it('should handle very large files', async () => {
      validatePath.mockImplementation(() => {});
      const largeContent = 'x'.repeat(10 * 1024 * 1024); // 10MB
      mockCache.getFileContent.mockResolvedValue(largeContent);
      
      const result = await handler.readNotes({ paths: ['large.md'] });
      
      expect(result.notes[0].content).toHaveLength(10 * 1024 * 1024);
    });
  });
  
  describe('writeNote - Error Conditions', () => {
    it('should handle API write failures and fallback', async () => {
      validatePath.mockImplementation(() => {});
      mockApiClient.isConnected.mockReturnValue(true);
      mockApiClient.request.mockRejectedValue(new Error('API unavailable'));
      
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      
      const result = await handler.writeNote({
        path: 'test.md',
        content: '# Test'
      });
      
      expect(result.success).toBe(true);
      expect(fs.writeFile).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        'API write failed, falling back to file system:',
        'API unavailable'
      );
    });
    
    it('should handle directory creation failures', async () => {
      validatePath.mockImplementation(() => {});
      fs.mkdir.mockRejectedValue(new Error('Disk full'));
      
      const result = await handler.writeNote({
        path: 'deep/nested/note.md',
        content: 'Content'
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Disk full');
    });
    
    it('should handle file write permission errors', async () => {
      validatePath.mockImplementation(() => {});
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockRejectedValue(new Error('EACCES: permission denied'));
      
      const result = await handler.writeNote({
        path: 'readonly.md',
        content: 'Content'
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('EACCES: permission denied');
    });
    
    it('should handle very long content', async () => {
      validatePath.mockImplementation(() => {});
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      
      const longContent = 'a'.repeat(50 * 1024 * 1024); // 50MB
      
      const result = await handler.writeNote({
        path: 'huge.md',
        content: longContent
      });
      
      expect(result.success).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('a'.repeat(1000)),
        'utf-8'
      );
    });
    
    it('should handle special characters in content', async () => {
      validatePath.mockImplementation(() => {});
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      
      const specialContent = '# Test\n\n• Bullet\n→ Arrow\n© Copyright\n🎉 Emoji';
      
      const result = await handler.writeNote({
        path: 'special.md',
        content: specialContent
      });
      
      expect(result.success).toBe(true);
      const writtenContent = fs.writeFile.mock.calls[0][1];
      expect(writtenContent).toContain('🎉 Emoji');
    });
    
    it('should handle concurrent writes to same file', async () => {
      validatePath.mockImplementation(() => {});
      fs.mkdir.mockResolvedValue();
      
      // Simulate slow write
      fs.writeFile.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      );
      
      const promises = Array(5).fill(null).map((_, i) =>
        handler.writeNote({
          path: 'concurrent.md',
          content: `Version ${i}`
        })
      );
      
      const results = await Promise.all(promises);
      
      expect(results.every(r => r.success)).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledTimes(5);
    });
  });
  
  describe('archiveNotes - Error Conditions', () => {
    it('should handle partial failures in batch operations', async () => {
      validatePath.mockImplementation((path) => {
        if (path.includes('invalid')) {
          throw new Error('Invalid path');
        }
      });
      
      fs.mkdir.mockResolvedValue();
      fs.rename
        .mockResolvedValueOnce() // First succeeds
        .mockRejectedValueOnce(new Error('File locked')) // Second fails
        .mockResolvedValueOnce(); // Third succeeds
      
      const result = await handler.archiveNotes({
        moves: [
          { from: 'note1.md', to: 'archive/note1.md' },
          { from: 'note2.md', to: 'archive/note2.md' },
          { from: 'note3.md', to: 'archive/note3.md' },
          { from: 'invalid/../etc.md', to: 'archive/etc.md' }
        ]
      });
      
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(2);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].error).toBe('File locked');
      expect(result.errors[1].error).toBe('Invalid path');
    });
    
    it('should handle API batch operation failures', async () => {
      mockApiClient.isConnected.mockReturnValue(true);
      mockApiClient.request.mockRejectedValue(new Error('Batch operation failed'));
      
      validatePath.mockImplementation(() => {});
      fs.mkdir.mockResolvedValue();
      fs.rename.mockResolvedValue();
      
      const result = await handler.archiveNotes({
        moves: [
          { from: 'note1.md', to: 'archive/note1.md' },
          { from: 'note2.md', to: 'archive/note2.md' }
        ]
      });
      
      // Should fallback to individual operations
      expect(result.successful).toBe(2);
      expect(fs.rename).toHaveBeenCalledTimes(2);
    });
    
    it('should handle empty moves array', async () => {
      const result = await handler.archiveNotes({ moves: [] });
      
      expect(result.successful).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.errors).toEqual([]);
    });
    
    it('should handle cyclic moves', async () => {
      validatePath.mockImplementation(() => {});
      fs.mkdir.mockResolvedValue();
      
      let renameCount = 0;
      fs.rename.mockImplementation(async (from, to) => {
        renameCount++;
        if (renameCount > 10) {
          throw new Error('Too many operations');
        }
      });
      
      const result = await handler.archiveNotes({
        moves: [
          { from: 'a.md', to: 'b.md' },
          { from: 'b.md', to: 'c.md' },
          { from: 'c.md', to: 'a.md' }
        ]
      });
      
      expect(result.successful).toBe(3);
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle notes with no extension', async () => {
      validatePath.mockImplementation(() => {});
      mockCache.getFileContent.mockResolvedValue('Content without extension');
      
      const result = await handler.readNotes({ paths: ['README', 'LICENSE'] });
      
      expect(result.notes).toHaveLength(2);
      expect(result.notes[0].path).toBe('README');
    });
    
    it('should handle hidden files', async () => {
      validatePath.mockImplementation(() => {});
      mockCache.getFileContent.mockResolvedValue('Hidden content');
      
      const result = await handler.readNotes({ paths: ['.hidden.md'] });
      
      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].path).toBe('.hidden.md');
    });
    
    it('should handle files with multiple dots', async () => {
      validatePath.mockImplementation(() => {});
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      
      const result = await handler.writeNote({
        path: 'my.notes.backup.2024.md',
        content: 'Content'
      });
      
      expect(result.success).toBe(true);
    });
    
    it('should handle Windows-style paths', async () => {
      validatePath.mockImplementation(() => {});
      const windowsPath = 'folder\\subfolder\\note.md';
      
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      
      const result = await handler.writeNote({
        path: windowsPath,
        content: 'Windows path content'
      });
      
      expect(result.success).toBe(true);
      // Should normalize path separators
      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining(path.sep),
        { recursive: true }
      );
    });
  });
});