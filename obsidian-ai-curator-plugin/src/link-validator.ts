import { App, TFile, Notice, Modal, Setting } from 'obsidian';
import { MCPClient } from './mcp-client';

export interface LinkValidationResult {
  brokenLinks: BrokenLink[];
  totalLinks: number;
  suggestions: LinkSuggestion[];
}

export interface BrokenLink {
  sourcePath: string;
  targetPath: string;
  linkText: string;
  line: number;
  suggestion?: string;
}

export interface LinkSuggestion {
  original: string;
  suggested: string;
  confidence: number;
}

export interface MovePreview {
  from: string;
  to: string;
  affectedFiles: string[];
  linkUpdates: LinkUpdate[];
}

export interface LinkUpdate {
  file: string;
  oldLink: string;
  newLink: string;
  line: number;
}

export class LinkValidator {
  constructor(
    private app: App,
    private mpcClient: MCPClient
  ) {}

  /**
   * Validate all links in the current file
   */
  async validateCurrentFile(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice('No active file to validate');
      return;
    }

    try {
      const result = await this.validateFile(activeFile);
      this.showValidationResults(result, activeFile);
    } catch (error) {
      console.error('Link validation failed:', error);
      new Notice('Link validation failed');
    }
  }

  /**
   * Validate links in a specific file
   */
  async validateFile(file: TFile): Promise<LinkValidationResult> {
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache || !cache.links) {
      return { brokenLinks: [], totalLinks: 0, suggestions: [] };
    }

    const brokenLinks: BrokenLink[] = [];
    const links = cache.links || [];

    for (const link of links) {
      const targetFile = this.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
      
      if (!targetFile) {
        // Link is broken
        const suggestion = await this.findSuggestion(link.link);
        brokenLinks.push({
          sourcePath: file.path,
          targetPath: link.link,
          linkText: link.displayText || link.link,
          line: link.position.start.line + 1,
          suggestion: suggestion?.suggested
        });
      }
    }

    return {
      brokenLinks,
      totalLinks: links.length,
      suggestions: []
    };
  }

  /**
   * Find suggestion for broken link
   */
  private async findSuggestion(brokenLink: string): Promise<LinkSuggestion | null> {
    // Simple fuzzy matching
    const files = this.app.vault.getMarkdownFiles();
    const linkName = brokenLink.toLowerCase().replace(/\.md$/, '');
    
    let bestMatch: { file: TFile; score: number } | null = null;

    for (const file of files) {
      const fileName = file.basename.toLowerCase();
      const score = this.calculateSimilarity(linkName, fileName);
      
      if (score > 0.7 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { file, score };
      }
    }

    if (bestMatch) {
      return {
        original: brokenLink,
        suggested: bestMatch.file.basename,
        confidence: bestMatch.score
      };
    }

    return null;
  }

  /**
   * Calculate string similarity (0-1)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Show validation results in a modal
   */
  private showValidationResults(result: LinkValidationResult, file: TFile): void {
    if (result.brokenLinks.length === 0) {
      new Notice(`All ${result.totalLinks} links are valid!`);
      return;
    }

    new LinkValidationModal(this.app, result, file).open();
  }

  /**
   * Preview what will happen if a file is moved
   */
  async previewMove(from: string, to: string): Promise<MovePreview> {
    try {
      const response = await this.mpcClient.request('preview-move', { from, to });
      return response as MovePreview;
    } catch (error) {
      console.error('Failed to preview move:', error);
      throw error;
    }
  }

  /**
   * Show move preview in a modal
   */
  async showMovePreview(from: string, to: string): Promise<boolean> {
    try {
      const preview = await this.previewMove(from, to);
      return new Promise((resolve) => {
        new MovePreviewModal(this.app, preview, resolve).open();
      });
    } catch (error) {
      new Notice('Failed to preview move');
      return false;
    }
  }
}

/**
 * Modal to show link validation results
 */
class LinkValidationModal extends Modal {
  constructor(
    app: App,
    private result: LinkValidationResult,
    private file: TFile
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: 'Link Validation Results' });
    
    const summary = contentEl.createEl('p');
    summary.innerHTML = `Found <strong>${this.result.brokenLinks.length}</strong> broken links out of <strong>${this.result.totalLinks}</strong> total links.`;

    if (this.result.brokenLinks.length > 0) {
      contentEl.createEl('h3', { text: 'Broken Links' });
      
      const list = contentEl.createEl('div', { cls: 'link-validation-list' });
      
      for (const broken of this.result.brokenLinks) {
        const item = list.createEl('div', { cls: 'link-validation-item' });
        
        item.createEl('div', { 
          text: `Line ${broken.line}: [[${broken.linkText}]]`,
          cls: 'link-validation-broken'
        });
        
        if (broken.suggestion) {
          const suggestion = item.createEl('div', { cls: 'link-validation-suggestion' });
          suggestion.createEl('span', { text: 'Suggestion: ' });
          suggestion.createEl('strong', { text: broken.suggestion });
          
          new Setting(item)
            .addButton(btn => btn
              .setButtonText('Apply')
              .setTooltip('Replace with suggestion')
              .onClick(async () => {
                // TODO: Implement link replacement
                new Notice('Link replacement not yet implemented');
              }));
        }
      }
    }

    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText('Close')
        .onClick(() => this.close()));
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * Modal to preview file move impacts
 */
class MovePreviewModal extends Modal {
  constructor(
    app: App,
    private preview: MovePreview,
    private onConfirm: (confirmed: boolean) => void
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: 'Move Preview' });
    
    const info = contentEl.createEl('div', { cls: 'move-preview-info' });
    info.createEl('p').innerHTML = `Moving: <strong>${this.preview.from}</strong> → <strong>${this.preview.to}</strong>`;
    
    if (this.preview.affectedFiles.length > 0) {
      info.createEl('p').innerHTML = `This will update <strong>${this.preview.linkUpdates.length}</strong> links in <strong>${this.preview.affectedFiles.length}</strong> files.`;
      
      contentEl.createEl('h3', { text: 'Affected Files' });
      
      const fileList = contentEl.createEl('ul');
      for (const file of this.preview.affectedFiles.slice(0, 10)) {
        fileList.createEl('li', { text: file });
      }
      
      if (this.preview.affectedFiles.length > 10) {
        fileList.createEl('li', { text: `... and ${this.preview.affectedFiles.length - 10} more` });
      }
    } else {
      info.createEl('p', { text: 'No other files link to this file.' });
    }

    const buttons = contentEl.createEl('div', { cls: 'move-preview-buttons' });
    
    new Setting(buttons)
      .addButton(btn => btn
        .setButtonText('Cancel')
        .onClick(() => {
          this.onConfirm(false);
          this.close();
        }))
      .addButton(btn => btn
        .setButtonText('Move & Update Links')
        .setCta()
        .onClick(() => {
          this.onConfirm(true);
          this.close();
        }));
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}