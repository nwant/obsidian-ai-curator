import { describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import { testHarness } from '../test-harness.js';

describe('Tag Cleanup Flow', () => {
  beforeAll(async () => {
    await testHarness.setup();
  });
  
  afterAll(async () => {
    await testHarness.teardown();
  });
  
  it('should identify and clean up inconsistent tags', async () => {
    // Create notes with inconsistent tags
    await testHarness.createTestVault({
      'Notes/Project1.md': {
        content: 'Project content #javascript #JavaScrip',
        frontmatter: { tags: ['project', 'java-script'] }
      },
      'Notes/Project2.md': {
        content: 'Another project #JavaScript #js',
        frontmatter: { tags: ['project', 'javascript'] }
      },
      'Notes/Learning.md': {
        content: 'Learning notes #js #java_script',
        frontmatter: { tags: ['learning', 'Java-Script'] }
      },
      'Notes/Reference.md': {
        content: 'Reference material',
        frontmatter: { tags: ['reference', 'Javascript'] }
      }
    });
    
    // Step 1: Analyze existing tags
    const analysis = await testHarness.executeTool('analyze_tags');
    
    expect(analysis.totalTags).toBeGreaterThan(0);
    // Recommendations might not always be generated if there aren't enough tags
    
    // Step 2: Get all tags to see variations
    const allTags = await testHarness.executeTool('get_tags');
    
    // Check for JavaScript variations
    const jsVariations = Object.keys(allTags.tags).filter(tag => 
      tag.toLowerCase().includes('java') || tag.toLowerCase() === 'js'
    );
    
    expect(jsVariations.length).toBeGreaterThan(1);
    
    // Step 3: Rename tags to standardize
    const renames = [
      { oldTag: 'JavaScrip', newTag: 'javascript' },
      { oldTag: 'java-script', newTag: 'javascript' },
      { oldTag: 'Java-Script', newTag: 'javascript' },
      { oldTag: 'Javascript', newTag: 'javascript' },
      { oldTag: 'js', newTag: 'javascript' },
      { oldTag: 'java_script', newTag: 'javascript' }
    ];
    
    for (const { oldTag, newTag } of renames) {
      try {
        await testHarness.executeTool('rename_tag', {
          oldTag,
          newTag,
          includeInline: true,
          includeFrontmatter: true
        });
      } catch (e) {
        // Tag might not exist, that's ok
      }
    }
    
    // Step 4: Verify standardization
    const updatedTags = await testHarness.executeTool('get_tags');
    const standardizedCount = updatedTags.tags['javascript'] || 0;
    
    expect(standardizedCount).toBeGreaterThanOrEqual(4);
    
    // Step 5: Create report
    const reportContent = `# Tag Cleanup Report

## Standardized Tags
- JavaScript variations → javascript (${standardizedCount} occurrences)

## Remaining Tags
${Object.entries(updatedTags.tags)
  .map(([tag, count]) => `- ${tag}: ${count}`)
  .join('\n')}

## Actions Taken
- Renamed multiple JavaScript tag variations
- Standardized to lowercase 'javascript'
- Updated both inline and frontmatter tags`;
    
    const reportResult = await testHarness.executeTool('write_note', {
      path: 'Reports/Tag Cleanup Report.md',
      content: reportContent
    });
    
    expect(reportResult.success).toBe(true);
  });
});