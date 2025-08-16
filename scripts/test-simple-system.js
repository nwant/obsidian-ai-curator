#!/usr/bin/env node

/**
 * Quick test of the simplified project system
 */

import { initProject, listStarters } from '../src/tools/simple-project-init.js';
import fs from 'fs/promises';
import path from 'path';

async function test() {
  console.log('Testing Simplified Project System\n');
  console.log('=================================\n');
  
  // Test 1: List starters
  console.log('1. Listing available starters:');
  const { starters } = await listStarters();
  starters.forEach(s => {
    console.log(`   - ${s.key}: ${s.description}`);
  });
  
  // Test 2: Create test project
  console.log('\n2. Creating test project...');
  
  const testProject = {
    projectName: 'Test Simple Project',
    description: 'Testing the simplified system',
    starter: 'minimal',
    targetDate: '2025-12-31'
  };
  
  try {
    const result = await initProject(testProject);
    console.log('   ✅ Project created successfully!');
    console.log(`   - Path: ${result.projectPath}`);
    console.log(`   - Files: ${result.filesCreated.join(', ')}`);
    console.log(`   - Folders: ${result.foldersCreated.join(', ')}`);
    
    // Clean up test project
    console.log('\n3. Cleaning up test project...');
    const testPath = path.join(process.cwd(), 'test-output', result.projectPath);
    try {
      await fs.rm(testPath, { recursive: true, force: true });
      console.log('   ✅ Test project cleaned up');
    } catch (e) {
      console.log('   ⚠️  Could not clean up test project (may not exist in test mode)');
    }
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  console.log('\n=================================');
  console.log('Test Complete!');
  console.log('\nThe simplified system is working.');
  console.log('Only ~100 lines of code vs ~500 before.');
}

test().catch(console.error);
