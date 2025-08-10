# Automated GitHub + Claude Code Workflow

## Overview

This project now includes an automated workflow that enables Claude Desktop to trigger Claude Code in headless mode for bug fixes and feature implementations through GitHub issues.

## Architecture

```
Claude Desktop → MCP Server → GitHub Issue → GitHub Action → Claude Code → Pull Request
```

## Setup Requirements

### 1. Install GitHub CLI

```bash
# macOS
brew install gh

# Linux
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh

# Windows
winget install --id GitHub.cli
```

### 2. Authenticate GitHub CLI

```bash
gh auth login
# Follow the prompts to authenticate with your GitHub account
```

### 3. Set Up Claude Code OAuth Token

1. Go to [Claude Code OAuth Setup](https://claude.ai/code/oauth)
2. Generate an OAuth token
3. Add it to your repository secrets:
   ```bash
   gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo=your-username/obsidian-ai-curator
   ```

### 4. Ensure Repository Settings

- Your repository must have Actions enabled
- The Claude Code Action needs appropriate permissions (already configured in the workflow)

## Available MCP Tools

### `create_github_issue`
Creates a general GitHub issue.

**Parameters:**
- `title` (string, required): Issue title
- `body` (string, required): Issue description
- `labels` (array): Labels to apply (e.g., `["bug", "enhancement"]`)
- `assignees` (array): GitHub usernames to assign
- `milestone` (string): Milestone name

**Example:**
```javascript
{
  "title": "Add support for Dataview queries",
  "body": "We need to support inline Dataview queries...",
  "labels": ["enhancement", "claude-feature"],
  "assignees": ["nwant"]
}
```

### `create_bug_report`
Automatically creates a bug report from an error.

**Parameters:**
- `error` (object/string): The error that occurred
- `context` (string): Additional context
- `toolName` (string): Which tool failed
- `args` (object): Arguments passed to the tool
- `stackTrace` (string): Error stack trace

**Example:**
```javascript
{
  "error": { "message": "Cannot read property 'path' of undefined" },
  "toolName": "read_notes",
  "args": { "paths": ["nonexistent.md"] },
  "context": "Failed while trying to read notes"
}
```

### `create_feature_request`
Creates a feature request with design documentation.

**Parameters:**
- `featureName` (string, required): Name of the feature
- `description` (string, required): Feature description
- `specifications` (string): Detailed specifications
- `designDecisions` (array): List of design decisions made
- `acceptanceCriteria` (array): List of acceptance criteria
- `technicalRequirements` (array): Technical requirements
- `userStory` (string): User story format
- `priority` (string): "low", "medium", or "high"

**Example:**
```javascript
{
  "featureName": "Smart Tag Suggestions",
  "description": "AI-powered tag suggestions based on note content",
  "designDecisions": [
    "Use TF-IDF algorithm for content analysis",
    "Cache suggestions for performance",
    "Limit to top 5 suggestions"
  ],
  "acceptanceCriteria": [
    "Suggestions appear within 100ms",
    "Accuracy rate above 80%",
    "Works with markdown and plain text"
  ],
  "priority": "high"
}
```

### `document_design_decision`
Documents a design decision in the vault.

**Parameters:**
- `feature` (string, required): Feature name
- `decisions` (array): List of decisions
- `rationale` (string): Why these decisions were made
- `technicalDetails` (object): Technical specifications
- `alternatives` (array): Alternatives considered
- `consequences` (array): Expected consequences

### `check_issue_status`
Checks the status of a GitHub issue.

**Parameters:**
- `issueNumber` (number, required): Issue number to check

## Automated Workflows

### Bug Fix Workflow

1. **Error Occurs**: When an error happens in the MCP server, it's automatically captured
2. **Issue Creation**: If the error meets criteria, a GitHub issue is created with the `claude-fix` label
3. **Claude Code Triggered**: GitHub Action detects the label and runs Claude Code
4. **Fix Implementation**: Claude Code analyzes the error, implements a fix, and runs tests
5. **PR Creation**: Claude Code creates a pull request with the fix
6. **Review**: You review and merge the PR

### Feature Implementation Workflow

1. **Design Discussion**: You discuss a feature with Claude Desktop
2. **Documentation**: Design decisions are documented in the vault
3. **Issue Creation**: Feature request issue created with `claude-feature` label
4. **Claude Code Implementation**: GitHub Action triggers Claude Code
5. **Development**: Claude Code implements the feature with tests
6. **PR Creation**: Pull request created for review

## Manual Triggering

You can also manually trigger Claude Code by:

1. Creating an issue with the `claude-fix` or `claude-feature` label
2. Adding the label to an existing issue
3. Mentioning `@claude` in any issue or PR comment

## Error Reporting Criteria

The system automatically creates bug reports for errors that:

- Are NOT user errors (validation, missing arguments, etc.)
- Are NOT known/expected errors (network timeouts, etc.)
- Occur multiple times (3+ for normal errors, 1 for critical)
- Are NOT from excluded tools

Critical errors (data loss, security, etc.) are reported immediately.

## Monitoring

### View Error Statistics

In Claude Desktop, you can check error statistics:

```javascript
// This would need to be added as a tool
{
  "tool": "get_error_stats"
}
```

### Check Issue Status

```javascript
{
  "tool": "check_issue_status",
  "args": {
    "issueNumber": 42
  }
}
```

## Configuration

### Excluding Tools from Error Reporting

Edit `src/mcp-server.js`:

```javascript
this.errorReporter = new ErrorReporter({
  reportableTools: 'all',
  excludeTools: ['test_tool', 'another_tool'], // Add tools to exclude
  // ...
});
```

### Customizing Error Thresholds

Edit `src/tools/error-handler.js`:

```javascript
// In ErrorReporter.shouldCreateIssue()
const isCritical = this.isCriticalError(error);
return isCritical ? count === 1 : count === 3; // Adjust thresholds
```

## Testing the Workflow

### Test Bug Reporting

1. Intentionally cause an error:
   ```javascript
   // In Claude Desktop
   Use the read_notes tool with invalid arguments
   ```

2. Check that an issue is created in GitHub

3. Verify Claude Code starts working on it

### Test Feature Creation

1. In Claude Desktop:
   ```
   "I'd like to add a feature that automatically creates a weekly summary of all notes created"
   ```

2. After discussion, ask Claude to create the feature request

3. Check GitHub for the issue and automated implementation

## Troubleshooting

### GitHub CLI Not Working

```bash
# Check authentication
gh auth status

# Re-authenticate if needed
gh auth login
```

### Claude Code Not Triggering

1. Check the GitHub Actions tab in your repository
2. Verify the `CLAUDE_CODE_OAUTH_TOKEN` secret is set
3. Check that the issue has the correct label (`claude-fix` or `claude-feature`)

### Issues Not Being Created

1. Verify GitHub CLI is installed and authenticated
2. Check error logs in Claude Desktop's developer console
3. Ensure the repository remote is set correctly:
   ```bash
   git remote -v
   ```

## Best Practices

1. **Review All PRs**: Always review PRs created by Claude Code before merging
2. **Test Coverage**: Ensure Claude Code's tests are comprehensive
3. **Documentation**: Keep design decisions documented for context
4. **Monitoring**: Regularly check error statistics and issue status
5. **Feedback Loop**: If Claude Code's fixes aren't adequate, provide feedback in the PR

## Security Considerations

1. **OAuth Token**: Keep your Claude Code OAuth token secure
2. **Permissions**: The GitHub Action has write permissions - review all changes
3. **Error Data**: Be aware that error reports may contain sensitive data
4. **Public Repos**: If your repo is public, error reports will be public

## Future Enhancements

- [ ] Real-time progress updates from Claude Code to Claude Desktop
- [ ] Automatic PR merging for passing tests
- [ ] Integration with CI/CD for deployment
- [ ] Custom Claude Code sub-agents for specific tasks
- [ ] Webhook notifications for completion

---

*This automated workflow turns Claude Desktop into a project manager that can delegate implementation tasks to Claude Code, creating a powerful AI-driven development pipeline.*
