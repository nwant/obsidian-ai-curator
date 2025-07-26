import { Plugin, Notice } from 'obsidian';
import { ConsolidationService } from './src/consolidation-service';
import { ConsolidationModal } from './src/consolidation-modal';
import { GitService } from './src/git-service';
import { AICuratorSettingTab } from './src/settings';
import { AICuratorSettings, DEFAULT_SETTINGS } from './src/types';
import { ObsidianAPIServer } from './src/obsidian-api-server';

export default class AICuratorPlugin extends Plugin {
  settings: AICuratorSettings;
  consolidationService: ConsolidationService | null = null;
  gitService: GitService;
  apiServer: ObsidianAPIServer | null = null;
  statusBarItem: HTMLElement;

  async onload() {
    console.log('Loading AI Curator plugin');

    // Load settings
    await this.loadSettings();

    // Add settings tab
    this.addSettingTab(new AICuratorSettingTab(this.app, this));

    // Initialize status bar
    if (this.settings.showStatusBar) {
      this.statusBarItem = this.addStatusBarItem();
      this.updateStatusBar();
    }



    // Initialize API server
    if (this.settings.apiServer?.enabled) {
      this.apiServer = new ObsidianAPIServer(this.app, this.settings.apiServer.port);
      try {
        await this.apiServer.start();
      } catch (error) {
        console.error('Failed to start API server:', error);
      }
    }


    // Initialize git service
    this.gitService = new GitService(this.app);


    // Add commands

    this.addCommand({
      id: 'find-consolidation-candidates',
      name: 'Find notes to consolidate',
      callback: () => this.findConsolidationCandidates()
    });


  }

  async onunload() {
    console.log('Unloading AI Curator plugin');
    
    // Stop API server
    if (this.apiServer) {
      await this.apiServer.stop();
    }
    
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }


  updateStatusBar() {
    if (!this.statusBarItem || !this.settings.showStatusBar) return;
    
    let text = 'AI Curator';
    if (this.apiServer) {
      text += ' (API ✅)';
    }
    
    this.statusBarItem.setText(text);
  }


  async findConsolidationCandidates() {
    if (!this.consolidationService) {
      this.consolidationService = new ConsolidationService(this.app, {
        model: this.settings.claudeModel || 'sonnet',
        vaultPath: (this.app.vault as any).adapter.basePath,
        claudeBinary: this.settings.claudeBinary || 'claude',
        maxCandidates: this.settings.consolidationSettings?.maxCandidates || 50,
        archiveFolder: this.settings.consolidationSettings?.archiveFolder || 'Archive'
      });
    }

    new Notice('Finding consolidation candidates...');
    
    try {
      const candidates = await this.consolidationService.findCandidates();
      
      if (candidates.length === 0) {
        new Notice('No consolidation candidates found');
        return;
      }

      // Show candidates in a modal or side panel
      this.showConsolidationCandidates(candidates);
    } catch (error) {
      console.error('Failed to find consolidation candidates:', error);
      new Notice('Failed to analyze vault. Is Claude CLI available?');
    }
  }

  showConsolidationCandidates(candidates: any[]) {
    if (!this.consolidationService) {
      new Notice('Consolidation service not initialized');
      return;
    }

    const modal = new ConsolidationModal(
      this.app, 
      candidates, 
      this.consolidationService,
      this.gitService
    );
    modal.open();
  }

}