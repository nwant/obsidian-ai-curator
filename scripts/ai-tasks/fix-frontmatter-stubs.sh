#!/bin/bash
# Fix FrontmatterManager stub implementations

echo "🔧 Fixing FrontmatterManager stub implementations..."
echo "This will implement the missing functionality to make tests pass."
echo ""

# Run Claude in headless mode with the prompt
claude -p "$(cat scripts/ai-tasks/prompts/fix-frontmatter-stubs.md)" \
  --allowedTools "Edit,Read,Bash(npm test*),Bash(NODE_ENV=test*)" \
  --output-format stream-json \
  --max-turns 15

echo ""
echo "✅ Task complete. Check the results above."
