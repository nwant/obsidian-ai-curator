#!/bin/bash
# Pre-release checklist for Obsidian AI Curator

echo "🚀 Pre-Release Checklist"
echo "======================="
echo ""
echo "This script helps ensure the codebase is ready for release."
echo ""

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "📋 Checking for common issues..."
echo ""

# Check for personal paths
echo "1. Checking for personal paths..."
PERSONAL_PATHS=$(grep -r "/Users/[^/y]" . --include="*.md" --include="*.json" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=coverage | grep -v "/Users/you" | grep -v "/Users/your")

if [ -z "$PERSONAL_PATHS" ]; then
  echo -e "   ${GREEN}✓ No personal paths found${NC}"
else
  echo -e "   ${RED}✗ Found personal paths:${NC}"
  echo "$PERSONAL_PATHS" | head -10
  echo ""
fi

# Check for hardcoded 'nathan' username
echo "2. Checking for hardcoded usernames..."
USERNAMES=$(grep -r "nathan" . --include="*.md" --include="*.json" --exclude-dir=node_modules --exclude-dir=.git | grep -v "nwant")

if [ -z "$USERNAMES" ]; then
  echo -e "   ${GREEN}✓ No hardcoded usernames found${NC}"
else
  echo -e "   ${YELLOW}⚠ Found potential username references:${NC}"
  echo "$USERNAMES" | head -5
fi

# Check GitHub URLs
echo "3. Checking GitHub URLs use 'nwant'..."
GITHUB_URLS=$(grep -r "github.com" . --include="*.md" --include="*.json" --exclude-dir=node_modules --exclude-dir=.git | grep -v "github.com/nwant")

if [ -z "$GITHUB_URLS" ]; then
  echo -e "   ${GREEN}✓ All GitHub URLs use correct username${NC}"
else
  echo -e "   ${YELLOW}⚠ Found GitHub URLs to check:${NC}"
  echo "$GITHUB_URLS" | head -5
fi

# Check for TODO/FIXME comments
echo "4. Checking for TODO/FIXME comments..."
TODOS=$(grep -r "TODO\|FIXME" . --include="*.js" --include="*.md" --exclude-dir=node_modules --exclude-dir=.git | wc -l)

if [ "$TODOS" -eq 0 ]; then
  echo -e "   ${GREEN}✓ No TODO/FIXME comments found${NC}"
else
  echo -e "   ${YELLOW}⚠ Found $TODOS TODO/FIXME comments${NC}"
fi

echo ""
echo "📊 Test Status"
echo "--------------"
npm run test:status

echo ""
echo "📝 Manual Checks Required:"
echo "-------------------------"
echo "[ ] All tests passing"
echo "[ ] Documentation up to date"
echo "[ ] CHANGELOG.md updated"
echo "[ ] Version bumped in package.json"
echo "[ ] Example configs work for new users"
echo "[ ] No sensitive data in examples"
echo ""

echo "Run 'npm test' to verify all tests pass before release."
