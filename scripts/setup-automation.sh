#!/bin/bash

# Setup script for Obsidian AI Curator Automated Workflow
# This script checks prerequisites and helps configure the automated GitHub + Claude Code workflow

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "======================================"
echo "Obsidian AI Curator Automated Workflow Setup"
echo "======================================"
echo ""

# Function to print colored output
print_status() {
    if [ "$1" = "success" ]; then
        echo -e "${GREEN}✓${NC} $2"
    elif [ "$1" = "error" ]; then
        echo -e "${RED}✗${NC} $2"
    elif [ "$1" = "warning" ]; then
        echo -e "${YELLOW}!${NC} $2"
    else
        echo "$2"
    fi
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check Node.js
echo "Checking prerequisites..."
echo ""

if command_exists node; then
    NODE_VERSION=$(node -v)
    print_status "success" "Node.js installed: $NODE_VERSION"
else
    print_status "error" "Node.js is not installed"
    echo "  Please install Node.js 18 or later from https://nodejs.org"
    exit 1
fi

# Check npm
if command_exists npm; then
    NPM_VERSION=$(npm -v)
    print_status "success" "npm installed: $NPM_VERSION"
else
    print_status "error" "npm is not installed"
    exit 1
fi

# Check Git
if command_exists git; then
    GIT_VERSION=$(git --version)
    print_status "success" "Git installed: $GIT_VERSION"
else
    print_status "error" "Git is not installed"
    echo "  Please install Git from https://git-scm.com"
    exit 1
fi

# Check GitHub CLI
echo ""
echo "Checking GitHub CLI..."
if command_exists gh; then
    GH_VERSION=$(gh --version | head -n 1)
    print_status "success" "GitHub CLI installed: $GH_VERSION"
    
    # Check if authenticated
    if gh auth status >/dev/null 2>&1; then
        print_status "success" "GitHub CLI is authenticated"
    else
        print_status "warning" "GitHub CLI is not authenticated"
        echo ""
        echo "Would you like to authenticate now? (y/n)"
        read -r AUTHENTICATE
        if [ "$AUTHENTICATE" = "y" ] || [ "$AUTHENTICATE" = "Y" ]; then
            gh auth login
        else
            echo "  You can authenticate later with: gh auth login"
        fi
    fi
else
    print_status "error" "GitHub CLI is not installed"
    echo ""
    echo "Would you like to install it now? (y/n)"
    read -r INSTALL_GH
    if [ "$INSTALL_GH" = "y" ] || [ "$INSTALL_GH" = "Y" ]; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            if command_exists brew; then
                brew install gh
            else
                echo "Please install Homebrew first: https://brew.sh"
                exit 1
            fi
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
            curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
            sudo apt update
            sudo apt install gh
        else
            echo "Please install GitHub CLI manually from: https://cli.github.com"
            exit 1
        fi
    else
        echo "  Install it later from: https://cli.github.com"
    fi
fi

# Check repository
echo ""
echo "Checking repository configuration..."
if [ -d .git ]; then
    print_status "success" "Git repository detected"
    
    # Check remote
    if git remote get-url origin >/dev/null 2>&1; then
        REMOTE_URL=$(git remote get-url origin)
        print_status "success" "Remote origin: $REMOTE_URL"
        
        # Extract repo info
        if [[ $REMOTE_URL =~ github\.com[:/]([^/]+)/(.+?)(\.git)?$ ]]; then
            REPO_OWNER="${BASH_REMATCH[1]}"
            REPO_NAME="${BASH_REMATCH[2]%.git}"
            print_status "success" "Repository: $REPO_OWNER/$REPO_NAME"
        fi
    else
        print_status "warning" "No remote origin set"
        echo "  Add a remote with: git remote add origin <your-repo-url>"
    fi
else
    print_status "error" "Not a git repository"
    echo "  Initialize with: git init"
fi

# Check for GitHub Actions
echo ""
echo "Checking GitHub Actions configuration..."
if [ -f .github/workflows/claude-auto-fix.yml ]; then
    print_status "success" "Claude Auto Fix workflow found"
else
    print_status "warning" "Claude Auto Fix workflow not found"
fi

if [ -f .github/workflows/claude.yml ]; then
    print_status "success" "Claude Code workflow found"
else
    print_status "warning" "Claude Code workflow not found"
fi

# Check npm dependencies
echo ""
echo "Checking npm dependencies..."
if [ -f package.json ]; then
    print_status "success" "package.json found"
    
    # Check if node_modules exists
    if [ -d node_modules ]; then
        print_status "success" "Dependencies installed"
    else
        print_status "warning" "Dependencies not installed"
        echo "  Run: npm install"
    fi
else
    print_status "error" "package.json not found"
fi

# Check for config
echo ""
echo "Checking MCP configuration..."
if [ -f config/config.json ]; then
    print_status "success" "config.json found"
elif [ -f .mcp.json ]; then
    print_status "success" ".mcp.json found"
else
    print_status "warning" "No configuration file found"
    echo "  Copy .mcp.example.json to .mcp.json and configure"
fi

# Setup GitHub secret
echo ""
echo "======================================"
echo "GitHub Secrets Configuration"
echo "======================================"
echo ""

if [ -n "$REPO_OWNER" ] && [ -n "$REPO_NAME" ] && command_exists gh; then
    echo "Checking for CLAUDE_CODE_OAUTH_TOKEN secret..."
    
    # Check if secret exists (this will fail if not set, which is fine)
    if gh secret list --repo="$REPO_OWNER/$REPO_NAME" 2>/dev/null | grep -q CLAUDE_CODE_OAUTH_TOKEN; then
        print_status "success" "CLAUDE_CODE_OAUTH_TOKEN is configured"
    else
        print_status "warning" "CLAUDE_CODE_OAUTH_TOKEN not found"
        echo ""
        echo "To set up Claude Code automation:"
        echo "1. Go to https://claude.ai/code/oauth"
        echo "2. Generate an OAuth token"
        echo "3. Run: gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo=$REPO_OWNER/$REPO_NAME"
        echo ""
        echo "Would you like to set it up now? (y/n)"
        read -r SETUP_TOKEN
        if [ "$SETUP_TOKEN" = "y" ] || [ "$SETUP_TOKEN" = "Y" ]; then
            echo "Please enter your Claude Code OAuth token:"
            read -rs OAUTH_TOKEN
            echo ""
            if [ -n "$OAUTH_TOKEN" ]; then
                echo "$OAUTH_TOKEN" | gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo="$REPO_OWNER/$REPO_NAME"
                print_status "success" "OAuth token configured successfully"
            else
                print_status "error" "No token provided"
            fi
        fi
    fi
else
    print_status "warning" "Cannot check GitHub secrets (missing gh CLI or repo info)"
fi

# Test the setup
echo ""
echo "======================================"
echo "Setup Summary"
echo "======================================"
echo ""

# Count successes
ISSUES=0

if ! command_exists gh || ! gh auth status >/dev/null 2>&1; then
    ((ISSUES++))
    print_status "error" "GitHub CLI not authenticated"
fi

if [ ! -f .github/workflows/claude-auto-fix.yml ]; then
    ((ISSUES++))
    print_status "error" "Claude Auto Fix workflow missing"
fi

if [ ! -d node_modules ]; then
    ((ISSUES++))
    print_status "warning" "npm dependencies not installed"
fi

if [ $ISSUES -eq 0 ]; then
    print_status "success" "Setup complete! The automated workflow is ready to use."
    echo ""
    echo "Next steps:"
    echo "1. Test the workflow by creating an issue with 'claude-fix' label"
    echo "2. Read the documentation in docs/AUTOMATED_WORKFLOW.md"
    echo "3. Configure error reporting thresholds if needed"
else
    echo ""
    print_status "warning" "Setup incomplete. Address the issues above to enable the automated workflow."
fi

echo ""
echo "======================================"
echo "Quick Test Commands"
echo "======================================"
echo ""
echo "Test GitHub CLI:"
echo "  gh issue create --title 'Test Issue' --body 'Test' --label 'test'"
echo ""
echo "Test MCP Server:"
echo "  npm start"
echo ""
echo "Run tests:"
echo "  npm test"
echo ""
echo "For more information, see docs/AUTOMATED_WORKFLOW.md"
