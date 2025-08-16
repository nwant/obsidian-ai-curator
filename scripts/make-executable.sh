#!/bin/bash

# Make scripts executable

chmod +x scripts/setup-automation.sh
chmod +x scripts/setup-local-claude.sh
chmod +x scripts/test-github-integration.js
chmod +x scripts/test-local-claude.js

echo "✓ Scripts are now executable"
echo ""
echo "You can now run:"
echo "  bash scripts/setup-local-claude.sh    # Setup local Claude Code"
echo "  bash scripts/setup-automation.sh      # Setup GitHub Actions"
echo "  node scripts/test-local-claude.js     # Test local integration"
echo "  node scripts/test-github-integration.js # Test GitHub integration"
