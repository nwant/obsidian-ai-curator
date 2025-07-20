import fs from 'fs/promises';
import path from 'path';

export class EnhancedFileOperations {
  constructor(config, linkIndex, git) {
    this.config = config;
    this.linkIndex = linkIndex;
    this.git = git;
  }

  /**
   * Move a note with automatic link updates
   */
  async moveNoteWithLinkUpdate({ from, to, updateLinks = true, dryRun = false }) {
    const fromPath = path.join(this.config.vaultPath, from);
    const toPath = path.join(this.config.vaultPath, to);
    
    // Validate source exists
    try {
      await fs.access(fromPath);
    } catch {
      throw new Error(`Source file not found: ${from}`);
    }
    
    // Get all files that link to this file
    const backlinks = this.linkIndex.getBacklinks(from);
    const updatedFiles = [];
    const updatePreviews = [];
    
    if (updateLinks && backlinks.length > 0) {
      // Calculate what changes would be made
      for (const linkingFile of backlinks) {
        const fullLinkingPath = path.join(this.config.vaultPath, linkingFile);
        const content = await fs.readFile(fullLinkingPath, 'utf-8');
        const updatedContent = this.updateLinksInContent(content, from, to);
        
        if (content !== updatedContent) {
          updatePreviews.push({
            file: linkingFile,
            changes: this.getContentDiff(content, updatedContent)
          });
          
          if (!dryRun) {
            updatedFiles.push(linkingFile);
          }
        }
      }
    }
    
    if (dryRun) {
      return {
        dryRun: true,
        move: { from, to },
        affectedFiles: backlinks,
        linkUpdates: updatePreviews
      };
    }
    
    // Create parent directory if needed
    const toDir = path.dirname(toPath);
    await fs.mkdir(toDir, { recursive: true });
    
    // Move the file
    await fs.rename(fromPath, toPath);
    
    // Update links in all referencing files
    if (updateLinks) {
      for (const linkingFile of updatedFiles) {
        const fullLinkingPath = path.join(this.config.vaultPath, linkingFile);
        const content = await fs.readFile(fullLinkingPath, 'utf-8');
        const updatedContent = this.updateLinksInContent(content, from, to);
        await fs.writeFile(fullLinkingPath, updatedContent);
      }
    }
    
    // Update link index
    await this.linkIndex.updateLinksOnMove(from, to);
    
    return {
      moved: { from, to },
      updatedFiles,
      totalLinksUpdated: updatedFiles.length
    };
  }

  /**
   * Update links in content when a file is moved
   */
  updateLinksInContent(content, oldPath, newPath) {
    const oldName = path.basename(oldPath, '.md');
    const newName = path.basename(newPath, '.md');
    const oldDir = path.dirname(oldPath);
    const newDir = path.dirname(newPath);
    
    let updated = content;
    
    // Update wiki-style links
    // Handle simple links: [[OldName]]
    updated = updated.replace(
      new RegExp(`\\[\\[${this.escapeRegex(oldName)}\\]\\]`, 'g'),
      `[[${newName}]]`
    );
    
    // Handle aliased links: [[OldName|Display Text]]
    updated = updated.replace(
      new RegExp(`\\[\\[${this.escapeRegex(oldName)}\\|([^\\]]+)\\]\\]`, 'g'),
      `[[${newName}|$1]]`
    );
    
    // Handle links with block references: [[OldName#^block-id]]
    updated = updated.replace(
      new RegExp(`\\[\\[${this.escapeRegex(oldName)}(#[^\\]|]+)\\]\\]`, 'g'),
      `[[${newName}$1]]`
    );
    
    // Handle aliased links with block references: [[OldName#^block|Display]]
    updated = updated.replace(
      new RegExp(`\\[\\[${this.escapeRegex(oldName)}(#[^\\]|]+)\\|([^\\]]+)\\]\\]`, 'g'),
      `[[${newName}$1|$2]]`
    );
    
    // Update markdown-style links with full paths
    if (oldPath.includes('/') || newPath.includes('/')) {
      // Full path links
      updated = updated.replace(
        new RegExp(`\\]\\(${this.escapeRegex(oldPath)}\\)`, 'g'),
        `](${newPath})`
      );
      
      // Relative path links (if directories changed)
      if (oldDir !== newDir) {
        // This is more complex and would need relative path calculation
        // For now, just update if it's a direct reference
        updated = updated.replace(
          new RegExp(`\\]\\(\\.\\/${this.escapeRegex(oldName)}\\.md\\)`, 'g'),
          `](${this.calculateRelativePath(content, newPath)})`
        );
      }
    }
    
    // Update embeds
    updated = updated.replace(
      new RegExp(`!\\[\\[${this.escapeRegex(oldName)}\\]\\]`, 'g'),
      `![[${newName}]]`
    );
    
    return updated;
  }

  /**
   * Batch move operation with transaction support
   */
  async batchMoveNotes({ moves, updateLinks = true, dryRun = false }) {
    // Validate all moves
    const validation = await this.validateMoves(moves);
    if (!validation.valid) {
      return { error: validation.errors };
    }
    
    // Calculate all link updates
    const allUpdates = [];
    for (const move of moves) {
      const preview = await this.moveNoteWithLinkUpdate({
        ...move,
        updateLinks,
        dryRun: true
      });
      allUpdates.push(preview);
    }
    
    if (dryRun) {
      return {
        dryRun: true,
        moves,
        totalFiles: moves.length,
        totalLinksToUpdate: allUpdates.reduce((sum, u) => sum + u.affectedFiles.length, 0),
        previews: allUpdates
      };
    }
    
    // Create git checkpoint
    await this.git.add('.');
    const checkpoint = await this.git.commit('Pre-batch-move checkpoint');
    
    try {
      const results = [];
      
      // Execute moves in order
      for (const move of moves) {
        const result = await this.moveNoteWithLinkUpdate({
          ...move,
          updateLinks,
          dryRun: false
        });
        results.push(result);
      }
      
      // Rebuild link index
      await this.linkIndex.buildIndex();
      
      return {
        success: true,
        checkpoint: checkpoint.commit,
        results,
        summary: {
          totalMoved: results.length,
          totalLinksUpdated: results.reduce((sum, r) => sum + r.totalLinksUpdated, 0)
        }
      };
      
    } catch (error) {
      // Rollback on failure
      await this.git.reset(['--hard', checkpoint.commit]);
      throw new Error(`Batch move failed and was rolled back: ${error.message}`);
    }
  }

  /**
   * Rename a note (special case of move within same directory)
   */
  async renameNote({ path: notePath, newName, updateLinks = true }) {
    const dir = path.dirname(notePath);
    const newPath = path.join(dir, newName + '.md');
    
    return await this.moveNoteWithLinkUpdate({
      from: notePath,
      to: newPath,
      updateLinks
    });
  }

  /**
   * Validate that moves are possible
   */
  async validateMoves(moves) {
    const errors = [];
    const destinations = new Set();
    
    for (const move of moves) {
      const fromPath = path.join(this.config.vaultPath, move.from);
      const toPath = path.join(this.config.vaultPath, move.to);
      
      // Check source exists
      try {
        await fs.access(fromPath);
      } catch {
        errors.push(`Source not found: ${move.from}`);
      }
      
      // Check destination doesn't exist
      try {
        await fs.access(toPath);
        errors.push(`Destination already exists: ${move.to}`);
      } catch {
        // Good, destination doesn't exist
      }
      
      // Check for duplicate destinations
      if (destinations.has(move.to)) {
        errors.push(`Duplicate destination: ${move.to}`);
      }
      destinations.add(move.to);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Check for broken links and optionally fix them
   */
  async checkAndFixBrokenLinks({ fix = false, interactive = false }) {
    const brokenLinks = await this.linkIndex.findBrokenLinks();
    const fixes = [];
    
    for (const broken of brokenLinks) {
      if (broken.suggestion && fix) {
        if (interactive) {
          // In a real implementation, this would prompt the user
          console.log(`Broken link: ${broken.source} -> ${broken.target}`);
          console.log(`Suggested fix: ${broken.suggestion}`);
          // For now, auto-accept suggestions
        }
        
        // Fix the broken link
        const sourcePath = path.join(this.config.vaultPath, broken.source);
        const content = await fs.readFile(sourcePath, 'utf-8');
        const fixedContent = this.fixBrokenLink(content, broken);
        
        if (content !== fixedContent) {
          await fs.writeFile(sourcePath, fixedContent);
          fixes.push({
            file: broken.source,
            brokenLink: broken.target,
            fixedTo: broken.suggestion
          });
        }
      }
    }
    
    // Update index after fixes
    if (fixes.length > 0) {
      for (const fix of fixes) {
        await this.linkIndex.updateFileLinks(fix.file);
      }
    }
    
    return {
      brokenLinks: brokenLinks.filter(b => !fixes.some(f => f.file === b.source && f.brokenLink === b.target)),
      fixed: fixes
    };
  }

  /**
   * Fix a broken link in content
   */
  fixBrokenLink(content, brokenLink) {
    const oldName = path.basename(brokenLink.target, '.md');
    const newName = path.basename(brokenLink.suggestion, '.md');
    
    let fixed = content;
    
    // Fix each occurrence based on the link details
    for (const detail of brokenLink.details) {
      if (detail.type === 'wiki') {
        // Replace the specific occurrence
        const oldPattern = detail.raw;
        const newPattern = oldPattern.replace(oldName, newName);
        fixed = fixed.replace(oldPattern, newPattern);
      } else if (detail.type === 'markdown') {
        // Similar for markdown links
        const oldPattern = detail.raw;
        const newPattern = oldPattern.replace(brokenLink.target, brokenLink.suggestion);
        fixed = fixed.replace(oldPattern, newPattern);
      }
    }
    
    return fixed;
  }

  /**
   * Utility functions
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  calculateRelativePath(fromFile, toFile) {
    const fromDir = path.dirname(fromFile);
    const relativePath = path.relative(fromDir, toFile);
    return relativePath.startsWith('../') ? relativePath : './' + relativePath;
  }

  getContentDiff(original, updated) {
    // Simple diff showing changed lines
    const originalLines = original.split('\n');
    const updatedLines = updated.split('\n');
    const changes = [];
    
    for (let i = 0; i < Math.max(originalLines.length, updatedLines.length); i++) {
      if (originalLines[i] !== updatedLines[i]) {
        changes.push({
          line: i + 1,
          original: originalLines[i] || '',
          updated: updatedLines[i] || ''
        });
      }
    }
    
    return changes;
  }
}