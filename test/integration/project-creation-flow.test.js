import { describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import { testHarness } from '../test-harness.js';

describe('Project Creation Flow', () => {
  beforeAll(async () => {
    await testHarness.setup();
  });
  
  afterAll(async () => {
    await testHarness.teardown();
  });
  
  it('should create a new project with proper structure', async () => {
    // Step 1: Initialize new project
    const projectResult = await testHarness.executeTool('init_project', {
      projectName: 'Email Automation',
      description: 'Automate email processing and categorization',
      projectType: 'automation',
      targetDate: '2025-12-31',
      stakeholders: ['John Doe (Product Owner)', 'Jane Smith (Developer)']
    });
    
    expect(projectResult.filesCreated).toBeGreaterThan(0);
    expect(projectResult.projectPath).toBe('Projects/Email Automation');
    
    // Step 2: Add tasks to project
    const tasksContent = `# Email Automation Tasks

## Current Sprint

### In Progress
- [ ] Design email parsing logic
- [ ] Set up email server connection

### Todo
- [ ] Implement categorization algorithm
- [ ] Create notification system
- [ ] Write unit tests

### Blocked
- [ ] Deploy to production (waiting for server access)`;
    
    await testHarness.executeTool('write_note', {
      path: 'Projects/Email Automation/Email Automation Tasks.md',
      content: tasksContent,
      preserveFrontmatter: true
    });
    
    // Step 3: Create daily note with project update
    const dailyResult = await testHarness.executeTool('get_daily_note', {
      date: 'today'
    });
    
    expect(dailyResult.created || dailyResult.exists).toBe(true);
    
    // Step 4: Add project update to daily note
    await testHarness.executeTool('append_to_daily_note', {
      content: `### Email Automation Project
- Created project structure
- Added initial tasks
- Set up [[Projects/Email Automation/Email Automation|project index]]`,
      section: 'Projects'
    });
    
    // Step 5: Add a high-priority task
    await testHarness.executeTool('add_daily_task', {
      task: 'Review Email Automation project plan',
      priority: 'high',
      date: 'today'
    });
    
    // Step 6: Search for project-related content
    const searchResult = await testHarness.executeTool('search_content', {
      query: 'Email Automation'
    });
    
    expect(searchResult.matches.length).toBeGreaterThanOrEqual(3);
    
    // Step 7: Get project context
    const contextResult = await testHarness.executeTool('get_working_context', {
      scope: 'project',
      identifier: 'Email Automation'
    });
    
    expect(contextResult.scope).toBe('project');
    
    // Verify project structure
    await testHarness.assertFileExists('Projects/Email Automation/Email Automation.md');
    await testHarness.assertFileExists('Projects/Email Automation/Email Automation Planning.md');
    await testHarness.assertFileExists('Projects/Email Automation/Email Automation Tasks.md');
    
    // Verify project index has correct metadata
    await testHarness.assertFileContains(
      'Projects/Email Automation/Email Automation.md',
      'Automate email processing and categorization'
    );
  });
});