#!/usr/bin/env node

/**
 * Verify MCP Server Tools Registration
 * 
 * This script checks that all tools are properly registered in the three required places:
 * 1. capabilities.tools object
 * 2. ListToolsRequestSchema handler with inputSchema
 * 3. handleToolCall/callTool switch statement
 */

import fs from 'fs';
import { McpServer } from '../src/mcp-server.js';

const serverCode = fs.readFileSync('./src/mcp-server.js', 'utf8');

// Extract capabilities from source
const capMatch = serverCode.match(/capabilities:\s*{\s*tools:\s*{([^}]+)}/);
const capabilities = [];
if (capMatch) {
  const lines = capMatch[1].split('\n');
  for (const line of lines) {
    const match = line.match(/"([^"]+)":\s*true/);
    if (match) capabilities.push(match[1]);
  }
}

// Extract tool definitions (tools with inputSchema)
const server = new McpServer();
const toolDefs = await server.getTools();
const toolNames = toolDefs.map(t => t.name);

// Extract switch cases from handleToolCall
const switchMatches = serverCode.matchAll(/case\s+'([^']+)':/g);
const switchCases = new Set();
for (const match of switchMatches) {
  switchCases.add(match[1]);
}

console.log('MCP Server Tool Registration Status');
console.log('=' .repeat(50));
console.log();

console.log('📊 Statistics:');
console.log(`  • Tools in capabilities: ${capabilities.length}`);
console.log(`  • Tools with definitions: ${toolNames.length}`);
console.log(`  • Tools in switch statement: ${switchCases.size}`);
console.log();

// Find issues
const allTools = new Set([...capabilities, ...toolNames, ...switchCases]);
const issues = [];

for (const tool of allTools) {
  const inCap = capabilities.includes(tool);
  const inDef = toolNames.includes(tool);
  const inSwitch = switchCases.has(tool);
  
  if (!inCap || !inDef || !inSwitch) {
    issues.push({
      name: tool,
      capabilities: inCap ? '✓' : '✗',
      definition: inDef ? '✓' : '✗',
      handler: inSwitch ? '✓' : '✗'
    });
  }
}

if (issues.length === 0) {
  console.log('✅ All tools are properly registered in all three places!');
} else {
  console.log(`⚠️  Found ${issues.length} tools with registration issues:\n`);
  console.log('Tool Name                      | Cap | Def | Handler');
  console.log('-'.repeat(55));
  
  for (const issue of issues.sort((a, b) => a.name.localeCompare(b.name))) {
    const name = issue.name.padEnd(30);
    console.log(`${name} |  ${issue.capabilities}  |  ${issue.definition}  |   ${issue.handler}`);
  }
  
  console.log('\n📝 Legend:');
  console.log('  Cap = In capabilities.tools object');
  console.log('  Def = Has tool definition with inputSchema');
  console.log('  Handler = In handleToolCall switch statement');
  
  console.log('\n💡 To fix:');
  console.log('  1. Add missing capabilities to the tools object');
  console.log('  2. Add missing tool definitions in ListToolsRequestSchema');
  console.log('  3. Add missing case statements in handleToolCall');
}

console.log('\n' + '=' .repeat(50));

// Additional check: Working tools
console.log('\n🔧 Quick Functionality Test:\n');

// Test a simple tool that should always work
try {
  const testTools = ['vault_scan', 'get_tags'];
  
  for (const toolName of testTools) {
    process.stdout.write(`Testing ${toolName}... `);
    
    // Import the tool function directly
    try {
      const toolModule = await import(`../src/tools/${toolName.replace(/_/g, '-')}.js`);
      const toolFunc = toolModule[toolName] || toolModule.default;
      
      if (toolFunc) {
        console.log('✓ Function found');
      } else {
        console.log('✗ Function not exported');
      }
    } catch (e) {
      // Try alternative locations
      try {
        const vaultTools = await import('../src/tools/vault-tools.js');
        if (vaultTools[toolName]) {
          console.log('✓ Found in vault-tools');
        } else {
          console.log('✗ Not found');
        }
      } catch {
        console.log('✗ Module not found');
      }
    }
  }
} catch (e) {
  console.log('Error testing tools:', e.message);
}

process.exit(issues.length > 0 ? 1 : 0);