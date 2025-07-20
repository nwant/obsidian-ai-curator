import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

export class LinkIndexManager {
  constructor(config) {
    this.config = config;
    this.indexPath = path.join(config.vaultPath, '.obsidian', 'mcp-link-index.json');
    this.index = {
      forwardLinks: {},  // { "fileA.md": ["fileB.md", "fileC.md"] }
      backLinks: {},     // { "fileB.md": ["fileA.md"] }
      linkDetails: {},   // { "fileA.md->fileB.md": { displayText, line, column, type } }
      aliases: {},       // { "alias": "actual-file.md" }
      lastUpdated: {},   // { "file.md": timestamp }
      version: '1.0'
    };
    this.isBuilding = false;
  }

  async load() {
    try {
      const data = await fs.readFile(this.indexPath, 'utf-8');
      this.index = JSON.parse(data);
      return true;
    } catch (error) {
      // Index doesn't exist yet
      return false;
    }
  }

  async save() {
    const dir = path.dirname(this.indexPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.indexPath, JSON.stringify(this.index, null, 2));
  }

  extractLinks(content, filePath) {
    const links = [];
    const lines = content.split('\n');
    
    lines.forEach((line, lineIndex) => {
      // Wiki links with optional aliases and block references
      const wikiLinks = line.matchAll(/\[\[([^\]|#]+)(#[^\]|]+)?(?:\|([^\]]+))?\]\]/g);
      for (const match of wikiLinks) {
        const target = match[1].trim();
        const blockRef = match[2] || '';
        const displayText = match[3]?.trim() || target;
        
        links.push({
          type: 'wiki',
          target: target + blockRef,
          targetFile: this.resolveTarget(target, filePath),
          displayText,
          line: lineIndex + 1,
          column: match.index,
          raw: match[0]
        });
      }
      
      // Markdown links to .md files
      const mdLinks = line.matchAll(/\[([^\]]+)\]\(([^)]+\.md[^)]*)\)/g);
      for (const match of mdLinks) {
        links.push({
          type: 'markdown',
          target: match[2],
          targetFile: this.resolveTarget(match[2], filePath),
          displayText: match[1],
          line: lineIndex + 1,
          column: match.index,
          raw: match[0]
        });
      }
      
      // Embeds
      const embeds = line.matchAll(/!\[\[([^\]]+)\]\]/g);
      for (const match of embeds) {
        links.push({
          type: 'embed',
          target: match[1],
          targetFile: this.resolveTarget(match[1], filePath),
          displayText: match[1],
          line: lineIndex + 1,
          column: match.index,
          raw: match[0]
        });
      }
    });
    
    return links;
  }

  resolveTarget(target, sourceFile) {
    // Remove block references for file resolution
    const cleanTarget = target.split('#')[0];
    
    // If it's already a .md file path, use it
    if (cleanTarget.endsWith('.md')) {
      return cleanTarget;
    }
    
    // Otherwise, assume it's a note name and add .md
    return cleanTarget + '.md';
  }

  async buildIndex(progressCallback) {
    if (this.isBuilding) return;
    this.isBuilding = true;
    
    try {
      // Reset index
      this.index = {
        forwardLinks: {},
        backLinks: {},
        linkDetails: {},
        aliases: {},
        lastUpdated: {},
        version: '1.0',
        lastFullScan: new Date().toISOString()
      };
      
      // Scan all markdown files
      const files = await this.scanVault();
      let processed = 0;
      
      for (const file of files) {
        await this.indexFile(file);
        processed++;
        
        if (progressCallback) {
          progressCallback({
            current: processed,
            total: files.length,
            file: file
          });
        }
      }
      
      await this.save();
    } finally {
      this.isBuilding = false;
    }
  }

  async scanVault(dir = '', files = []) {
    const fullDir = path.join(this.config.vaultPath, dir);
    const entries = await fs.readdir(fullDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const relativePath = path.join(dir, entry.name);
      
      if (entry.isDirectory() && !this.shouldIgnore(entry.name)) {
        await this.scanVault(relativePath, files);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(relativePath);
      }
    }
    
    return files;
  }

  shouldIgnore(name) {
    const ignorePatterns = ['.git', '.obsidian', '_archived', ...this.config.ignorePatterns];
    return ignorePatterns.includes(name);
  }

  async indexFile(filePath) {
    try {
      const fullPath = path.join(this.config.vaultPath, filePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      const { data: frontmatter, content: body } = matter(content);
      
      // Extract links
      const links = this.extractLinks(body, filePath);
      
      // Update forward links
      this.index.forwardLinks[filePath] = links.map(l => l.targetFile);
      
      // Update back links and details
      for (const link of links) {
        // Add to backlinks
        if (!this.index.backLinks[link.targetFile]) {
          this.index.backLinks[link.targetFile] = [];
        }
        if (!this.index.backLinks[link.targetFile].includes(filePath)) {
          this.index.backLinks[link.targetFile].push(filePath);
        }
        
        // Store link details
        const detailKey = `${filePath}->${link.targetFile}`;
        if (!this.index.linkDetails[detailKey]) {
          this.index.linkDetails[detailKey] = [];
        }
        this.index.linkDetails[detailKey].push({
          type: link.type,
          displayText: link.displayText,
          line: link.line,
          column: link.column,
          raw: link.raw
        });
      }
      
      // Extract aliases from frontmatter
      if (frontmatter.aliases) {
        const aliases = Array.isArray(frontmatter.aliases) 
          ? frontmatter.aliases 
          : [frontmatter.aliases];
          
        for (const alias of aliases) {
          this.index.aliases[alias] = filePath;
        }
      }
      
      // Update timestamp
      const stats = await fs.stat(fullPath);
      this.index.lastUpdated[filePath] = stats.mtime.toISOString();
      
    } catch (error) {
      console.error(`Error indexing ${filePath}:`, error);
    }
  }

  async updateFileLinks(filePath) {
    // Remove old entries
    this.removeFileFromIndex(filePath);
    
    // Re-index the file
    await this.indexFile(filePath);
    await this.save();
  }

  removeFileFromIndex(filePath) {
    // Remove forward links
    delete this.index.forwardLinks[filePath];
    
    // Remove from other files' backlinks
    for (const [target, sources] of Object.entries(this.index.backLinks)) {
      this.index.backLinks[target] = sources.filter(s => s !== filePath);
      if (this.index.backLinks[target].length === 0) {
        delete this.index.backLinks[target];
      }
    }
    
    // Remove link details
    for (const key of Object.keys(this.index.linkDetails)) {
      if (key.startsWith(filePath + '->')) {
        delete this.index.linkDetails[key];
      }
    }
    
    // Remove aliases
    for (const [alias, target] of Object.entries(this.index.aliases)) {
      if (target === filePath) {
        delete this.index.aliases[alias];
      }
    }
    
    // Remove timestamp
    delete this.index.lastUpdated[filePath];
  }

  getBacklinks(filePath) {
    return this.index.backLinks[filePath] || [];
  }

  getForwardLinks(filePath) {
    return this.index.forwardLinks[filePath] || [];
  }

  async updateLinksOnMove(oldPath, newPath) {
    // Get all files that link to the old path
    const backlinks = this.getBacklinks(oldPath);
    
    // Update forward links from the moved file
    if (this.index.forwardLinks[oldPath]) {
      this.index.forwardLinks[newPath] = this.index.forwardLinks[oldPath];
      delete this.index.forwardLinks[oldPath];
    }
    
    // Update backlinks
    if (this.index.backLinks[oldPath]) {
      this.index.backLinks[newPath] = this.index.backLinks[oldPath];
      delete this.index.backLinks[oldPath];
    }
    
    // Update link details
    const detailsToUpdate = {};
    for (const [key, details] of Object.entries(this.index.linkDetails)) {
      if (key.startsWith(oldPath + '->')) {
        const newKey = key.replace(oldPath, newPath);
        detailsToUpdate[newKey] = details;
        delete this.index.linkDetails[key];
      } else if (key.endsWith('->' + oldPath)) {
        const newKey = key.replace('->' + oldPath, '->' + newPath);
        detailsToUpdate[newKey] = details;
        delete this.index.linkDetails[key];
      }
    }
    Object.assign(this.index.linkDetails, detailsToUpdate);
    
    // Update aliases
    for (const [alias, target] of Object.entries(this.index.aliases)) {
      if (target === oldPath) {
        this.index.aliases[alias] = newPath;
      }
    }
    
    // Update forward links in other files
    for (const [file, links] of Object.entries(this.index.forwardLinks)) {
      if (links.includes(oldPath)) {
        this.index.forwardLinks[file] = links.map(l => l === oldPath ? newPath : l);
      }
    }
    
    await this.save();
    
    return backlinks;
  }

  async findBrokenLinks() {
    const brokenLinks = [];
    const allFiles = new Set(Object.keys(this.index.forwardLinks));
    
    for (const [source, targets] of Object.entries(this.index.forwardLinks)) {
      for (const target of targets) {
        if (!allFiles.has(target)) {
          const details = this.index.linkDetails[`${source}->${target}`] || [];
          brokenLinks.push({
            source,
            target,
            details,
            suggestion: this.findSimilarFile(target, allFiles)
          });
        }
      }
    }
    
    return brokenLinks;
  }

  findSimilarFile(target, allFiles) {
    const targetName = path.basename(target, '.md').toLowerCase();
    let bestMatch = null;
    let bestScore = 0;
    
    for (const file of allFiles) {
      const fileName = path.basename(file, '.md').toLowerCase();
      const score = this.calculateSimilarity(targetName, fileName);
      
      if (score > bestScore && score > 0.7) {
        bestScore = score;
        bestMatch = file;
      }
    }
    
    return bestMatch;
  }

  calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  getStats() {
    const totalFiles = Object.keys(this.index.forwardLinks).length;
    const totalLinks = Object.values(this.index.forwardLinks)
      .reduce((sum, links) => sum + links.length, 0);
    const filesWithBacklinks = Object.keys(this.index.backLinks).length;
    const totalAliases = Object.keys(this.index.aliases).length;
    
    return {
      totalFiles,
      totalLinks,
      filesWithBacklinks,
      totalAliases,
      avgLinksPerFile: totalFiles > 0 ? (totalLinks / totalFiles).toFixed(2) : 0,
      lastUpdated: Math.max(...Object.values(this.index.lastUpdated).map(d => new Date(d).getTime()))
    };
  }
}