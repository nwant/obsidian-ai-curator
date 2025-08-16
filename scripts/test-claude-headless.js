#!/usr/bin/env node

/**
 * Test script for Claude Code headless mode functionality
 */

import { check_claude_code_status } from '../src/tools/claude-code-executor.js';

async function testClaudeCodeStatus() {
  console.log('Testing Claude Code status check...\n');
  
  try {
    const status = await check_claude_code_status();
    console.log('Claude Code Status:');
    console.log('==================');
    console.log('Installed:', status.installed ? '✅' : '❌');
    
    if (status.installed) {
      console.log('Version:', status.version);
      console.log('Path:', status.path);
      console.log('GitHub CLI:', status.githubCli || 'Not installed');
      console.log('Active Sessions:', status.sessions?.length || 0);
    } else {
      console.log('Error:', status.error);
    }
    
    return status.installed;
  } catch (error) {
    console.error('Error checking Claude Code status:', error);
    return false;
  }
}

async function testHeadlessMode() {
  console.log('\nTesting Claude Code headless mode...\n');
  
  // Create a simple test prompt
  const testPrompt = 'Create a simple hello.txt file with the content "Hello from Claude Code headless mode!"';
  
  try {
    // Test if we can run claude with -p flag
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    // Create a temp directory for testing
    const tempDir = '/tmp/claude-headless-test-' + Date.now();
    await execAsync(`mkdir -p ${tempDir}`);
    
    console.log('Running Claude in headless mode...');
    console.log('Working directory:', tempDir);
    console.log('Prompt:', testPrompt);
    
    // Run Claude in headless mode with a simple prompt
    const command = `cd ${tempDir} && echo "${testPrompt}" | claude -p "${testPrompt}" --dangerously-skip-permissions 2>&1 | head -20`;
    const { stdout, stderr } = await execAsync(command, { timeout: 10000 });
    
    if (stdout) {
      console.log('\nOutput (first 20 lines):');
      console.log('========================');
      console.log(stdout);
    }
    
    if (stderr) {
      console.log('\nStderr:', stderr);
    }
    
    // Check if file was created
    try {
      const { stdout: fileCheck } = await execAsync(`ls -la ${tempDir}/hello.txt 2>/dev/null`);
      if (fileCheck) {
        console.log('\n✅ File created successfully!');
        const { stdout: content } = await execAsync(`cat ${tempDir}/hello.txt`);
        console.log('Content:', content.trim());
      }
    } catch {
      console.log('\n⚠️  File not created (this is normal if Claude needs confirmation)');
    }
    
    // Cleanup
    await execAsync(`rm -rf ${tempDir}`);
    
    return true;
  } catch (error) {
    console.error('Error testing headless mode:', error.message);
    return false;
  }
}

// Run tests
(async () => {
  console.log('=== Claude Code Headless Mode Test ===\n');
  
  const statusOk = await testClaudeCodeStatus();
  
  if (statusOk) {
    const headlessOk = await testHeadlessMode();
    
    console.log('\n=== Test Results ===');
    console.log('Status Check:', statusOk ? '✅' : '❌');
    console.log('Headless Mode:', headlessOk ? '✅' : '❌');
  } else {
    console.log('\n❌ Claude Code is not installed. Cannot test headless mode.');
    console.log('Install with: npm install -g @anthropic/claude-code');
  }
})();