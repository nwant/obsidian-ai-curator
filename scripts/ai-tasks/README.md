# AI-Assisted Development Tasks

This directory contains prompts and scripts for using Claude Code in headless mode to help with development tasks.

## Usage

Run tasks using npm scripts:

```bash
# Fix specific stub implementations
npm run ai:fix-frontmatter    # Fix FrontmatterManager stubs
npm run ai:fix-performance    # Fix PerformanceMonitor stubs

# Fix all stubs at once
npm run ai:fix-stubs

# Check for personal information before release
npm run ai:check-paths

# See all available tasks
npm run ai:task
```

## How It Works

1. Each task has a prompt file in `prompts/` that describes what Claude should do
2. Shell scripts run `claude -p` (headless mode) with appropriate permissions
3. Claude reads the tests, implements the code, and verifies it works
4. All changes are made directly to your local files

## Cost Considerations

Each task run will consume API tokens based on:
- File sizes being read/edited
- Number of test runs
- Complexity of implementation

Typical stub fix: ~5,000-15,000 tokens per module

## Adding New Tasks

1. Create a prompt in `prompts/your-task.md`
2. Create a script `your-task.sh` that runs:
   ```bash
   claude -p "$(cat scripts/ai-tasks/prompts/your-task.md)" \
     --allowedTools "Edit,Read,Bash(...)" \
     --max-turns 15
   ```
3. Add to package.json scripts
4. Update the menu in `ai-tasks.sh`

## Safety

- Scripts use specific `--allowedTools` to limit what Claude can do
- No internet access or system modifications
- All changes are to project files only
- Use git to track/revert changes as needed
