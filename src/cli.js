#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import VaultAnalyzer from './vault-analyzer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const program = new Command();

program
  .name('obsidian-curator')
  .description('AI-powered Obsidian note consolidation system')
  .version('0.1.0');

program
  .command('analyze')
  .description('Analyze your Obsidian vault for consolidation opportunities')
  .option('-o, --output <path>', 'Output report to file', 'vault-analysis-report.json')
  .action(async (options) => {
    try {
      const config = await loadConfig();
      const analyzer = new VaultAnalyzer(config);
      const report = await analyzer.analyze();
      
      analyzer.printReport(report);
      
      await fs.writeFile(options.output, JSON.stringify(report, null, 2));
      console.log(`\n${chalk.green('✓')} Report saved to: ${options.output}`);
      
      const { reviewNow } = await inquirer.prompt([{
        type: 'confirm',
        name: 'reviewNow',
        message: 'Would you like to review consolidation candidates now?',
        default: true
      }]);
      
      if (reviewNow) {
        await reviewCandidates(report);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

program
  .command('review')
  .description('Review consolidation candidates from previous analysis')
  .option('-r, --report <path>', 'Report file to review', 'vault-analysis-report.json')
  .action(async (options) => {
    try {
      const reportContent = await fs.readFile(options.report, 'utf-8');
      const report = JSON.parse(reportContent);
      await reviewCandidates(report);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Configure vault path and settings')
  .action(async () => {
    try {
      const config = await loadConfig();
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'vaultPath',
          message: 'Obsidian vault path:',
          default: config.vaultPath,
          validate: async (input) => {
            try {
              const stats = await fs.stat(input);
              return stats.isDirectory() || 'Path must be a directory';
            } catch {
              return 'Path does not exist';
            }
          }
        },
        {
          type: 'number',
          name: 'minNoteLength',
          message: 'Minimum words for complete note:',
          default: config.thresholds.minNoteLength
        },
        {
          type: 'number',
          name: 'similarityScore',
          message: 'Title similarity threshold (0-1):',
          default: config.thresholds.similarityScore,
          validate: (input) => input >= 0 && input <= 1 || 'Must be between 0 and 1'
        }
      ]);
      
      config.vaultPath = answers.vaultPath;
      config.thresholds.minNoteLength = answers.minNoteLength;
      config.thresholds.similarityScore = answers.similarityScore;
      
      const configPath = path.join(__dirname, '..', 'config', 'config.json');
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      
      console.log(chalk.green('✓ Configuration saved'));
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

async function loadConfig() {
  const configPath = path.join(__dirname, '..', 'config', 'config.json');
  const configContent = await fs.readFile(configPath, 'utf-8');
  return JSON.parse(configContent);
}

async function reviewCandidates(report) {
  console.log('\n' + chalk.bold.blue('=== Review Consolidation Candidates ===\n'));
  
  const candidates = [];
  
  if (report.details.fragmentaryNotes.length > 0) {
    candidates.push(...report.details.fragmentaryNotes
      .filter(n => n.candidates && n.candidates.length > 0)
      .map(n => ({
        type: 'fragment',
        source: n,
        description: `Fragment: "${n.title}" (${n.wordCount} words)`
      }))
    );
  }
  
  if (report.details.duplicateCandidates.length > 0) {
    candidates.push(...report.details.duplicateCandidates
      .map(d => ({
        type: 'duplicate',
        source: d,
        description: `Duplicates: "${d.title}" (${d.notes.length} notes)`
      }))
    );
  }
  
  if (candidates.length === 0) {
    console.log(chalk.yellow('No consolidation candidates found.'));
    return;
  }
  
  console.log(`Found ${chalk.green(candidates.length)} consolidation opportunities\n`);
  
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    console.log(chalk.bold(`\n[${i + 1}/${candidates.length}] ${candidate.description}`));
    
    if (candidate.type === 'fragment') {
      console.log(`Path: ${candidate.source.path}`);
      console.log('Potential consolidation targets:');
      candidate.source.candidates.forEach(c => {
        console.log(`  - ${c.title} (${(c.similarity * 100).toFixed(0)}% similar)`);
      });
    } else if (candidate.type === 'duplicate') {
      console.log('Notes with this title:');
      candidate.source.notes.forEach(n => {
        console.log(`  - ${n.path} (${n.wordCount} words)`);
      });
    }
    
    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: 'Mark for consolidation', value: 'consolidate' },
        { name: 'Skip', value: 'skip' },
        { name: 'View notes', value: 'view' },
        { name: 'Stop reviewing', value: 'stop' }
      ]
    }]);
    
    if (action === 'stop') break;
    
    if (action === 'view') {
      await viewNotes(candidate);
      i--; 
    } else if (action === 'consolidate') {
      await markForConsolidation(candidate);
    }
  }
  
  console.log('\n' + chalk.green('Review complete!'));
}

async function viewNotes(candidate) {
  const config = await loadConfig();
  
  if (candidate.type === 'fragment') {
    const notePath = path.join(config.vaultPath, candidate.source.path);
    const content = await fs.readFile(notePath, 'utf-8');
    console.log('\n' + chalk.bold('Fragment content:'));
    console.log(chalk.dim('---'));
    console.log(content);
    console.log(chalk.dim('---'));
  } else if (candidate.type === 'duplicate') {
    for (const note of candidate.source.notes) {
      const notePath = path.join(config.vaultPath, note.path);
      const content = await fs.readFile(notePath, 'utf-8');
      console.log('\n' + chalk.bold(`Content of ${note.path}:`));
      console.log(chalk.dim('---'));
      console.log(content.substring(0, 500) + (content.length > 500 ? '...' : ''));
      console.log(chalk.dim('---'));
    }
  }
  
  await inquirer.prompt([{
    type: 'input',
    name: 'continue',
    message: 'Press Enter to continue...'
  }]);
}

async function markForConsolidation(candidate) {
  const consolidationQueuePath = path.join(__dirname, '..', 'consolidation-queue.json');
  
  let queue = [];
  try {
    const existing = await fs.readFile(consolidationQueuePath, 'utf-8');
    queue = JSON.parse(existing);
  } catch {
  }
  
  queue.push({
    timestamp: new Date().toISOString(),
    type: candidate.type,
    data: candidate.source
  });
  
  await fs.writeFile(consolidationQueuePath, JSON.stringify(queue, null, 2));
  console.log(chalk.green('✓ Marked for consolidation'));
}

program.parse(process.argv);

if (process.argv.length === 2) {
  program.outputHelp();
}