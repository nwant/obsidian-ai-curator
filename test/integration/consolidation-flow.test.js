import { describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import { testHarness } from '../test-harness.js';

describe('Knowledge Consolidation Flow', () => {
  beforeAll(async () => {
    await testHarness.setup();
  });
  
  afterAll(async () => {
    await testHarness.teardown();
  });
  
  it('should find and consolidate related JavaScript notes', async () => {
    // Create scattered notes about JavaScript
    await testHarness.createTestVault({
      'Notes/JavaScript Basics.md': {
        content: `# JavaScript Basics
        
JavaScript is a programming language used for web development.
Variables can be declared with let, const, or var.`,
        frontmatter: { tags: ['javascript', 'basics'] }
      },
      'Notes/JS Functions.md': {
        content: `# JavaScript Functions

Functions in JavaScript can be declared in multiple ways:
- Function declarations
- Function expressions
- Arrow functions`,
        frontmatter: { tags: ['javascript', 'functions'] }
      },
      'Notes/JavaScript Arrays.md': {
        content: `# Arrays in JS

Arrays are ordered collections in JavaScript.
Common methods: map, filter, reduce`,
        frontmatter: { tags: ['javascript', 'arrays'] }
      },
      'Daily/2025-01-15.md': {
        content: `# Daily Note

Learned about JavaScript closures today. They are functions that have access to outer scope.`,
        frontmatter: { tags: ['daily-note'] }
      }
    });
    
    // Step 1: Search for JavaScript-related content
    const searchResult = await testHarness.executeTool('search_content', {
      query: 'javascript'
    });
    
    expect(searchResult.matches.length).toBeGreaterThanOrEqual(4);
    
    // Step 2: Get all JavaScript-tagged notes
    const taggedNotes = await testHarness.executeTool('find_by_metadata', {
      frontmatter: { tags: { $regex: 'javascript' } }
    });
    
    expect(taggedNotes.files.length).toBeGreaterThanOrEqual(3);
    
    // Step 3: Create consolidated note
    const consolidatedContent = `# JavaScript Complete Guide

## Basics
JavaScript is a programming language used for web development.
Variables can be declared with let, const, or var.

## Functions
Functions in JavaScript can be declared in multiple ways:
- Function declarations
- Function expressions  
- Arrow functions

## Arrays
Arrays are ordered collections in JavaScript.
Common methods: map, filter, reduce

## Advanced Concepts
### Closures
Functions that have access to outer scope.

## Sources
- [[JavaScript Basics]] - Original basics note
- [[JS Functions]] - Original functions note
- [[JavaScript Arrays]] - Original arrays note`;
    
    const result = await testHarness.executeTool('write_note', {
      path: 'References/JavaScript Complete Guide.md',
      content: consolidatedContent
    });
    
    expect(result).toHaveProperty('success', true);
    
    // Step 4: Archive original notes
    const archiveResult = await testHarness.executeTool('archive_notes', {
      moves: [
        { from: 'Notes/JavaScript Basics.md', to: 'Archive/2025/JavaScript Basics.md' },
        { from: 'Notes/JS Functions.md', to: 'Archive/2025/JS Functions.md' },
        { from: 'Notes/JavaScript Arrays.md', to: 'Archive/2025/JavaScript Arrays.md' }
      ]
    });
    
    expect(archiveResult.successful).toBe(3);
    
    // Step 5: Create git checkpoint
    const gitResult = await testHarness.executeTool('git_checkpoint', {
      message: 'Consolidated JavaScript notes'
    });
    
    expect(gitResult.success || gitResult.message === 'No changes to commit').toBeTruthy();
    
    // Verify the consolidated note exists
    await testHarness.assertFileExists('References/JavaScript Complete Guide.md');
  });
});