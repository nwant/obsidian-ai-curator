#!/bin/bash
# Check code quality and common issues

echo "🔍 Code Quality Check"
echo "===================="
echo ""

# Check for console.log statements (should use stderr)
echo "Checking for console.log usage (should use console.error for MCP)..."
CONSOLE_LOGS=$(grep -r "console\.log" src/ --include="*.js" | grep -v "test" | wc -l)

if [ "$CONSOLE_LOGS" -gt 0 ]; then
  echo "⚠️  Found $CONSOLE_LOGS console.log statements - MCP servers should use console.error"
  echo "   Run: grep -r 'console\.log' src/ --include='*.js'"
else
  echo "✅ No console.log statements in src/"
fi

# Check for missing JSDoc comments
echo ""
echo "Checking for missing documentation..."
UNDOCUMENTED=$(grep -r "export.*function\|export.*class" src/ --include="*.js" | grep -B1 -v "@" | wc -l)
echo "📊 Functions/classes possibly missing JSDoc: ~$UNDOCUMENTED"

# Check import consistency
echo ""
echo "Checking import style consistency..."
REQUIRE_COUNT=$(grep -r "require(" src/ --include="*.js" | wc -l)
IMPORT_COUNT=$(grep -r "^import " src/ --include="*.js" | wc -l)

echo "📊 Import statements: $IMPORT_COUNT"
echo "📊 Require statements: $REQUIRE_COUNT"

if [ "$REQUIRE_COUNT" -gt 0 ]; then
  echo "⚠️  Found CommonJS require() - project uses ES modules"
fi

# Check for large files
echo ""
echo "Checking for large files..."
find src/ -name "*.js" -size +100k -exec echo "⚠️  Large file: {} ($(ls -lh {} | awk '{print $5}'))" \;

echo ""
echo "💡 Run 'npm test' to check test coverage"
echo "💡 Run 'npm run test:benchmark' to check performance"
