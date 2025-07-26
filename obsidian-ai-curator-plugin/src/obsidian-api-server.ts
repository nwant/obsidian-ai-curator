import { App, TFile, Notice, MetadataCache } from 'obsidian';
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
      const tags: Record<string, number> = {};

      if (metadata?.tags) {
        metadata.tags.forEach(tag => {
          tags[tag.tag] = (tags[tag.tag] || 0) + 1;
        });
      }

      this.sendResponse(res, 200, { 
        success: true, 
        data: { path, tags } 
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
}