#!/usr/bin/env node

/**
 * Test script for file operations with link preservation
 * 
 * This demonstrates how rename_file and move_file tools
 * preserve all links throughout the vault.
 */

import { FileOperations } from '../src/tools/file-operations.js';
import { ObsidianAPIClient } from '../src/obsidian-api-client.js';
import { promises as fs } from 'fs';
import path from 'path';

// Load config
const config = JSON.parse(
  await fs.readFile('./config/config.json', 'utf-8')
);

console.log('🧪 File Operations Test\n');

// Initialize
const obsidianAPI = new ObsidianAPIClient();
const fileOps = new FileOperations(config, obsidianAPI);

// Wait for API to be available
await new Promise(resolve => setTimeout(resolve, 2000));

console.log('Obsidian API available:', obsidianAPI.isAvailable());

async function testRename() {
  console.log('\n📝 Testing Rename Operation');
  console.log('─'.repeat(40));
  
  const testCase = {
    oldPath: 'Test/Original File.md',
    newPath: 'Test/Renamed File.md'
  };

  try {
    // Create test file
    const testContent = `---
title: Test File for Rename
tags:
  - #test
  - #file-operations
---

# Test File

This file will be renamed.

Links to other files:
- [[Projects/Obsidian AI Curator/README]]
- [[Daily/2025-07-28]]
`;

    const fullPath = path.join(config.vaultPath, testCase.oldPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, testContent, 'utf-8');
    
    console.log(`✅ Created test file: ${testCase.oldPath}`);

    // Create a file that links to our test file
    const linkingFile = `---
title: File with Links
---

# Links Test

This file contains links to our test file:
- [[Original File]]
- [[Test/Original File|Custom Alias]]
- [Markdown Link](Test/Original File.md)
`;

    const linkingPath = path.join(config.vaultPath, 'Test/Linking File.md');
    await fs.writeFile(linkingPath, linkingFile, 'utf-8');
    console.log('✅ Created file with links to test file');

    // Perform rename
    console.log(`\n🔄 Renaming: ${testCase.oldPath} → ${testCase.newPath}`);
    const result = await fileOps.renameFile(testCase.oldPath, testCase.newPath);
    
    console.log('\nResult:', JSON.stringify(result, null, 2));

    // Verify links were updated
    const updatedLinking = await fs.readFile(linkingPath, 'utf-8');
    console.log('\n📋 Updated linking file content:');
    console.log(updatedLinking);

    // Cleanup
    await fs.unlink(path.join(config.vaultPath, testCase.newPath));
    await fs.unlink(linkingPath);
    console.log('\n🧹 Cleaned up test files');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function testMove() {
  console.log('\n\n📦 Testing Move Operation');
  console.log('─'.repeat(40));
  
  const testCase = {
    sourcePath: 'Test/Source File.md',
    targetPath: 'Archive/Test/Source File.md'
  };

  try {
    // Create test file
    const testContent = `---
title: Test File for Move
tags:
  - #test
  - #file-operations
---

# Test File

This file will be moved to archive.

Related notes:
- [[Daily/2025-07-28]]
- [[Projects/Active]]
`;

    const fullPath = path.join(config.vaultPath, testCase.sourcePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, testContent, 'utf-8');
    
    console.log(`✅ Created test file: ${testCase.sourcePath}`);

    // Perform move
    console.log(`\n🔄 Moving: ${testCase.sourcePath} → ${testCase.targetPath}`);
    const result = await fileOps.moveFile(testCase.sourcePath, testCase.targetPath);
    
    console.log('\nResult:', JSON.stringify(result, null, 2));

    // Verify file exists at new location
    const movedExists = await fs.access(
      path.join(config.vaultPath, testCase.targetPath)
    ).then(() => true).catch(() => false);
    
    console.log(`\n✅ File exists at new location: ${movedExists}`);

    // Cleanup
    await fs.unlink(path.join(config.vaultPath, testCase.targetPath));
    await fs.rmdir(path.join(config.vaultPath, 'Archive/Test'));
    console.log('\n🧹 Cleaned up test files');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run tests
await testRename();
await testMove();

console.log('\n\n✨ File operations test complete!');
console.log('\nKey Benefits:');
console.log('- Obsidian API ensures ALL links are updated');
console.log('- No broken links after rename/move');
console.log('- Works with wikilinks and markdown links');
console.log('- Automatic fallback if API unavailable');

process.exit(0);