import { App, TFile, Notice, MetadataCache, getAllTags } from 'obsidian';
import * as http from 'http';
import { IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { openApiSpec } from './openapi-spec';

interface APIResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export class ObsidianAPIServer {
  private server: http.Server | null = null;
  private port: number;
  private isRunning: boolean = false;

  constructor(
    private app: App,
    port: number = 3001
  ) {
    this.port = port;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('API server already running');
      return;
    }

    try {
      this.server = http.createServer((req, res) => {
        // CORS headers for localhost only
        res.setHeader('Access-Control-Allow-Origin', 'http://localhost:*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        // Handle preflight requests
        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        this.handleRequest(req, res);
      });

      await new Promise<void>((resolve, reject) => {
        this.server!.on('error', reject);
        this.server!.listen(this.port, 'localhost', () => {
          console.log(`Obsidian API server listening on http://localhost:${this.port}`);
          this.isRunning = true;
          resolve();
        });
      });

      new Notice(`API server started on port ${this.port}`);
    } catch (error) {
      console.error('Failed to start API server:', error);
      new Notice('Failed to start API server: ' + error.message);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.server || !this.isRunning) {
      return;
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        console.log('API server stopped');
        this.isRunning = false;
        resolve();
      });
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url || '', `http://localhost:${this.port}`);
    
    // Only allow GET requests for now (read-only operations)
    if (req.method !== 'GET') {
      this.sendResponse(res, 405, { 
        success: false, 
        error: 'Method not allowed' 
      });
      return;
    }

    try {
      switch (url.pathname) {
        case '/':
          this.handleRoot(res);
          break;

        case '/docs':
          this.handleSwaggerUI(res);
          break;

        case '/swagger.json':
          this.handleSwaggerJSON(res);
          break;

        case '/health':
          this.sendResponse(res, 200, { 
            success: true, 
            data: { 
              status: 'ok', 
              version: '1.0.0',
              vault: this.app.vault.getName() 
            } 
          });
          break;

        case '/api/search':
          await this.handleSearch(url.searchParams, res);
          break;

        case '/api/tags':
          await this.handleTags(url.searchParams, res);
          break;

        case '/api/links':
          await this.handleLinks(url.searchParams, res);
          break;

        case '/api/metadata':
          await this.handleMetadata(url.searchParams, res);
          break;

        case '/api/vault-info':
          await this.handleVaultInfo(res);
          break;

        case '/api/format-link':
          await this.handleFormatLink(url.searchParams, res);
          break;

        case '/api/resolve-link':
          await this.handleResolveLink(url.searchParams, res);
          break;

        case '/api/rename-file':
          await this.handleRenameFile(url.searchParams, res);
          break;

        case '/api/move-file':
          await this.handleMoveFile(url.searchParams, res);
          break;

        case '/api/rename-tag':
          await this.handleRenameTag(url.searchParams, res);
          break;

        case '/api/find-tag':
          await this.handleFindTag(url.searchParams, res);
          break;

        case '/api/tags/update':
          await this.handleUpdateTags(url.searchParams, res);
          break;

        default:
          this.sendResponse(res, 404, { 
            success: false, 
            error: 'Endpoint not found' 
          });
      }
    } catch (error) {
      console.error('API request error:', error);
      this.sendResponse(res, 500, { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      });
    }
  }

  private async handleSearch(params: URLSearchParams, res: ServerResponse) {
    const query = params.get('query');
    const maxResults = parseInt(params.get('maxResults') || '50');
    const contextLines = parseInt(params.get('contextLines') || '2');

    if (!query) {
      this.sendResponse(res, 400, { 
        success: false, 
        error: 'Missing query parameter' 
      });
      return;
    }

    const files = this.app.vault.getMarkdownFiles();
    const results: any[] = [];
    const lowerQuery = query.toLowerCase();

    for (const file of files) {
      if (results.length >= maxResults) break;

      const content = await this.app.vault.read(file);
      const lines = content.split('\n');
      const matches: any[] = [];

      lines.forEach((line, lineIndex) => {
        const lowerLine = line.toLowerCase();
        let startIndex = 0;
        let matchIndex = lowerLine.indexOf(lowerQuery, startIndex);

        while (matchIndex !== -1) {
          matches.push({
            line: lineIndex + 1,
            text: line,
            start: matchIndex,
            end: matchIndex + query.length
          });

          startIndex = matchIndex + 1;
          matchIndex = lowerLine.indexOf(lowerQuery, startIndex);
        }
      });

      if (matches.length > 0) {
        const score = matches.length + (1 / (matches[0].line + 1));
        results.push({
          path: file.path,
          basename: file.basename,
          matches: matches.slice(0, 5), // Limit matches per file
          score,
          context: this.getSearchContext(lines, matches.slice(0, 3), contextLines)
        });
      }
    }

    results.sort((a, b) => b.score - a.score);

    this.sendResponse(res, 200, { 
      success: true, 
      data: results.slice(0, maxResults) 
    });
  }

  private async handleTags(params: URLSearchParams, res: ServerResponse) {
    const path = params.get('path');
    const metadataCache = this.app.metadataCache;

    if (path) {
      // Get tags for specific file
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        this.sendResponse(res, 404, { 
          success: false, 
          error: 'File not found' 
        });
        return;
      }

      const metadata = metadataCache.getFileCache(file);
      
      // Use getAllTags function to get all tags from the file (frontmatter + inline)
      const allTags = getAllTags(metadata);
      const tags: string[] = allTags || [];
      
      // Also get tag counts for consistency
      const tagCounts: Record<string, number> = {};
      if (metadata?.tags) {
        metadata.tags.forEach(tag => {
          tagCounts[tag.tag] = (tagCounts[tag.tag] || 0) + 1;
        });
      }

      this.sendResponse(res, 200, { 
        success: true, 
        data: { 
          path, 
          tags: tags,  // Array of all tags (includes frontmatter and inline)
          tagCounts: tagCounts  // Object with tag counts
        } 
      });
    } else {
      // Get all tags in vault
      const tagCounts = (metadataCache as any).getTags();
      this.sendResponse(res, 200, { 
        success: true, 
        data: { tags: tagCounts } 
      });
    }
  }

  private async handleLinks(params: URLSearchParams, res: ServerResponse) {
    const path = params.get('path');
    const type = params.get('type') || 'both';

    if (!path) {
      this.sendResponse(res, 400, { 
        success: false, 
        error: 'Missing path parameter' 
      });
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      this.sendResponse(res, 404, { 
        success: false, 
        error: 'File not found' 
      });
      return;
    }

    const metadataCache = this.app.metadataCache;
    const result: any = { path };

    if (type === 'outgoing' || type === 'both') {
      const metadata = metadataCache.getFileCache(file);
      const outgoingLinks: string[] = [];

      if (metadata?.links) {
        metadata.links.forEach(link => {
          const linkedFile = metadataCache.getFirstLinkpathDest(link.link, file.path);
          if (linkedFile) {
            outgoingLinks.push(linkedFile.path);
          }
        });
      }

      result.outgoingLinks = [...new Set(outgoingLinks)];
    }

    if (type === 'backlinks' || type === 'both') {
      const backlinks: string[] = [];
      const resolvedLinks = metadataCache.resolvedLinks;

      for (const [sourcePath, links] of Object.entries(resolvedLinks)) {
        if (links[file.path]) {
          backlinks.push(sourcePath);
        }
      }

      result.backlinks = backlinks;
    }

    this.sendResponse(res, 200, { 
      success: true, 
      data: result 
    });
  }

  private async handleMetadata(params: URLSearchParams, res: ServerResponse) {
    const paths = params.get('paths')?.split(',').filter(p => p.trim());

    if (!paths || paths.length === 0) {
      this.sendResponse(res, 400, { 
        success: false, 
        error: 'Missing paths parameter' 
      });
      return;
    }

    const metadataCache = this.app.metadataCache;
    const results: any[] = [];

    for (const path of paths) {
      const file = this.app.vault.getAbstractFileByPath(path.trim());
      if (file instanceof TFile) {
        const metadata = metadataCache.getFileCache(file);
        results.push({
          path: file.path,
          frontmatter: metadata?.frontmatter || {},
          tags: metadata?.tags?.map(t => t.tag) || [],
          links: metadata?.links?.map(l => l.link) || [],
          headings: metadata?.headings?.map(h => ({
            text: h.heading,
            level: h.level
          })) || []
        });
      }
    }

    this.sendResponse(res, 200, { 
      success: true, 
      data: results 
    });
  }

  private async handleVaultInfo(res: ServerResponse) {
    const files = this.app.vault.getMarkdownFiles();
    const totalSize = files.reduce((acc, file) => acc + file.stat.size, 0);

    this.sendResponse(res, 200, {
      success: true,
      data: {
        name: this.app.vault.getName(),
        fileCount: files.length,
        totalSize,
        adapter: this.app.vault.adapter.constructor.name
      }
    });
  }

  private getSearchContext(lines: string[], matches: any[], contextLines: number): string {
    const contextParts: string[] = [];
    let lastLineIncluded = -1;

    for (const match of matches) {
      const startLine = Math.max(0, match.line - contextLines - 1);
      const endLine = Math.min(lines.length - 1, match.line + contextLines - 1);

      if (startLine > lastLineIncluded + 1) {
        contextParts.push('...');
      }

      for (let i = Math.max(startLine, lastLineIncluded + 1); i <= endLine; i++) {
        contextParts.push(`${i + 1}: ${lines[i]}`);
      }

      lastLineIncluded = endLine;
    }

    return contextParts.join('\n');
  }

  private sendResponse(res: ServerResponse, statusCode: number, data: APIResponse) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private handleRoot(res: ServerResponse) {
    const response = {
      name: 'Obsidian API Server',
      version: '1.0.0',
      docs: `http://localhost:${this.port}/docs`,
      health: `http://localhost:${this.port}/health`
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
  }

  private handleSwaggerJSON(res: ServerResponse) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(openApiSpec));
  }

  private handleSwaggerUI(res: ServerResponse) {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Obsidian API Server - Swagger UI</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.9.0/swagger-ui.css">
  <style>
    body {
      margin: 0;
      padding: 0;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.9.0/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      window.ui = SwaggerUIBundle({
        url: '/swagger.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>
`;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }

  private async handleFormatLink(params: URLSearchParams, res: ServerResponse) {
    const target = params.get('target');
    const alias = params.get('alias');
    const sourcePath = params.get('sourcePath');

    if (!target) {
      this.sendResponse(res, 400, { 
        success: false, 
        error: 'Missing target parameter' 
      });
      return;
    }

    try {
      // Use Obsidian's link formatting
      let formattedLink: string;
      
      if (alias && alias !== target) {
        formattedLink = `[[${target}|${alias}]]`;
      } else {
        formattedLink = `[[${target}]]`;
      }

      // Validate the link can be resolved if sourcePath provided
      let resolvedFile = null;
      if (sourcePath) {
        resolvedFile = this.app.metadataCache.getFirstLinkpathDest(target, sourcePath);
      }

      this.sendResponse(res, 200, { 
        success: true, 
        data: {
          formatted: formattedLink,
          target,
          alias: alias || null,
          resolved: resolvedFile ? resolvedFile.path : null,
          exists: !!resolvedFile
        }
      });
    } catch (error) {
      this.sendResponse(res, 500, { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to format link' 
      });
    }
  }

  private async handleResolveLink(params: URLSearchParams, res: ServerResponse) {
    const linkpath = params.get('linkpath');
    const sourcePath = params.get('sourcePath');

    if (!linkpath || !sourcePath) {
      this.sendResponse(res, 400, { 
        success: false, 
        error: 'Missing linkpath or sourcePath parameter' 
      });
      return;
    }

    try {
      // Use Obsidian's link resolution
      const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
      
      if (resolvedFile) {
        const metadata = this.app.metadataCache.getFileCache(resolvedFile);
        
        this.sendResponse(res, 200, { 
          success: true, 
          data: {
            resolved: true,
            path: resolvedFile.path,
            basename: resolvedFile.basename,
            extension: resolvedFile.extension,
            frontmatter: metadata?.frontmatter || {},
            tags: metadata?.tags?.map(t => t.tag) || []
          }
        });
      } else {
        // Link couldn't be resolved
        this.sendResponse(res, 200, { 
          success: true, 
          data: {
            resolved: false,
            path: null,
            suggestion: this.findSimilarFiles(linkpath)
          }
        });
      }
    } catch (error) {
      this.sendResponse(res, 500, { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to resolve link' 
      });
    }
  }

  private findSimilarFiles(query: string): string[] {
    const files = this.app.vault.getMarkdownFiles();
    const queryLower = query.toLowerCase();
    const suggestions: Array<{file: TFile, score: number}> = [];

    for (const file of files) {
      const nameLower = file.basename.toLowerCase();
      let score = 0;

      // Exact match
      if (nameLower === queryLower) {
        score = 1.0;
      }
      // Contains query
      else if (nameLower.includes(queryLower)) {
        score = 0.7;
      }
      // Query contains name
      else if (queryLower.includes(nameLower)) {
        score = 0.5;
      }

      if (score > 0) {
        suggestions.push({ file, score });
      }
    }

    return suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(s => s.file.basename);
  }

  private async handleRenameFile(params: URLSearchParams, res: ServerResponse) {
    const oldPath = params.get('oldPath');
    const newPath = params.get('newPath');

    if (!oldPath || !newPath) {
      this.sendResponse(res, 400, { 
        success: false, 
        error: 'Missing oldPath or newPath parameter' 
      });
      return;
    }

    try {
      // Get the file
      const file = this.app.vault.getAbstractFileByPath(oldPath);
      
      if (!file || !(file instanceof TFile)) {
        this.sendResponse(res, 404, { 
          success: false, 
          error: 'File not found' 
        });
        return;
      }

      // Perform the rename - Obsidian will automatically update all links
      await this.app.fileManager.renameFile(file, newPath);

      // Get updated file info
      const updatedFile = this.app.vault.getAbstractFileByPath(newPath);
      
      this.sendResponse(res, 200, { 
        success: true, 
        data: {
          oldPath: oldPath,
          newPath: newPath,
          linksUpdated: true, // Obsidian handles this automatically
          file: updatedFile ? {
            path: updatedFile.path,
            name: updatedFile.name
          } : null
        }
      });
    } catch (error) {
      this.sendResponse(res, 500, { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to rename file' 
      });
    }
  }

  private async handleMoveFile(params: URLSearchParams, res: ServerResponse) {
    const sourcePath = params.get('sourcePath');
    const targetPath = params.get('targetPath');

    if (!sourcePath || !targetPath) {
      this.sendResponse(res, 400, { 
        success: false, 
        error: 'Missing sourcePath or targetPath parameter' 
      });
      return;
    }

    try {
      // Get the file
      const file = this.app.vault.getAbstractFileByPath(sourcePath);
      
      if (!file || !(file instanceof TFile)) {
        this.sendResponse(res, 404, { 
          success: false, 
          error: 'File not found' 
        });
        return;
      }

      // Check if target directory exists, create if needed
      const targetDir = targetPath.substring(0, targetPath.lastIndexOf('/'));
      if (targetDir && !this.app.vault.getAbstractFileByPath(targetDir)) {
        await this.app.vault.createFolder(targetDir);
      }

      // Perform the move - Obsidian will automatically update all links
      await this.app.fileManager.renameFile(file, targetPath);

      // Get updated file info
      const movedFile = this.app.vault.getAbstractFileByPath(targetPath);
      
      this.sendResponse(res, 200, { 
        success: true, 
        data: {
          sourcePath: sourcePath,
          targetPath: targetPath,
          linksUpdated: true, // Obsidian handles this automatically
          file: movedFile ? {
            path: movedFile.path,
            name: movedFile.name,
            parent: movedFile.parent?.path
          } : null
        }
      });
    } catch (error) {
      this.sendResponse(res, 500, { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to move file' 
      });
    }
  }

  private async handleRenameTag(params: URLSearchParams, res: ServerResponse) {
    const oldTag = params.get('oldTag');
    const newTag = params.get('newTag');
    const includeInline = params.get('includeInline') !== 'false';
    const includeFrontmatter = params.get('includeFrontmatter') !== 'false';

    if (!oldTag || !newTag) {
      this.sendResponse(res, 400, { 
        success: false, 
        error: 'Missing oldTag or newTag parameter' 
      });
      return;
    }

    try {
      // Normalize tags (remove # for comparison)
      const oldTagClean = oldTag.startsWith('#') ? oldTag.substring(1) : oldTag;
      const newTagClean = newTag.startsWith('#') ? newTag.substring(1) : newTag;

      const files = this.app.vault.getMarkdownFiles();
      let filesModified = 0;
      const changes: any[] = [];

      for (const file of files) {
        let content = await this.app.vault.read(file);
        let modified = false;
        let frontmatterChanges = 0;
        let inlineChanges = 0;

        // Process frontmatter using processFrontMatter API
        if (includeFrontmatter) {
          const metadata = this.app.metadataCache.getFileCache(file);
          if (metadata?.frontmatter?.tags) {
            const tags = metadata.frontmatter.tags;
            if (Array.isArray(tags) && tags.includes(oldTagClean)) {
              // Use processFrontMatter for atomic update
              await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                if (frontmatter.tags && Array.isArray(frontmatter.tags)) {
                  const index = frontmatter.tags.indexOf(oldTagClean);
                  if (index !== -1) {
                    frontmatter.tags[index] = newTagClean;
                    frontmatterChanges++;
                    modified = true;
                  }
                }
              });
              // Re-read content after frontmatter update
              content = await this.app.vault.read(file);
            }
          }
        }

        // Process inline tags
        if (includeInline) {
          const inlineTagRegex = new RegExp(`#${this.escapeRegex(oldTagClean)}(?![a-zA-Z0-9_/-])`, 'g');
          const matches = content.match(inlineTagRegex);
          inlineChanges = matches ? matches.length : 0;

          if (inlineChanges > 0) {
            content = content.replace(inlineTagRegex, `#${newTagClean}`);
            modified = true;
          }
        }

        // Save changes
        if (modified) {
          await this.app.vault.modify(file, content);
          filesModified++;
          changes.push({
            file: file.path,
            frontmatterTags: frontmatterChanges,
            inlineTags: inlineChanges,
            totalChanges: frontmatterChanges + inlineChanges
          });
        }
      }

      this.sendResponse(res, 200, { 
        success: true, 
        data: {
          oldTag: oldTagClean,
          newTag: newTagClean,
          filesModified,
          changes,
          method: 'obsidian-api'
        }
      });
    } catch (error) {
      this.sendResponse(res, 500, { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to rename tag' 
      });
    }
  }

  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async handleUpdateTags(params: URLSearchParams, res: ServerResponse) {
    const path = params.get('path');
    const add = params.get('add')?.split(',').filter(t => t.trim()) || [];
    const remove = params.get('remove')?.split(',').filter(t => t.trim()) || [];
    const replace = params.get('replace')?.split(',').filter(t => t.trim());

    if (!path) {
      this.sendResponse(res, 400, { 
        success: false, 
        error: 'Missing path parameter' 
      });
      return;
    }

    try {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        this.sendResponse(res, 404, { 
          success: false, 
          error: 'File not found' 
        });
        return;
      }

      // Clean input tags (remove hashtags)
      const cleanAdd = add.map(t => t.startsWith('#') ? t.substring(1) : t);
      const cleanRemove = remove.map(t => t.startsWith('#') ? t.substring(1) : t);
      const cleanReplace = replace?.map(t => t.startsWith('#') ? t.substring(1) : t);
      
      let finalTags: string[] = [];
      
      // Use Obsidian's processFrontMatter API for atomic frontmatter updates
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        // Get current tags from frontmatter
        const currentTags = frontmatter.tags || [];
        const cleanCurrentTags = Array.isArray(currentTags) 
          ? currentTags.map(t => typeof t === 'string' && t.startsWith('#') ? t.substring(1) : t)
          : [currentTags].map(t => typeof t === 'string' && t.startsWith('#') ? t.substring(1) : t);
        
        // Calculate new tags
        if (cleanReplace !== undefined) {
          finalTags = cleanReplace;
        } else {
          finalTags = [...cleanCurrentTags];
          // Remove tags
          finalTags = finalTags.filter(tag => !cleanRemove.includes(tag));
          // Add tags
          cleanAdd.forEach(tag => {
            if (!finalTags.includes(tag)) {
              finalTags.push(tag);
            }
          });
        }
        
        // Update frontmatter object
        if (finalTags.length > 0) {
          frontmatter.tags = finalTags;
        } else {
          // Remove tags field if empty
          delete frontmatter.tags;
        }
        
        // Add modified timestamp
        frontmatter.modified = new Date().toISOString();
      });
      
      this.sendResponse(res, 200, { 
        success: true, 
        data: {
          path,
          tags: finalTags,
          added: cleanAdd,
          removed: cleanRemove,
          method: 'obsidian-processFrontMatter'
        }
      });
    } catch (error) {
      this.sendResponse(res, 500, { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to update tags' 
      });
    }
  }

  private async handleFindTag(params: URLSearchParams, res: ServerResponse) {
    const tag = params.get('tag');

    if (!tag) {
      this.sendResponse(res, 400, { 
        success: false, 
        error: 'Missing tag parameter' 
      });
      return;
    }

    try {
      // Normalize tag (remove # for comparison)
      const tagClean = tag.startsWith('#') ? tag.substring(1) : tag;
      const files = this.app.vault.getMarkdownFiles();
      const filesWithTag: string[] = [];

      for (const file of files) {
        let hasTag = false;

        // Check frontmatter tags
        const metadata = this.app.metadataCache.getFileCache(file);
        if (metadata?.frontmatter?.tags) {
          const tags = metadata.frontmatter.tags;
          if (Array.isArray(tags)) {
            hasTag = tags.includes(tagClean);
          } else if (typeof tags === 'string') {
            hasTag = tags === tagClean;
          }
        }

        // Check inline tags if not found in frontmatter
        if (!hasTag && metadata?.tags) {
          hasTag = metadata.tags.some(t => t.tag === `#${tagClean}`);
        }

        if (hasTag) {
          filesWithTag.push(file.path);
        }
      }

      this.sendResponse(res, 200, { 
        success: true, 
        data: {
          tag: tagClean,
          files: filesWithTag,
          count: filesWithTag.length
        }
      });
    } catch (error) {
      this.sendResponse(res, 500, { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to find tag' 
      });
    }
  }
}