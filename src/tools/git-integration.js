import simpleGit from 'simple-git';
import path from 'path';
import fs from 'fs/promises';

/**
 * Git integration tools
 */

export async function git_checkpoint(args) {
  const { message } = args;
  
  if (!message) {
    throw new Error('Commit message is required');
  }
  
  // Get vault path from config
  const configPath = path.join(process.cwd(), 'config', process.env.NODE_ENV === 'test' ? 'test-config.json' : 'config.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
  const vaultPath = config.vaultPath;
  
  // If in test mode, return mock success
  if (config.testMode) {
    return {
      success: true,
      testMode: true,
      message,
      commit: 'test-commit-hash',
      filesChanged: 0,
      summary: { changes: 0, insertions: 0, deletions: 0 }
    };
  }
  
  const git = simpleGit(vaultPath);
  
  try {
    // Check if it's a git repository
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      // Initialize git repo if not exists
      await git.init();
      await git.add('.gitignore');
      await git.commit('Initial commit');
    }
    
    // Stage all changes
    await git.add('.');
    
    // Check if there are changes to commit
    const status = await git.status();
    if (status.files.length === 0) {
      return {
        success: true,
        message: 'No changes to commit',
        commit: null
      };
    }
    
    // Create commit
    const commitResult = await git.commit(message);
    
    return {
      success: true,
      message,
      commit: commitResult.commit,
      filesChanged: status.files.length,
      summary: commitResult.summary
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      message
    };
  }
}

export async function git_changes(args = {}) {
  const { since = 'HEAD' } = args;
  
  // Get vault path from config
  const configPath = path.join(process.cwd(), 'config', process.env.NODE_ENV === 'test' ? 'test-config.json' : 'config.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
  const vaultPath = config.vaultPath;
  
  // If in test mode, return mock data
  if (config.testMode) {
    return {
      success: true,
      testMode: true,
      since,
      uncommitted: {
        modified: [],
        created: [],
        deleted: [],
        renamed: []
      },
      commits: [],
      totalChanges: 0,
      totalCommits: 0
    };
  }
  
  const git = simpleGit(vaultPath);
  
  try {
    // Get current status
    const status = await git.status();
    
    // Get log since commit
    const logs = await git.log({
      from: since,
      to: 'HEAD'
    });
    
    return {
      since,
      uncommitted: {
        modified: status.modified,
        created: status.created,
        deleted: status.deleted,
        renamed: status.renamed
      },
      commits: logs.all.map(commit => ({
        hash: commit.hash,
        message: commit.message,
        date: commit.date,
        author: commit.author_name
      })),
      totalChanges: status.files.length,
      totalCommits: logs.total
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      since
    };
  }
}

export async function git_rollback(args) {
  const { commit } = args;
  
  if (!commit) {
    throw new Error('Commit hash is required');
  }
  
  // Get vault path from config
  const configPath = path.join(process.cwd(), 'config', process.env.NODE_ENV === 'test' ? 'test-config.json' : 'config.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
  const vaultPath = config.vaultPath;
  
  // If in test mode, return mock success
  if (config.testMode) {
    return {
      success: true,
      testMode: true,
      commit,
      message: `Successfully rolled back to commit ${commit} (test mode)`
    };
  }
  
  const git = simpleGit(vaultPath);
  
  try {
    // Check for uncommitted changes
    const status = await git.status();
    if (status.files.length > 0) {
      throw new Error('Cannot rollback with uncommitted changes. Please commit or stash changes first.');
    }
    
    // Reset to commit
    await git.reset(['--hard', commit]);
    
    return {
      success: true,
      commit,
      message: `Successfully rolled back to commit ${commit}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      commit
    };
  }
}