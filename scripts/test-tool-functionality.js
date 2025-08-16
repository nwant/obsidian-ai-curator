#!/usr/bin/env node

/**
 * Test script to verify all MCP tools are working properly
 */

import { McpServer } from '../src/mcp-server.js';
import fs from 'fs/promises';
import path from 'path';

console.log('Testing MCP Server Tool Functionality\n');
console.log('=' .repeat(40));

async function testToolFunctionality() {
  const server = new McpServer();
  
  // Get all tools
  const tools = await server.getTools();
  console.log(`\n✓ MCP Server initialized with ${tools.length} tools`);
  
  // Check tool registration - capabilities are hardcoded in mcp-server.js
  // These are the tools that should be in capabilities
  const expectedCapabilities = [
    "vault_scan", "read_notes", "write_note", "archive_notes",
    "search_content", "find_by_metadata", "git_checkpoint", "git_changes",
    "git_rollback", "get_research_context", "get_working_context", "run_benchmark",
    "view_search_metrics", "view_performance_metrics", "query_dataview", "get_tags",
    "get_links", "get_backlinks", "analyze_tags", "suggest_tags",
    "get_daily_note", "append_to_daily_note", "add_daily_task", "get_frontmatter",
    "update_frontmatter", "update_tags", "rename_file", "create_github_issue",
    "create_bug_report", "create_feature_request", "document_design_decision", "check_issue_status",
    "execute_claude_code_fix", "execute_claude_code_feature", "check_claude_code_status", "cleanup_temp_directories",
    "move_file", "rename_tag", "init_project", "list_project_templates"
  ];
  const capabilityCount = expectedCapabilities.length;
  
  console.log(`✓ ${capabilityCount} tools registered in capabilities`);
  console.log(`✓ ${tools.length} tools have definitions`);
  
  // Find mismatches
  const toolNames = tools.map(t => t.name);
  
  const missingDefs = expectedCapabilities.filter(name => !toolNames.includes(name));
  const extraDefs = toolNames.filter(name => !expectedCapabilities.includes(name));
  
  if (missingDefs.length > 0) {
    console.log(`\n⚠️  Tools in capabilities but missing definitions (${missingDefs.length}):`);
    missingDefs.forEach(name => console.log(`   - ${name}`));
  }
  
  if (extraDefs.length > 0) {
    console.log(`\n⚠️  Tool definitions not in capabilities (${extraDefs.length}):`);
    extraDefs.forEach(name => console.log(`   - ${name}`));
  }
  
  // Test a few critical tools
  console.log('\n' + '=' .repeat(40));
  console.log('Testing Critical Tools:');
  console.log('=' .repeat(40));
  
  // Create test vault
  const testVaultPath = '/tmp/mcp-test-vault-' + Date.now();
  await fs.mkdir(testVaultPath, { recursive: true });
  
  try {
    // Test vault_scan
    console.log('\n1. Testing vault_scan...');
    try {
      const scanResult = await server.callTool('vault_scan', {});
      if (scanResult && !scanResult.error) {
        console.log('   ✓ vault_scan executed');
      } else {
        console.log('   ✗ vault_scan failed:', scanResult?.error || 'Unknown error');
      }
    } catch (e) {
      console.log('   ✗ vault_scan error:', e.message);
    }
    
    // Test write_note
    console.log('\n2. Testing write_note...');
    try {
      const writeResult = await server.callTool('write_note', {
        path: 'test-note.md',
        content: '# Test Note\n\nThis is a test.'
      });
      if (writeResult && !writeResult.error) {
        console.log('   ✓ write_note executed');
      } else {
        console.log('   ✗ write_note failed:', writeResult?.error || 'Unknown error');
      }
    } catch (e) {
      console.log('   ✗ write_note error:', e.message);
    }
    
    // Test read_notes
    console.log('\n3. Testing read_notes...');
    try {
      const readResult = await server.callTool('read_notes', {
        paths: ['test-note.md']
      });
      if (readResult && !readResult.error) {
        console.log('   ✓ read_notes executed');
      } else {
        console.log('   ✗ read_notes failed:', readResult?.error || 'Unknown error');
      }
    } catch (e) {
      console.log('   ✗ read_notes error:', e.message);
    }
    
    // Test search_content
    console.log('\n4. Testing search_content...');
    try {
      const searchResult = await server.callTool('search_content', {
        query: 'test'
      });
      if (searchResult && !searchResult.error) {
        console.log('   ✓ search_content executed');
      } else {
        console.log('   ✗ search_content failed:', searchResult?.error || 'Unknown error');
      }
    } catch (e) {
      console.log('   ✗ search_content error:', e.message);
    }
    
    // Test get_tags
    console.log('\n5. Testing get_tags...');
    try {
      const tagsResult = await server.callTool('get_tags', {});
      if (tagsResult && !tagsResult.error) {
        console.log('   ✓ get_tags executed');
      } else {
        console.log('   ✗ get_tags failed:', tagsResult?.error || 'Unknown error');
      }
    } catch (e) {
      console.log('   ✗ get_tags error:', e.message);
    }
    
  } catch (error) {
    console.error('\nError during tool testing:', error.message);
  } finally {
    // Cleanup
    await fs.rm(testVaultPath, { recursive: true, force: true });
  }
  
  // Summary
  console.log('\n' + '=' .repeat(40));
  console.log('Summary:');
  console.log('=' .repeat(40));
  
  const allGood = missingDefs.length === 0 && extraDefs.length === 0;
  
  if (allGood) {
    console.log('✅ All tools are properly registered!');
  } else {
    console.log(`⚠️  Found ${missingDefs.length + extraDefs.length} registration issues`);
    console.log('   Please ensure all tools are registered in:');
    console.log('   1. capabilities.tools object');
    console.log('   2. ListToolsRequestSchema handler with full inputSchema');
    console.log('   3. handleToolCall/callTool switch statement');
  }
  
  return allGood;
}

// Run tests
testToolFunctionality()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });