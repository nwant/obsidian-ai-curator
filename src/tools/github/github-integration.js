/**
 * GitHub Integration Tools for MCP Server
 * Enables automated issue creation and Claude Code triggering
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { getVaultPath, loadConfig } from '../../utils/config-loader.js';

const execAsync = promisify(exec);

/**
 * Check if GitHub CLI is installed and authenticated
 */
async function checkGitHubCLI() {
  try {
    const { stdout } = await execAsync('gh auth status');
    return { available: true, status: stdout };
  } catch (error) {
    // Check if gh is installed but not authenticated
    try {
      await execAsync('gh --version');
      return { 
        available: false, 
        error: 'GitHub CLI is installed but not authenticated. Run: gh auth login' 
      };
    } catch {
      return { 
        available: false, 
        error: 'GitHub CLI is not installed. Install with: brew install gh' 
      };
    }
  }
}

/**
 * Get the repository info from git remote
 */
async function getRepoInfo() {
  try {
    const { stdout } = await execAsync('git remote get-url origin');
    const url = stdout.trim();
    
    // Parse GitHub URL to get owner/repo
    // Handles both HTTPS and SSH URLs
    let match = url.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
    if (match) {
      return {
        owner: match[1],
        repo: match[2].replace('.git', ''),
        fullName: `${match[1]}/${match[2].replace('.git', '')}`
      };
    }
    
    throw new Error('Could not parse repository URL');
  } catch (error) {
    // Fallback to hardcoded for your project
    return {
      owner: 'nwant',
      repo: 'obsidian-ai-curator',
      fullName: 'nwant/obsidian-ai-curator'
    };
  }
}

/**
 * Create a GitHub issue that will trigger Claude Code
 */
export async function create_github_issue(args) {
  const { title, body, labels = [], assignees = [], milestone = null } = args;
  
  // Check GitHub CLI availability
  const cliCheck = await checkGitHubCLI();
  if (!cliCheck.available) {
    throw new Error(cliCheck.error);
  }
  
  // Get repository info
  const repoInfo = await getRepoInfo();
  
  // Build the gh command
  const cmdParts = [
    'gh', 'issue', 'create',
    '--title', `"${title.replace(/"/g, '\\"')}"`,
    '--body', `"${body.replace(/"/g, '\\"')}"`,
    '--repo', repoInfo.fullName
  ];
  
  if (labels.length > 0) {
    cmdParts.push('--label', labels.map(l => `"${l}"`).join(','));
  }
  
  if (assignees.length > 0) {
    cmdParts.push('--assignee', assignees.map(a => `"${a}"`).join(','));
  }
  
  if (milestone) {
    cmdParts.push('--milestone', `"${milestone}"`);
  }
  
  try {
    const command = cmdParts.join(' ');
    const { stdout, stderr } = await execAsync(command);
    
    if (stderr && !stderr.includes('Creating issue')) {
      console.warn('GitHub CLI warning:', stderr);
    }
    
    const issueUrl = stdout.trim();
    const issueNumber = issueUrl.split('/').pop();
    
    // Check if this will trigger Claude Code workflow
    const willTriggerClaude = labels.some(label => 
      ['claude-fix', 'claude-feature', 'claude-review'].includes(label)
    );
    
    return {
      success: true,
      issueNumber: parseInt(issueNumber),
      issueUrl,
      repository: repoInfo.fullName,
      triggeredWorkflow: willTriggerClaude,
      labels,
      message: willTriggerClaude 
        ? `Issue #${issueNumber} created. Claude Code workflow will start automatically.`
        : `Issue #${issueNumber} created successfully.`
    };
  } catch (error) {
    throw new Error(`Failed to create GitHub issue: ${error.message}`);
  }
}

/**
 * Create a bug report issue from an error
 */
export async function create_bug_report(args) {
  const { 
    error, 
    context, 
    toolName, 
    args: toolArgs,
    stackTrace,
    claudeSessionInfo = {}
  } = args;
  
  const title = `[Bug] ${error?.message || error || 'Unknown error'} in ${toolName || 'unknown tool'}`;
  
  const body = `## 🐛 Bug Report

### Error Details

**Error Message**: \`${error?.message || error || 'Unknown error'}\`

**Tool**: \`${toolName || 'N/A'}\`

**Timestamp**: ${new Date().toISOString()}

### Stack Trace
\`\`\`javascript
${stackTrace || error?.stack || 'No stack trace available'}
\`\`\`

### Context

**Tool Arguments**:
\`\`\`json
${JSON.stringify(toolArgs || {}, null, 2)}
\`\`\`

**Session Context**:
${context || 'No additional context provided'}

### Reproduction Steps

1. Call the \`${toolName}\` tool with the above arguments
2. Error occurs during execution
3. [Additional steps if known]

### Expected Behavior
The tool should execute successfully without errors.

### Actual Behavior
The tool fails with the error shown above.

### Environment
- MCP Server Version: ${await getMCPVersion()}
- Node Version: ${process.version}
- Platform: ${process.platform}
- Claude Session: ${claudeSessionInfo.sessionId || 'N/A'}

### Automated Fix
This issue has been labeled with \`claude-fix\` and will be automatically addressed by Claude Code.

---
*This bug report was automatically generated by Claude Desktop error handling.*
*Issue created at: ${new Date().toISOString()}*`;

  return await create_github_issue({
    title,
    body,
    labels: ['claude-fix', 'bug', 'auto-generated'],
    assignees: ['nwant']
  });
}

/**
 * Document a design decision in the vault
 */
export async function document_design_decision(args) {
  const { 
    feature, 
    decisions = [], 
    rationale, 
    technicalDetails = {},
    alternatives = [],
    consequences = []
  } = args;
  
  const vaultPath = await getVaultPath();
  const designDocsPath = path.join(vaultPath, 'docs', 'design-decisions');
  
  // Ensure the design-decisions directory exists
  await fs.mkdir(designDocsPath, { recursive: true });
  
  // Create filename from feature name
  const filename = `${feature.toLowerCase().replace(/\s+/g, '-')}.md`;
  const filepath = path.join(designDocsPath, filename);
  
  // Check if document already exists
  let existingContent = '';
  let isUpdate = false;
  try {
    existingContent = await fs.readFile(filepath, 'utf-8');
    isUpdate = true;
  } catch {
    // File doesn't exist, will create new
  }
  
  const timestamp = new Date().toISOString();
  
  const content = `# Design Decision: ${feature}

## Status
${isUpdate ? 'UPDATED' : 'PROPOSED'} - ${timestamp}

## Context
${rationale || 'No rationale provided'}

## Decision
${decisions.length > 0 ? decisions.map(d => `- ${d}`).join('\n') : 'No specific decisions documented'}

## Technical Details
${Object.keys(technicalDetails).length > 0 
  ? Object.entries(technicalDetails).map(([key, value]) => 
      `### ${key}\n${value}`
    ).join('\n\n')
  : 'No technical details provided'
}

## Alternatives Considered
${alternatives.length > 0 
  ? alternatives.map((alt, i) => `### Option ${i + 1}: ${alt.name}\n${alt.description}\n**Reason not chosen**: ${alt.reasonNotChosen}`).join('\n\n')
  : 'No alternatives documented'
}

## Consequences

### Positive
${consequences.filter(c => c.type === 'positive').map(c => `- ${c.description}`).join('\n') || '- To be determined'}

### Negative
${consequences.filter(c => c.type === 'negative').map(c => `- ${c.description}`).join('\n') || '- None identified'}

### Neutral
${consequences.filter(c => c.type === 'neutral').map(c => `- ${c.description}`).join('\n') || '- None identified'}

## Implementation Notes
- Implementation will be handled by Claude Code in headless mode
- Related issue will be created in GitHub
- Design decisions are version controlled

${isUpdate ? `\n## Update History\n${timestamp}: Design decision updated\n\n### Previous Content\n\`\`\`markdown\n${existingContent}\n\`\`\`\n` : ''}

---
*Generated by Obsidian AI Curator MCP Server*
*Last updated: ${timestamp}*`;

  await fs.writeFile(filepath, content, 'utf-8');
  
  return {
    success: true,
    path: filepath,
    relativePath: path.relative(vaultPath, filepath),
    isUpdate,
    feature,
    timestamp
  };
}

/**
 * Create a feature request with design documentation
 */
export async function create_feature_request(args) {
  const { 
    featureName, 
    description,
    specifications = '', 
    designDecisions = [], 
    acceptanceCriteria = [],
    technicalRequirements = [],
    userStory = '',
    priority = 'medium'
  } = args;
  
  // First, document the design decisions
  const designDoc = await document_design_decision({
    feature: featureName,
    decisions: designDecisions,
    rationale: specifications || description,
    technicalDetails: {
      'Technical Requirements': technicalRequirements.join('\n'),
      'User Story': userStory
    }
  });
  
  // Create the GitHub issue
  const issueBody = `## ✨ Feature Request: ${featureName}

### Description
${description}

### User Story
${userStory || 'As a user, I want to ' + featureName.toLowerCase() + ' so that I can achieve better results.'}

### Specifications
${specifications || 'See design document for detailed specifications.'}

### Design Decisions
${designDecisions.length > 0 
  ? designDecisions.map((d, i) => `${i + 1}. ${d}`).join('\n')
  : 'See design document for design decisions.'
}

### Technical Requirements
${technicalRequirements.length > 0
  ? technicalRequirements.map(req => `- [ ] ${req}`).join('\n')
  : '- [ ] To be determined during implementation'
}

### Acceptance Criteria
${acceptanceCriteria.length > 0
  ? acceptanceCriteria.map(ac => `- [ ] ${ac}`).join('\n')
  : '- [ ] Feature works as specified\n- [ ] Tests are passing\n- [ ] Documentation is updated'
}

### Priority
**${priority.toUpperCase()}**

### Implementation Plan
1. Claude Code will implement this feature in headless mode
2. Comprehensive tests will be added
3. Documentation will be updated
4. PR will be created for review

### Related Documentation
- Design Document: \`${designDoc.relativePath}\`
- Created: ${new Date().toISOString()}

---
*This feature request was created after design discussion with Claude Desktop.*
*It will be automatically implemented by Claude Code.*`;

  const labels = ['claude-feature', 'enhancement', 'auto-generated'];
  
  // Add priority label
  if (priority === 'high') labels.push('priority-high');
  else if (priority === 'low') labels.push('priority-low');
  
  const issue = await create_github_issue({
    title: `[Feature] ${featureName}`,
    body: issueBody,
    labels,
    assignees: ['nwant']
  });
  
  return {
    ...issue,
    designDocument: designDoc.relativePath,
    featureName
  };
}

/**
 * Check status of a GitHub issue
 */
export async function check_issue_status(args) {
  const { issueNumber } = args;
  
  const repoInfo = await getRepoInfo();
  
  try {
    const { stdout } = await execAsync(
      `gh issue view ${issueNumber} --repo ${repoInfo.fullName} --json state,title,labels,url,closedAt,body`
    );
    
    const issue = JSON.parse(stdout);
    
    return {
      success: true,
      issueNumber,
      state: issue.state,
      title: issue.title,
      labels: issue.labels.map(l => l.name),
      url: issue.url,
      isClosed: issue.state === 'CLOSED',
      closedAt: issue.closedAt,
      hasClaude: issue.labels.some(l => l.name.startsWith('claude-'))
    };
  } catch (error) {
    throw new Error(`Failed to check issue status: ${error.message}`);
  }
}

/**
 * Get MCP server version from package.json
 */
async function getMCPVersion() {
  try {
    const packagePath = path.join(process.cwd(), 'package.json');
    const packageContent = await fs.readFile(packagePath, 'utf-8');
    const packageJson = JSON.parse(packageContent);
    return packageJson.version || '1.0.0';
  } catch {
    return 'unknown';
  }
}

/**
 * Create a PR from Claude Code changes
 */
export async function create_pull_request(args) {
  const { 
    title, 
    body, 
    branch = 'claude-fix-' + Date.now(),
    baseBranch = 'main',
    issueNumber = null 
  } = args;
  
  const repoInfo = await getRepoInfo();
  
  // Create and checkout new branch
  await execAsync(`git checkout -b ${branch}`);
  
  // Stage and commit changes
  await execAsync('git add -A');
  await execAsync(`git commit -m "${title}"`);
  
  // Push branch
  await execAsync(`git push origin ${branch}`);
  
  // Create PR
  const prBody = issueNumber 
    ? `${body}\n\nCloses #${issueNumber}` 
    : body;
  
  const { stdout } = await execAsync(
    `gh pr create --title "${title}" --body "${prBody}" --base ${baseBranch} --head ${branch} --repo ${repoInfo.fullName}`
  );
  
  return {
    success: true,
    prUrl: stdout.trim(),
    branch
  };
}

// Export all functions as a tools object for MCP server
export const githubTools = {
  create_github_issue,
  create_bug_report,
  document_design_decision,
  create_feature_request,
  check_issue_status,
  create_pull_request
};
