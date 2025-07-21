#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Obsidian AI Curator Development Environment${NC}"
echo ""

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}Shutting down...${NC}"
    # Kill the WebSocket server if it's running
    if [ ! -z "$WS_PID" ]; then
        kill $WS_PID 2>/dev/null
    fi
    # Kill the plugin dev server if it's running
    if [ ! -z "$DEV_PID" ]; then
        kill $DEV_PID 2>/dev/null
    fi
    exit 0
}

# Set up trap for cleanup on Ctrl+C
trap cleanup INT TERM

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "obsidian-ai-curator-plugin" ]; then
    echo -e "${YELLOW}Error: Must run from the obsidian-ai-curator root directory${NC}"
    exit 1
fi

# Build the plugin first
echo -e "${GREEN}📦 Building plugin...${NC}"
cd obsidian-ai-curator-plugin
npm run build
if [ $? -ne 0 ]; then
    echo -e "${YELLOW}Plugin build failed!${NC}"
    exit 1
fi
cd ..

# Start the WebSocket server
echo -e "${GREEN}🌐 Starting WebSocket server...${NC}"
npm run start:ws &
WS_PID=$!

# Give the server a moment to start
sleep 2

# Optional: Start plugin in dev mode for auto-rebuild
echo -e "${GREEN}👁️  Starting plugin in watch mode...${NC}"
cd obsidian-ai-curator-plugin
npm run dev &
DEV_PID=$!
cd ..

echo ""
echo -e "${BLUE}✅ Development environment is running!${NC}"
echo ""
echo -e "WebSocket server: ${GREEN}http://localhost:3000${NC}"
echo -e "Plugin watching: ${GREEN}Enabled${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"

# Wait for processes
wait