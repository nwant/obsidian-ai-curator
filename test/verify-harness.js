#!/usr/bin/env node

/**
 * Quick verification that our test harness works
 */

import { SimpleTestHarness } from './test-harness-simple.js';

async function verify() {
  console.log('🔍 Verifying test harness...\n');
  
  const harness = new SimpleTestHarness();
  
  try {
    // Setup
    await harness.setup();
    console.log('✅ Setup completed');
    
    // Create test notes
    await harness.createTestVault({
      'Notes/Test1.md': {
        content: '# Test Note\n\nThis is a test with #tag1 and #tag2',
        frontmatter: { tags: ['test', 'example'] }
      },
      'Notes/Test2.md': 'Simple content'
    });
    console.log('✅ Created test vault');
    
    // Test vault_scan
    const scanResult = await harness.executeTool('vault_scan', {
      includeStats: true
    });
    console.log(`✅ vault_scan found ${scanResult.files.length} files`);
    
    // Test search_content
    const searchResult = await harness.executeTool('search_content', {
      query: 'test'
    });
    console.log(`✅ search_content found ${searchResult.matches.length} matches`);
    
    // Test get_tags
    const tagsResult = await harness.executeTool('get_tags');
    console.log(`✅ get_tags found ${Object.keys(tagsResult.tags).length} unique tags`);
    
    // Test write_note
    const writeResult = await harness.executeTool('write_note', {
      path: 'Notes/New.md',
      content: '# New Note'
    });
    console.log('✅ write_note created new file');
    
    // Cleanup
    await harness.teardown();
    console.log('✅ Teardown completed');
    
    console.log('\n✨ All harness functions working correctly!');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run verification
verify();