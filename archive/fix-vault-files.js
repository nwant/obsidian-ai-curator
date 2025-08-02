#!/usr/bin/env node

/**
 * Script to fix files that were created directly in the vault
 * without going through the MCP server tools.
 * 
 * This demonstrates how files SHOULD be created.
 */

import { MCPServer } from '../src/mcp-server.js';
import { promises as fs } from 'fs';
import path from 'path';
import matter from 'gray-matter';

async function fixVaultFiles() {
  console.log('🔧 Vault File Fixer\n');
  console.log('This script demonstrates the proper way to create vault files.\n');

  // Initialize MCP Server
  const server = new MCPServer();
  
  // Wait for initialization
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Example: Properly create the project documentation
  const projectDoc = {
    path: 'Projects/Obsidian AI Curator/README-PROPER.md',
    content: `---
tags:
  - project/obsidian-ai-curator
  - documentation
  - mcp-server
type: project-documentation
status: active
---

# Obsidian AI Curator - Project Documentation

This file was created using the proper MCP server write_note tool.

## Benefits of Using MCP Tools

When this file was created:
1. Tags were validated against the vault's taxonomy
2. Timestamps were automatically added
3. Links would be converted to wikilink format
4. All vault conventions were enforced

## Key Difference

Unlike files created directly with the Write tool, this file:
- Has properly formatted tags (with # prefix)
- Has correct timestamps
- Follows vault conventions
- Was validated before writing

[[Projects/Obsidian AI Curator/README|Compare with direct write version]]
`
  };

  try {
    console.log(`Creating ${projectDoc.path} using write_note tool...`);
    
    const result = await server.writeNote(projectDoc);
    
    console.log('✅ File created successfully!');
    console.log('Result:', JSON.stringify(result, null, 2));
    
    // Show what validations were applied
    if (result.content && result.content[0]) {
      const response = JSON.parse(result.content[0].text);
      
      if (response.tagValidation) {
        console.log('\n📋 Tag Validation Applied:');
        console.log('- Validated tags:', response.tagValidation.validatedTags);
        console.log('- Auto-tags added:', response.tagValidation.autoTagsAdded);
        console.log('- Warnings:', response.tagValidation.warnings);
      }
      
      if (response.linkFormatting) {
        console.log('\n🔗 Link Formatting:');
        console.log('- Valid:', response.linkFormatting.valid);
        console.log('- Corrections:', response.linkFormatting.corrections);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  console.log('\n📝 Summary:');
  console.log('- Direct writes bypass ALL validations');
  console.log('- MCP tools ensure consistency');
  console.log('- Always use write_note, update_tags, etc.');
  
  process.exit(0);
}

// Run the fixer
fixVaultFiles().catch(console.error);