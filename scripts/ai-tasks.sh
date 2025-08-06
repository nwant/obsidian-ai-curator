#!/bin/bash
# AI-assisted development tasks for Obsidian AI Curator

echo "🤖 Obsidian AI Curator - AI Development Tasks"
echo "============================================"
echo ""
echo "Available tasks:"
echo ""
echo "1. fix-frontmatter-stubs    - Implement FrontmatterManager stub methods"
echo "2. fix-performance-stubs    - Implement PerformanceMonitor stub methods"
echo "3. fix-daily-note-stubs     - Implement DailyNoteManager stub methods"
echo "4. fix-all-stubs           - Fix all stub implementations (runs sequentially)"
echo "5. update-docs             - Update documentation to match current code"
echo "6. check-personal-paths    - Scan for hardcoded personal paths"
echo ""

# Make scripts executable if they aren't already
chmod +x scripts/ai-tasks/*.sh 2>/dev/null

if [ -z "$1" ]; then
    echo "Usage: npm run ai:task <task-name>"
    echo "Example: npm run ai:task fix-frontmatter-stubs"
    exit 1
fi

TASK_SCRIPT="scripts/ai-tasks/$1.sh"

if [ ! -f "$TASK_SCRIPT" ]; then
    echo "❌ Error: Task '$1' not found!"
    echo "Please choose from the available tasks listed above."
    exit 1
fi

echo "▶️  Running task: $1"
echo ""

# Run the selected task
bash "$TASK_SCRIPT"
