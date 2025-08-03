#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Test Runner for Obsidian AI Curator
 * 
 * This script runs all tests and provides a summary report
 */

async function runTests() {
  console.log('🧪 Obsidian AI Curator Test Suite\n');
  
  const testSuites = [
    { name: 'Unit Tests', pattern: 'test/unit/**/*.test.js' },
    { name: 'Integration Tests', pattern: 'test/integration/**/*.test.js' }
  ];
  
  const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    duration: 0
  };
  
  const startTime = Date.now();
  
  for (const suite of testSuites) {
    console.log(`\n📁 Running ${suite.name}...\n`);
    
    try {
      await runTestSuite(suite.pattern, results);
    } catch (error) {
      console.error(`❌ Error running ${suite.name}:`, error.message);
      results.failed++;
    }
  }
  
  results.duration = Date.now() - startTime;
  
  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary\n');
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`⏭️  Skipped: ${results.skipped}`);
  console.log(`⏱️  Duration: ${(results.duration / 1000).toFixed(2)}s`);
  console.log('='.repeat(50));
  
  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

async function runTestSuite(pattern, results) {
  return new Promise((resolve, reject) => {
    const args = ['--test', pattern];
    
    // Add experimental coverage flag if requested
    if (process.argv.includes('--coverage')) {
      args.push('--experimental-test-coverage');
    }
    
    const child = spawn('node', args, {
      stdio: 'inherit',
      shell: true
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        results.passed++;
        resolve();
      } else {
        results.failed++;
        resolve(); // Don't reject to continue running other suites
      }
    });
    
    child.on('error', (error) => {
      reject(error);
    });
  });
}

// Check if test files exist
async function checkTestFiles() {
  const testDirs = [
    path.join(__dirname, 'unit'),
    path.join(__dirname, 'integration')
  ];
  
  let hasTests = false;
  
  for (const dir of testDirs) {
    try {
      const files = await fs.readdir(dir);
      const testFiles = files.filter(f => f.endsWith('.test.js'));
      if (testFiles.length > 0) {
        hasTests = true;
        console.log(`Found ${testFiles.length} test files in ${path.basename(dir)}/`);
      }
    } catch (error) {
      console.log(`No tests found in ${path.basename(dir)}/`);
    }
  }
  
  if (!hasTests) {
    console.error('\n❌ No test files found!');
    console.log('Make sure test files are named *.test.js');
    process.exit(1);
  }
  
  return true;
}

// Main execution
(async () => {
  try {
    await checkTestFiles();
    await runTests();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
})();