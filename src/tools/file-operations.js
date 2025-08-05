import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';

/**
 * File operations tools (rename, move, etc.)
 */

export async function rename_file(args) {
  const { oldPath, newPath } = args;
  
  if (!oldPath || !newPath) {
    throw new Error('Both oldPath and newPath are required');
  }
  
  // Get vault path from config
  const configPath = path.join(process.cwd(), 'config', process.env.NODE_ENV === 'test' ? 'test-config.json' : 'config.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
  const vaultPath = config.vaultPath;
  
  // Validate paths for security
  if (path.isAbsolute(oldPath) || oldPath.includes('..')) {
    throw new Error(`Invalid path outside vault: ${oldPath}`);
  }
  if (path.isAbsolute(newPath) || newPath.includes('..')) {
    throw new Error(`Invalid path outside vault: ${newPath}`);
  }
  const validatedOldPath = oldPath;
  const validatedNewPath = newPath;
  
  const fullOldPath = path.join(vaultPath, validatedOldPath);
  const fullNewPath = path.join(vaultPath, validatedNewPath);
  
  // Check if source exists
  try {
    await fs.access(fullOldPath);
  } catch {
    throw new Error(`Source file not found: ${oldPath}`);
  }
  
  // Check if target already exists
  try {
    await fs.access(fullNewPath);
    throw new Error(`Target file already exists: ${newPath}`);
  } catch (error) {
    // Good, target doesn't exist
    if (error.message && error.message.includes('already exists')) {
      throw error;
    }
  }
  
  // Create target directory if needed
  await fs.mkdir(path.dirname(fullNewPath), { recursive: true });
  
  // Rename file
  await fs.rename(fullOldPath, fullNewPath);
  
  // Update all links in vault
  const updatedFiles = await updateLinksInVault(oldPath, newPath, vaultPath, config);
  
  return {
    oldPath,
    newPath,
    success: true,
    linksUpdated: updatedFiles.length,
    filesUpdated: updatedFiles
  };
}

export async function move_file(args) {
  const { sourcePath, targetPath } = args;
  
  if (!sourcePath || !targetPath) {
    throw new Error('Both sourcePath and targetPath are required');
  }
  
  // Move is just rename with different parameter names
  return await rename_file({
    oldPath: sourcePath,
    newPath: targetPath
  });
}

export async function archive_notes(args) {
  const { moves } = args;
  
  if (!Array.isArray(moves)) {
    throw new Error('moves must be an array');
  }
  
  // Get vault path from config
  const configPath = path.join(process.cwd(), 'config', process.env.NODE_ENV === 'test' ? 'test-config.json' : 'config.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
  const vaultPath = config.vaultPath;
  
  // Validate all paths first
  for (const move of moves) {
    if (path.isAbsolute(move.from) || move.from.includes('..')) {
      throw new Error(`Invalid path outside vault: ${move.from}`);
    }
    if (path.isAbsolute(move.to) || move.to.includes('..')) {
      throw new Error(`Invalid path outside vault: ${move.to}`);
    }
  }
  
  // Create a map of all moves to handle batch link updates
  const moveMap = new Map();
  for (const move of moves) {
    moveMap.set(move.from, move.to);
  }
  
  // First, move all files without updating links
  const movedFiles = [];
  const failedMoves = [];
  
  for (const move of moves) {
    try {
      const sourcePath = path.join(vaultPath, move.from);
      const targetPath = path.join(vaultPath, move.to);
      
      // Check if source exists
      try {
        await fs.access(sourcePath);
      } catch {
        failedMoves.push({
          from: move.from,
          to: move.to,
          success: false,
          error: `Source file not found: ${move.from}`
        });
        continue; // Skip to next move
      }
      
      // Create target directory if needed
      const targetDir = path.dirname(targetPath);
      await fs.mkdir(targetDir, { recursive: true });
      
      // Move the file
      await fs.rename(sourcePath, targetPath);
      movedFiles.push({ from: move.from, to: move.to });
    } catch (error) {
      failedMoves.push({
        from: move.from,
        to: move.to,
        success: false,
        error: error.message
      });
    }
  }
  
  // Now update all links in the vault considering all moves (only for successful moves)
  const successfulMoveMap = new Map();
  for (const moved of movedFiles) {
    successfulMoveMap.set(moved.from, moved.to);
  }
  const updatedFiles = await updateLinksForBatchMove(vaultPath, successfulMoveMap);
  
  // Combine results
  const results = [];
  
  // Add successful moves
  for (const move of movedFiles) {
    results.push({
      from: move.from,
      to: move.to,
      success: true,
      filesUpdated: updatedFiles.filter(f => f.updated).map(f => f.path)
    });
  }
  
  // Add failed moves
  results.push(...failedMoves);
  
  return {
    totalMoves: moves.length,
    successful: movedFiles.length,
    failed: failedMoves.length,
    results,
    errors: failedMoves.map(f => f.error) // Add errors array for test compatibility
  };
}

async function updateLinksForBatchMove(vaultPath, moveMap) {
  const files = await glob('**/*.md', {
    cwd: vaultPath,
    ignore: ['.obsidian/**', '.git/**', '.trash/**']
  });
  
  const updatedFiles = [];
  
  for (const file of files) {
    const fullPath = path.join(vaultPath, file);
    let content = await fs.readFile(fullPath, 'utf-8');
    let modified = false;
    const fileDir = path.dirname(file);
    
    // Update links for each moved file
    for (const [oldPath, newPath] of moveMap) {
      const oldName = path.basename(oldPath, '.md');
      const newName = path.basename(newPath, '.md');
      const newDir = path.dirname(newPath);
      
      // Simple wikilink pattern
      const simpleWikilinkRegex = new RegExp(`\\[\\[${oldName}(\\|[^\\]]+)?\\]\\]`, 'g');
      
      content = content.replace(simpleWikilinkRegex, (match, alias) => {
        modified = true;
        
        // Check if the current file and target are in the same directory
        if (fileDir === newDir) {
          // Same directory, use simple link
          return alias ? `[[${newName}${alias}]]` : `[[${newName}]]`;
        } else if (newDir === '.') {
          // Target is in root
          return alias ? `[[${newName}${alias}]]` : `[[${newName}]]`;
        } else {
          // Different directories
          const link = `${newDir}/${newName}`;
          return alias ? `[[${link}${alias}]]` : `[[${link}|${oldName}]]`;
        }
      });
      
      // Also handle full path links
      const pathPatterns = [
        oldPath.replace('.md', ''),
        oldPath
      ];
      
      for (const pattern of pathPatterns) {
        const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const fullWikilinkRegex = new RegExp(`\\[\\[${escapedPattern}(\\|[^\\]]+)?\\]\\]`, 'g');
        
        content = content.replace(fullWikilinkRegex, (match, alias) => {
          modified = true;
          const newFullPath = newPath.replace('.md', '');
          
          // Check if same directory
          if (fileDir === newDir) {
            return alias ? `[[${newName}${alias}]]` : `[[${newName}]]`;
          } else {
            return alias ? `[[${newFullPath}${alias}]]` : `[[${newFullPath}|${oldName}]]`;
          }
        });
      }
    }
    
    if (modified) {
      await fs.writeFile(fullPath, content);
      updatedFiles.push({ path: file, updated: true });
    } else {
      updatedFiles.push({ path: file, updated: false });
    }
  }
  
  return updatedFiles;
}

export async function get_links(args) {
  const { path: filePath } = args;
  
  if (!filePath) {
    throw new Error('Path parameter is required');
  }
  
  // Get vault path from config
  const configPath = path.join(process.cwd(), 'config', process.env.NODE_ENV === 'test' ? 'test-config.json' : 'config.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
  const vaultPath = config.vaultPath;
  
  const fullPath = path.join(vaultPath, filePath);
  const content = await fs.readFile(fullPath, 'utf-8');
  
  // Extract links
  const links = [];
  
  // Wikilinks: [[Note Name]] or [[Note Name|Display Text]]
  const wikilinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let match;
  while ((match = wikilinkRegex.exec(content)) !== null) {
    links.push({
      type: 'wikilink',
      target: match[1],
      displayText: match[2] || match[1],
      raw: match[0]
    });
  }
  
  // Markdown links: [text](url)
  const mdLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  while ((match = mdLinkRegex.exec(content)) !== null) {
    links.push({
      type: 'markdown',
      target: match[2],
      displayText: match[1],
      raw: match[0]
    });
  }
  
  return {
    path: filePath,
    links,
    totalLinks: links.length
  };
}

export async function get_backlinks(args) {
  const { path: targetPath } = args;
  
  if (!targetPath) {
    throw new Error('Path parameter is required');
  }
  
  // Get vault path from config
  const configPath = path.join(process.cwd(), 'config', process.env.NODE_ENV === 'test' ? 'test-config.json' : 'config.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
  const vaultPath = config.vaultPath;
  
  // Find all markdown files
  const files = await glob('**/*.md', {
    cwd: vaultPath,
    ignore: config.ignorePatterns || ['.obsidian/**', '.git/**', '.trash/**']
  });
  
  const backlinks = [];
  const targetName = path.basename(targetPath, '.md');
  
  for (const file of files) {
    if (file === targetPath) continue; // Skip self
    
    const fullPath = path.join(vaultPath, file);
    const content = await fs.readFile(fullPath, 'utf-8');
    
    // Check for wikilinks to this file
    const wikilinkRegex = new RegExp(`\\[\\[${targetName}(?:\\|[^\\]]+)?\\]\\]`, 'g');
    const wikiMatches = content.match(wikilinkRegex) || [];
    
    // Check for markdown links to this file
    const mdLinkRegex = new RegExp(`\\[[^\\]]+\\]\\(${targetPath}\\)`, 'g');
    const mdMatches = content.match(mdLinkRegex) || [];
    
    if (wikiMatches.length > 0 || mdMatches.length > 0) {
      backlinks.push({
        source: file,
        linkCount: wikiMatches.length + mdMatches.length,
        linkTypes: {
          wikilinks: wikiMatches.length,
          markdown: mdMatches.length
        }
      });
    }
  }
  
  return {
    target: targetPath,
    backlinks,
    totalBacklinks: backlinks.length
  };
}

// Helper function to update links throughout the vault
async function updateLinksInVault(oldPath, newPath, vaultPath, config) {
  const files = await glob('**/*.md', {
    cwd: vaultPath,
    ignore: config.ignorePatterns || ['.obsidian/**', '.git/**', '.trash/**']
  });
  
  const updatedFiles = [];
  const oldName = path.basename(oldPath, '.md');
  const newName = path.basename(newPath, '.md');
  const oldDir = path.dirname(oldPath);
  const newDir = path.dirname(newPath);
  
  for (const file of files) {
    const fullPath = path.join(vaultPath, file);
    let content = await fs.readFile(fullPath, 'utf-8');
    let modified = false;
    
    // Get the directory of the current file
    const currentFileDir = path.dirname(file);
    
    // Update wikilinks
    // If the file moved to a different directory, we need to update the link path
    if (oldDir !== newDir) {
      // For files that were linking with just the name, we need to add the path
      const simpleWikilinkRegex = new RegExp(`\\[\\[${oldName}(\\|[^\\]]+)?\\]\\]`, 'g');
      
      // Determine the appropriate link format
      let newLink;
      if (currentFileDir === newDir) {
        // Files are in the same directory, use simple link
        newLink = newName;
      } else if (newDir === '.') {
        // Target is in root
        newLink = newName;
      } else {
        // Files are in different directories, use path
        newLink = `${newDir}/${newName}`;
      }
      
      const newContent = content.replace(simpleWikilinkRegex, (match, alias) => {
        if (alias) {
          // Already has an alias, just update the path
          return `[[${newLink}${alias}]]`;
        } else if (currentFileDir === newDir) {
          // Same directory, no alias needed
          return `[[${newLink}]]`;
        } else {
          // Different directories, add the old name as alias to preserve display text
          return `[[${newLink}|${oldName}]]`;
        }
      });
      if (newContent !== content) {
        content = newContent;
        modified = true;
      }
      
      // Also update any existing full-path wikilinks
      // Try both with and without the parent directory in case of relative links
      const pathWithoutExt = oldPath.replace('.md', '');
      const pathParts = pathWithoutExt.split('/');
      const patterns = [
        pathWithoutExt, // Full path
        pathParts.slice(1).join('/'), // Without first directory
        pathParts.slice(-2).join('/') // Just parent/file
      ].filter((p, i, arr) => arr.indexOf(p) === i); // Remove duplicates
      
      for (const pattern of patterns) {
        const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const fullWikilinkRegex = new RegExp(`\\[\\[${escapedPattern}(\\|[^\\]]+)?\\]\\]`, 'g');
        const newPathWithoutExt = newPath.replace('.md', '');
        const newContent2 = content.replace(fullWikilinkRegex, (match, alias) => {
          if (alias) {
            return `[[${newPathWithoutExt}${alias}]]`;
          } else if (newDir === '.') {
            // Moving to root, just use the name
            return `[[${newName}]]`;
          } else {
            // Moving to different dir, preserve display name
            return `[[${newPathWithoutExt}|${oldName}]]`;
          }
        });
        if (newContent2 !== content) {
          content = newContent2;
          modified = true;
        }
      }
    } else {
      // Same directory, just update the name
      const wikilinkRegex = new RegExp(`\\[\\[${oldName}(\\|[^\\]]+)?\\]\\]`, 'g');
      const newContent = content.replace(wikilinkRegex, `[[${newName}$1]]`);
      if (newContent !== content) {
        content = newContent;
        modified = true;
      }
    }
    
    // Update markdown links
    const mdLinkRegex = new RegExp(`\\]\\(${oldPath}\\)`, 'g');
    const newContent3 = content.replace(mdLinkRegex, `](${newPath})`);
    if (newContent3 !== content) {
      content = newContent3;
      modified = true;
    }
    
    if (modified) {
      // Update modified timestamp if file has frontmatter
      const parsed = matter(content);
      if (Object.keys(parsed.data).length > 0) {
        parsed.data.modified = new Date().toISOString();
        content = matter.stringify(parsed.content, parsed.data);
      }
      
      await fs.writeFile(fullPath, content);
      updatedFiles.push(file);
    }
  }
  
  return updatedFiles;
}