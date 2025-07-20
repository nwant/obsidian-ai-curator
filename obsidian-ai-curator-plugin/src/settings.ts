import { App, PluginSettingTab, Setting } from 'obsidian';
import AICuratorPlugin from '../main';
import { AICuratorSettings } from './types';

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

    // MCP Server URL
    new Setting(containerEl)
      .setName('MCP Server URL')
      .setDesc('WebSocket URL for the MCP server connection')
      .addText(text => text
        .setPlaceholder('ws://localhost:3000')
        .setValue(this.plugin.settings.mpcServerUrl)
        .onChange(async (value) => {
          this.plugin.settings.mpcServerUrl = value;
          await this.plugin.saveSettings();
        }));

    // Auto-connect
    new Setting(containerEl)
      .setName('Auto-connect on startup')
      .setDesc('Automatically connect to the MCP server when Obsidian starts')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoConnect)
        .onChange(async (value) => {
          this.plugin.settings.autoConnect = value;
          await this.plugin.saveSettings();
        }));

    // Status bar
    new Setting(containerEl)
      .setName('Show status bar')
      .setDesc('Display connection status in the status bar')
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

    // Connection controls
    containerEl.createEl('h3', { text: 'Connection' });

    const connectionDiv = containerEl.createDiv();
    const statusEl = connectionDiv.createEl('p', { 
      text: `Status: ${this.plugin.mpcClient?.state.status || 'Not initialized'}` 
    });

    new Setting(connectionDiv)
      .setName('Connection controls')
      .setDesc('Manually control the MCP server connection')
      .addButton(button => button
        .setButtonText('Connect')
        .onClick(async () => {
          try {
            await this.plugin.connect();
            statusEl.setText(`Status: ${this.plugin.mpcClient.state.status}`);
          } catch (error) {
            console.error('Failed to connect:', error);
          }
        }))
      .addButton(button => button
        .setButtonText('Disconnect')
        .onClick(() => {
          this.plugin.disconnect();
          statusEl.setText(`Status: ${this.plugin.mpcClient?.state.status || 'Disconnected'}`);
        }));

    // Update status periodically
    const updateStatus = () => {
      if (this.plugin.mpcClient) {
        statusEl.setText(`Status: ${this.plugin.mpcClient.state.status}`);
      }
    };
    
    // Update every second while settings are open
    this.updateInterval = window.setInterval(updateStatus, 1000);
  }

  hide(): void {
    // Clean up interval when settings tab is closed
    if (this.updateInterval !== null) {
      window.clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
}