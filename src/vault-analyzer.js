import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import chalk from 'chalk';
import ora from 'ora';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class VaultAnalyzer {
  constructor(config) {
    this.config = config;
    this.stats = {
      totalFiles: 0,
      totalSize: 0,
      filesByExtension: {},
      fragmentaryNotes: [],
      duplicateCandidates: [],
      similarTitles: [],
      emptyNotes: [],
      largeNotes: []
    };
    this.notes = [];
  }

  async analyze() {
    const spinner = ora('Analyzing vault...').start();
    
    try {
      await this.scanVault(this.config.vaultPath);
      await this.findDuplicates();
      await this.findFragments();
      spinner.succeed('Vault analysis complete');
      return this.generateReport();
    } catch (error) {
      spinner.fail('Analysis failed');
      throw error;
    }
  }

  async scanVault(dirPath, relativePath = '') {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relPath = path.join(relativePath, entry.name);
      
      if (this.shouldIgnore(relPath)) continue;
      
      if (entry.isDirectory()) {
        await this.scanVault(fullPath, relPath);
      } else if (entry.name.endsWith('.md')) {
        await this.analyzeNote(fullPath, relPath);
      }
    }
  }

  shouldIgnore(filePath) {
    return this.config.ignorePatterns.some(pattern => 
      filePath.includes(pattern)
    );
  }

  async analyzeNote(fullPath, relativePath) {
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const stats = await fs.stat(fullPath);
      const { data: frontmatter, content: body } = matter(content);
      
      const note = {
        path: relativePath,
        fullPath,
        size: stats.size,
        modified: stats.mtime,
        frontmatter,
        content: body,
        wordCount: body.split(/\s+/).filter(word => word.length > 0).length,
        title: this.extractTitle(body, relativePath),
        headings: this.extractHeadings(body),
        links: this.extractLinks(body)
      };
      
      this.notes.push(note);
      this.updateStats(note);
      
    } catch (error) {
      console.error(`Error analyzing ${relativePath}:`, error.message);
    }
  }

  extractTitle(content, filePath) {
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match) return h1Match[1].trim();
    
    const fileName = path.basename(filePath, '.md');
    return fileName;
  }

  extractHeadings(content) {
    const headings = [];
    const regex = /^(#{1,6})\s+(.+)$/gm;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      headings.push({
        level: match[1].length,
        text: match[2].trim()
      });
    }
    
    return headings;
  }

  extractLinks(content) {
    const links = [];
    const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
    const mdLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    
    while ((match = wikiLinkRegex.exec(content)) !== null) {
      links.push({ type: 'wiki', target: match[1] });
    }
    
    while ((match = mdLinkRegex.exec(content)) !== null) {
      if (!match[2].startsWith('http')) {
        links.push({ type: 'markdown', target: match[2], text: match[1] });
      }
    }
    
    return links;
  }

  updateStats(note) {
    this.stats.totalFiles++;
    this.stats.totalSize += note.size;
    
    if (note.wordCount === 0) {
      this.stats.emptyNotes.push(note);
    } else if (note.wordCount < this.config.thresholds.minNoteLength) {
      this.stats.fragmentaryNotes.push(note);
    } else if (note.wordCount > this.config.thresholds.maxFragmentLength * 2) {
      this.stats.largeNotes.push(note);
    }
  }

  async findDuplicates() {
    const titleGroups = {};
    
    for (const note of this.notes) {
      const normalizedTitle = this.normalizeTitle(note.title);
      if (!titleGroups[normalizedTitle]) {
        titleGroups[normalizedTitle] = [];
      }
      titleGroups[normalizedTitle].push(note);
    }
    
    for (const [title, notes] of Object.entries(titleGroups)) {
      if (notes.length > 1) {
        this.stats.duplicateCandidates.push({
          title,
          notes: notes.map(n => ({
            path: n.path,
            wordCount: n.wordCount,
            modified: n.modified
          }))
        });
      }
    }
    
    this.findSimilarTitles();
  }

  normalizeTitle(title) {
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  findSimilarTitles() {
    const titles = this.notes.map(n => ({ title: n.title, path: n.path }));
    
    for (let i = 0; i < titles.length; i++) {
      for (let j = i + 1; j < titles.length; j++) {
        const similarity = this.calculateSimilarity(
          titles[i].title.toLowerCase(),
          titles[j].title.toLowerCase()
        );
        
        if (similarity > this.config.thresholds.similarityScore) {
          this.stats.similarTitles.push({
            note1: titles[i],
            note2: titles[j],
            similarity
          });
        }
      }
    }
  }

  calculateSimilarity(str1, str2) {
    const words1 = new Set(str1.split(/\s+/));
    const words2 = new Set(str2.split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  async findFragments() {
    for (const note of this.notes) {
      if (note.wordCount < this.config.thresholds.minNoteLength && note.wordCount > 0) {
        const relatedNotes = this.findRelatedNotes(note);
        if (relatedNotes.length > 0) {
          note.consolidationCandidates = relatedNotes;
        }
      }
    }
  }

  findRelatedNotes(targetNote) {
    const related = [];
    const targetWords = new Set(
      targetNote.content.toLowerCase().split(/\s+/)
        .filter(w => w.length > 3)
    );
    
    for (const note of this.notes) {
      if (note.path === targetNote.path) continue;
      
      const noteWords = new Set(
        note.content.toLowerCase().split(/\s+/)
          .filter(w => w.length > 3)
      );
      
      const commonWords = [...targetWords].filter(w => noteWords.has(w));
      const similarity = commonWords.length / targetWords.size;
      
      if (similarity > 0.3) {
        related.push({
          path: note.path,
          title: note.title,
          similarity
        });
      }
    }
    
    return related.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
  }

  generateReport() {
    const report = {
      summary: {
        totalNotes: this.stats.totalFiles,
        totalSize: this.formatBytes(this.stats.totalSize),
        averageNoteSize: this.formatBytes(this.stats.totalSize / this.stats.totalFiles),
        emptyNotes: this.stats.emptyNotes.length,
        fragmentaryNotes: this.stats.fragmentaryNotes.length,
        largeNotes: this.stats.largeNotes.length,
        duplicateCandidates: this.stats.duplicateCandidates.length,
        similarTitles: this.stats.similarTitles.length
      },
      details: {
        fragmentaryNotes: this.stats.fragmentaryNotes
          .sort((a, b) => a.wordCount - b.wordCount)
          .slice(0, 10)
          .map(n => ({
            path: n.path,
            title: n.title,
            wordCount: n.wordCount,
            candidates: n.consolidationCandidates
          })),
        duplicateCandidates: this.stats.duplicateCandidates.slice(0, 10),
        similarTitles: this.stats.similarTitles.slice(0, 10),
        emptyNotes: this.stats.emptyNotes.map(n => n.path)
      }
    };
    
    return report;
  }

  formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  printReport(report) {
    console.log('\n' + chalk.bold.blue('=== Vault Analysis Report ===\n'));
    
    console.log(chalk.bold('Summary:'));
    console.log(`Total Notes: ${chalk.green(report.summary.totalNotes)}`);
    console.log(`Total Size: ${chalk.green(report.summary.totalSize)}`);
    console.log(`Average Note Size: ${chalk.green(report.summary.averageNoteSize)}`);
    console.log(`Empty Notes: ${chalk.yellow(report.summary.emptyNotes)}`);
    console.log(`Fragmentary Notes: ${chalk.yellow(report.summary.fragmentaryNotes)}`);
    console.log(`Large Notes: ${chalk.yellow(report.summary.largeNotes)}`);
    console.log(`Duplicate Candidates: ${chalk.red(report.summary.duplicateCandidates)}`);
    console.log(`Similar Titles: ${chalk.red(report.summary.similarTitles)}`);
    
    if (report.details.fragmentaryNotes.length > 0) {
      console.log('\n' + chalk.bold('Top Fragmentary Notes:'));
      report.details.fragmentaryNotes.forEach(note => {
        console.log(`\n${chalk.cyan(note.path)}`);
        console.log(`  Title: ${note.title}`);
        console.log(`  Words: ${note.wordCount}`);
        if (note.candidates && note.candidates.length > 0) {
          console.log(`  Consolidation candidates:`);
          note.candidates.forEach(c => {
            console.log(`    - ${c.title} (${(c.similarity * 100).toFixed(0)}% similar)`);
          });
        }
      });
    }
    
    if (report.details.duplicateCandidates.length > 0) {
      console.log('\n' + chalk.bold('Duplicate Title Candidates:'));
      report.details.duplicateCandidates.forEach(group => {
        console.log(`\n"${chalk.cyan(group.title)}"`);
        group.notes.forEach(note => {
          console.log(`  - ${note.path} (${note.wordCount} words)`);
        });
      });
    }
    
    if (report.details.similarTitles.length > 0) {
      console.log('\n' + chalk.bold('Similar Titles:'));
      report.details.similarTitles.forEach(pair => {
        console.log(`\n${(pair.similarity * 100).toFixed(0)}% similar:`);
        console.log(`  - ${pair.note1.title}`);
        console.log(`  - ${pair.note2.title}`);
      });
    }
  }
}

async function main() {
  try {
    const configPath = path.join(__dirname, '..', 'config', 'config.json');
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configContent);
    
    const analyzer = new VaultAnalyzer(config);
    const report = await analyzer.analyze();
    
    analyzer.printReport(report);
    
    const reportPath = path.join(__dirname, '..', 'vault-analysis-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n${chalk.green('✓')} Full report saved to: ${reportPath}`);
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default VaultAnalyzer;