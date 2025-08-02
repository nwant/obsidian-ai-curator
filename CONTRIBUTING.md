# Contributing to Obsidian AI Curator

We welcome contributions! This guide will help you get started.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/[your-username]/obsidian-ai-curator.git
   cd obsidian-ai-curator
   ```
3. Install dependencies:
   ```bash
   npm install
   cd obsidian-ai-curator-plugin && npm install && cd ..
   ```

## Development Setup

1. Link to your test vault:
   ```bash
   cp config/config.minimal.json config/config.json
   # Edit config.json with your test vault path
   ```

2. Run in development mode:
   ```bash
   npm run dev
   ```

## Making Changes

### Code Style
- Use ES modules for server code
- Use TypeScript for plugin code
- Follow existing code patterns
- Add JSDoc comments for public functions

### Testing Your Changes
1. Test MCP server functionality:
   ```bash
   npm test
   ```

2. Test with Claude Desktop:
   - Update your claude_desktop_config.json to point to your fork
   - Restart Claude Desktop
   - Test all affected tools

3. Test plugin (if changed):
   ```bash
   cd obsidian-ai-curator-plugin
   npm run dev
   ```

### Commit Guidelines
- Use clear, descriptive commit messages
- Format: `type: description`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
- Example: `feat: add bulk tag rename functionality`

## Pull Request Process

1. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and commit
3. Push to your fork
4. Open a Pull Request with:
   - Clear description of changes
   - Any breaking changes noted
   - Screenshots if UI changes
   - Test results

## What to Contribute

### Good First Issues
- Documentation improvements
- Bug fixes with clear reproduction steps  
- Test coverage improvements
- Performance optimizations

### Feature Ideas
- New MCP tools for vault operations
- Enhanced search capabilities
- Better error messages
- UI improvements for the plugin

### Before Starting Major Features
Please open an issue first to discuss:
- Large architectural changes
- New dependencies
- Breaking changes
- Major new features

## Code Guidelines

### MCP Tools
- Follow the existing tool pattern in `src/tools/`
- Include comprehensive JSDoc
- Validate inputs thoroughly
- Return consistent response formats
- Add usage examples to docs

### Plugin Development
- Follow Obsidian plugin guidelines
- Ensure backwards compatibility
- Test on multiple Obsidian versions
- Keep the API server lightweight

## Documentation

When adding features:
1. Update relevant docs in `docs/`
2. Add examples to `docs/EXAMPLES.md`
3. Update tool reference in `docs/MCP_TOOLS.md`
4. Include inline code comments

## Questions?

- Open an issue for bugs
- Start a discussion for features
- Check existing issues first

Thank you for contributing!