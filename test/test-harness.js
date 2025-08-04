import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Comprehensive Test Harness for MCP Tools
 * 
 * This harness provides:
 * - Mock vault creation and cleanup
 * - Tool execution helpers
 * - Assertion utilities
 * - Performance tracking
 */

export class TestHarness {
  constructor() {
    this.testVaultPath = path.join(__dirname, 'fixtures', 'test-vault');
    this.tools = new Map();
    this.performanceMetrics = [];
  }

  /**
   * Initialize test environment
   */
  async setup() {
    // Create test vault directory
    await fs.mkdir(this.testVaultPath, { recursive: true });
    
    // Create standard test structure
    const dirs = [
      'Daily',
      'Projects',
      'Archive',
      'Templates',
      'Attachments',
      '.obsidian'
    ];
    
    for (const dir of dirs) {
      await fs.mkdir(path.join(this.testVaultPath, dir), { recursive: true });
    }
    
    // Initialize test config
    await this.createTestConfig();
    
    // Load tools
    await this.loadTools();
  }

  /**
   * Clean up test environment
   */
  async teardown() {
    // Clean test vault contents but keep the directory
    await this.cleanTestVault();
    
    // Clear caches
    this.tools.clear();
    
    // Report performance metrics
    if (this.performanceMetrics.length > 0 && process.env.SHOW_PERF_METRICS) {
      console.log('\nPerformance Metrics:');
      this.performanceMetrics.forEach(metric => {
        console.log(`  ${metric.tool}.${metric.operation}: ${metric.duration}ms`);
      });
    }
  }

  /**
   * Create test configuration
   */
  async createTestConfig() {
    const config = {
      vaultPath: this.testVaultPath,
      dateFormat: 'yyyy-MM-dd',
      ignorePatterns: ['.obsidian', '.git', '.trash'],
      testMode: true
    };
    
    const configPath = path.join(__dirname, '..', 'config', 'test-config.json');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  }

  /**
   * Load all MCP tools
   */
  async loadTools() {
    // Import tool modules (only existing modules after cleanup)
    const toolModules = [
      'vault-operations',
      'search-tools',
      'tag-management',
      'daily-notes',
      'git-integration',
      'project-management'
    ];
    
    for (const moduleName of toolModules) {
      try {
        const module = await import(`../src/tools/${moduleName}.js`);
        Object.entries(module).forEach(([name, tool]) => {
          if (typeof tool === 'function') {
            this.tools.set(name, tool);
          }
        });
      } catch (error) {
        console.warn(`Could not load tool module: ${moduleName}`);
      }
    }
  }

  /**
   * Create a test note
   */
  async createNote(relativePath, content, frontmatter = {}) {
    const fullPath = path.join(this.testVaultPath, relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    
    let fileContent = '';
    if (Object.keys(frontmatter).length > 0) {
      fileContent = '---\n';
      Object.entries(frontmatter).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          fileContent += `${key}:\n`;
          value.forEach(item => {
            fileContent += `  - ${item}\n`;
          });
        } else {
          fileContent += `${key}: ${value}\n`;
        }
      });
      fileContent += '---\n\n';
    }
    fileContent += content;
    
    await fs.writeFile(fullPath, fileContent);
    return fullPath;
  }

  /**
   * Read a note
   */
  async readNote(relativePath) {
    const fullPath = path.join(this.testVaultPath, relativePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    const parsed = matter(content);
    return {
      content: parsed.content,
      frontmatter: parsed.data,
      raw: content
    };
  }

  /**
   * Execute a tool with performance tracking
   */
  async executeTool(toolName, params = {}) {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }
    
    const start = Date.now();
    try {
      const result = await tool({ ...params, vaultPath: this.testVaultPath });
      const duration = Date.now() - start;
      
      this.performanceMetrics.push({
        tool: toolName,
        operation: params.operation || 'default',
        duration
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.performanceMetrics.push({
        tool: toolName,
        operation: params.operation || 'default',
        duration,
        error: true
      });
      throw error;
    }
  }

  /**
   * Assert file exists
   */
  async assertFileExists(relativePath) {
    const fullPath = path.join(this.testVaultPath, relativePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      throw new Error(`File does not exist: ${relativePath}`);
    }
  }
  
  /**
   * Assert file does not exist
   */
  async assertFileNotExists(relativePath) {
    const fullPath = path.join(this.testVaultPath, relativePath);
    try {
      await fs.access(fullPath);
      throw new Error(`File should not exist but does: ${relativePath}`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return true;
      }
      // Re-throw our custom error
      if (error.message.includes('should not exist')) {
        throw error;
      }
      // Otherwise it's an unexpected error
      throw new Error(`Unexpected error checking file: ${error.message}`);
    }
  }

  /**
   * Assert file contains text
   */
  async assertFileContains(relativePath, expectedText) {
    const fullPath = path.join(this.testVaultPath, relativePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    
    if (!content.includes(expectedText)) {
      throw new Error(`File ${relativePath} does not contain: ${expectedText}`);
    }
    return true;
  }

  /**
   * Assert frontmatter field
   */
  async assertFrontmatter(relativePath, field, expectedValue) {
    const fullPath = path.join(this.testVaultPath, relativePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    
    // Parse frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      throw new Error(`No frontmatter found in ${relativePath}`);
    }
    
    // Simple YAML parsing for tests
    const lines = frontmatterMatch[1].split('\n');
    for (const line of lines) {
      const [key, ...valueParts] = line.split(':');
      if (key.trim() === field) {
        let value = valueParts.join(':').trim();
        // Remove surrounding quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (value !== String(expectedValue)) {
          throw new Error(`Frontmatter ${field} is "${value}", expected "${expectedValue}"`);
        }
        return true;
      }
    }
    
    throw new Error(`Frontmatter field ${field} not found`);
  }

  /**
   * Get tags from a note
   */
  async getNoteTags(relativePath) {
    const fullPath = path.join(this.testVaultPath, relativePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    const { data } = matter(content);
    
    if (data.tags) {
      return Array.isArray(data.tags) ? data.tags : [data.tags];
    }
    return [];
  }

  /**
   * Clean test vault (remove all files except directories)
   */
  async cleanTestVault() {
    // Ensure test vault exists
    await fs.mkdir(this.testVaultPath, { recursive: true });
    
    const cleanDir = async (dir) => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            await cleanDir(fullPath);
          } else if (!entry.isDirectory()) {
            await fs.unlink(fullPath);
          }
        }
      } catch (error) {
        // Directory doesn't exist, that's fine
        if (error.code !== 'ENOENT') {
          console.error(`Error cleaning ${dir}:`, error.message);
        }
      }
    };
    
    await cleanDir(this.testVaultPath);
  }

  /**
   * Create multiple test notes
   */
  async createTestVault(structure) {
    // Clean vault first
    await this.cleanTestVault();
    
    for (const [path, config] of Object.entries(structure)) {
      if (typeof config === 'string') {
        await this.createNote(path, config);
      } else {
        await this.createNote(path, config.content || '', config.frontmatter || {});
      }
    }
  }

  /**
   * Get vault statistics
   */
  async getAllNotes() {
    const notesPath = this.testVaultPath;
    const noteFiles = [];
    
    async function walkDir(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(notesPath, fullPath);
        
        if (entry.isDirectory()) {
          await walkDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          noteFiles.push(relativePath);
        }
      }
    }
    
    await walkDir(notesPath);
    return noteFiles;
  }
  
  async getVaultStats() {
    const stats = {
      totalFiles: 0,
      totalFolders: 0,
      noteFiles: 0,
      attachments: 0,
      totalSize: 0
    };
    
    async function walkDir(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.')) {
            stats.totalFolders++;
            await walkDir(fullPath);
          }
        } else {
          stats.totalFiles++;
          if (entry.name.endsWith('.md')) {
            stats.noteFiles++;
          } else {
            stats.attachments++;
          }
          
          const fileStat = await fs.stat(fullPath);
          stats.totalSize += fileStat.size;
        }
      }
    }
    
    await walkDir(this.testVaultPath);
    return stats;
  }

  /**
   * Simulate file permission errors
   */
  async setFilePermissions(relativePath, permissions) {
    // For testing, we'll track permission changes but not actually change them
    // This prevents issues on different OS platforms
    if (!this.filePermissions) {
      this.filePermissions = new Map();
    }
    this.filePermissions.set(relativePath, permissions);
    
    // If we're setting read-only, we can simulate by tracking it
    if (permissions === 'read-only') {
      this.readOnlyFiles = this.readOnlyFiles || new Set();
      this.readOnlyFiles.add(relativePath);
    }
  }

  /**
   * Simulate disk full errors
   */
  simulateDiskFull(enable = true) {
    this.diskFull = enable;
  }

  /**
   * Override executeTool to check for simulated errors
   */
  async executeToolWithSimulation(toolName, params = {}) {
    // Check for disk full simulation
    if (this.diskFull && (toolName === 'write_note' || toolName === 'update_frontmatter')) {
      throw new Error('ENOSPC: no space left on device');
    }
    
    // Check for permission errors
    if (this.readOnlyFiles && params.path && this.readOnlyFiles.has(params.path)) {
      throw new Error('EACCES: permission denied');
    }
    
    return this.executeTool(toolName, params);
  }
}

// Export singleton instance
export const testHarness = new TestHarness();