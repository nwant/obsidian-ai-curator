import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import AICuratorPlugin from '../main';
import { AICuratorSettings } from './types';
import { ObsidianAPIServer } from './obsidian-api-server';

export class AICuratorSettingTab extends PluginSettingTab {
  plugin: AICuratorPlugin;
  private updateInterval: number | null = null;

  constructor(app: App, plugin: AICuratorPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'AI Curator Settings' });


    // Status bar
    new Setting(containerEl)
      .setName('Show status bar')
      .setDesc('Display plugin status in the status bar')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showStatusBar)
        .onChange(async (value) => {
          this.plugin.settings.showStatusBar = value;
          await this.plugin.saveSettings();
          this.plugin.updateStatusBar();
        }));

    // Debug mode
    new Setting(containerEl)
      .setName('Debug mode')
      .setDesc('Enable debug logging to the console')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.debugMode)
        .onChange(async (value) => {
          this.plugin.settings.debugMode = value;
          await this.plugin.saveSettings();
        }));

    // Claude CLI Settings
    containerEl.createEl('h3', { text: 'Claude CLI Settings' });

    // Claude CLI binary path
    new Setting(containerEl)
      .setName('Claude CLI path')
      .setDesc('Path to the Claude CLI binary (leave empty to use "claude" from PATH)')
      .addText(text => text
        .setPlaceholder('claude')
        .setValue(this.plugin.settings.claudeBinary || '')
        .onChange(async (value) => {
          this.plugin.settings.claudeBinary = value || undefined;
          await this.plugin.saveSettings();
        }));

    // Claude model selection
    new Setting(containerEl)
      .setName('Claude model')
      .setDesc('Select which Claude model to use for consolidation')
      .addDropdown(dropdown => dropdown
        .addOption('sonnet', 'Claude 3.5 Sonnet (balanced)')
        .addOption('opus', 'Claude 3 Opus (powerful)')
        .addOption('haiku', 'Claude 3 Haiku (fast)')
        .setValue(this.plugin.settings.claudeModel || 'sonnet')
        .onChange(async (value: 'sonnet' | 'opus' | 'haiku') => {
          this.plugin.settings.claudeModel = value;
          await this.plugin.saveSettings();
        }));

    // Consolidation Settings
    containerEl.createEl('h3', { text: 'Consolidation Settings' });

    // Auto git commit
    new Setting(containerEl)
      .setName('Auto-commit before consolidation')
      .setDesc('Automatically create a git commit before and after consolidation')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.consolidationSettings?.autoGitCommit ?? true)
        .onChange(async (value) => {
          if (!this.plugin.settings.consolidationSettings) {
            this.plugin.settings.consolidationSettings = {
              autoGitCommit: true,
              archiveFolder: 'Archive',
              maxCandidates: 50
            };
          }
          this.plugin.settings.consolidationSettings.autoGitCommit = value;
          await this.plugin.saveSettings();
        }));

    // Archive folder
    new Setting(containerEl)
      .setName('Archive folder')
      .setDesc('Folder where consolidated notes will be archived')
      .addText(text => text
        .setPlaceholder('Archive')
        .setValue(this.plugin.settings.consolidationSettings?.archiveFolder || 'Archive')
        .onChange(async (value) => {
          if (!this.plugin.settings.consolidationSettings) {
            this.plugin.settings.consolidationSettings = {
              autoGitCommit: true,
              archiveFolder: 'Archive',
              maxCandidates: 50
            };
          }
          this.plugin.settings.consolidationSettings.archiveFolder = value;
          await this.plugin.saveSettings();
        }));

    // Max candidates to analyze
    new Setting(containerEl)
      .setName('Maximum files to analyze')
      .setDesc('Maximum number of files to analyze for consolidation (higher = slower)')
      .addSlider(slider => slider
        .setLimits(10, 200, 10)
        .setValue(this.plugin.settings.consolidationSettings?.maxCandidates || 50)
        .setDynamicTooltip()
        .onChange(async (value) => {
          if (!this.plugin.settings.consolidationSettings) {
            this.plugin.settings.consolidationSettings = {
              autoGitCommit: true,
              archiveFolder: 'Archive',
              maxCandidates: 50
            };
          }
          this.plugin.settings.consolidationSettings.maxCandidates = value;
          await this.plugin.saveSettings();
        }));

    // API Server settings
    containerEl.createEl('h3', { text: 'API Server' });

    new Setting(containerEl)
      .setName('Enable API server')
      .setDesc('Start a local API server for the MCP server to use Obsidian APIs')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.apiServer?.enabled ?? true)
        .onChange(async (value) => {
          if (!this.plugin.settings.apiServer) {
            this.plugin.settings.apiServer = {
              enabled: true,
              port: 3001
            };
          }
          this.plugin.settings.apiServer.enabled = value;
          await this.plugin.saveSettings();
          
          // Restart API server if needed
          if (value && !this.plugin.apiServer) {
            this.plugin.apiServer = new ObsidianAPIServer(this.app, this.plugin.settings.apiServer.port);
            try {
              await this.plugin.apiServer.start();
              new Notice('API server started');
            } catch (error) {
              new Notice('Failed to start API server: ' + error.message);
            }
          } else if (!value && this.plugin.apiServer) {
            await this.plugin.apiServer.stop();
            this.plugin.apiServer = null;
            new Notice('API server stopped');
          }
        }));

    new Setting(containerEl)
      .setName('API server port')
      .setDesc('Port for the API server (default: 3001)')
      .addText(text => text
        .setPlaceholder('3001')
        .setValue(String(this.plugin.settings.apiServer?.port || 3001))
        .onChange(async (value) => {
          const port = parseInt(value);
          if (isNaN(port) || port < 1024 || port > 65535) {
            new Notice('Invalid port number');
            return;
          }
          
          if (!this.plugin.settings.apiServer) {
            this.plugin.settings.apiServer = {
              enabled: true,
              port: 3001
            };
          }
          this.plugin.settings.apiServer.port = port;
          await this.plugin.saveSettings();
          
          new Notice('API server port changed. Restart Obsidian to apply.');
        }));

  }

  hide(): void {
    // Clean up interval when settings tab is closed
    if (this.updateInterval !== null) {
      window.clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
}