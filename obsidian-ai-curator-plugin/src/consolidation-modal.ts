import { App, Modal, Setting, Notice, ButtonComponent, TextAreaComponent } from 'obsidian';
import { ConsolidationCandidate, ConsolidationService } from './consolidation-service';
import { GitService } from './git-service';

export class ConsolidationModal extends Modal {
  private candidates: ConsolidationCandidate[];
  private selectedCandidate: ConsolidationCandidate | null = null;
  private consolidationService: ConsolidationService;
  private gitService: GitService;
  private previewArea: TextAreaComponent;
  private consolidateButton: ButtonComponent;
  private isProcessing = false;

  constructor(
    app: App, 
    candidates: ConsolidationCandidate[],
    consolidationService: ConsolidationService,
    gitService: GitService
  ) {
    super(app);
    this.candidates = candidates;
    this.consolidationService = consolidationService;
    this.gitService = gitService;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    
    contentEl.createEl('h2', { text: 'Consolidation Candidates' });
    
    // Candidate selection
    new Setting(contentEl)
      .setName('Select notes to consolidate')
      .setDesc('Choose a group of related notes that can be merged');
    
    const candidateContainer = contentEl.createDiv('consolidation-candidates');
    
    this.candidates.forEach((candidate, index) => {
      const candidateEl = candidateContainer.createDiv('consolidation-candidate');
      candidateEl.addClass('clickable');
      
      const header = candidateEl.createDiv('candidate-header');
      header.createEl('strong', { text: `Option ${index + 1}` });
      header.createEl('span', { 
        text: ` (${(candidate.confidence * 100).toFixed(0)}% confidence)`,
        cls: 'confidence'
      });
      
      candidateEl.createEl('p', { text: candidate.reason });
      
      const filesList = candidateEl.createEl('ul', { cls: 'files-list' });
      candidate.files.forEach(file => {
        filesList.createEl('li', { text: file.basename });
      });
      
      candidateEl.addEventListener('click', () => {
        // Remove selected class from all candidates
        candidateContainer.querySelectorAll('.consolidation-candidate')
          .forEach(el => el.removeClass('selected'));
        
        // Select this candidate
        candidateEl.addClass('selected');
        this.selectedCandidate = candidate;
        this.updateButtons();
      });
    });
    
    // Preview section
    contentEl.createEl('h3', { text: 'Consolidation Preview' });
    
    new Setting(contentEl)
      .setName('Preview')
      .setDesc('Review the consolidation plan before executing')
      .addTextArea(text => {
        this.previewArea = text;
        text.inputEl.rows = 10;
        text.inputEl.disabled = true;
        text.setPlaceholder('Select a candidate to see preview...');
        return text;
      });
    
    // Action buttons
    const buttonContainer = contentEl.createDiv('button-container');
    
    new Setting(buttonContainer)
      .addButton(btn => {
        btn.setButtonText('Preview')
          .setCta()
          .onClick(() => this.previewConsolidation());
      })
      .addButton(btn => {
        this.consolidateButton = btn;
        btn.setButtonText('Consolidate')
          .setWarning()
          .onClick(() => this.executeConsolidation());
        btn.setDisabled(true);
      })
      .addButton(btn => {
        btn.setButtonText('Cancel')
          .onClick(() => this.close());
      });
      
    // Add styles
    this.addStyles();
  }

  private updateButtons() {
    if (this.consolidateButton) {
      this.consolidateButton.setDisabled(!this.selectedCandidate || this.isProcessing);
    }
  }

  private async previewConsolidation() {
    if (!this.selectedCandidate) {
      new Notice('Please select a consolidation candidate first');
      return;
    }

    this.isProcessing = true;
    this.updateButtons();
    
    this.previewArea.setValue('Generating consolidation preview...\n');
    
    try {
      console.log('[ConsolidationModal] Starting preview generation for:', this.selectedCandidate);
      const stream = this.consolidationService.streamConsolidation(this.selectedCandidate);
      let fullContent = '';
      
      for await (const chunk of stream) {
        console.log('[ConsolidationModal] Received chunk:', chunk.type);
        switch (chunk.type) {
          case 'progress':
            this.previewArea.setValue(fullContent + '\n\n' + chunk.data);
            break;
          case 'content':
            fullContent += chunk.data;
            this.previewArea.setValue(fullContent);
            break;
          case 'complete':
            this.previewArea.setValue(this.formatPreview(chunk.data));
            new Notice('Preview generated successfully');
            break;
          case 'error':
            this.previewArea.setValue(`Error: ${chunk.data}`);
            new Notice('Failed to generate preview');
            break;
        }
      }
    } catch (error) {
      console.error('Preview generation failed:', error);
      this.previewArea.setValue(`Error: ${error.message}`);
      new Notice('Failed to generate preview');
    } finally {
      this.isProcessing = false;
      this.updateButtons();
    }
  }

  private formatPreview(result: any): string {
    let preview = `Title: ${result.title}\n`;
    preview += `Files to archive: ${result.archivedFiles.join(', ')}\n\n`;
    preview += '--- CONSOLIDATED NOTE ---\n\n';
    preview += result.content;
    return preview;
  }

  private async executeConsolidation() {
    if (!this.selectedCandidate) {
      new Notice('Please select a consolidation candidate first');
      return;
    }

    // Confirm action
    const confirmed = await this.confirmConsolidation();
    if (!confirmed) return;

    this.isProcessing = true;
    this.updateButtons();

    try {
      // Create git commit before changes if enabled
      const autoCommit = (this.app as any).plugins.plugins['obsidian-ai-curator']?.settings?.consolidationSettings?.autoGitCommit;
      if (autoCommit && await this.gitService.isGitRepo()) {
        new Notice('Creating git checkpoint...');
        await this.gitService.createCheckpoint('Before consolidation');
      }

      // Execute consolidation
      new Notice('Executing consolidation...');
      const stream = this.consolidationService.streamConsolidation(this.selectedCandidate);
      
      let result: any;
      for await (const chunk of stream) {
        if (chunk.type === 'complete') {
          result = chunk.data;
        } else if (chunk.type === 'error') {
          throw new Error(chunk.data);
        }
      }

      if (result) {
        await this.consolidationService.executeConsolidation(result);
        
        // Create git commit after changes if enabled
        if (autoCommit && await this.gitService.isGitRepo()) {
          await this.gitService.createCheckpoint(
            `Consolidated ${result.archivedFiles.length} notes into "${result.title}"`
          );
        }
        
        new Notice('Consolidation completed successfully!');
        this.close();
      }
    } catch (error) {
      console.error('Consolidation failed:', error);
      new Notice(`Consolidation failed: ${error.message}`);
    } finally {
      this.isProcessing = false;
      this.updateButtons();
    }
  }

  private async confirmConsolidation(): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new Modal(this.app);
      modal.contentEl.createEl('h3', { text: 'Confirm Consolidation' });
      modal.contentEl.createEl('p', { 
        text: 'This will create a new consolidated note and archive the original files. This action cannot be undone (except via git).' 
      });
      
      new Setting(modal.contentEl)
        .addButton(btn => {
          btn.setButtonText('Cancel')
            .onClick(() => {
              modal.close();
              resolve(false);
            });
        })
        .addButton(btn => {
          btn.setButtonText('Consolidate')
            .setWarning()
            .setCta()
            .onClick(() => {
              modal.close();
              resolve(true);
            });
        });
        
      modal.open();
    });
  }

  private addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .consolidation-candidates {
        max-height: 300px;
        overflow-y: auto;
        margin-bottom: 1em;
      }
      
      .consolidation-candidate {
        border: 1px solid var(--background-modifier-border);
        border-radius: 4px;
        padding: 10px;
        margin-bottom: 10px;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .consolidation-candidate:hover {
        background-color: var(--background-modifier-hover);
      }
      
      .consolidation-candidate.selected {
        background-color: var(--background-modifier-active-hover);
        border-color: var(--interactive-accent);
      }
      
      .candidate-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5em;
      }
      
      .confidence {
        color: var(--text-muted);
        font-size: 0.9em;
      }
      
      .files-list {
        margin: 0.5em 0 0 1em;
        color: var(--text-muted);
      }
      
      .button-container {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 1em;
      }
    `;
    document.head.appendChild(style);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}