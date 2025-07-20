# Link Preservation System Design

## Overview
This document outlines improvements to the MCP server for preserving links when files are moved, renamed, or repurposed in an Obsidian vault.

## Core Components

### 1. Link Index Manager
A new class to maintain a persistent index of all links in the vault:

```javascript
class LinkIndexManager {
  constructor(config) {
    this.indexPath = path.join(config.vaultPath, '.obsidian', 'mcp-link-index.json');
    this.index = {
      forwardLinks: {}, // { "fileA.md": ["fileB.md", "fileC.md"] }
      backLinks: {},    // { "fileB.md": ["fileA.md"] }
      linkDetails: {},  // { "fileA.md->fileB.md": { displayText, lineNumber, type } }
      aliases: {},      // { "alias": "actual-file.md" }
      lastUpdated: {}   // { "file.md": timestamp }
    };
  }

  async buildIndex() {
    // Scan all files and extract links
  }

  async updateFileLinks(filePath, links) {
    // Update index when a file is modified
  }

  async getBacklinks(filePath) {
    // Return all files that link to this file
  }

  async updateLinksOnMove(oldPath, newPath) {
    // Update all references when a file is moved
  }
}
```

### 2. Enhanced Link Extraction
Improve link detection to handle:
- Wiki-style links: `[[Note Name]]`
- Markdown links: `[text](path/to/note.md)`
- Aliases: `[[Note Name|Display Text]]`
- Embeds: `![[Image.png]]`
- Block references: `[[Note#^block-id]]`

```javascript
function extractLinks(content, filePath) {
  const links = [];
  
  // Wiki links with optional aliases
  const wikiLinks = content.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g);
  for (const match of wikiLinks) {
    links.push({
      type: 'wiki',
      target: match[1].trim(),
      displayText: match[2]?.trim() || match[1].trim(),
      raw: match[0]
    });
  }
  
  // Markdown links
  const mdLinks = content.matchAll(/\[([^\]]+)\]\(([^)]+\.md[^)]*)\)/g);
  for (const match of mdLinks) {
    links.push({
      type: 'markdown',
      target: match[2],
      displayText: match[1],
      raw: match[0]
    });
  }
  
  // Embeds
  const embeds = content.matchAll(/!\[\[([^\]]+)\]\]/g);
  for (const match of embeds) {
    links.push({
      type: 'embed',
      target: match[1],
      raw: match[0]
    });
  }
  
  return links;
}
```

### 3. Smart Move/Rename Operations
Enhance `archiveNotes` and add new operations:

```javascript
async moveNoteWithLinkUpdate({ from, to, updateLinks = true }) {
  // 1. Get all backlinks to the file being moved
  const backlinks = await this.linkIndex.getBacklinks(from);
  
  // 2. Move the file
  await fs.rename(fromPath, toPath);
  
  if (updateLinks) {
    // 3. Update all files that link to the moved file
    for (const linkingFile of backlinks) {
      const content = await fs.readFile(linkingFile, 'utf-8');
      const updatedContent = updateLinksInContent(content, from, to);
      await fs.writeFile(linkingFile, updatedContent);
    }
  }
  
  // 4. Update the link index
  await this.linkIndex.updateLinksOnMove(from, to);
  
  return {
    moved: { from, to },
    updatedFiles: backlinks,
    brokenLinks: [] // Could track any links that couldn't be updated
  };
}

function updateLinksInContent(content, oldPath, newPath) {
  // Smart replacement that handles various link formats
  const oldName = path.basename(oldPath, '.md');
  const newName = path.basename(newPath, '.md');
  
  // Update wiki links
  content = content.replace(
    new RegExp(`\\[\\[${escapeRegex(oldName)}(\\|[^\\]]+)?\\]\\]`, 'g'),
    `[[${newName}$1]]`
  );
  
  // Update markdown links (if using full paths)
  content = content.replace(
    new RegExp(`\\]\\(${escapeRegex(oldPath)}\\)`, 'g'),
    `](${newPath})`
  );
  
  return content;
}
```

### 4. Link Validation Tools
Add tools to check and repair broken links:

```javascript
{
  name: 'validate_links',
  description: 'Check for broken links in the vault',
  async execute({ fix = false }) {
    const brokenLinks = [];
    const files = await this.vaultScan();
    
    for (const file of files) {
      const content = await fs.readFile(file.path);
      const links = extractLinks(content, file.path);
      
      for (const link of links) {
        const resolved = await resolveLink(link.target, file.path);
        if (!resolved.exists) {
          brokenLinks.push({
            source: file.path,
            target: link.target,
            type: link.type,
            suggestion: resolved.suggestion // Fuzzy match suggestion
          });
          
          if (fix && resolved.suggestion) {
            // Auto-fix with user confirmation
          }
        }
      }
    }
    
    return { brokenLinks };
  }
}
```

### 5. Batch Operations with Transaction Support
Implement transaction-like operations for safety:

```javascript
{
  name: 'batch_move_notes',
  description: 'Move multiple notes with automatic link updates',
  async execute({ moves, dryRun = false }) {
    // 1. Validate all moves are possible
    const validation = await validateMoves(moves);
    if (!validation.valid) {
      return { error: validation.errors };
    }
    
    // 2. Calculate all required link updates
    const linkUpdates = await calculateLinkUpdates(moves);
    
    // 3. Show preview if dry run
    if (dryRun) {
      return { 
        preview: {
          moves,
          affectedFiles: linkUpdates.affectedFiles,
          linkChanges: linkUpdates.changes
        }
      };
    }
    
    // 4. Create git checkpoint for rollback
    await git.add('.');
    await git.commit('Pre-move checkpoint');
    
    try {
      // 5. Execute all moves and updates
      await executeBatchMoves(moves, linkUpdates);
      
      // 6. Rebuild link index
      await this.linkIndex.rebuild();
      
      return { success: true, summary: linkUpdates.summary };
    } catch (error) {
      // Rollback on failure
      await git.reset(['--hard', 'HEAD']);
      throw error;
    }
  }
}
```

### 6. Configuration Options
Add to `config.json`:

```json
{
  "linkManagement": {
    "autoUpdateLinks": true,
    "preserveAliases": true,
    "createRedirects": false,
    "fuzzyLinkMatching": true,
    "backlinkIndexing": true,
    "indexUpdateInterval": 300000
  }
}
```

## Implementation Priority

1. **Phase 1**: Link Index Manager with basic forward/back link tracking
2. **Phase 2**: Enhanced move operations with link updates
3. **Phase 3**: Link validation and repair tools
4. **Phase 4**: Batch operations and advanced features

## Benefits

- **Link Integrity**: Automatically maintain valid links during file operations
- **Refactoring Support**: Safely reorganize vault structure
- **Visibility**: Know what will be affected before making changes
- **Recovery**: Git integration provides rollback capability
- **Performance**: Cached index for fast link lookups