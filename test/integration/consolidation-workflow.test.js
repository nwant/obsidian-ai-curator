import { describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import { testHarness } from '../test-harness.js';

describe('Note Consolidation Workflow', () => {
  beforeAll(async () => {
    await testHarness.setup();
  });
  
  afterAll(async () => {
    await testHarness.teardown();
  });
  
  it('should complete full Python note consolidation workflow', async () => {
    // Create scattered notes about Python
    await testHarness.createTestVault({
      'Inbox/python tips.md': {
        content: '# Python Tips\n\n- Use list comprehensions\n- Type hints are helpful',
        frontmatter: { tags: ['python', 'tips'] }
      },
      'Daily/2025-07-15.md': {
        content: '# Daily Note\n\n## Python Learning\n\nLearned about async/await today.',
        frontmatter: { tags: ['daily-note', 'python'] }
      },
      'Projects/Python Study.md': {
        content: '# Python Study\n\n## Decorators\n\n@property is useful for getters',
        frontmatter: { tags: ['python', 'learning'] }
      },
      'Notes/Python async.md': {
        content: '# Python Async\n\nasync def and await keywords for concurrent code',
        frontmatter: { tags: ['python', 'async'] }
      }
    });
    
    // Step 1: Search for Python content
    const searchResult = await testHarness.executeTool('search_content', {
      query: 'Python',
      contextLines: 1
    });
    
    expect(searchResult.matches.length).toBeGreaterThanOrEqual(4);
    
    // Step 2: Find notes by metadata
    const metadataResult = await testHarness.executeTool('find_by_metadata', {
      frontmatter: {
        tags: { '$in': ['python'] }
      }
    });
    
    expect(metadataResult.files.length).toBe(4);
    
    // Step 3: Read all Python notes
    const pythonNotes = [
      'Inbox/python tips.md',
      'Projects/Python Study.md',
      'Notes/Python async.md'
    ];
    
    const readResult = await testHarness.executeTool('read_notes', {
      paths: pythonNotes
    });
    
    expect(readResult.notes.length).toBe(3);
    
    // Step 4: Create consolidated note
    const consolidatedContent = `# Python Knowledge Base

## Overview
This note consolidates Python knowledge from various sources.

## Tips & Best Practices
- Use list comprehensions
- Type hints are helpful
- Use @property decorator for getters

## Async Programming
async def and await keywords for concurrent code

## Learning Notes
- Learned about async/await
- Decorators are powerful

## Sources
Consolidated from:
- [[python tips]]
- [[Python Study]]
- [[Python async]]
`;
    
    await testHarness.executeTool('write_note', {
      path: 'Knowledge/Python Knowledge Base.md',
      content: consolidatedContent
    });
    
    // Verify consolidated note exists
    await testHarness.assertFileExists('Knowledge/Python Knowledge Base.md');
    await testHarness.assertFileContains('Knowledge/Python Knowledge Base.md', 'Tips & Best Practices');
    
    // Step 5: Add comprehensive tags
    await testHarness.executeTool('update_tags', {
      path: 'Knowledge/Python Knowledge Base.md',
      add: ['python', 'consolidated', 'knowledge-base', 'programming']
    });
    
    // Step 6: Archive original notes
    await testHarness.executeTool('archive_notes', {
      moves: [
        { from: 'Inbox/python tips.md', to: 'Archive/2025/python tips.md' },
        { from: 'Notes/Python async.md', to: 'Archive/2025/Python async.md' }
      ]
    });
    
    // Verify moves
    await testHarness.assertFileExists('Archive/2025/python tips.md');
    await testHarness.assertFileExists('Archive/2025/Python async.md');
    
    // Step 7: Create checkpoint
    const gitResult = await testHarness.executeTool('git_checkpoint', {
      message: 'Consolidated Python notes'
    });
    
    // In test mode, this might be mocked
    expect(gitResult.success || gitResult.testMode).toBe(true);
    
    // Final verification
    const finalScan = await testHarness.executeTool('vault_scan', {
      patterns: ['Knowledge/**/*.md']
    });
    
    expect(finalScan.files.some(f => f.path === 'Knowledge/Python Knowledge Base.md')).toBe(true);
    
    // Check that archived notes are not in original locations
    const inboxScan = await testHarness.executeTool('vault_scan', {
      patterns: ['Inbox/**/*.md']
    });
    
    expect(inboxScan.files.some(f => f.path === 'Inbox/python tips.md')).toBe(false);
  });
});