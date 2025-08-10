#!/bin/bash

# Make scripts executable

chmod +x scripts/setup-automation.sh
chmod +x scripts/setup-local-claude.sh
chmod +x scripts/test-github-integration.js

echo "✓ Scripts are now executable"
echo ""
echo "You can now run:"
echo "  bash scripts/setup-automation.sh"
echo "  node scripts/test-github-integration.js"
