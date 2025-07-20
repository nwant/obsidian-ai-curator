# Obsidian AI Curator Plugin - Quick Start Guide

## Immediate Next Steps

### 1. Create Plugin Scaffold (Day 1)
```bash
# Create plugin directory
mkdir obsidian-ai-curator-plugin
cd obsidian-ai-curator-plugin

# Initialize with Obsidian plugin template
npm init -y
npm install -D obsidian tslib typescript @types/node
npm install -D esbuild builtin-modules

# Create basic structure
mkdir src styles
touch manifest.json main.ts src/settings.ts
```

### 2. Minimum Viable Plugin (Week 1)
Focus on core value: **Connection + File Sync**

```typescript
// main.ts - Start simple
import { Plugin, Notice } from 'obsidian';
import { MPCClient } from './src/mpc-client';
import { FileWatcher } from './src/file-watcher';

export default class AICuratorPlugin extends Plugin {
  private mpcClient: MPCClient;
  private fileWatcher: FileWatcher;

  async onload() {
    // 1. Connect to MCP server
    this.mpcClient = new MPCClient(this.settings.serverUrl);
    await this.mpcClient.connect();
    
    // 2. Watch for file changes
    this.fileWatcher = new FileWatcher(this.app, this.mpcClient);
    this.fileWatcher.start();
    
    // 3. Show connection status
    this.addStatusBarItem().setText('AI Curator: Connected');
  }
}
```

### 3. Priority Features Timeline

#### Week 1-2: Foundation
- [x] WebSocket connection to MCP
- [x] File change notifications
- [x] Basic settings page
- [x] Connection status indicator

#### Week 3-4: Intelligence
- [ ] Send metadata to MCP
- [ ] Track active file context
- [ ] Link validation warnings

#### Week 5-6: Visual Experience
- [ ] Consolidation suggestion panel
- [ ] Simple approve/reject UI
- [ ] Basic progress indicators

#### Week 7-8: Memory
- [ ] Save conversation context
- [ ] Auto-resume threads
- [ ] Show operation history

### 4. Development Setup

```json
// package.json
{
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production"
  }
}
```

```javascript
// esbuild.config.mjs
import esbuild from "esbuild";
import process from "process";

const prod = (process.argv[2] === "production");

esbuild.build({
  entryPoints: ["main.ts"],
  bundle: true,
  external: ["obsidian", "electron", ...builtins],
  format: "cjs",
  watch: !prod,
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  outfile: "main.js",
}).catch(() => process.exit(1));
```

### 5. Testing Strategy

1. **Development Vault**
   ```bash
   # Create test vault with sample data
   mkdir test-vault
   # Copy plugin to .obsidian/plugins/
   ```

2. **Test Scenarios**
   - Connect/disconnect cycles
   - File operations (create, rename, delete)
   - Large vault performance
   - Error handling

3. **Beta Testing**
   - Start with 5 friendly users
   - Focus on core workflow
   - Gather feedback on UX

### 6. MVP Checklist

Essential for first release:
- [ ] Stable MCP connection
- [ ] Real-time file sync
- [ ] Settings configuration
- [ ] Error notifications
- [ ] Basic documentation
- [ ] Connection retry logic
- [ ] Clean enable/disable

Nice to have:
- [ ] Visual consolidation preview
- [ ] Context persistence
- [ ] Batch operations

### 7. Quick Wins

Features that provide immediate value:
1. **Status Bar Intelligence**: "5 consolidation opportunities"
2. **Right-Click Menu**: "Find related notes" on any file
3. **Command**: "AI: Suggest consolidations for this note"
4. **Notification**: "3 broken links detected after move"

### 8. Architecture Decisions

**Keep It Simple**:
- Start with REST/WebSocket, not complex protocols
- Use Obsidian's native UI components
- Store data in `.obsidian/` folder
- Rely on MCP server for heavy lifting

**Avoid Early**:
- Custom UI frameworks
- Complex state management
- Over-engineering the protocol
- Perfect is enemy of good

### 9. Release Strategy

1. **Alpha** (Week 4): Core team testing
2. **Beta** (Week 8): Limited release to 20 users
3. **Public** (Week 12): Submit to community plugins
4. **Iterate** (Ongoing): Weekly updates based on feedback

### 10. Success Metrics

Track from day 1:
- Connection success rate
- File sync latency
- User engagement (commands used)
- Error frequency
- Feature requests

## The First 48 Hours

1. **Hour 0-4**: Set up development environment
2. **Hour 4-8**: Get "Hello World" plugin running
3. **Hour 8-16**: Implement WebSocket connection
4. **Hour 16-24**: Add file change detection
5. **Hour 24-32**: Create settings interface
6. **Hour 32-40**: Test with real vault
7. **Hour 40-48**: Fix critical bugs, document

## Remember

- **Start small**: Connection + sync is enough for v0.1
- **User feedback**: Ship early, iterate often
- **Core value**: Make link preservation magical
- **Trust**: Always preview before changing files
- **Delight**: Small animations make big difference

The goal is not perfection, but a working tool that solves real problems. Ship the minimum that provides value, then improve based on actual usage.