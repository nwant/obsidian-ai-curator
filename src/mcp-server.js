#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import VaultAnalyzer from './vault-analyzer.js';
import { readFile, writeFile, mkdir, copyFile, unlink } from 'fs/promises';
import { join, isAbsolute, basename } from 'path';
import { existsSync } from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import simpleGit from 'simple-git';
import matter from 'gray-matter';
import { z } from 'zod';

// Load configuration
const configPath = join(process.cwd(), 'config', 'config.json');
let config = {
  vaultPath: process.env.OBSIDIAN_VAULT_PATH || '/path/to/obsidian/vault',
  minNoteLength: 50,
  titleSimilarityThreshold: 0.7,
  maxFragmentLength: 500
};

if (existsSync(configPath)) {
  const configContent = await readFile(configPath, 'utf-8');
  const loadedConfig = JSON.parse(configContent);
  
  // Handle different config structures
  if (loadedConfig.thresholds) {
    config = {
      vaultPath: loadedConfig.vaultPath || config.vaultPath,
      minNoteLength: loadedConfig.thresholds.minNoteLength || config.minNoteLength,
      titleSimilarityThreshold: loadedConfig.thresholds.similarityScore || config.titleSimilarityThreshold,
      maxFragmentLength: loadedConfig.thresholds.maxFragmentLength || config.maxFragmentLength,
      ignorePatterns: loadedConfig.ignorePatterns,
      consolidation: loadedConfig.consolidation
    };
  } else {
    config = { ...config, ...loadedConfig };
  }
}

// Override with environment variable if set
if (process.env.OBSIDIAN_VAULT_PATH) {
  config.vaultPath = process.env.OBSIDIAN_VAULT_PATH;
}

// Validate vault path exists
if (!existsSync(config.vaultPath)) {
  console.error(`Warning: Vault path does not exist: ${config.vaultPath}`);
  console.error('Please set OBSIDIAN_VAULT_PATH environment variable or update config.json');
}

// Initialize services
const vaultAnalyzer = new VaultAnalyzer(config);
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Only initialize git if vault path exists
let git;
if (existsSync(config.vaultPath)) {
  git = simpleGit(config.vaultPath);
}

// Helper function to extract metadata from note content
async function extractMetadata(content) {
  const { data: frontmatter, content: body } = matter(content);
  
  // Extract title
  const h1Match = body.match(/^#\s+(.+)$/m);
  const title = h1Match ? h1Match[1].trim() : 'Untitled';
  
  // Extract headings
  const headings = [];
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  let match;
  while ((match = headingRegex.exec(body)) !== null) {
    headings.push({
      level: match[1].length,
      text: match[2].trim()
    });
  }
  
  // Extract links
  const links = [];
  const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
  const mdLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  
  while ((match = wikiLinkRegex.exec(body)) !== null) {
    links.push({ type: 'wiki', target: match[1] });
  }
  
  while ((match = mdLinkRegex.exec(body)) !== null) {
    if (!match[2].startsWith('http')) {
      links.push({ type: 'markdown', target: match[2], text: match[1] });
    }
  }
  
  return {
    frontmatter,
    title,
    headings,
    links
  };
}

// Create MCP server
const server = new McpServer({
  name: 'obsidian-ai-curator',
  version: '0.1.0',
});

// Tool: analyze_vault
server.tool('analyze_vault', 'Analyze Obsidian vault for consolidation opportunities', {
  vaultPath: z.string().optional().describe('Path to Obsidian vault (optional, uses config default)')
}, async ({ vaultPath }) => {
  const path = vaultPath || config.vaultPath;
  
  if (!existsSync(path)) {
    return {
      content: [{
        type: 'text',
        text: `Error: Vault path does not exist: ${path}`
      }]
    };
  }

  // Update analyzer with new path if provided
  if (vaultPath) {
    vaultAnalyzer.config.vaultPath = path;
  }

  try {
    const report = await vaultAnalyzer.analyze();
    
    const summary = {
      totalNotes: report.summary.totalNotes,
      fragments: report.summary.fragmentaryNotes,
      duplicates: report.summary.duplicateCandidates,
      similarTitles: report.summary.similarTitles,
      emptyNotes: report.summary.emptyNotes,
      largeNotes: report.summary.largeNotes
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          summary,
          vaultPath: path,
          timestamp: new Date().toISOString(),
          details: report.details
        }, null, 2)
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error analyzing vault: ${error.message}`
      }]
    };
  }
});

// Tool: get_note_content
server.tool('get_note_content', 'Retrieve full content of specific notes', {
  notePaths: z.array(z.string()).describe('List of note paths relative to vault root')
}, async ({ notePaths }) => {
  const results = [];

  for (const notePath of notePaths) {
    const fullPath = isAbsolute(notePath) 
      ? notePath 
      : join(config.vaultPath, notePath);

    try {
      if (!existsSync(fullPath)) {
        results.push({
          path: notePath,
          error: 'File not found'
        });
        continue;
      }

      const content = await readFile(fullPath, 'utf-8');
      const metadata = await extractMetadata(content);

      results.push({
        path: notePath,
        content,
        metadata,
        stats: {
          wordCount: content.split(/\s+/).filter(word => word.length > 0).length,
          lineCount: content.split('\n').length,
          hasHeadings: metadata.headings.length > 0,
          hasFrontmatter: !!metadata.frontmatter
        }
      });
    } catch (error) {
      results.push({
        path: notePath,
        error: error.message
      });
    }
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(results, null, 2)
    }]
  };
});

// Tool: get_consolidation_candidates
server.tool('get_consolidation_candidates', 'Get specific candidates ready for consolidation with full content', {
  candidateType: z.enum(['fragments', 'duplicates', 'similar', 'all']).describe('Type of consolidation candidates to retrieve'),
  includeContent: z.boolean().optional().default(true).describe('Include full note content (default: true)')
}, async ({ candidateType, includeContent }) => {
  try {
    const report = await vaultAnalyzer.analyze();
    let candidates = [];

    switch (candidateType) {
      case 'fragments':
        candidates = report.details.fragmentaryNotes;
        break;
      case 'duplicates':
        candidates = report.details.duplicateCandidates;
        break;
      case 'similar':
        candidates = report.details.similarTitles;
        break;
      case 'all':
        candidates = [
          ...report.details.fragmentaryNotes.map(f => ({ ...f, type: 'fragment' })),
          ...report.details.duplicateCandidates.map(d => ({ ...d, type: 'duplicate' })),
          ...report.details.similarTitles.map(s => ({ ...s, type: 'similar' }))
        ];
        break;
    }

    if (includeContent) {
      // Enrich candidates with full content
      for (let candidate of candidates) {
        if (candidate.path) {
          const fullPath = join(config.vaultPath, candidate.path);
          try {
            candidate.content = await readFile(fullPath, 'utf-8');
          } catch (error) {
            candidate.contentError = error.message;
          }
        } else if (candidate.files) {
          // For duplicate/similar titles
          candidate.filesContent = [];
          for (const file of candidate.files) {
            try {
              const content = await readFile(join(config.vaultPath, file), 'utf-8');
              candidate.filesContent.push({ path: file, content });
            } catch (error) {
              candidate.filesContent.push({ path: file, error: error.message });
            }
          }
        }
      }
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          candidateType,
          count: candidates.length,
          candidates: candidates.slice(0, 50) // Limit response size
        }, null, 2)
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error getting consolidation candidates: ${error.message}`
      }]
    };
  }
});

// Tool: preview_consolidation
server.tool('preview_consolidation', 'Generate consolidated note content without saving', {
  notePaths: z.array(z.string()).describe('List of note paths to consolidate'),
  strategy: z.enum(['fragment_merge', 'duplicate_resolve', 'topic_synthesis']).optional().default('fragment_merge').describe('Consolidation strategy to use'),
  targetTitle: z.string().optional().describe('Title for the consolidated note')
}, async ({ notePaths, strategy, targetTitle }) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      content: [{
        type: 'text',
        text: 'Error: ANTHROPIC_API_KEY environment variable not set'
      }]
    };
  }

  try {
    // Read all note contents
    const notes = [];
    for (const notePath of notePaths) {
      const fullPath = join(config.vaultPath, notePath);
      const content = await readFile(fullPath, 'utf-8');
      const metadata = await extractMetadata(content);
      notes.push({ path: notePath, content, metadata });
    }

    // Generate consolidation prompt based on strategy
    let systemPrompt = `You are an AI assistant helping to consolidate Obsidian notes while preserving the user's voice and style. 
The user's notes need to be merged into a single, well-structured note.

Important guidelines:
- Preserve the user's writing style and voice
- Maintain all important information
- Use the provided target format
- Keep the tone consistent with the original notes
- Extract and organize key points logically
- Identify and preserve any action items

Target format:
# [Title]
**Project**: [Auto-detected or specified]
**Consolidation Date**: ${new Date().toISOString().split('T')[0]}
**Confidence**: [High/Medium/Low based on content coherence]

## Context
[Merged context from original notes]

## Key Points
[Organized main content]

## Next Steps
[Extracted action items]

---
<!-- AI Metadata -->
consolidated_from: ${JSON.stringify(notePaths)}
consolidation_strategy: "${strategy}"
`;

    let userPrompt = `Please consolidate these ${notes.length} notes into a single comprehensive note.\n\n`;
    
    if (targetTitle) {
      userPrompt += `Use this title: "${targetTitle}"\n\n`;
    }

    notes.forEach((note, index) => {
      userPrompt += `=== Note ${index + 1} (${note.path}) ===\n${note.content}\n\n`;
    });

    userPrompt += `\nConsolidation strategy: ${strategy}
Please create a consolidated note that captures all important information while being concise and well-organized.`;

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: userPrompt
      }]
    });

    const consolidatedContent = response.content[0].text;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          strategy,
          originalNotes: notePaths,
          wordCountBefore: notes.reduce((sum, note) => sum + note.content.split(/\s+/).length, 0),
          wordCountAfter: consolidatedContent.split(/\s+/).length,
          consolidatedContent
        }, null, 2)
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error previewing consolidation: ${error.message}`
      }]
    };
  }
});

// Tool: apply_consolidation
server.tool('apply_consolidation', 'Save consolidated note and archive originals with git safety', {
  consolidatedContent: z.string().describe('The consolidated note content'),
  originalPaths: z.array(z.string()).describe('Original note paths to archive'),
  newPath: z.string().describe('Path for the new consolidated note'),
  commitMessage: z.string().optional().describe('Git commit message')
}, async ({ consolidatedContent, originalPaths, newPath, commitMessage }) => {
  try {
    // Check if git is available and vault path exists
    if (!git) {
      return {
        content: [{
          type: 'text',
          text: `Error: Cannot apply consolidation - vault path does not exist: ${config.vaultPath}`
        }]
      };
    }
    
    // Ensure we're in a git repo
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      await git.init();
    }

    // Create archive directory with timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    const archiveDir = join(config.vaultPath, '_archived', `${timestamp}-consolidation`);
    
    // Stage 1: Git commit current state
    await git.add('.');
    await git.commit(`Pre-consolidation snapshot: ${commitMessage || 'Consolidating notes'}`)
      .catch(() => {}); // Ignore if nothing to commit

    // Stage 2: Create new consolidated note
    const newFullPath = join(config.vaultPath, newPath);
    await writeFile(newFullPath, consolidatedContent);

    // Stage 3: Archive originals
    await mkdir(archiveDir, { recursive: true });
    
    for (const originalPath of originalPaths) {
      const fullOriginalPath = join(config.vaultPath, originalPath);
      const archivePath = join(archiveDir, basename(originalPath));
      
      // Copy to archive
      await copyFile(fullOriginalPath, archivePath);
      
      // Remove original
      await unlink(fullOriginalPath);
    }

    // Stage 4: Commit consolidation
    await git.add('.');
    const finalCommitMessage = commitMessage || 
      `Consolidated ${originalPaths.length} notes into ${newPath}`;
    
    const commit = await git.commit(finalCommitMessage);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          newNotePath: newPath,
          archivedTo: archiveDir,
          originalNotes: originalPaths,
          commitHash: commit.commit,
          message: 'Consolidation applied successfully. Original notes archived and changes committed to git.'
        }, null, 2)
      }]
    };
  } catch (error) {
    // Attempt rollback on error
    try {
      await git.reset(['--hard', 'HEAD~1']);
    } catch (rollbackError) {
      console.error('Rollback failed:', rollbackError);
    }

    return {
      content: [{
        type: 'text',
        text: `Error applying consolidation: ${error.message}. Attempted automatic rollback.`
      }]
    };
  }
});

// Main function to start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Obsidian AI Curator MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});