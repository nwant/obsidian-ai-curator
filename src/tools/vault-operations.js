import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';

/**
 * Vault operations tools
 */

export async function vault_scan(args) {
  const {
    patterns = ['**/*.md'],
    includeStats = false,
    includeFrontmatter = false,
    includePreview = false,
    sortBy = 'modified',
    limit = 100,
    useCache = true
  } = args;

  // Get vault path from config
  const configPath = path.join(process.cwd(), 'config', process.env.NODE_ENV === 'test' ? 'test-config.json' : 'config.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
  const vaultPath = config.vaultPath;

  // Find files matching patterns
  const files = [];
  for (const pattern of patterns) {
    try {
      const matches = await glob(pattern, {
        cwd: vaultPath,
        ignore: config.ignorePatterns || ['.obsidian/**', '.git/**', '.trash/**']
      });
      files.push(...matches);
    } catch (error) {
      throw new Error(`Invalid pattern: ${pattern}`);
    }
  }

  // Remove duplicates
  const uniqueFiles = [...new Set(files)];

  // Get file details
  const fileDetails = await Promise.all(
    uniqueFiles.map(async (file) => {
      const fullPath = path.join(vaultPath, file);
      const stats = await fs.stat(fullPath);
      
      let result = {
        path: file,
        modified: stats.mtime.toISOString(),
        created: stats.ctime.toISOString()
      };

      if (includeStats) {
        const content = await fs.readFile(fullPath, 'utf-8');
        result.size = stats.size;
        result.wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
      }

      if (includeFrontmatter) {
        const content = await fs.readFile(fullPath, 'utf-8');
        const { data } = matter(content);
        result.frontmatter = data;
      }

      if (includePreview) {
        const content = await fs.readFile(fullPath, 'utf-8');
        const { content: body } = matter(content);
        result.preview = body.substring(0, 200);
      }

      return result;
    })
  );

  // Sort files
  const sortedFiles = fileDetails.sort((a, b) => {
    switch (sortBy) {
      case 'modified':
        return new Date(b.modified) - new Date(a.modified);
      case 'path':
        return a.path.localeCompare(b.path);
      case 'size':
        return (b.size || 0) - (a.size || 0);
      default:
        return 0;
    }
  });

  // Apply limit
  const limitedFiles = sortedFiles.slice(0, limit);

  return {
    files: limitedFiles,
    totalCount: uniqueFiles.length,
    patterns,
    sortBy,
    limit
  };
}

export async function get_frontmatter(args) {
  const { path: filePath } = args;
  
  // Get vault path from config
  const configPath = path.join(process.cwd(), 'config', process.env.NODE_ENV === 'test' ? 'test-config.json' : 'config.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
  const vaultPath = config.vaultPath;
  
  const fullPath = path.join(vaultPath, filePath);
  const content = await fs.readFile(fullPath, 'utf-8');
  const { data } = matter(content);
  
  return {
    path: filePath,
    frontmatter: data
  };
}

export async function update_frontmatter(args) {
  const { path: filePath, updates, merge = true } = args;
  
  // Get vault path from config
  const configPath = path.join(process.cwd(), 'config', process.env.NODE_ENV === 'test' ? 'test-config.json' : 'config.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
  const vaultPath = config.vaultPath;
  
  const fullPath = path.join(vaultPath, filePath);
  const content = await fs.readFile(fullPath, 'utf-8');
  const parsed = matter(content);
  
  // Update frontmatter
  if (merge) {
    parsed.data = { ...parsed.data, ...updates };
  } else {
    parsed.data = updates;
  }
  
  // Write back
  const newContent = matter.stringify(parsed.content, parsed.data);
  await fs.writeFile(fullPath, newContent);
  
  return {
    path: filePath,
    frontmatter: parsed.data,
    success: true
  };
}

export async function read_notes(args) {
  const { paths, renderDataview = false, dataviewMode = 'smart' } = args;
  
  if (!paths || !Array.isArray(paths)) {
    throw new Error('paths parameter is required and must be an array');
  }
  
  // Get vault path from config
  const configPath = path.join(process.cwd(), 'config', process.env.NODE_ENV === 'test' ? 'test-config.json' : 'config.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
  const vaultPath = config.vaultPath;
  
  const notes = await Promise.all(paths.map(async (notePath) => {
    const fullPath = path.join(vaultPath, notePath);
    
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const { data: frontmatter, content: body } = matter(content);
      
      const headings = [];
      const links = [];
      
      // Extract headings
      const headingMatches = body.matchAll(/^#{1,6}\s+(.+)$/gm);
      for (const match of headingMatches) {
        headings.push(match[1]);
      }
      
      // Extract links
      const linkMatches = body.matchAll(/\[\[([^\]]+)\]\]/g);
      for (const match of linkMatches) {
        links.push(match[1]);
      }
      
      return {
        path: notePath,
        content: body,
        frontmatter,
        headings,
        links,
        raw: content
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Note not found: ${notePath}`);
      }
      throw error;
    }
  }));
  
  return {
    notes,
    count: notes.length
  };
}