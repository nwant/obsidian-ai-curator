#!/usr/bin/env node
import { spawn } from 'child_process';

console.log('Testing Tag Intelligence System...\n');

async function callMCPTool(toolName, args) {
  return new Promise((resolve, reject) => {
    const mcp = spawn('node', ['src/mcp-server.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        OBSIDIAN_VAULT_PATH: process.env.OBSIDIAN_VAULT_PATH || '/Users/nathan/obsidian'
      }
    });
    
    let stdout = '';
    let stderr = '';
    
    mcp.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    mcp.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    mcp.on('error', reject);
    
    // Send initialize request
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      }
    };
    
    setTimeout(() => {
      mcp.stdin.write(JSON.stringify(initRequest) + '\n');
    }, 100);
    
    // Send tool request
    setTimeout(() => {
      const toolRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      };
      mcp.stdin.write(JSON.stringify(toolRequest) + '\n');
    }, 300);
    
    // Collect response
    setTimeout(() => {
      try {
        const lines = stdout.split('\n').filter(line => line.trim());
        for (const line of lines) {
          try {
            const response = JSON.parse(line);
            if (response.id === 2 && response.result) {
              mcp.kill();
              resolve(response.result);
              return;
            }
          } catch (e) {
            // Continue
          }
        }
        mcp.kill();
        reject(new Error('No valid response found'));
      } catch (error) {
        mcp.kill();
        reject(error);
      }
    }, 2000);
  });
}

async function runTests() {
  try {
    console.log('1. Testing analyze_tags tool...\n');
    const analysis = await callMCPTool('analyze_tags', {});
    const analysisData = JSON.parse(analysis.content[0].text);
    
    console.log(`Total tags found: ${analysisData.totalTags}`);
    console.log(`\nTop 5 most used tags:`);
    analysisData.stats.slice(0, 5).forEach(stat => {
      console.log(`  ${stat.tag}: ${stat.count} uses`);
    });
    
    if (analysisData.similarTags && analysisData.similarTags.length > 0) {
      console.log(`\nSimilar tags found:`);
      analysisData.similarTags.slice(0, 3).forEach(pair => {
        console.log(`  ${pair.tag1} ≈ ${pair.tag2} (${Math.round(pair.similarity * 100)}% similar - ${pair.type})`);
      });
    }
    
    if (analysisData.recommendations && analysisData.recommendations.length > 0) {
      console.log(`\nRecommendations:`);
      analysisData.recommendations.forEach(rec => {
        console.log(`  ${rec.type}: ${rec.message}`);
        console.log(`    Action: ${rec.action}`);
      });
    }
    
    console.log('\n2. Testing suggest_tags tool...\n');
    const sampleContent = `
# Meeting Notes: AI Strategy Discussion

Discussed the roadmap for implementing machine learning models in our product.
Key points:
- Need to evaluate different ML frameworks
- Consider performance optimization strategies
- Security and governance are critical
- Team training and enablement required
`;
    
    const suggestions = await callMCPTool('suggest_tags', {
      content: sampleContent,
      existingTags: []
    });
    const suggestionData = JSON.parse(suggestions.content[0].text);
    
    console.log('Tag suggestions for sample content:');
    suggestionData.suggestions.slice(0, 5).forEach(sugg => {
      console.log(`  ${sugg.tag} (${Math.round(sugg.score * 100)}% relevance)`);
      console.log(`    Reason: ${sugg.reason}`);
      console.log(`    Used ${sugg.count} times in vault`);
    });
    
    console.log('\n3. Testing write_note with tag validation...\n');
    const noteContent = `---
tags: [meeting, ML, stratagy]
---

# Test Note with Tag Validation

This is a test note to demonstrate tag validation.
#ai #MachineLearning #new-project-2025
`;
    
    const writeResult = await callMCPTool('write_note', {
      path: 'test-tag-validation.md',
      content: noteContent
    });
    const writeData = JSON.parse(writeResult.content[0].text);
    
    console.log(`Note written: ${writeData.path}`);
    
    if (writeData.tagWarnings && writeData.tagWarnings.length > 0) {
      console.log('\nTag warnings:');
      writeData.tagWarnings.forEach(warning => {
        console.log(`  ⚠️  ${warning}`);
      });
    }
    
    if (writeData.tagSuggestions && writeData.tagSuggestions.length > 0) {
      console.log('\nTag suggestions:');
      writeData.tagSuggestions.forEach(sugg => {
        if (sugg.tags) {
          console.log(`  ${sugg.type}: ${sugg.message}`);
          sugg.tags.slice(0, 3).forEach(t => {
            console.log(`    - ${t.tag} (${Math.round(t.score * 100)}%)`);
          });
        }
      });
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

console.log('Starting tag intelligence tests...\n');
console.log('This will analyze your vault\'s tags and test the validation system.\n');

runTests().catch(console.error);