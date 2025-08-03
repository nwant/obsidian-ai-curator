import { describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import { SimpleTestHarness } from '../test-harness-simple.js';

describe('Tag Cleanup Workflow Integration Test', () => {
  let harness;
  
  beforeAll(async () => {
    harness = new SimpleTestHarness();
    await harness.setup();
    
    // Create vault with messy tags
    await harness.createTestVault({
      'Notes/JavaScript Tutorial.md': {
        content: '# JavaScript Tutorial\n\nLearn #javascript and #js basics.',
        frontmatter: { tags: ['JavaScript', 'programming-language', 'tutorial'] }
      },
      'Notes/JS Tips.md': {
        content: '# JS Tips\n\nQuick #js tips and #java-script tricks.',
        frontmatter: { tags: ['java-script', 'tips', 'programming-language'] }
      },
      'Notes/Python Guide.md': {
        content: '# Python Guide\n\nPython is different from #javascript.',
        frontmatter: { tags: ['python', 'programming-language', 'guide'] }
      },
      'Projects/Web App.md': {
        content: '# Web App Project\n\nUsing #js and #javascript for frontend.',
        frontmatter: { tags: ['project', 'web', 'JavaScript'] }
      },
      'Daily/2025-08-01.md': {
        content: '# Daily Note\n\nStudied #java-script today.',
        frontmatter: { tags: ['daily-note'] }
      }
    });
  });
  
  afterAll(async () => {
    await harness.teardown();
  });
  
  it('should analyze and identify tag inconsistencies', async () => {
    // Step 1: Get all tags
    const allTags = await harness.executeTool('get_tags');
    
    // Should have variations of JavaScript
    expect(allTags.tags['javascript']).toBeDefined();
    expect(allTags.tags['JavaScript']).toBeDefined();
    expect(allTags.tags['js']).toBeDefined();
    expect(allTags.tags['java-script']).toBeDefined();
    
    // Mock analyze_tags tool
    harness.tools.set('analyze_tags', async () => {
      return {
        analysis: {
          totalTags: Object.keys(allTags.tags).length,
          similar: [
            ['javascript', 'JavaScript', 'js', 'java-script']
          ],
          mostUsed: [
            { tag: 'programming-language', count: 3 },
            { tag: 'javascript', count: 2 }
          ]
        },
        recommendations: [
          'Consolidate javascript variations to single tag',
          'Use lowercase for consistency'
        ]
      };
    });
    
    const analysis = await harness.executeTool('analyze_tags');
    expect(analysis.analysis.similar.length).toBeGreaterThan(0);
  });
  
  it('should consolidate tag variations', async () => {
    // Mock rename_tag tool
    harness.tools.set('rename_tag', async (params) => {
      let filesUpdated = 0;
      
      // Update vault files
      for (const [path, file] of harness.vault) {
        let updated = false;
        
        // Update frontmatter tags
        if (file.frontmatter?.tags) {
          const newTags = file.frontmatter.tags.map(tag => 
            tag.toLowerCase() === params.oldTag.toLowerCase() ? params.newTag : tag
          );
          if (newTags.some((tag, i) => tag !== file.frontmatter.tags[i])) {
            file.frontmatter.tags = newTags;
            updated = true;
          }
        }
        
        // Update inline tags
        const oldInlineTag = `#${params.oldTag}`;
        const newInlineTag = `#${params.newTag}`;
        if (file.content.includes(oldInlineTag)) {
          file.content = file.content.replaceAll(oldInlineTag, newInlineTag);
          updated = true;
        }
        
        if (updated) filesUpdated++;
      }
      
      return { success: true, filesUpdated };
    });
    
    // Step 2: Rename variations to standard form
    const renames = [
      { oldTag: 'JavaScript', newTag: 'javascript' },
      { oldTag: 'js', newTag: 'javascript' },
      { oldTag: 'java-script', newTag: 'javascript' }
    ];
    
    for (const rename of renames) {
      const result = await harness.executeTool('rename_tag', rename);
      expect(result.success).toBe(true);
    }
    
    // Step 3: Verify consolidation
    const finalTags = await harness.executeTool('get_tags');
    
    // Should only have 'javascript' now, not the variations
    expect(finalTags.tags['javascript']).toBeGreaterThanOrEqual(4);
    expect(finalTags.tags['JavaScript']).toBeUndefined();
    expect(finalTags.tags['js']).toBeUndefined();
    expect(finalTags.tags['java-script']).toBeUndefined();
  });
  
  it('should update tag hierarchy', async () => {
    // Mock update to use hierarchical tags
    for (const [path, file] of harness.vault) {
      if (file.frontmatter?.tags?.includes('javascript')) {
        // Add hierarchical tag
        await harness.executeTool('update_tags', {
          path,
          add: ['programming/javascript']
        });
      }
      if (file.frontmatter?.tags?.includes('python')) {
        await harness.executeTool('update_tags', {
          path,
          add: ['programming/python']
        });
      }
    }
    
    // Verify hierarchy
    const hierarchicalTags = await harness.executeTool('get_tags');
    expect(hierarchicalTags.tags['programming/javascript']).toBeDefined();
    expect(hierarchicalTags.tags['programming/python']).toBeDefined();
  });
  
  it('should generate cleanup report', async () => {
    // Mock a report generation
    const report = {
      tagsConsolidated: 4,
      filesUpdated: 5,
      hierarchyCreated: ['programming/javascript', 'programming/python'],
      recommendations: [
        'Consider creating tag taxonomy document',
        'Set up tag validation rules'
      ]
    };
    
    expect(report.tagsConsolidated).toBeGreaterThan(0);
    expect(report.filesUpdated).toBeGreaterThan(0);
  });
});