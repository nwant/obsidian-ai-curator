import { App, TFile, TFolder, Notice } from 'obsidian';
import { LinkValidator } from './link-validator';

export class FileInterceptor {
  private originalRename: typeof this.app.vault.rename;

  constructor(
    private app: App,
    private linkValidator: LinkValidator
  ) {
    // Store original rename function
    this.originalRename = this.app.vault.rename.bind(this.app.vault);
  }

  /**
   * Install interceptors for file operations
   */
  install(): void {
    // Intercept rename operations
    this.app.vault.rename = async (file: TFile | TFolder, newPath: string) => {
      // Only intercept markdown file renames
      if (file instanceof TFile && file.extension === 'md') {
        const shouldProceed = await this.handleFileRename(file, newPath);
        if (!shouldProceed) {
          return; // User cancelled
        }
      }

      // Proceed with original rename
      return this.originalRename(file, newPath);
    };
  }

  /**
   * Restore original functions
   */
  uninstall(): void {
    this.app.vault.rename = this.originalRename;
  }

  /**
   * Handle file rename with preview
   */
  private async handleFileRename(file: TFile, newPath: string): Promise<boolean> {
    try {
      // Check if the file has any backlinks
      const cache = this.app.metadataCache.getCache(file.path);
      const resolvedLinks = this.app.metadataCache.resolvedLinks;
      
      let hasBacklinks = false;
      for (const [, links] of Object.entries(resolvedLinks)) {
        if (links[file.path]) {
          hasBacklinks = true;
          break;
        }
      }

      // If no backlinks, proceed without preview
      if (!hasBacklinks) {
        return true;
      }

      // Show preview modal
      new Notice('Checking link impacts...');
      const confirmed = await this.linkValidator.showMovePreview(file.path, newPath);
      
      return confirmed;
    } catch (error) {
      console.error('Error handling file rename:', error);
      // On error, proceed with rename anyway
      return true;
    }
  }
}