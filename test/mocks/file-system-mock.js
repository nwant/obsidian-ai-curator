/**
 * Mock file system for testing
 * Provides in-memory file system operations
 */

export class FileSystemMock {
  constructor() {
    this.files = new Map();
    this.directories = new Set();
    this.watchers = new Map();
    this.permissions = new Map();
  }

  /**
   * Reset mock state
   */
  reset() {
    this.files.clear();
    this.directories.clear();
    this.watchers.clear();
    this.permissions.clear();
  }

  /**
   * Create a directory
   */
  async mkdir(path, options = {}) {
    if (this.files.has(path)) {
      throw new Error(`EEXIST: file already exists, mkdir '${path}'`);
    }

    if (options.recursive) {
      const parts = path.split('/');
      let currentPath = '';
      for (const part of parts) {
        if (part) {
          currentPath += '/' + part;
          this.directories.add(currentPath);
        }
      }
    } else {
      const parent = path.substring(0, path.lastIndexOf('/'));
      if (parent && !this.directories.has(parent)) {
        throw new Error(`ENOENT: no such file or directory, mkdir '${path}'`);
      }
      this.directories.add(path);
    }
  }

  /**
   * Write a file
   */
  async writeFile(path, content, encoding = 'utf8') {
    const dir = path.substring(0, path.lastIndexOf('/'));
    if (dir && !this.directories.has(dir)) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }

    // Check permissions
    if (this.permissions.has(path) && !this.permissions.get(path).write) {
      throw new Error(`EACCES: permission denied, open '${path}'`);
    }

    this.files.set(path, {
      content: content.toString(),
      encoding,
      mtime: new Date(),
      size: content.length
    });

    // Trigger watchers
    this.triggerWatchers(path, 'change');
  }

  /**
   * Read a file
   */
  async readFile(path, encoding = 'utf8') {
    if (!this.files.has(path)) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }

    // Check permissions
    if (this.permissions.has(path) && !this.permissions.get(path).read) {
      throw new Error(`EACCES: permission denied, open '${path}'`);
    }

    const file = this.files.get(path);
    return file.content;
  }

  /**
   * Check if file exists
   */
  async access(path) {
    if (!this.files.has(path) && !this.directories.has(path)) {
      throw new Error(`ENOENT: no such file or directory, access '${path}'`);
    }
  }

  /**
   * Get file stats
   */
  async stat(path) {
    if (this.directories.has(path)) {
      return {
        isDirectory: () => true,
        isFile: () => false,
        size: 0,
        mtime: new Date(),
        birthtime: new Date()
      };
    }

    if (this.files.has(path)) {
      const file = this.files.get(path);
      return {
        isDirectory: () => false,
        isFile: () => true,
        size: file.size,
        mtime: file.mtime,
        birthtime: file.mtime
      };
    }

    throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
  }

  /**
   * Read directory
   */
  async readdir(path, options = {}) {
    if (!this.directories.has(path)) {
      throw new Error(`ENOENT: no such file or directory, scandir '${path}'`);
    }

    const entries = [];
    const pathPrefix = path.endsWith('/') ? path : path + '/';

    // Find all direct children
    for (const [filePath] of this.files) {
      if (filePath.startsWith(pathPrefix)) {
        const relativePath = filePath.substring(pathPrefix.length);
        if (!relativePath.includes('/')) {
          entries.push(options.withFileTypes ? {
            name: relativePath,
            isDirectory: () => false,
            isFile: () => true
          } : relativePath);
        }
      }
    }

    for (const dirPath of this.directories) {
      if (dirPath.startsWith(pathPrefix) && dirPath !== path) {
        const relativePath = dirPath.substring(pathPrefix.length);
        if (!relativePath.includes('/')) {
          entries.push(options.withFileTypes ? {
            name: relativePath,
            isDirectory: () => true,
            isFile: () => false
          } : relativePath);
        }
      }
    }

    return entries;
  }

  /**
   * Delete a file
   */
  async unlink(path) {
    if (!this.files.has(path)) {
      throw new Error(`ENOENT: no such file or directory, unlink '${path}'`);
    }

    this.files.delete(path);
    this.triggerWatchers(path, 'unlink');
  }

  /**
   * Rename/move a file
   */
  async rename(oldPath, newPath) {
    if (!this.files.has(oldPath)) {
      throw new Error(`ENOENT: no such file or directory, rename '${oldPath}' -> '${newPath}'`);
    }

    const file = this.files.get(oldPath);
    this.files.delete(oldPath);
    this.files.set(newPath, file);

    this.triggerWatchers(oldPath, 'unlink');
    this.triggerWatchers(newPath, 'add');
  }

  /**
   * Remove directory (recursive)
   */
  async rm(path, options = {}) {
    if (options.recursive) {
      // Remove all files and subdirectories
      const toRemove = [];
      
      for (const [filePath] of this.files) {
        if (filePath.startsWith(path)) {
          toRemove.push(filePath);
        }
      }
      
      for (const filePath of toRemove) {
        this.files.delete(filePath);
      }
      
      const dirsToRemove = [];
      for (const dirPath of this.directories) {
        if (dirPath.startsWith(path)) {
          dirsToRemove.push(dirPath);
        }
      }
      
      for (const dirPath of dirsToRemove) {
        this.directories.delete(dirPath);
      }
    } else {
      if (!this.directories.has(path)) {
        throw new Error(`ENOENT: no such file or directory, rmdir '${path}'`);
      }
      this.directories.delete(path);
    }
  }

  /**
   * Set file permissions
   */
  setPermissions(path, permissions) {
    this.permissions.set(path, permissions);
  }

  /**
   * Add a file watcher
   */
  watch(path, callback) {
    if (!this.watchers.has(path)) {
      this.watchers.set(path, []);
    }
    this.watchers.get(path).push(callback);
  }

  /**
   * Trigger watchers
   */
  triggerWatchers(path, event) {
    if (this.watchers.has(path)) {
      for (const callback of this.watchers.get(path)) {
        callback(event, path);
      }
    }
  }

  /**
   * Simulate disk full error
   */
  simulateDiskFull() {
    this.diskFull = true;
  }

  /**
   * Get all files (for debugging)
   */
  getAllFiles() {
    return Array.from(this.files.keys());
  }

  /**
   * Get file content (for assertions)
   */
  getFileContent(path) {
    return this.files.get(path)?.content;
  }
}

// Create singleton instance
export const fsMock = new FileSystemMock();