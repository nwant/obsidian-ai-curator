import { Plugin, Notice } from 'obsidian';
import { MCPClient } from './src/mcp-client';
import { FileWatcher } from './src/file-watcher';
import { AICuratorSettingTab } from './src/settings';
import { AICuratorSettings, DEFAULT_SETTINGS, ConnectionState } from './src/types';

export default class AICuratorPlugin extends Plugin {
  settings: AICuratorSettings;
  mpcClient: MCPClient;
  fileWatcher: FileWatcher;
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

    // Initialize MCP client
    this.mpcClient = new MCPClient(
      this.settings.mpcServerUrl,
      (state) => this.handleConnectionStateChange(state),
      this.settings.debugMode
    );

    // Initialize file watcher
    this.fileWatcher = new FileWatcher(this.app, this.mpcClient);

    // Add commands
    this.addCommand({
      id: 'connect-mcp-server',
      name: 'Connect to MCP server',
      callback: () => this.connect()
    });

    this.addCommand({
      id: 'disconnect-mcp-server',
      name: 'Disconnect from MCP server',
      callback: () => this.disconnect()
    });

    this.addCommand({
      id: 'sync-vault-state',
      name: 'Sync vault state with MCP server',
      callback: () => this.syncVaultState()
    });

    // Auto-connect if enabled
    if (this.settings.autoConnect) {
      // Delay connection to ensure Obsidian is fully loaded
      setTimeout(() => {
        this.connect().catch(error => {
          console.error('Auto-connect failed:', error);
          new Notice('AI Curator: Failed to connect to MCP server');
        });
      }, 2000);
    }
  }

  onunload() {
    console.log('Unloading AI Curator plugin');
    this.disconnect();
    this.fileWatcher?.stop();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async connect() {
    try {
      await this.mpcClient.connect();
      this.fileWatcher.start();
      
      // Send initial vault state
      await this.syncVaultState();
      
      new Notice('AI Curator: Connected successfully');
    } catch (error) {
      console.error('Connection failed:', error);
      new Notice('AI Curator: Connection failed - check settings');
      throw error;
    }
  }

  disconnect() {
    this.fileWatcher?.stop();
    this.mpcClient?.disconnect();
    new Notice('AI Curator: Disconnected');
  }

  async syncVaultState() {
    if (this.mpcClient.state.status !== 'connected') {
      new Notice('AI Curator: Not connected to MCP server');
      return;
    }

    new Notice('AI Curator: Syncing vault state...');

    try {
      // Get all markdown files
      const files = this.app.vault.getMarkdownFiles();
      const vaultInfo = {
        totalFiles: files.length,
        files: files.map(file => ({
          path: file.path,
          size: file.stat.size,
          modified: file.stat.mtime
        }))
      };

      // Send vault info to MCP server
      await this.mpcClient.notify('vault-sync', vaultInfo);
      
      new Notice(`AI Curator: Synced ${files.length} files`);
    } catch (error) {
      console.error('Sync failed:', error);
      new Notice('AI Curator: Sync failed');
    }
  }

  handleConnectionStateChange(state: ConnectionState) {
    this.updateStatusBar();

    // Log state changes in debug mode
    if (this.settings.debugMode) {
      console.log('Connection state changed:', state);
    }

    // Show notices for important state changes
    if (state.status === 'error' && state.lastError) {
      new Notice(`AI Curator: ${state.lastError}`);
    }
  }

  updateStatusBar() {
    if (!this.statusBarItem || !this.settings.showStatusBar) return;

    const state = this.mpcClient?.state;
    if (!state) {
      this.statusBarItem.setText('AI Curator: Not initialized');
      return;
    }

    let text = 'AI Curator: ';
    let className = '';

    switch (state.status) {
      case 'connected':
        text += '🟢 Connected';
        className = 'ai-curator-connected';
        break;
      case 'connecting':
        text += '🟡 Connecting...';
        className = 'ai-curator-connecting';
        break;
      case 'error':
        text += '🔴 Error';
        className = 'ai-curator-error';
        break;
      default:
        text += '⚪ Disconnected';
        className = 'ai-curator-disconnected';
    }

    if (state.reconnectAttempts > 0) {
      text += ` (retry ${state.reconnectAttempts})`;
    }

    this.statusBarItem.setText(text);
    this.statusBarItem.className = className;
  }
}