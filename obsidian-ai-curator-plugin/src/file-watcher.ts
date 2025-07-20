import { App, TFile, TAbstractFile, EventRef } from 'obsidian';
import { MCPClient } from './mcp-client';
import { FileChangeNotification, FileMetadata } from './types';

export class FileWatcher {
  private eventRefs: EventRef[] = [];
  private processedEvents = new Set<string>();

  constructor(
    private app: App,
    private mpcClient: MCPClient
  ) {}

  start(): void {
    // File created
    const createRef = this.app.vault.on('create', (file) => {
      if (file instanceof TFile && file.extension === 'md') {
        this.handleFileCreate(file);
      }
    });
    this.eventRefs.push(createRef);

    // File modified
    const modifyRef = this.app.vault.on('modify', (file) => {
      if (file instanceof TFile && file.extension === 'md') {
        this.handleFileModify(file);
      }
    });
    this.eventRefs.push(modifyRef);

    // File deleted
    const deleteRef = this.app.vault.on('delete', (file) => {
      if (file instanceof TFile && file.extension === 'md') {
        this.handleFileDelete(file);
      }
    });
    this.eventRefs.push(deleteRef);

    // File renamed
    const renameRef = this.app.vault.on('rename', (file, oldPath) => {
      if (file instanceof TFile && file.extension === 'md') {
        this.handleFileRename(file, oldPath);
      }
    });
    this.eventRefs.push(renameRef);
  }

  stop(): void {
    this.eventRefs.forEach(ref => this.app.vault.offref(ref));
    this.eventRefs = [];
    this.processedEvents.clear();
  }

  private async handleFileCreate(file: TFile): Promise<void> {
    const eventKey = `create-${file.path}-${Date.now()}`;
    if (this.isDuplicateEvent(eventKey)) return;

    const metadata = await this.extractMetadata(file);
    const notification: FileChangeNotification = {
      type: 'create',
      path: file.path,
      metadata
    };

    this.mpcClient.notify('file-change', notification);
  }

  private async handleFileModify(file: TFile): Promise<void> {
    const eventKey = `modify-${file.path}-${Date.now()}`;
    if (this.isDuplicateEvent(eventKey)) return;

    // Debounce rapid modifications
    setTimeout(async () => {
      const metadata = await this.extractMetadata(file);
      const notification: FileChangeNotification = {
        type: 'modify',
        path: file.path,
        metadata
      };

      this.mpcClient.notify('file-change', notification);
    }, 500);
  }

  private handleFileDelete(file: TFile): void {
    const eventKey = `delete-${file.path}-${Date.now()}`;
    if (this.isDuplicateEvent(eventKey)) return;

    const notification: FileChangeNotification = {
      type: 'delete',
      path: file.path
    };

    this.mpcClient.notify('file-change', notification);
  }

  private handleFileRename(file: TFile, oldPath: string): void {
    const eventKey = `rename-${oldPath}-${file.path}-${Date.now()}`;
    if (this.isDuplicateEvent(eventKey)) return;

    const notification: FileChangeNotification = {
      type: 'rename',
      path: file.path,
      oldPath: oldPath
    };

    this.mpcClient.notify('file-change', notification);
  }

  private async extractMetadata(file: TFile): Promise<FileMetadata> {
    const cache = this.app.metadataCache.getFileCache(file);
    
    if (!cache) {
      return {
        frontmatter: {},
        links: [],
        tags: [],
        headings: []
      };
    }

    // Extract frontmatter
    const frontmatter = cache.frontmatter || {};

    // Extract links
    const links = (cache.links || []).map(link => ({
      link: link.link,
      displayText: link.displayText,
      position: { line: link.position.start.line, col: link.position.start.col }
    }));

    // Extract tags
    const tags = cache.tags?.map(tag => tag.tag) || [];

    // Extract headings
    const headings = (cache.headings || []).map(heading => ({
      heading: heading.heading,
      level: heading.level,
      position: { line: heading.position.start.line, col: heading.position.start.col }
    }));

    // Get backlinks
    const backlinks = this.getBacklinks(file);

    return {
      frontmatter,
      links,
      tags,
      headings,
      backlinks
    };
  }

  private getBacklinks(file: TFile): string[] {
    const backlinks: string[] = [];
    const resolvedLinks = this.app.metadataCache.resolvedLinks;

    for (const [sourcePath, links] of Object.entries(resolvedLinks)) {
      if (links[file.path]) {
        backlinks.push(sourcePath);
      }
    }

    return backlinks;
  }

  private isDuplicateEvent(eventKey: string): boolean {
    // Check if we've processed this event recently (within 100ms)
    const now = Date.now();
    const keyParts = eventKey.split('-');
    const timestamp = parseInt(keyParts[keyParts.length - 1]);

    // Clean old events
    this.processedEvents.forEach(key => {
      const parts = key.split('-');
      const ts = parseInt(parts[parts.length - 1]);
      if (now - ts > 1000) {
        this.processedEvents.delete(key);
      }
    });

    // Check for duplicate
    for (const processedKey of this.processedEvents) {
      if (processedKey.startsWith(eventKey.substring(0, eventKey.lastIndexOf('-')))) {
        const parts = processedKey.split('-');
        const ts = parseInt(parts[parts.length - 1]);
        if (Math.abs(timestamp - ts) < 100) {
          return true;
        }
      }
    }

    this.processedEvents.add(eventKey);
    return false;
  }
}