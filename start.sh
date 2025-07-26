#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Obsidian AI Curator${NC}"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "obsidian-ai-curator-plugin" ]; then
    echo -e "${YELLOW}Error: Must run from the obsidian-ai-curator root directory${NC}"
    exit 1
fi

# Build the plugin
echo -e "${GREEN}📦 Building plugin...${NC}"
cd obsidian-ai-curator-plugin
npm run build
if [ $? -ne 0 ]; then
    echo -e "${YELLOW}Plugin build failed!${NC}"
    exit 1
fi
cd ..

echo -e "${GREEN}✅ Plugin built successfully!${NC}"
echo ""

echo -e "${BLUE}The Obsidian plugin is now ready!${NC}"
echo -e "${BLUE}To use with Claude Desktop/Code:${NC}"
echo -e "  1. Open Obsidian with the AI Curator plugin enabled"
echo -e "  2. The API server will start automatically on port 3001"
echo -e "  3. Use Claude Desktop/Code with the MCP server"
echo ""
echo -e "${GREEN}MCP server is configured in your Claude Desktop/Code settings.${NC}"