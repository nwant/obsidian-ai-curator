/**
 * Claude Code Local Executor
 * Runs Claude Code in headless mode locally to implement fixes and features
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

const execAsync = promisify(exec);

/**
 * Check if Claude Code CLI is installed
 */
async function checkClaudeCode() {
  try {
    const { stdout } = await execAsync('claude --version');
    return { 
      installed: true, 
      version: stdout.trim(),
      path: (await execAsync('which claude')).stdout.trim()
    };
  } catch (error) {
    return { 
      installed: false, 
      error: 'Claude Code CLI not found. Install with: npm install -g @anthropic-ai/claude-code' 
    };
  }
}

/**
 * Create a temporary working directory
 */
async function createTempWorkspace(projectName = 'claude-fix') {
  const tempDir = path.join(os.tmpdir(), `claude-code-${projectName}-${uuidv4()}`);
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Clone repository to temporary directory
 */
async function cloneRepository(repoUrl, targetDir, branch = 'main') {
  // Clone the repository
  await execAsync(`git clone ${repoUrl} .`, { cwd: targetDir });
  
  // Checkout main/master branch
  try {
    await execAsync(`git checkout ${branch}`, { cwd: targetDir });
  } catch {
    // Try master if main doesn't exist
    await execAsync('git checkout master', { cwd: targetDir });
  }
  
  return targetDir;
}

/**
 * Execute Claude Code in headless mode with a prompt
 */
async function runClaudeCode(workDir, prompt, options = {}) {
  const {
    model = 'claude-3-opus-20240229',  // Default to Opus for complex tasks
    maxIterations = 10,
    timeout = 600000,  // 10 minutes default
    verbose = false,
    skipPermissions = false
  } = options;

  return new Promise((resolve, reject) => {
    // Build the command
    let command = 'claude';
    const args = ['-p', prompt];
    
    // Add flags
    if (skipPermissions) {
      args.unshift('--dangerously-skip-permissions');
    }
    
    if (verbose) {
      args.push('--verbose');
    }

    const claudeProcess = spawn(command, args, {
      cwd: workDir,
      env: {
        ...process.env,
        // Set any environment variables needed
      },
      shell: true
    });

    let output = '';
    let errorOutput = '';
    const timer = setTimeout(() => {
      claudeProcess.kill();
      reject(new Error(`Claude Code execution timed out after ${timeout}ms`));
    }, timeout);

    claudeProcess.stdout.on('data', (data) => {
      output += data.toString();
      if (verbose) {
        console.log('[Claude]:', data.toString());
      }
    });

    claudeProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
      if (verbose) {
        console.error('[Claude Error]:', data.toString());
      }
    });

    claudeProcess.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({
          success: true,
          output,
          workDir
        });
      } else {
        reject(new Error(`Claude exited with code ${code}: ${errorOutput}`));
      }
    });

    claudeProcess.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Create a branch and commit changes
 */
async function createBranchAndCommit(workDir, branchName, commitMessage) {
  // Create and checkout new branch
  await execAsync(`git checkout -b ${branchName}`, { cwd: workDir });
  
  // Stage all changes
  await execAsync('git add -A', { cwd: workDir });
  
  // Check if there are changes to commit
  const { stdout: status } = await execAsync('git status --porcelain', { cwd: workDir });
  
  if (!status.trim()) {
    return { hasChanges: false };
  }
  
  // Commit changes
  await execAsync(`git commit -m "${commitMessage}"`, { cwd: workDir });
  
  // Get commit hash
  const { stdout: commitHash } = await execAsync('git rev-parse HEAD', { cwd: workDir });
  
  return {
    hasChanges: true,
    commitHash: commitHash.trim(),
    branch: branchName
  };
}

/**
 * Push branch and create PR
 */
async function pushAndCreatePR(workDir, branch, title, body, options = {}) {
  const { labels = [], assignees = [], draft = false } = options;
  
  // Push the branch
  await execAsync(`git push origin ${branch}`, { cwd: workDir });
  
  // Build PR creation command
  const prArgs = [
    'gh pr create',
    `--title "${title}"`,
    `--body "${body}"`,
    `--head ${branch}`
  ];
  
  if (labels.length > 0) {
    prArgs.push(`--label ${labels.join(',')}`);
  }
  
  if (assignees.length > 0) {
    prArgs.push(`--assignee ${assignees.join(',')}`);
  }
  
  if (draft) {
    prArgs.push('--draft');
  }
  
  const { stdout } = await execAsync(prArgs.join(' '), { cwd: workDir });
  const prUrl = stdout.trim();
  
  return {
    prUrl,
    branch
  };
}

/**
 * Main execution function for bug fixes
 */
export async function execute_claude_code_fix(args) {
  const {
    issueNumber,
    issueTitle,
    issueBody,
    errorDetails = null,
    customPrompt = null,
    skipPermissions = true  // Default to skipping permissions for automation
  } = args;

  // Check Claude Code installation
  const claudeCheck = await checkClaudeCode();
  if (!claudeCheck.installed) {
    throw new Error(claudeCheck.error);
  }

  // Get repository info
  const { stdout: repoUrl } = await execAsync('git remote get-url origin');
  const cleanRepoUrl = repoUrl.trim();
  
  // Create temp workspace
  const workDir = await createTempWorkspace(`fix-${issueNumber}`);
  
  try {
    // Clone repository
    await cloneRepository(cleanRepoUrl, workDir);
    
    // Install dependencies
    await execAsync('npm install', { cwd: workDir });
    
    // Build the prompt for Claude Code
    const prompt = customPrompt || `
You are fixing issue #${issueNumber}: ${issueTitle}

Issue Description:
${issueBody}

${errorDetails ? `Error Details:\n${JSON.stringify(errorDetails, null, 2)}\n` : ''}

Instructions:
1. Analyze the issue and identify the root cause
2. Implement a robust fix that handles edge cases
3. Add or update tests to prevent regression
4. Ensure all existing tests pass (run: npm test)
5. Update documentation if needed

Important:
- Follow existing code patterns in the project
- Write clean, well-documented code
- Test your changes thoroughly
- Make atomic commits with clear messages

After making changes, verify everything works by running:
- npm test (all tests should pass)
- npm run test:coverage (maintain or improve coverage)
`;

    // Execute Claude Code
    console.log(`Running Claude to fix issue #${issueNumber}...`);
    const result = await runClaudeCode(workDir, prompt, {
      maxIterations: 15,
      verbose: true,
      skipPermissions
    });
    
    // Create branch and commit
    const branchName = `claude-fix-${issueNumber}`;
    const commitMessage = `fix: Resolve issue #${issueNumber} - ${issueTitle}

Automated fix by Claude Code.
Closes #${issueNumber}`;
    
    const commitResult = await createBranchAndCommit(workDir, branchName, commitMessage);
    
    if (!commitResult.hasChanges) {
      return {
        success: false,
        message: 'No changes were made by Claude',
        workDir
      };
    }
    
    // Push and create PR
    const prBody = `## Automated Fix for Issue #${issueNumber}

This PR was automatically generated by Claude Code running locally in headless mode.

### Changes Made
${result.output.slice(-2000)}  // Last 2000 chars of output

### Testing
- [ ] All tests pass
- [ ] No new issues introduced
- [ ] Documentation updated if needed

Closes #${issueNumber}

---
*Generated by Obsidian AI Curator MCP Server*`;
    
    const prResult = await pushAndCreatePR(
      workDir,
      branchName,
      `Fix: ${issueTitle}`,
      prBody,
      {
        labels: ['automated-fix', 'claude-code'],
        assignees: ['nwant']
      }
    );
    
    return {
      success: true,
      prUrl: prResult.prUrl,
      branch: prResult.branch,
      workDir,
      issueNumber
    };
    
  } catch (error) {
    // Clean up on error
    try {
      await fs.rm(workDir, { recursive: true, force: true });
    } catch {}
    
    throw error;
  }
}

/**
 * Main execution function for feature implementation
 */
export async function execute_claude_code_feature(args) {
  const {
    featureName,
    description,
    specifications = '',
    designDecisions = [],
    acceptanceCriteria = [],
    technicalRequirements = [],
    customPrompt = null,
    skipPermissions = true
  } = args;

  // Check Claude Code installation
  const claudeCheck = await checkClaudeCode();
  if (!claudeCheck.installed) {
    throw new Error(claudeCheck.error);
  }

  // Get repository info
  const { stdout: repoUrl } = await execAsync('git remote get-url origin');
  const cleanRepoUrl = repoUrl.trim();
  
  // Create temp workspace
  const safeFeatureName = featureName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const workDir = await createTempWorkspace(`feature-${safeFeatureName}`);
  
  try {
    // Clone repository
    await cloneRepository(cleanRepoUrl, workDir);
    
    // Install dependencies
    await execAsync('npm install', { cwd: workDir });
    
    // Build the prompt for Claude Code
    const prompt = customPrompt || `
You are implementing a new feature: ${featureName}

Description:
${description}

${specifications ? `Specifications:\n${specifications}\n` : ''}

${designDecisions.length > 0 ? `Design Decisions:\n${designDecisions.map(d => `- ${d}`).join('\n')}\n` : ''}

${acceptanceCriteria.length > 0 ? `Acceptance Criteria:\n${acceptanceCriteria.map(ac => `- ${ac}`).join('\n')}\n` : ''}

${technicalRequirements.length > 0 ? `Technical Requirements:\n${technicalRequirements.map(req => `- ${req}`).join('\n')}\n` : ''}

Instructions:
1. Implement the feature following the specifications
2. Create comprehensive tests for all new functionality
3. Update documentation including README if needed
4. Ensure backward compatibility
5. Follow existing code patterns and style

Important:
- Write clean, modular, well-documented code
- Add JSDoc comments for all new functions
- Create both unit and integration tests
- Update the MCP_TOOLS.md documentation if adding new tools

Verify your implementation:
- Run: npm test (all tests should pass)
- Run: npm run test:coverage (maintain or improve coverage)
- Test the feature manually to ensure it works as expected
`;

    // Execute Claude Code
    console.log(`Running Claude to implement feature: ${featureName}...`);
    const result = await runClaudeCode(workDir, prompt, {
      maxIterations: 20,  // More iterations for features
      verbose: true,
      timeout: 900000,  // 15 minutes for features
      skipPermissions
    });
    
    // Create branch and commit
    const branchName = `feature-${safeFeatureName}`;
    const commitMessage = `feat: Implement ${featureName}

${description}

Automated implementation by Claude Code.`;
    
    const commitResult = await createBranchAndCommit(workDir, branchName, commitMessage);
    
    if (!commitResult.hasChanges) {
      return {
        success: false,
        message: 'No changes were made by Claude',
        workDir
      };
    }
    
    // Push and create PR
    const prBody = `## New Feature: ${featureName}

This PR was automatically generated by Claude Code running locally in headless mode.

### Description
${description}

${acceptanceCriteria.length > 0 ? `### Acceptance Criteria\n${acceptanceCriteria.map(ac => `- [ ] ${ac}`).join('\n')}` : ''}

### Implementation Details
${result.output.slice(-3000)}  // Last 3000 chars of output

### Testing
- [ ] All tests pass
- [ ] New tests added for feature
- [ ] Documentation updated
- [ ] Backward compatibility maintained

---
*Generated by Obsidian AI Curator MCP Server*`;
    
    const prResult = await pushAndCreatePR(
      workDir,
      branchName,
      `Feature: ${featureName}`,
      prBody,
      {
        labels: ['enhancement', 'automated-feature', 'claude-code'],
        assignees: ['nwant'],
        draft: true  // Features as draft for review
      }
    );
    
    return {
      success: true,
      prUrl: prResult.prUrl,
      branch: prResult.branch,
      workDir,
      featureName
    };
    
  } catch (error) {
    // Clean up on error
    try {
      await fs.rm(workDir, { recursive: true, force: true });
    } catch {}
    
    throw error;
  }
}

/**
 * Clean up temporary directories
 */
export async function cleanup_temp_directories() {
  const tempDir = os.tmpdir();
  const { stdout } = await execAsync(`ls -d ${tempDir}/claude-code-* 2>/dev/null || true`);
  
  const dirs = stdout.trim().split('\n').filter(Boolean);
  let cleaned = 0;
  
  for (const dir of dirs) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
      cleaned++;
    } catch {}
  }
  
  return {
    cleaned,
    total: dirs.length
  };
}

/**
 * Check Claude Code status and configuration
 */
export async function check_claude_code_status() {
  const claudeCheck = await checkClaudeCode();
  
  if (!claudeCheck.installed) {
    return claudeCheck;
  }
  
  // Skip sessions check as it requires interactive terminal
  // The 'claude sessions' command hangs in non-interactive mode
  claudeCheck.sessions = [];
  claudeCheck.sessionsNote = 'Session check skipped (requires interactive terminal)';
  
  // Check for gh CLI
  try {
    const { stdout } = await execAsync('gh --version');
    claudeCheck.githubCli = stdout.split('\n')[0];
  } catch {
    claudeCheck.githubCli = null;
  }
  
  return claudeCheck;
}

// Export all functions for MCP server
export const claudeCodeTools = {
  execute_claude_code_fix,
  execute_claude_code_feature,
  cleanup_temp_directories,
  check_claude_code_status
};
