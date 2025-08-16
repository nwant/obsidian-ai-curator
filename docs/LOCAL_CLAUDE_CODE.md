# Local Claude Code Execution Workflow

## Overview

This approach runs Claude Code **locally on your machine** in headless mode, avoiding GitHub Actions costs and giving you more control over the process.

## Architecture

```
Claude Desktop (MCP Tools)
    ↓
execute_claude_code_fix/feature
    ↓
Clone repo to temp directory
    ↓
Run Claude with -p flag
    ↓
Claude makes changes
    ↓
Commit & push branch
    ↓
Create PR with gh CLI
    ↓
Return PR URL to Claude
```

## Prerequisites

### 1. Install Claude Code CLI

```bash
# Install via npm
npm install -g @anthropic-ai/claude-code

# Verify installation
claude --version
```

### 2. Configure Claude Code

```bash
# Start Claude to verify it's working
claude

# Exit with Ctrl+D or type 'exit'
```

Note: Claude Code doesn't require explicit authentication like traditional CLIs. It works based on your system configuration.

### 3. Install GitHub CLI

```bash
# macOS
brew install gh

# Linux
sudo apt install gh

# Windows
winget install --id GitHub.cli
```

### 4. Authenticate GitHub CLI

```bash
gh auth login
```

## Available MCP Tools

### `check_claude_code_status`
Verify Claude Code is installed and configured properly.

**Example:**
```
"Check if Claude Code is installed and ready"
```

This will verify:
- Claude CLI is installed
- Version information
- GitHub CLI status
- Current sessions (if any)

### `execute_claude_code_fix`
Run Claude Code locally to fix a bug.

**Parameters:**
- `issueNumber` (number, required): Issue number to reference
- `issueTitle` (string, required): Title describing the issue
- `issueBody` (string, required): Detailed issue description
- `errorDetails` (object): Error information if available
- `customPrompt` (string): Override the default prompt
- `skipPermissions` (boolean): Skip permission prompts (default: true)

**Example:**
```javascript
{
  "tool": "execute_claude_code_fix",
  "args": {
    "issueNumber": 42,
    "issueTitle": "Search function returns undefined for empty queries",
    "issueBody": "When searching with an empty string, the function throws an error instead of returning empty results.",
    "errorDetails": {
      "error": "Cannot read property 'length' of undefined",
      "location": "src/tools/search-tools.js:45"
    }
  }
}
```

### `execute_claude_code_feature`
Run Claude Code locally to implement a new feature.

**Parameters:**
- `featureName` (string, required): Name of the feature
- `description` (string, required): Feature description
- `specifications` (string): Detailed specifications
- `designDecisions` (array): Design decisions made
- `acceptanceCriteria` (array): What defines success
- `technicalRequirements` (array): Technical constraints
- `customPrompt` (string): Override the default prompt
- `skipPermissions` (boolean): Skip permission prompts (default: true)

**Example:**
```javascript
{
  "tool": "execute_claude_code_feature",
  "args": {
    "featureName": "Smart Tag Suggestions",
    "description": "Automatically suggest relevant tags based on note content using TF-IDF analysis",
    "specifications": "Analyze note content and suggest up to 5 relevant tags...",
    "designDecisions": [
      "Use TF-IDF algorithm for content analysis",
      "Cache suggestions for performance",
      "Limit to top 5 suggestions"
    ],
    "acceptanceCriteria": [
      "Suggestions appear within 100ms",
      "Accuracy rate above 80%",
      "Works with markdown and plain text"
    ]
  }
}
```

### `cleanup_temp_directories`
Clean up temporary work directories created by Claude Code.

**Example:**
```
"Clean up any temporary Claude Code directories"
```

## How It Works

### For Bug Fixes

1. **You tell Claude Desktop about a bug**
   ```
   "The search function is throwing an error when given empty input"
   ```

2. **Claude Desktop calls the tool**
   - Creates a temp directory
   - Clones your repo
   - Runs `claude -p "fix prompt"` with the issue details
   - Claude analyzes and fixes the issue
   - Runs tests to verify
   - Commits changes to a new branch
   - Pushes and creates a PR

3. **You get a PR URL**
   ```
   "I've fixed the issue! PR created: https://github.com/user/repo/pull/123"
   ```

### For Features

1. **You discuss a feature with Claude Desktop**
   ```
   "I want to add smart tag suggestions based on note content"
   ```

2. **Claude documents the design and calls the tool**
   - Documents design decisions in your vault
   - Creates temp directory and clones
   - Runs `claude -p "feature prompt"` with specs
   - Claude implements the feature
   - Creates tests and documentation
   - Pushes and creates a draft PR

3. **You review the implementation**
   ```
   "Feature implemented! Draft PR: https://github.com/user/repo/pull/124"
   ```

## Claude CLI Reference

### Key Commands

```bash
# Start interactive session
claude

# Run in headless mode
claude -p "your prompt here"

# Skip permission prompts (for automation)
claude --dangerously-skip-permissions -p "prompt"

# List sessions
claude sessions

# Continue last session
claude continue

# Check version
claude --version
```

### Workflow Examples

#### Quick Bug Fix
```
You: "There's a bug where the tag formatter crashes on empty tags"

Claude: "I'll fix that for you. Let me run Claude Code locally..."
[Executes execute_claude_code_fix]
"Fixed! I've created PR #125 that handles empty tags gracefully."
```

#### Feature Implementation
```
You: "Let's add a feature to auto-archive old notes"

Claude: "Great idea! Let me document the design decisions first..."
[Documents design in vault]
"Now I'll implement it using Claude Code..."
[Executes execute_claude_code_feature]
"Implementation complete! Draft PR #126 is ready for review."
```

## Advanced Usage

### Custom Prompts

You can provide custom prompts for complex scenarios:

```javascript
{
  "tool": "execute_claude_code_fix",
  "args": {
    "issueNumber": 50,
    "issueTitle": "Complex refactoring needed",
    "issueBody": "...",
    "customPrompt": "Focus on performance optimization. Use memoization where appropriate. Ensure backward compatibility with v1 API..."
  }
}
```

### Skip Permissions Mode

By default, the executor runs with `--dangerously-skip-permissions` to avoid interrupting the automation. You can disable this:

```javascript
{
  "tool": "execute_claude_code_fix",
  "args": {
    "issueNumber": 51,
    "issueTitle": "Sensitive fix",
    "issueBody": "...",
    "skipPermissions": false  // Will prompt for each file edit
  }
}
```

## Benefits Over GitHub Actions

1. **No Usage Costs**: Runs on your local machine
2. **Faster Feedback**: See progress in real-time
3. **More Control**: Can interrupt if needed
4. **Private Repos**: No GitHub Actions minutes consumed
5. **Immediate**: No waiting for runners
6. **Debuggable**: Can inspect temp directories

## Limitations

1. **Local Resources**: Uses your machine's CPU/memory
2. **Claude Code Required**: Must have CLI installed
3. **Network Needed**: For git operations
4. **No Auth Command**: Claude doesn't have traditional auth like other CLIs

## Troubleshooting

### "Claude Code not found"
```bash
# Verify installation
claude --version

# If not installed:
npm install -g @anthropic-ai/claude-code
```

### "Claude not working"
```bash
# Test Claude
claude -p "echo hello"

# If that fails, check the documentation:
# https://docs.anthropic.com/en/docs/claude-code/overview
```

### "Git push failed"
```bash
# Check you have push access
gh repo view

# Verify remote is correct
git remote -v
```

### "Changes not detected"
- Claude may not have made changes
- Check the temp directory (path is returned)
- Verify the prompt is clear and specific

## Best Practices

1. **Be Specific**: Give Claude clear, detailed prompts
2. **Include Context**: Provide error messages, stack traces
3. **Review PRs**: Always review before merging
4. **Clean Up**: Run cleanup_temp_directories periodically
5. **Test First**: Use check_claude_code_status before starting
6. **Use --dangerously-skip-permissions**: For automation to avoid interruptions

## Security Considerations

1. **Local Execution**: Code runs on your machine
2. **Temp Directories**: Cleaned up automatically or manually
3. **Git Credentials**: Uses your existing git/gh auth
4. **No Secrets in Code**: Claude doesn't have access to env vars unless explicitly provided

## Comparison with GitHub Actions Approach

| Aspect | Local Execution | GitHub Actions |
|--------|----------------|----------------|
| Cost | Free | Usage limits/costs |
| Speed | Immediate | Queue wait time |
| Resources | Your machine | GitHub runners |
| Visibility | Local terminal | GitHub UI |
| Setup | npm install | OAuth + Secrets |
| Control | Full | Limited |
| Debugging | Easy | Logs only |

## Next Steps

1. Install Claude Code: `npm install -g @anthropic-ai/claude-code`
2. Run setup script: `bash scripts/setup-local-claude.sh`
3. Check status: Use `check_claude_code_status` tool
4. Try a simple bug fix
5. Implement a small feature
6. Review and merge PRs

This local execution approach gives you the power of Claude Code automation without the complexity or cost of CI/CD pipelines!
