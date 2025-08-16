#!/usr/bin/env node

/**
 * Test that all tools are properly registered in the MCP server
 */

import { McpServer } from '../src/mcp-server.js';

async function testToolRegistration() {
  console.log('Testing MCP Server Tool Registration\n');
  console.log('=====================================\n');
  
  // Create server instance with test config
  const server = new McpServer({
    testMode: true,
    vaultPath: '/tmp/test-vault',
    cacheEnabled: false
  });
  
  // Get the list of tools
  const tools = server.getTools();
  
  console.log(`Total tools registered: ${tools.length}\n`);
  
  // Check for GitHub integration tools
  const githubTools = [
    'create_github_issue',
    'create_bug_report', 
    'create_feature_request',
    'check_issue_status'
  ];
  
  // Check for Claude Code tools
  const claudeTools = [
    'execute_claude_code_fix',
    'execute_claude_code_feature',
    'check_claude_code_status',
    'cleanup_temp_directories'
  ];
  
  console.log('GitHub Integration Tools:');
  for (const toolName of githubTools) {
    const found = tools.some(t => t.name === toolName);
    console.log(`  ${found ? '✅' : '❌'} ${toolName}`);
  }
  
  console.log('\nClaude Code Headless Tools:');
  for (const toolName of claudeTools) {
    const found = tools.some(t => t.name === toolName);
    console.log(`  ${found ? '✅' : '❌'} ${toolName}`);
  }
  
  // List all available tools
  console.log('\n\nAll Available Tools:');
  console.log('====================');
  tools.forEach(tool => {
    console.log(`- ${tool.name}: ${tool.description}`);
  });
  
  return true;
}

// Run test
testToolRegistration().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});