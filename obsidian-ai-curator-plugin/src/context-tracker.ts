import { App, TFile, WorkspaceLeaf } from 'obsidian';
import { MCPClient } from './mcp-client';

export interface WorkspaceContext {
  activeFile: string | null;
  recentFiles: string[];
  openFiles: string[];
  lastModified: string[];
  currentFolder: string | null;
  workspaceLayout: string;
}

export class ContextTracker {
  private recentFiles: string[] = [];
  private maxRecentFiles = 20;
  private contextUpdateTimer: NodeJS.Timeout | null = null;
  private lastContext: WorkspaceContext | null = null;

  constructor(
    private app: App,
    private mpcClient: MCPClient
  ) {}

  start(): void {
    // Track active file changes
    this.app.workspace.on('active-leaf-change', (leaf) => {
      this.handleActiveLeafChange(leaf);
    });

    // Track file opens
    this.app.workspace.on('file-open', (file) => {
      this.handleFileOpen(file);
    });

    // Track layout changes
    this.app.workspace.on('layout-change', () => {
      this.scheduleContextUpdate();
    });

    // Send initial context
    this.sendContextUpdate();
  }

  stop(): void {
    if (this.contextUpdateTimer) {
      clearTimeout(this.contextUpdateTimer);
      this.contextUpdateTimer = null;
    }
    
    // Obsidian automatically removes event listeners when plugin unloads
  }

  private handleActiveLeafChange(leaf: WorkspaceLeaf | null): void {
    if (!leaf) return;
    
    const view = leaf.view;
    if (view.getViewType() === 'markdown') {
      this.scheduleContextUpdate();
    }
  }

  private handleFileOpen(file: TFile | null): void {
    if (!file) return;
    
    // Add to recent files
    this.addToRecentFiles(file.path);
    
    // Send context update
    this.scheduleContextUpdate();
  }

  private addToRecentFiles(path: string): void {
    // Remove if already exists
    this.recentFiles = this.recentFiles.filter(p => p !== path);
    
    // Add to front
    this.recentFiles.unshift(path);
    
    // Trim to max size
    if (this.recentFiles.length > this.maxRecentFiles) {
      this.recentFiles = this.recentFiles.slice(0, this.maxRecentFiles);
    }
  }

  private scheduleContextUpdate(): void {
    // Debounce context updates
    if (this.contextUpdateTimer) {
      clearTimeout(this.contextUpdateTimer);
    }
    
    this.contextUpdateTimer = setTimeout(() => {
      this.sendContextUpdate();
    }, 500);
  }

  private async sendContextUpdate(): Promise<void> {
    const context = this.gatherContext();
    
    // Only send if context has changed
    if (this.hasContextChanged(context)) {
      this.lastContext = context;
      this.mpcClient.notify('workspace-context', context);
    }
  }

  private gatherContext(): WorkspaceContext {
    const activeFile = this.app.workspace.getActiveFile();
    const openFiles = this.getOpenFiles();
    const lastModified = this.getRecentlyModifiedFiles();
    
    return {
      activeFile: activeFile?.path || null,
      recentFiles: [...this.recentFiles],
      openFiles,
      lastModified,
      currentFolder: this.getCurrentFolder(),
      workspaceLayout: this.getWorkspaceLayout()
    };
  }

  private getOpenFiles(): string[] {
    const openFiles: string[] = [];
    
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (view.getViewType() === 'markdown') {
        const file = (view as any).file;
        if (file && file.path) {
          openFiles.push(file.path);
        }
      }
    });
    
    return [...new Set(openFiles)]; // Remove duplicates
  }

  private getRecentlyModifiedFiles(): string[] {
    const files = this.app.vault.getMarkdownFiles();
    
    // Sort by modification time
    files.sort((a, b) => b.stat.mtime - a.stat.mtime);
    
    // Return top 10
    return files.slice(0, 10).map(f => f.path);
  }

  private getCurrentFolder(): string | null {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) return null;
    
    const parts = activeFile.path.split('/');
    parts.pop(); // Remove filename
    
    return parts.length > 0 ? parts.join('/') : '/';
  }

  private getWorkspaceLayout(): string {
    // Simplified layout description
    const leaves = this.app.workspace.getLeavesOfType('markdown');
    const splitTypes = new Set<string>();
    
    this.app.workspace.iterateAllLeaves((leaf) => {
      const parent = (leaf as any).parent;
      if (parent && parent.type) {
        splitTypes.add(parent.type);
      }
    });
    
    if (splitTypes.has('split')) {
      return splitTypes.has('horizontal') ? 'split-horizontal' : 'split-vertical';
    }
    
    return leaves.length > 1 ? 'multiple-tabs' : 'single';
  }

  private hasContextChanged(newContext: WorkspaceContext): boolean {
    if (!this.lastContext) return true;
    
    // Simple comparison - could be enhanced
    return JSON.stringify(newContext) !== JSON.stringify(this.lastContext);
  }

  // Public methods for other components to use
  getActiveFile(): TFile | null {
    return this.app.workspace.getActiveFile();
  }

  getRecentFiles(): string[] {
    return [...this.recentFiles];
  }

  async getFileContext(path: string): Promise<any> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return null;
    
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return null;
    
    // Get files that link to this file
    const backlinks = this.getBacklinksForFile(path);
    
    // Get files this file links to
    const outlinks = (cache.links || []).map(l => l.link);
    
    return {
      path,
      frontmatter: cache.frontmatter || {},
      tags: (cache.tags || []).map(t => t.tag),
      headings: (cache.headings || []).map(h => ({
        text: h.heading,
        level: h.level
      })),
      backlinks,
      outlinks
    };
  }

  private getBacklinksForFile(path: string): string[] {
    const backlinks: string[] = [];
    const resolvedLinks = this.app.metadataCache.resolvedLinks;
    
    for (const [sourcePath, links] of Object.entries(resolvedLinks)) {
      if (links[path]) {
        backlinks.push(sourcePath);
      }
    }
    
    return backlinks;
  }
}