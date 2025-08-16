#!/usr/bin/env node

/**
 * Test script for Local Claude Code Integration
 * Tests the Claude Code tools without actually running Claude
 */

import { claudeCodeTools } from '../src/tools/claude-code-executor.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testClaudeCLI() {
  log('\n=== Testing Claude CLI ===', 'blue');
  
  try {
    // Check if claude is installed
    const { stdout: version } = await execAsync('claude --version');
    log(`✓ Claude CLI installed: ${version.trim()}`, 'green');
    
    // Check if we can list sessions
    try {
      await execAsync('claude sessions');
      log('✓ Claude sessions command works', 'green');
    } catch {
      log('✓ Claude CLI found (sessions command may require setup)', 'yellow');
    }
    
    return true;
  } catch (error) {
    log(`✗ Claude CLI test failed: ${error.message}`, 'red');
    if (error.message.includes('command not found')) {
      log('  Install with: npm install -g @anthropic-ai/claude-code', 'yellow');
    }
    return false;
  }
}

async function testGitHubCLI() {
  log('\n=== Testing GitHub CLI ===', 'blue');
  
  try {
    // Check if gh is installed
    const { stdout: version } = await execAsync('gh --version');
    log(`✓ GitHub CLI installed: ${version.split('\n')[0]}`, 'green');
    
    // Check authentication
    await execAsync('gh auth status');
    log('✓ GitHub CLI authenticated', 'green');
    
    // Get repo info
    try {
      const { stdout: repoInfo } = await execAsync('gh repo view --json name,owner');
      const repo = JSON.parse(repoInfo);
      log(`✓ Repository: ${repo.owner.login}/${repo.name}`, 'green');
    } catch {
      log('  Not in a GitHub repository', 'yellow');
    }
    
    return true;
  } catch (error) {
    log(`✗ GitHub CLI test failed: ${error.message}`, 'red');
    if (error.message.includes('gh: command not found')) {
      log('  Install with: brew install gh (macOS) or see https://cli.github.com', 'yellow');
    } else if (error.message.includes('not authenticated')) {
      log('  Authenticate with: gh auth login', 'yellow');
    }
    return false;
  }
}

async function testClaudeCodeStatus() {
  log('\n=== Testing Claude Code Status Tool ===', 'blue');
  
  try {
    const status = await claudeCodeTools.check_claude_code_status();
    
    if (status.installed) {
      log(`✓ Claude Code status check works`, 'green');
      log(`  Version: ${status.version || 'unknown'}`, 'green');
      if (status.sessions) {
        log(`  Sessions: ${status.sessions.length}`, 'green');
      }
      if (status.githubCli) {
        log(`  GitHub CLI: ${status.githubCli}`, 'green');
      }
    } else {
      log(`✗ Claude Code not installed: ${status.error}`, 'red');
    }
    
    return status.installed;
  } catch (error) {
    log(`✗ Status check failed: ${error.message}`, 'red');
    return false;
  }
}

async function testTempDirectoryCreation() {
  log('\n=== Testing Temp Directory Management ===', 'blue');
  
  try {
    // This will test the cleanup function
    const result = await claudeCodeTools.cleanup_temp_directories();
    log(`✓ Temp directory cleanup works`, 'green');
    log(`  Cleaned ${result.cleaned} of ${result.total} directories`, 'green');
    return true;
  } catch (error) {
    log(`✗ Temp directory test failed: ${error.message}`, 'red');
    return false;
  }
}

async function main() {
  log('====================================', 'blue');
  log('Local Claude Code Integration Test', 'blue');
  log('====================================', 'blue');
  
  const tests = [
    testClaudeCLI,
    testGitHubCLI,
    testClaudeCodeStatus,
    testTempDirectoryCreation
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    const result = await test();
    if (result) passed++;
    else failed++;
  }
  
  log('\n====================================', 'blue');
  log('Test Results', 'blue');
  log('====================================', 'blue');
  log(`Passed: ${passed}`, 'green');
  if (failed > 0) {
    log(`Failed: ${failed}`, 'red');
  }
  
  if (failed === 0) {
    log('\n✓ All tests passed! Local Claude Code integration is ready.', 'green');
    log('\nYou can now:', 'yellow');
    log('1. Use execute_claude_code_fix to fix bugs', 'yellow');
    log('2. Use execute_claude_code_feature to implement features', 'yellow');
    log('3. Claude will run locally and create PRs automatically', 'yellow');
  } else {
    log('\n✗ Some tests failed. Please fix the issues above.', 'red');
    log('\nRun setup script for help:', 'yellow');
    log('  bash scripts/setup-local-claude.sh', 'yellow');
    process.exit(1);
  }
}

// Run tests
main().catch(error => {
  log(`\n✗ Unexpected error: ${error.message}`, 'red');
  process.exit(1);
});
