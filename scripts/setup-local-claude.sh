#!/bin/bash

# Setup script for Local Claude Code Execution
# This script checks prerequisites for running Claude Code locally

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "======================================"
echo -e "${BLUE}Local Claude Code Execution Setup${NC}"
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

SETUP_COMPLETE=true
CLAUDE_OK=false  # Will be set to true if Claude tests pass

# Check Claude Code CLI
echo "Checking Claude Code CLI..."
if command_exists claude; then
    CLAUDE_VERSION=$(claude --version 2>/dev/null || echo "unknown")
    print_status "success" "Claude Code installed: $CLAUDE_VERSION"
    
    # Note: Claude doesn't have a simple auth status command
    # We'll try a simple test to see if it's working
    echo "Testing Claude Code..."
    if echo "" | timeout 2 claude -p "echo test" >/dev/null 2>&1; then
        print_status "success" "Claude Code appears to be working"
        CLAUDE_OK=true
    else
        print_status "warning" "Claude Code may need configuration"
        echo "  Try running: claude"
        echo "  Check the Claude Code documentation for setup"
        CLAUDE_OK=false
    fi
else
    print_status "error" "Claude Code CLI is not installed"
    echo ""
    echo "  To install Claude Code:"
    echo "  npm install -g @anthropic-ai/claude-code"
    echo ""
    echo "  Or visit: https://docs.anthropic.com/en/docs/claude-code/overview"
    echo ""
    SETUP_COMPLETE=false
    CLAUDE_OK=false
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
        
        # Get the authenticated user
        GH_USER=$(gh api user --jq .login 2>/dev/null || echo "unknown")
        print_status "success" "Authenticated as: $GH_USER"
    else
        print_status "warning" "GitHub CLI is not authenticated"
        echo ""
        echo "Would you like to authenticate now? (y/n)"
        read -r AUTHENTICATE
        if [ "$AUTHENTICATE" = "y" ] || [ "$AUTHENTICATE" = "Y" ]; then
            gh auth login
        else
            echo "  You can authenticate later with: gh auth login"
            SETUP_COMPLETE=false
        fi
    fi
else
    print_status "error" "GitHub CLI is not installed"
    echo ""
    echo "Would you like instructions to install it? (y/n)"
    read -r SHOW_INSTALL
    if [ "$SHOW_INSTALL" = "y" ] || [ "$SHOW_INSTALL" = "Y" ]; then
        echo ""
        echo "  macOS:    brew install gh"
        echo "  Ubuntu:   sudo apt install gh"
        echo "  Windows:  winget install --id GitHub.cli"
        echo "  Other:    https://cli.github.com"
    fi
    SETUP_COMPLETE=false
fi

# Check Git
echo ""
echo "Checking Git..."
if command_exists git; then
    GIT_VERSION=$(git --version)
    print_status "success" "$GIT_VERSION"
    
    # Check if in a git repository
    if git rev-parse --git-dir > /dev/null 2>&1; then
        print_status "success" "Current directory is a git repository"
        
        # Check remote
        if git remote get-url origin >/dev/null 2>&1; then
            REMOTE_URL=$(git remote get-url origin)
            print_status "success" "Remote origin: $REMOTE_URL"
        else
            print_status "warning" "No remote origin configured"
            SETUP_COMPLETE=false
        fi
    else
        print_status "warning" "Not in a git repository"
    fi
else
    print_status "error" "Git is not installed"
    SETUP_COMPLETE=false
fi

# Check Node.js
echo ""
echo "Checking Node.js..."
if command_exists node; then
    NODE_VERSION=$(node -v)
    print_status "success" "Node.js installed: $NODE_VERSION"
else
    print_status "error" "Node.js is not installed"
    SETUP_COMPLETE=false
fi

# Check npm packages
echo ""
echo "Checking npm dependencies..."
if [ -f package.json ]; then
    print_status "success" "package.json found"
    
    if [ -d node_modules ]; then
        print_status "success" "Dependencies installed"
        
        # Check for uuid package (needed for Claude Code executor)
        if [ -d node_modules/uuid ]; then
            print_status "success" "uuid package installed"
        else
            print_status "warning" "uuid package not found"
            echo "  Run: npm install"
            SETUP_COMPLETE=false
        fi
    else
        print_status "warning" "Dependencies not installed"
        echo "  Run: npm install"
        SETUP_COMPLETE=false
    fi
else
    print_status "error" "package.json not found"
fi

# Test Claude Code functionality
echo ""
echo "======================================"
echo -e "${BLUE}Testing Claude Code Functionality${NC}"
echo "======================================"
echo ""

if command_exists claude; then
    echo "Testing prompt capability..."
    TEST_DIR=$(mktemp -d)
    cd "$TEST_DIR"
    echo "# Test File" > test.md
    
    # Try a simple prompt (will fail if not set up properly, which is fine)
    if echo "Just output 'test successful' and nothing else" | timeout 5 claude -p "Just output 'test successful' and nothing else" 2>/dev/null | grep -q "test successful"; then
        print_status "success" "Claude Code can execute prompts"
        # If the comprehensive test passes, Claude is definitely working
        CLAUDE_OK=true
    else
        print_status "warning" "Claude Code prompt test failed (this is normal if not fully configured)"
        # Only mark as not OK if we haven't already confirmed it's working
        if [ "$CLAUDE_OK" != "true" ]; then
            CLAUDE_OK=false
        fi
    fi
    
    cd - >/dev/null
    rm -rf "$TEST_DIR"
fi

# Final check - determine if setup is really complete
# Claude is the only critical component that might have issues
# If Claude is working (either test passed), everything is good
if [ "$CLAUDE_OK" != "true" ]; then
    SETUP_COMPLETE=false
fi

# Summary
echo ""
echo "======================================"
echo -e "${BLUE}Setup Summary${NC}"
echo "======================================"
echo ""

if [ "$SETUP_COMPLETE" = true ]; then
    print_status "success" "All prerequisites are installed!"
    echo ""
    echo "You can now use the local Claude Code execution tools:"
    echo ""
    echo "1. In Claude Desktop, ask to check Claude Code status:"
    echo "   'Check if Claude Code is ready'"
    echo ""
    echo "2. To fix a bug:"
    echo "   'Fix the search function bug using Claude Code'"
    echo ""
    echo "3. To implement a feature:"
    echo "   'Implement smart tag suggestions using Claude Code'"
    echo ""
    echo "The tools will run Claude Code locally on your machine,"
    echo "make changes in a temporary directory, and create a PR."
else
    print_status "warning" "Setup incomplete. Please address the issues above."
    echo ""
    echo "Once everything is installed and configured, run this script again."
fi

echo ""
echo "======================================"
echo -e "${BLUE}Quick Reference${NC}"
echo "======================================"
echo ""
echo "Claude Code commands:"
echo "  claude                         # Start interactive session"
echo "  claude -p \"prompt\"             # Run in headless mode"
echo "  claude sessions                # List sessions"
echo "  claude continue                # Continue last session"
echo "  claude --version               # Check version"
echo "  --dangerously-skip-permissions # Skip permission prompts"
echo ""
echo "GitHub CLI commands:"
echo "  gh auth login                  # Authenticate"
echo "  gh auth status                 # Check auth status"
echo "  gh repo view                   # View current repo"
echo ""
echo "MCP Tools available:"
echo "  check_claude_code_status       # Verify Claude Code setup"
echo "  execute_claude_code_fix        # Fix bugs locally"
echo "  execute_claude_code_feature    # Implement features locally"
echo "  cleanup_temp_directories       # Clean up temp dirs"
echo ""
echo "For more information, see docs/LOCAL_CLAUDE_CODE.md"
