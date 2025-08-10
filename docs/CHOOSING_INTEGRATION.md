# Choosing Your Claude Code Integration Method

## Quick Decision Guide

**Choose Local Execution if you:**
- Want to avoid GitHub Actions costs
- Need immediate feedback
- Want full control over the process
- Are working on private repos with limited Actions minutes
- Prefer to see what's happening in real-time
- Want to debug issues easily

**Choose GitHub Actions if you:**
- Want fully automated cloud execution
- Don't mind GitHub Actions usage/costs
- Prefer fire-and-forget automation
- Want the process to run even when offline
- Have multiple team members who need automation
- Want everything tracked in GitHub's UI

## Detailed Comparison

| Feature | Local Execution | GitHub Actions |
|---------|----------------|----------------|
| **Cost** | Free (uses your machine) | Free tier limits, then paid |
| **Speed** | Immediate execution | Queue wait + execution time |
| **Setup Complexity** | Simple (CLI tools) | Moderate (OAuth + Secrets) |
| **Resource Usage** | Your CPU/memory | GitHub's runners |
| **Visibility** | Real-time terminal output | GitHub Actions logs |
| **Debugging** | Direct access to temp dirs | Only through logs |
| **Offline Work** | Requires internet for git | Runs without your machine |
| **Team Usage** | Per-developer setup | Shared automation |
| **Trigger Method** | MCP tool call | Issue labels |
| **Control** | Can interrupt anytime | Must wait or cancel |

## Setup Requirements

### Local Execution
```bash
# 1. Install Claude Code CLI
# Download from https://claude.ai/code

# 2. Install GitHub CLI  
brew install gh  # macOS

# 3. Authenticate both
claude-code auth login
gh auth login

# 4. Run setup
bash scripts/setup-local-claude.sh
```

### GitHub Actions
```bash
# 1. Install GitHub CLI
brew install gh

# 2. Authenticate
gh auth login

# 3. Get Claude Code OAuth token
# Visit https://claude.ai/code/oauth

# 4. Add to secrets
gh secret set CLAUDE_CODE_OAUTH_TOKEN

# 5. Run setup
bash scripts/setup-automation.sh
```

## Usage Examples

### Local Execution
```
You: "Fix the search bug using Claude Code"
Claude: "I'll run Claude Code locally to fix that..."
[Runs on your machine]
Claude: "Fixed! PR created: github.com/..."
```

### GitHub Actions
```
You: "Create an issue for the search bug with claude-fix label"
Claude: "Issue #123 created. Claude Code will start automatically..."
[Runs in GitHub cloud]
[Later] GitHub: "PR created by Claude Code"
```

## Cost Analysis

### Local Execution
- **Direct Costs**: $0
- **Indirect Costs**: Your electricity/machine wear
- **Best for**: Individual developers, open source projects

### GitHub Actions
- **Free Tier**: 2,000 minutes/month (private repos)
- **Usage**: ~5-10 minutes per Claude Code run
- **Monthly Capacity**: ~200-400 fixes on free tier
- **Overage**: $0.008 per minute
- **Best for**: Teams, production systems

## Performance

### Local Execution
- **Start Time**: Instant
- **Execution**: As fast as your machine
- **Bottleneck**: Your CPU/memory
- **Typical Fix**: 1-3 minutes

### GitHub Actions  
- **Start Time**: 30s-2min queue
- **Execution**: Fast runners
- **Bottleneck**: Queue wait time
- **Typical Fix**: 3-7 minutes total

## Security Considerations

### Local Execution
- ✅ Code never leaves your machine
- ✅ No secrets in cloud
- ✅ Full control over environment
- ⚠️ Requires local git credentials

### GitHub Actions
- ✅ Isolated environment
- ✅ Secrets management built-in
- ✅ Audit trail in GitHub
- ⚠️ Code processed in cloud

## Recommendations

### Start with Local Execution if:
- You're a solo developer
- You're just trying out the automation
- You work on open source projects
- You want maximum control
- You have a powerful development machine

### Use GitHub Actions if:
- You're on a team
- You want 24/7 automation
- You have GitHub Enterprise
- You need audit trails
- You want set-and-forget automation

### Hybrid Approach
You can use BOTH! Set up both methods and:
- Use local execution for quick fixes during development
- Use GitHub Actions for production issues
- Let team members choose their preference

## Migration Path

### Starting with Local → Adding GitHub Actions
1. Get comfortable with local execution first
2. Understand how Claude Code works
3. Set up GitHub Actions for production
4. Keep local as fallback/development option

### Starting with GitHub Actions → Adding Local
1. Set up cloud automation first
2. Add local execution for faster development
3. Use local for debugging failed Actions
4. Keep Actions for team/production use

## Troubleshooting Quick Reference

### Local Execution Issues
```bash
# Check setup
bash scripts/setup-local-claude.sh

# Verify Claude Code
claude-code --version
claude-code auth status

# Test execution
npm run test:local-claude
```

### GitHub Actions Issues
```bash
# Check workflow runs
gh run list --workflow=claude-auto-fix

# View logs
gh run view <run-id> --log

# Check secrets
gh secret list
```

## The Bottom Line

**For most developers**: Start with **local execution**. It's simpler, free, and gives you more control. You can always add GitHub Actions later if needed.

**For teams/production**: Use **GitHub Actions** for consistency and automation, but set up local execution as a development tool.

**For maximum power**: Use **both** - local for development, Actions for production.
