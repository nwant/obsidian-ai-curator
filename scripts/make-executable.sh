#!/bin/bash
# Make all scripts executable

chmod +x scripts/dev/*.sh

echo "✅ Made all dev scripts executable"
echo ""
echo "Available scripts:"
echo "- scripts/dev/pre-release-check.sh"
echo "- scripts/dev/code-quality-check.sh"
echo ""
echo "Or use npm commands:"
echo "- npm run dev:pre-release"
echo "- npm run dev:quality"
