import { spawn } from 'child_process';
import { App } from 'obsidian';

export class GitService {
  private vaultPath: string;
  
  constructor(app: App) {
    this.vaultPath = (app.vault as any).adapter.basePath;
  }

  /**
   * Check if the vault is a git repository
   */
  async isGitRepo(): Promise<boolean> {
    try {
      await this.execGit(['status']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a git checkpoint (add all and commit)
   */
  async createCheckpoint(message: string): Promise<void> {
    try {
      // Stage all changes
      await this.execGit(['add', '-A']);
      
      // Commit with message
      await this.execGit(['commit', '-m', message]);
      
      console.log(`Git checkpoint created: ${message}`);
    } catch (error) {
      console.error('Failed to create git checkpoint:', error);
      throw new Error(`Git commit failed: ${error.message}`);
    }
  }

  /**
   * Get the status of the git repository
   */
  async getStatus(): Promise<string> {
    try {
      const output = await this.execGit(['status', '--porcelain']);
      return output;
    } catch (error) {
      throw new Error(`Failed to get git status: ${error.message}`);
    }
  }

  /**
   * Check if there are uncommitted changes
   */
  async hasUncommittedChanges(): Promise<boolean> {
    const status = await this.getStatus();
    return status.trim().length > 0;
  }

  /**
   * Execute a git command
   */
  private execGit(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const git = spawn('git', args, {
        cwd: this.vaultPath,
        shell: false
      });

      let stdout = '';
      let stderr = '';

      git.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      git.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      git.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr || `Git command failed with code ${code}`));
        }
      });

      git.on('error', (error) => {
        reject(new Error(`Failed to execute git: ${error.message}`));
      });
    });
  }
}