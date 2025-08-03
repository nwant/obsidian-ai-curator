#!/usr/bin/env node

/**
 * Migration script to transition from monolithic mcp-server.js to modular architecture
 * This script helps update references and configurations
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

async function migrate() {
  console.log('🔄 Starting migration to modular MCP server architecture...\n');

  try {
    // Step 1: Backup original server file
    console.log('1️⃣ Creating backup of original server file...');
    const originalPath = path.join(projectRoot, 'src', 'mcp-server.js');
    const backupPath = path.join(projectRoot, 'src', 'mcp-server.original.js');
    
    try {
      await fs.copyFile(originalPath, backupPath);
      console.log('   ✅ Backup created: mcp-server.original.js');
    } catch (error) {
      console.log('   ⚠️  Backup already exists or original file not found');
    }

    // Step 2: Update package.json to use new server
    console.log('\n2️⃣ Updating package.json scripts...');
    const packagePath = path.join(projectRoot, 'package.json');
    const packageContent = await fs.readFile(packagePath, 'utf-8');
    const packageJson = JSON.parse(packageContent);
    
    // Update main entry point
    if (packageJson.main === 'src/mcp-server.js') {
      packageJson.main = 'src/mcp-server-refactored.js';
      console.log('   ✅ Updated main entry point');
    }
    
    // Update scripts
    if (packageJson.scripts) {
      if (packageJson.scripts.start === 'node src/mcp-server.js') {
        packageJson.scripts.start = 'node src/mcp-server-refactored.js';
        console.log('   ✅ Updated start script');
      }
      if (packageJson.scripts.dev === 'node --watch src/mcp-server.js') {
        packageJson.scripts.dev = 'node --watch src/mcp-server-refactored.js';
        console.log('   ✅ Updated dev script');
      }
    }
    
    await fs.writeFile(packagePath, JSON.stringify(packageJson, null, 2) + '\n');

    // Step 3: Update MCP configuration files
    console.log('\n3️⃣ Checking MCP configuration files...');
    const configPaths = [
      path.join(process.env.HOME || process.env.USERPROFILE, '.config', 'claude', 'claude_desktop_config.json'),
      path.join(projectRoot, '.mcp.json')
    ];
    
    for (const configPath of configPaths) {
      try {
        const configContent = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(configContent);
        
        let updated = false;
        
        // Update MCP server configurations
        if (config.mcpServers) {
          for (const [key, server] of Object.entries(config.mcpServers)) {
            if (server.command && server.args) {
              const serverPath = server.args.find(arg => arg.includes('mcp-server.js'));
              if (serverPath) {
                const index = server.args.indexOf(serverPath);
                server.args[index] = serverPath.replace('mcp-server.js', 'mcp-server-refactored.js');
                updated = true;
                console.log(`   ✅ Updated ${key} configuration`);
              }
            }
          }
        }
        
        if (updated) {
          await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
        }
      } catch (error) {
        console.log(`   ℹ️  Skipping ${path.basename(configPath)} - not found or not accessible`);
      }
    }

    // Step 4: Create new directories if needed
    console.log('\n4️⃣ Creating handler directories...');
    const handlersDir = path.join(projectRoot, 'src', 'handlers');
    await fs.mkdir(handlersDir, { recursive: true });
    console.log('   ✅ Created src/handlers directory');

    // Step 5: Update imports in test files
    console.log('\n5️⃣ Updating test imports...');
    const testDir = path.join(projectRoot, 'test');
    const testFiles = await findFiles(testDir, '.js');
    
    let updatedTests = 0;
    for (const testFile of testFiles) {
      const content = await fs.readFile(testFile, 'utf-8');
      if (content.includes('mcp-server.js')) {
        const updatedContent = content.replace(/mcp-server\.js/g, 'mcp-server-refactored.js');
        await fs.writeFile(testFile, updatedContent);
        updatedTests++;
      }
    }
    console.log(`   ✅ Updated ${updatedTests} test files`);

    // Step 6: Generate summary
    console.log('\n✨ Migration completed successfully!\n');
    console.log('📋 Summary:');
    console.log('   - Original server backed up to mcp-server.original.js');
    console.log('   - New modular server at mcp-server-refactored.js');
    console.log('   - Handler modules in src/handlers/');
    console.log('   - Configuration files updated');
    
    console.log('\n🚀 Next steps:');
    console.log('   1. Test the new server: npm test');
    console.log('   2. Run the server: npm start');
    console.log('   3. If everything works, you can remove mcp-server.original.js');
    console.log('   4. Consider renaming mcp-server-refactored.js to mcp-server.js');
    
    console.log('\n⚠️  Important:');
    console.log('   - Restart Claude Desktop to use the new server');
    console.log('   - Run tests to ensure everything works correctly');
    console.log('   - The old server is preserved as mcp-server.original.js');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

async function findFiles(dir, extension) {
  const files = [];
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        const subFiles = await findFiles(fullPath, extension);
        files.push(...subFiles);
      } else if (entry.isFile() && entry.name.endsWith(extension)) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error.message);
  }
  
  return files;
}

// Run migration
migrate().catch(console.error);