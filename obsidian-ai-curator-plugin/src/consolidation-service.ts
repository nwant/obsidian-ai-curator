import { App, Notice, TFile } from 'obsidian';
import { ClaudeCliWrapper, ClaudeCliOptions } from './claude-cli-wrapper';

export interface ConsolidationCandidate {
  files: TFile[];
  reason: string;
  confidence: number;
}

export interface ConsolidationResult {
  title: string;
  content: string;
  archivedFiles: string[];
  metadata: Record<string, any>;
}

export class ConsolidationService {
  private claude: ClaudeCliWrapper;
  private sessionId?: string;

  constructor(
    private app: App,
    private config: {
      model?: 'sonnet' | 'opus' | 'haiku';
      vaultPath: string;
      claudeBinary?: string;
      maxCandidates?: number;
      archiveFolder?: string;
    }
  ) {
    this.claude = new ClaudeCliWrapper(config.claudeBinary);
  }

  /**
   * Analyze notes and find consolidation candidates
   */
  async findCandidates(): Promise<ConsolidationCandidate[]> {
    const files = this.app.vault.getMarkdownFiles();
    console.log(`[ConsolidationService] Found ${files.length} markdown files`);
    
    const prompt = this.buildAnalysisPrompt(files);
    console.log('[ConsolidationService] Prompt length:', prompt.length);

    try {
      console.log('[ConsolidationService] Calling Claude CLI...');
      const response = await this.claude.execute(prompt, {
        model: this.config.model,
        outputFormat: 'json'
        // Temporarily disable MCP tools to test basic functionality
        // tools: ['mcp__obsidian-vault__read_notes', 'mcp__obsidian-vault__find_by_metadata']
      });

      console.log('[ConsolidationService] Response:', response);
      
      const candidates = this.parseCandidates(response.content);
      console.log('[ConsolidationService] Parsed candidates:', candidates);
      
      return candidates;
    } catch (error) {
      console.error('Failed to find consolidation candidates:', error);
      new Notice('Failed to analyze vault for consolidation candidates');
      return [];
    }
  }

  /**
   * Consolidate a set of notes with streaming progress
   */
  async *streamConsolidation(candidate: ConsolidationCandidate): AsyncGenerator<{
    type: 'progress' | 'content' | 'complete' | 'error';
    data: any;
  }> {
    const prompt = await this.buildConsolidationPrompt(candidate);

    try {
      let fullContent = '';
      
      yield { type: 'progress', data: 'Analyzing notes...' };

      const stream = this.claude.stream(prompt, {
        model: this.config.model,
        maxTokens: 8000,
        sessionId: this.sessionId
        // Temporarily disable MCP tools until properly configured
        // tools: [
        //   'mcp__obsidian-vault__read_notes',
        //   'mcp__obsidian-vault__write_note',
        //   'mcp__obsidian-vault__archive_notes'
        // ]
      });

      for await (const chunk of stream) {
        if (chunk.content) {
          fullContent += chunk.content;
          yield { type: 'content', data: chunk.content };
        }
        
        if (chunk.sessionId) {
          this.sessionId = chunk.sessionId;
        }

        if (chunk.usage) {
          yield { 
            type: 'progress', 
            data: `Tokens used: ${chunk.usage.outputTokens} (Cost: ${chunk.usage.cost?.amount || 0} ${chunk.usage.cost?.currency || 'USD'})` 
          };
        }
      }

      // Parse the result
      const result = this.parseConsolidationResult(fullContent);
      yield { type: 'complete', data: result };

    } catch (error) {
      yield { type: 'error', data: error.message };
    }
  }

  /**
   * Execute consolidation (after user approval)
   */
  async executeConsolidation(result: ConsolidationResult): Promise<void> {
    try {
      // Create the new consolidated note
      const newFile = await this.app.vault.create(
        `${result.title}.md`,
        result.content
      );

      // Archive the old files
      const archiveFolder = this.config.archiveFolder || 'Archive';
      
      // Ensure archive folder exists
      if (!this.app.vault.getAbstractFileByPath(archiveFolder)) {
        await this.app.vault.createFolder(archiveFolder);
      }
      
      for (const filePath of result.archivedFiles) {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
          const archivePath = `${archiveFolder}/${file.name}`;
          await this.app.vault.rename(file, archivePath);
        }
      }

      new Notice(`Consolidated ${result.archivedFiles.length} notes into "${result.title}"`);
    } catch (error) {
      console.error('Failed to execute consolidation:', error);
      new Notice('Failed to execute consolidation');
    }
  }

  private buildAnalysisPrompt(files: TFile[]): string {
    // Use maxCandidates from config
    const maxFiles = this.config.maxCandidates || 50;
    const filesToAnalyze = files.slice(0, maxFiles);
    const fileNames = filesToAnalyze.map(f => f.basename);
    
    // Structured prompt for better results
    const prompt = `Analyze these Obsidian note titles and find groups that could be consolidated:

${fileNames.map((name, i) => `${i + 1}. ${name}`).join('\n')}

Look for:
- Similar topics or themes
- Duplicate content (e.g. "Meeting Notes 2024-01-01" and "Team Meeting Jan 1")
- Related templates that could be merged
- Fragmented notes on the same subject

Return ONLY a JSON array with this exact format:
[
  {
    "files": ["exact filename 1", "exact filename 2"],
    "reason": "Brief explanation",
    "confidence": 0.8
  }
]

Important: Use exact filenames from the list above. Only suggest consolidations with confidence > 0.6.`;
    
    return prompt;
  }

  private async buildConsolidationPrompt(candidate: ConsolidationCandidate): Promise<string> {
    const filePaths = candidate.files.map(f => f.path);
    
    // Read file contents
    const fileContents = await Promise.all(
      candidate.files.map(async (file) => {
        try {
          const content = await this.app.vault.read(file);
          return `File: ${file.path}\n\n${content}`;
        } catch (error) {
          console.error(`Failed to read file ${file.path}:`, error);
          return `File: ${file.path}\n\n[Failed to read content]`;
        }
      })
    );
    
    return `Please consolidate these notes into a single, well-structured document:

Files to consolidate:
${filePaths.map(p => `- ${p}`).join('\n')}

Reason: ${candidate.reason}

Note Contents:
${fileContents.join('\n\n---\n\n')}

Instructions:
1. Analyze and merge the content, removing duplicates
2. Create a comprehensive, well-structured note that preserves all unique information
3. Use a natural voice/style
4. Include proper frontmatter with metadata
5. Return the result as JSON with:
   - title: suggested filename (without .md)
   - content: full markdown content including frontmatter
   - archivedFiles: array of original file paths
   - metadata: any important metadata to preserve

The consolidated note should be well-organized and comprehensive.`;
  }

  private parseCandidates(jsonStr: string): ConsolidationCandidate[] {
    try {
      // Handle potential markdown code blocks in response
      let cleanJson = jsonStr;
      if (jsonStr.includes('```json')) {
        const match = jsonStr.match(/```json\s*([\s\S]*?)\s*```/);
        if (match) {
          cleanJson = match[1];
        }
      }
      
      const data = JSON.parse(cleanJson);
      return data.map((item: any) => ({
        files: item.files.map((filename: string) => {
          // Try to find by basename first, then by path
          const file = this.app.vault.getMarkdownFiles().find(f => 
            f.basename === filename || f.path === filename
          );
          return file;
        }).filter(Boolean),
        reason: item.reason,
        confidence: item.confidence
      })).filter((candidate: ConsolidationCandidate) => 
        candidate.files.length >= 2 // Only include candidates with at least 2 valid files
      );
    } catch (error) {
      console.error('Failed to parse candidates:', error);
      console.error('Raw response:', jsonStr);
      return [];
    }
  }

  private parseConsolidationResult(content: string): ConsolidationResult {
    try {
      // Try to extract JSON from the content
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Failed to parse consolidation result:', error);
    }

    // Fallback: treat entire content as the note
    return {
      title: 'Consolidated Note',
      content: content,
      archivedFiles: [],
      metadata: {}
    };
  }
}