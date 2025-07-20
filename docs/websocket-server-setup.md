# WebSocket Server Setup for Obsidian Plugin

## Overview
The WebSocket server provides real-time communication between the Obsidian plugin and the MCP server infrastructure.

## Quick Start

1. **Install dependencies** (in the main project directory):
   ```bash
   cd /Users/nathan/projects/obsidian-ai-curator
   npm install
   ```

2. **Configure vault path** in `config/config.json`:
   ```json
   {
     "vaultPath": "/Users/nathan/obsidian",
     "websocketPort": 3000
   }
   ```

   Or use environment variable:
   ```bash
   export OBSIDIAN_VAULT_PATH="/Users/nathan/obsidian"
   ```

3. **Start the WebSocket server**:
   ```bash
   npm run start:ws
   ```

   For development with auto-reload:
   ```bash
   npm run dev:ws
   ```

## Features

The WebSocket server provides:
- Real-time file change notifications
- Link index management
- Vault synchronization
- Search capabilities
- Note reading with backlinks

## Protocol

### From Plugin to Server

**File Change Notification**:
```json
{
  "type": "notification",
  "method": "file-change",
  "params": {
    "type": "create|modify|delete|rename",
    "path": "path/to/file.md",
    "oldPath": "old/path.md",  // for renames
    "metadata": { ... }
  }
}
```

**Vault Sync**:
```json
{
  "type": "notification", 
  "method": "vault-sync",
  "params": {
    "totalFiles": 100,
    "files": [...]
  }
}
```

### From Server to Plugin

**Connected**:
```json
{
  "type": "notification",
  "method": "connected",
  "params": {
    "serverVersion": "1.0.0",
    "vaultPath": "/path/to/vault"
  }
}
```

**File Renamed** (broadcast to all clients):
```json
{
  "type": "notification",
  "method": "file-renamed",
  "params": {
    "oldPath": "old/path.md",
    "newPath": "new/path.md"
  }
}
```

## Troubleshooting

**Connection refused**: 
- Ensure the server is running
- Check the port isn't already in use
- Verify firewall settings

**File not found errors**:
- Verify the vault path in config
- Ensure the path is absolute, not relative

**Permission errors**:
- Check file permissions in the vault
- Ensure the server has read/write access