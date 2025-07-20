import fs from 'fs/promises';
import path from 'path';

export class LinkIndexValidator {
  constructor(linkIndex, config) {
    this.linkIndex = linkIndex;
    this.config = config;
  }

  /**
   * Validate and update the index based on current file system state
   */
  async validateAndUpdate() {
    const startTime = Date.now();
    const changes = {
      newFiles: [],
      deletedFiles: [],
      modifiedFiles: [],
      movedFiles: []
    };

    // Get current files from file system
    const currentFiles = await this.scanVaultFiles();
    const currentFileSet = new Set(currentFiles.map(f => f.path));
    
    // Get files from index
    const indexedFiles = Object.keys(this.linkIndex.index.lastUpdated);
    const indexedFileSet = new Set(indexedFiles);

    // Find new files (in FS but not in index)
    for (const file of currentFiles) {
      if (!indexedFileSet.has(file.path)) {
        changes.newFiles.push(file.path);
        await this.linkIndex.indexFile(file.path);
      }
    }

    // Find deleted files (in index but not in FS)
    for (const indexedFile of indexedFiles) {
      if (!currentFileSet.has(indexedFile)) {
        changes.deletedFiles.push(indexedFile);
        this.linkIndex.removeFileFromIndex(indexedFile);
      }
    }

    // Check for modified files
    for (const file of currentFiles) {
      if (indexedFileSet.has(file.path)) {
        const indexedTime = new Date(this.linkIndex.index.lastUpdated[file.path]).getTime();
        if (file.mtime > indexedTime) {
          changes.modifiedFiles.push(file.path);
          await this.linkIndex.updateFileLinks(file.path);
        }
      }
    }

    // Detect moved files (heuristic based on content similarity)
    if (changes.newFiles.length > 0 && changes.deletedFiles.length > 0) {
      const movedPairs = await this.detectMovedFiles(changes.newFiles, changes.deletedFiles);
      for (const [oldPath, newPath] of movedPairs) {
        changes.movedFiles.push({ from: oldPath, to: newPath });
        // Update the index for the move
        await this.linkIndex.updateLinksOnMove(oldPath, newPath);
        // Remove from new/deleted lists
        changes.newFiles = changes.newFiles.filter(f => f !== newPath);
        changes.deletedFiles = changes.deletedFiles.filter(f => f !== oldPath);
      }
    }

    // Save updated index
    await this.linkIndex.save();

    return {
      duration: Date.now() - startTime,
      changes,
      totalChanges: Object.values(changes).reduce((sum, arr) => sum + arr.length, 0)
    };
  }

  /**
   * Scan vault for all markdown files with stats
   */
  async scanVaultFiles() {
    const files = [];
    
    const scanDir = async (dir, baseDir = '') => {
      const fullDir = path.join(this.config.vaultPath, dir);
      const entries = await fs.readdir(fullDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const relativePath = path.join(baseDir, entry.name);
        const fullPath = path.join(fullDir, entry.name);
        
        if (entry.isDirectory() && !this.shouldIgnore(entry.name)) {
          await scanDir(relativePath, relativePath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          const stats = await fs.stat(fullPath);
          files.push({
            path: relativePath,
            mtime: stats.mtime.getTime()
          });
        }
      }
    };
    
    await scanDir('');
    return files;
  }

  /**
   * Detect files that were likely moved by comparing content
   */
  async detectMovedFiles(newFiles, deletedFiles) {
    const moved = [];
    const contentCache = new Map();
    
    // Load content for deleted files from git history if possible
    for (const deleted of deletedFiles) {
      try {
        // Try to get content from last known state
        const cachedLinks = this.linkIndex.index.forwardLinks[deleted] || [];
        const cachedDetails = this.linkIndex.index.linkDetails;
        
        // Create a fingerprint from known data
        const fingerprint = {
          linkCount: cachedLinks.length,
          links: cachedLinks.sort(),
          // Could also use frontmatter aliases if available
          aliases: Object.entries(this.linkIndex.index.aliases)
            .filter(([alias, target]) => target === deleted)
            .map(([alias]) => alias)
        };
        
        contentCache.set(deleted, fingerprint);
      } catch (error) {
        // Skip if we can't get content
      }
    }
    
    // Compare with new files
    for (const newFile of newFiles) {
      try {
        const fullPath = path.join(this.config.vaultPath, newFile);
        const content = await fs.readFile(fullPath, 'utf-8');
        const links = this.linkIndex.extractLinks(content, newFile);
        
        const newFingerprint = {
          linkCount: links.length,
          links: links.map(l => l.targetFile).sort()
        };
        
        // Find best match
        let bestMatch = null;
        let bestScore = 0;
        
        for (const [deleted, oldFingerprint] of contentCache.entries()) {
          const score = this.calculateSimilarityScore(oldFingerprint, newFingerprint);
          
          // Consider it a move if similarity is high enough
          if (score > 0.8 && score > bestScore) {
            bestScore = score;
            bestMatch = deleted;
          }
        }
        
        if (bestMatch) {
          moved.push([bestMatch, newFile]);
          contentCache.delete(bestMatch);
        }
      } catch (error) {
        // Skip if we can't read the file
      }
    }
    
    return moved;
  }

  /**
   * Calculate similarity between two file fingerprints
   */
  calculateSimilarityScore(fingerprint1, fingerprint2) {
    // Simple similarity based on shared links
    if (fingerprint1.linkCount === 0 && fingerprint2.linkCount === 0) {
      return 0; // Can't determine similarity without links
    }
    
    const links1 = new Set(fingerprint1.links);
    const links2 = new Set(fingerprint2.links);
    
    const intersection = [...links1].filter(l => links2.has(l)).length;
    const union = new Set([...links1, ...links2]).size;
    
    return union > 0 ? intersection / union : 0;
  }

  shouldIgnore(name) {
    const ignorePatterns = ['.git', '.obsidian', '_archived', ...this.config.ignorePatterns];
    return ignorePatterns.includes(name);
  }

  /**
   * Watch for file system changes and update index in real-time
   */
  async watchForChanges(callback) {
    // This would use fs.watch or chokidar in a real implementation
    // For now, just provide the structure
    console.log('File watching not implemented in this version');
    
    // Example of what this would do:
    // - Watch for file create/modify/delete events
    // - Debounce rapid changes
    // - Update index incrementally
    // - Notify callback with changes
  }
}