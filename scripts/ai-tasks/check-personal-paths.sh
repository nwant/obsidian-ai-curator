#!/bin/bash
# Check and fix personal paths in documentation

echo "🔍 Checking for personal paths and information..."
echo "This will scan all documentation and config examples for hardcoded paths."
echo ""

# Run Claude in headless mode with the prompt
claude -p "$(cat scripts/ai-tasks/prompts/check-personal-paths.md)" \
  --allowedTools "Edit,Read,Bash(grep*),Bash(find*)" \
  --output-format stream-json \
  --max-turns 10

echo ""
echo "✅ Task complete. Review the changes above before committing."
