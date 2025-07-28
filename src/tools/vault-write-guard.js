/**
 * Vault Write Guard
 * Prevents accidental direct writes to the vault, ensuring all operations
 * go through the MCP server tools which apply validations and formatting.
 */

import path from 'path';
import { promises as fs } from 'fs';

export class VaultWriteGuard {
  constructor(config) {
    this.config = config;
    this.vaultPath = path.resolve(config.vaultPath);
    this.enabled = config.vaultWriteGuard?.enabled ?? true;
    this.logViolations = config.vaultWriteGuard?.logViolations ?? true;
  }

  /**
   * Check if a path is within the vault
   */
  isVaultPath(targetPath) {
    const resolvedPath = path.resolve(targetPath);
    return resolvedPath.startsWith(this.vaultPath);
  }

  /**
   * Validate that a write operation should be allowed
   */
  validateWrite(targetPath, source = 'unknown') {
    if (!this.enabled) {
      return { allowed: true };
    }

    if (this.isVaultPath(targetPath)) {
      const violation = {
        allowed: false,
        reason: 'Direct vault write attempted',
        path: targetPath,
        source: source,
        suggestion: 'Use MCP server tools (write_note, update_tags, etc.) instead',
        timestamp: new Date().toISOString()
      };

      if (this.logViolations) {
        this.logViolation(violation);
      }

      return violation;
    }

    return { allowed: true };
  }

  /**
   * Log write violations for debugging
   */
  async logViolation(violation) {
    const logPath = path.join(path.dirname(this.config.vaultPath), 'vault-write-violations.log');
    const logEntry = `${violation.timestamp} - ${violation.source}: Attempted write to ${violation.path}\n`;
    
    try {
      await fs.appendFile(logPath, logEntry, 'utf-8');
    } catch (error) {
      console.error('Failed to log vault write violation:', error);
    }
  }

  /**
   * Get a user-friendly error message
   */
  getErrorMessage(validation) {
    return `
❌ Direct vault write blocked!

Attempted to write to: ${validation.path}

This operation was blocked because direct writes bypass:
- Tag validation and intelligence
- Date/timestamp management  
- Link formatting to wikilinks
- Vault conventions

${validation.suggestion}

Available MCP tools:
- write_note: Create or update notes with full validation
- update_tags: Modify tags with intelligence
- update_frontmatter: Update metadata
- append_to_daily_note: Add to daily notes
`;
  }

  /**
   * Create a middleware for validating operations
   */
  createMiddleware() {
    return {
      beforeWrite: (targetPath, source) => {
        const validation = this.validateWrite(targetPath, source);
        if (!validation.allowed) {
          throw new Error(this.getErrorMessage(validation));
        }
        return validation;
      }
    };
  }
}

/**
 * Helper to check if we're about to write to vault
 */
export function checkVaultWrite(config, targetPath) {
  const guard = new VaultWriteGuard(config);
  return guard.validateWrite(targetPath, 'manual-check');
}