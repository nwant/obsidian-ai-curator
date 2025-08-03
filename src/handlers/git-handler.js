/**
 * Git operations handler for MCP server
 * Handles version control operations within the vault
 */

import { git_checkpoint, git_changes, git_rollback } from '../tools/git-integration.js';

export class GitHandler {
  constructor(config) {
    this.config = config;
  }

  /**
   * Create a git checkpoint
   */
  async createCheckpoint({ message }) {
    return git_checkpoint({ message });
  }

  /**
   * Get git changes
   */
  async getChanges({ since = 'HEAD' }) {
    return git_changes({ since });
  }

  /**
   * Rollback to a commit
   */
  async rollback({ commit }) {
    return git_rollback({ commit });
  }
}