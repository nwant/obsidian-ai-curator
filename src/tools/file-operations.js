/**
 * File Operations Tool
 * Handles renaming and moving files while preserving all links.
 * Uses Obsidian API when available for automatic link updates.
 */

import path from 'path';
import { promises as fs } from 'fs';
import { glob } from 'glob';

export class FileOperations {
  constructor(config, obsidianAPI = null) {
    this.config = config;
    this.vaultPath = config.vaultPath;
    this.obsidianAPI = obsidianAPI;
  }

  /**
   * Rename a file while preserving all links
   */
  async renameFile(oldPath, newPath) {
    // Normalize paths (remove leading slash, ensure .md extension)
    oldPath = this.normalizePath(oldPath);
    newPath = this.normalizePath(newPath);

    // Check if file exists
    const fullOldPath = path.join(this.vaultPath, oldPath);
    const sourceExists = await this.fileExists(fullOldPath);
    
    // Check if target already exists
    const fullNewPath = path.join(this.vaultPath, newPath);
    const targetExists = await this.fileExists(fullNewPath);
    
    // Handle various scenarios
    if (!sourceExists && targetExists) {
      // File might have already been renamed
      return {
        success: false,
        error: `Source file not found at '${oldPath}'. A file already exists at the target location '${newPath}'. The file may have already been renamed.`,
        oldPath,
        newPath,
        suggestion: 'The rename operation may have already been completed.'
      };
    } else if (!sourceExists) {
      throw new Error(`Source file not found: ${oldPath}`);
    } else if (targetExists) {
      throw new Error(`Target file already exists: ${newPath}`);
    }

    // Use Obsidian API if available
    if (this.obsidianAPI && this.obsidianAPI.isAvailable()) {
      return await this.renameWithObsidianAPI(oldPath, newPath);
    }

    // Fallback to manual rename with link updates
    return await this.renameWithLinkUpdates(oldPath, newPath);
  }

  /**
   * Move a file to a new location while preserving all links
   */
  async moveFile(sourcePath, targetPath) {
    // Normalize paths
    sourcePath = this.normalizePath(sourcePath);
    targetPath = this.normalizePath(targetPath);

    // Check if source exists
    const fullSourcePath = path.join(this.vaultPath, sourcePath);
    const sourceExists = await this.fileExists(fullSourcePath);
    
    // Check if target already exists
    const fullTargetPath = path.join(this.vaultPath, targetPath);
    const targetExists = await this.fileExists(fullTargetPath);
    
    // Handle various scenarios
    if (!sourceExists && targetExists) {
      // File might have already been moved
      return {
        success: false,
        error: `Source file not found at '${sourcePath}'. A file already exists at the target location '${targetPath}'. The file may have already been moved.`,
        sourcePath,
        targetPath,
        suggestion: 'The move operation may have already been completed.'
      };
    } else if (!sourceExists) {
      throw new Error(`Source file not found: ${sourcePath}`);
    } else if (targetExists) {
      throw new Error(`Target file already exists: ${targetPath}`);
    }

    // Use Obsidian API if available
    if (this.obsidianAPI && this.obsidianAPI.isAvailable()) {
      return await this.moveWithObsidianAPI(sourcePath, targetPath);
    }

    // Fallback to manual move with link updates
    return await this.moveWithLinkUpdates(sourcePath, targetPath);
  }

  /**
   * Rename using Obsidian API (automatic link updates)
   */
  async renameWithObsidianAPI(oldPath, newPath) {
    try {
      const response = await this.obsidianAPI.request('/api/rename-file', {
        oldPath,
        newPath
      });

      if (response.success) {
        return {
          success: true,
          oldPath,
          newPath,
          linksUpdated: true,
          method: 'obsidian-api',
          details: response.data
        };
      } else {
        throw new Error(response.error || 'Rename failed');
      }
    } catch (error) {
      console.error('Obsidian API rename failed, falling back:', error);
      // Fallback to manual method
      return await this.renameWithLinkUpdates(oldPath, newPath);
    }
  }

  /**
   * Move using Obsidian API (automatic link updates)
   */
  async moveWithObsidianAPI(sourcePath, targetPath) {
    try {
      const response = await this.obsidianAPI.request('/api/move-file', {
        sourcePath,
        targetPath
      });

      if (response.success) {
        return {
          success: true,
          sourcePath,
          targetPath,
          linksUpdated: true,
          method: 'obsidian-api',
          details: response.data
        };
      } else {
        throw new Error(response.error || 'Move failed');
      }
    } catch (error) {
      console.error('Obsidian API move failed, falling back:', error);
      // Fallback to manual method
      return await this.moveWithLinkUpdates(sourcePath, targetPath);
    }
  }

  /**
   * Manual rename with link updates
   */
  async renameWithLinkUpdates(oldPath, newPath) {
    const fullOldPath = path.join(this.vaultPath, oldPath);
    const fullNewPath = path.join(this.vaultPath, newPath);

    // Find all files that might contain links
    const affectedFiles = await this.findFilesWithLinks(oldPath);

    // Update links in all affected files
    const updateResults = await this.updateLinksInFiles(affectedFiles, oldPath, newPath);

    // Ensure target directory exists
    const targetDir = path.dirname(fullNewPath);
    await fs.mkdir(targetDir, { recursive: true });

    // Perform the rename
    await fs.rename(fullOldPath, fullNewPath);

    return {
      success: true,
      oldPath,
      newPath,
      linksUpdated: true,
      method: 'manual',
      filesUpdated: updateResults.length,
      details: {
        updatedFiles: updateResults
      }
    };
  }

  /**
   * Manual move with link updates
   */
  async moveWithLinkUpdates(sourcePath, targetPath) {
    // Moving is essentially the same as renaming
    return await this.renameWithLinkUpdates(sourcePath, targetPath);
  }

  /**
   * Find files that contain links to the given file
   */
  async findFilesWithLinks(targetPath) {
    const pattern = path.join(this.vaultPath, '**/*.md');
    const files = await glob(pattern, {
      ignore: this.config.ignorePatterns?.map(p => path.join(this.vaultPath, p))
    });

    const basename = path.basename(targetPath, '.md');
    const affectedFiles = [];

    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      
      // Check for various link formats
      const linkPatterns = [
        `[[${basename}]]`,
        `[[${basename}|`,
        `[[${targetPath}]]`,
        `[[${targetPath}|`,
        `](${targetPath})`,
        `](${basename}.md)`
      ];

      if (linkPatterns.some(pattern => content.includes(pattern))) {
        affectedFiles.push(file);
      }
    }

    return affectedFiles;
  }

  /**
   * Update links in the given files
   */
  async updateLinksInFiles(files, oldPath, newPath) {
    const oldBasename = path.basename(oldPath, '.md');
    const newBasename = path.basename(newPath, '.md');
    const results = [];

    for (const file of files) {
      let content = await fs.readFile(file, 'utf-8');
      let modified = false;
      const originalContent = content;

      // Update wikilinks
      // [[OldName]] -> [[NewName]]
      content = content.replace(
        new RegExp(`\\[\\[${this.escapeRegex(oldBasename)}\\]\\]`, 'g'),
        `[[${newBasename}]]`
      );

      // [[OldName|Alias]] -> [[NewName|Alias]]
      content = content.replace(
        new RegExp(`\\[\\[${this.escapeRegex(oldBasename)}\\|([^\\]]+)\\]\\]`, 'g'),
        `[[${newBasename}|$1]]`
      );

      // Update full path links if paths are different
      if (oldPath !== oldBasename + '.md' || newPath !== newBasename + '.md') {
        // [[path/to/OldName]] -> [[path/to/NewName]]
        content = content.replace(
          new RegExp(`\\[\\[${this.escapeRegex(oldPath.replace('.md', ''))}\\]\\]`, 'g'),
          `[[${newPath.replace('.md', '')}]]`
        );

        // [[path/to/OldName|Alias]] -> [[path/to/NewName|Alias]]
        content = content.replace(
          new RegExp(`\\[\\[${this.escapeRegex(oldPath.replace('.md', ''))}\\|([^\\]]+)\\]\\]`, 'g'),
          `[[${newPath.replace('.md', '')}|$1]]`
        );
      }

      // Update markdown links
      content = content.replace(
        new RegExp(`\\]\\(${this.escapeRegex(oldPath)}\\)`, 'g'),
        `](${newPath})`
      );

      modified = content !== originalContent;

      if (modified) {
        await fs.writeFile(file, content, 'utf-8');
        results.push({
          file: path.relative(this.vaultPath, file),
          linksUpdated: true
        });
      }
    }

    return results;
  }

  /**
   * Normalize file path
   */
  normalizePath(filePath) {
    // Remove leading slash
    if (filePath.startsWith('/')) {
      filePath = filePath.substring(1);
    }

    // Ensure .md extension
    if (!filePath.endsWith('.md')) {
      filePath += '.md';
    }

    return filePath;
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Escape special regex characters
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Get file info
   */
  async getFileInfo(filePath) {
    const fullPath = path.join(this.vaultPath, filePath);
    const stats = await fs.stat(fullPath);
    
    return {
      path: filePath,
      name: path.basename(filePath),
      size: stats.size,
      modified: stats.mtime.toISOString(),
      created: stats.birthtime.toISOString()
    };
  }
}