# Check for Personal Paths in Documentation and Config

You are preparing the Obsidian AI Curator project for open source release. Your task is to find and fix any hardcoded personal paths or information.

## What to Look For
1. **Personal vault paths** like `/Users/nathan/obsidian/` 
2. **Hardcoded usernames** (except 'nwant' which should be used for GitHub)
3. **Personal API keys or tokens** (though these should be in .gitignore)
4. **Real note names or content** from personal vaults
5. **Machine-specific paths** that won't work for others

## Where to Check
- All markdown files (*.md)
- Configuration examples (config/*.json)
- Test files (test/**/*)
- Documentation (docs/**/*)
- Scripts (scripts/**/*)
- README and CONTRIBUTING files

## What to Replace With
- Vault paths → `/path/to/your/vault` or `/Users/you/Documents/MyVault`
- Usernames → `you` or `username` (except GitHub should be `nwant`)
- Note examples → Generic examples like `[[Meeting Notes]]` or `[[Project Index]]`
- Personal content → Generic placeholder content

## Process
1. Search through all relevant files
2. Identify any personal information
3. Replace with generic placeholders
4. Ensure examples still make sense
5. Verify no sensitive data remains

## Important
- Do NOT change actual config files (config/config.json) as these are gitignored
- Do NOT change GitHub username from 'nwant' - this is correct
- Keep examples realistic but generic
- Maintain consistency across all documentation

Report all changes made and any remaining concerns.
