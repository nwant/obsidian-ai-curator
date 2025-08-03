import { describe, it, beforeAll, afterAll, beforeEach, expect } from '@jest/globals';
import { testHarness } from '../test-harness.js';

describe('Tag Management Tools', () => {
  beforeAll(async () => {
    await testHarness.setup();
  });
  
  afterAll(async () => {
    await testHarness.teardown();
  });
  
  beforeEach(async () => {
    // Create test vault with various tag scenarios
    await testHarness.createTestVault({
      'Notes/Tagged1.md': {
        content: 'Content with #inline-tag and #another-tag',
        frontmatter: { tags: ['project', 'important'] }
      },
      'Notes/Tagged2.md': {
        content: 'More content #inline-tag #unique-tag',
        frontmatter: { tags: ['project', 'review'] }
      },
      'Notes/NoTags.md': {
        content: 'Content without any tags',
        frontmatter: { status: 'draft' }
      },
      'Notes/ComplexTags.md': {
        content: 'Has #parent/child and #parent/child/grandchild tags',
        frontmatter: { tags: ['parent', 'parent/child', 'other'] }
      }
    });
  });
  
  describe('get_tags tool', () => {
    it('should get all tags from vault', async () => {
      const result = await testHarness.executeTool('get_tags');
      
      expect(result.tags).toBeDefined();
      expect(result.tags['project']).toBeGreaterThanOrEqual(2);
      expect(result.tags['inline-tag']).toBeGreaterThanOrEqual(2);
      expect(result.tags['unique-tag']).toBe(1);
    });
    
    it('should get tags from specific file', async () => {
      const result = await testHarness.executeTool('get_tags', {
        path: 'Notes/Tagged1.md'
      });
      
      expect(Array.isArray(result.tags)).toBe(true);
      expect(result.tags.includes('project')).toBe(true);
      expect(result.tags.includes('inline-tag')).toBe(true);
      expect(result.tags.includes('unique-tag')).toBe(false);
    });
    
    it('should handle files without tags', async () => {
      const result = await testHarness.executeTool('get_tags', {
        path: 'Notes/NoTags.md'
      });
      
      expect(Array.isArray(result.tags)).toBe(true);
      expect(result.tags.length).toBe(0);
    });
    
    it('should handle hierarchical tags', async () => {
      const result = await testHarness.executeTool('get_tags', {
        path: 'Notes/ComplexTags.md'
      });
      
      expect(result.tags.includes('parent')).toBe(true);
      expect(result.tags.includes('parent/child')).toBe(true);
      expect(result.tags.includes('parent/child/grandchild')).toBe(true);
    });
  });
  
  describe('analyze_tags tool', () => {
    it('should analyze tag usage patterns', async () => {
      const result = await testHarness.executeTool('analyze_tags');
      
      expect(result.analysis).toBeDefined();
      expect(result.analysis.totalTags).toBeDefined();
      expect(result.analysis.mostUsed).toBeDefined();
      expect(result.analysis.hierarchy).toBeDefined();
    });
    
    it('should detect similar tags', async () => {
      // Add similar tags
      await testHarness.createNote('Notes/Similar.md', 'Content', {
        tags: ['javascript', 'java-script', 'js']
      });
      
      const result = await testHarness.executeTool('analyze_tags');
      
      expect(result.analysis.similar).toBeDefined();
      expect(result.analysis.similar.length).toBeGreaterThan(0);
    });
    
    it('should identify orphaned tags', async () => {
      const result = await testHarness.executeTool('analyze_tags');
      
      expect(result.analysis.orphaned).toBeDefined();
      // Tags used only once might be considered orphaned
    });
    
    it('should provide recommendations', async () => {
      const result = await testHarness.executeTool('analyze_tags');
      
      expect(result.recommendations).toBeDefined();
      expect(Array.isArray(result.recommendations)).toBe(true);
    });
  });
  
  describe('suggest_tags tool', () => {
    it('should suggest tags based on content', async () => {
      const content = `# JavaScript Tutorial

This tutorial covers JavaScript programming, including ES6 features,
async/await, and modern web development practices.`;
      
      const result = await testHarness.executeTool('suggest_tags', {
        content: content
      });
      
      expect(Array.isArray(result.suggestions)).toBe(true);
      expect(result.suggestions.length).toBeGreaterThan(0);
      // Might suggest: programming, javascript, tutorial, web-development
    });
    
    it('should not suggest existing tags', async () => {
      const content = 'Content about projects';
      
      const result = await testHarness.executeTool('suggest_tags', {
        content: content,
        existingTags: ['project']
      });
      
      expect(result.suggestions.includes('project')).toBe(false);
    });
    
    it('should consider vault tag taxonomy', async () => {
      // Create taxonomy document and some notes using those tags
      await testHarness.createNote('Meta/Tags.md', `# Tag Taxonomy

- project
  - project/active
  - project/completed
- status
  - status/draft
  - status/review`);
      
      // Create a note with the project/active tag so it exists in the vault
      await testHarness.createNote('Projects/CurrentProject.md', 
        'This is an active project', 
        { tags: ['project/active'] }
      );
      
      const content = 'Working on an active project';
      const result = await testHarness.executeTool('suggest_tags', {
        content: content
      });
      
      // Should prefer tags from taxonomy
      expect(result.suggestions.some(suggestion => suggestion.tag.startsWith('project/'))).toBe(true);
    });
    
    it('should handle empty content', async () => {
      const result = await testHarness.executeTool('suggest_tags', {
        content: ''
      });
      
      expect(Array.isArray(result.suggestions)).toBe(true);
      expect(result.suggestions.length).toBe(0);
    });
  });
  
  describe('update_tags tool', () => {
    it('should add tags to a note', async () => {
      const result = await testHarness.executeTool('update_tags', {
        path: 'Notes/NoTags.md',
        add: ['new-tag', 'another-new-tag']
      });
      
      expect(result.success).toBe(true);
      expect(result.tags.includes('new-tag')).toBe(true);
      
      // Verify in file
      const tags = await testHarness.getNoteTags('Notes/NoTags.md');
      expect(tags.includes('new-tag')).toBe(true);
    });
    
    it('should remove tags from a note', async () => {
      const result = await testHarness.executeTool('update_tags', {
        path: 'Notes/Tagged1.md',
        remove: ['important']
      });
      
      expect(result.success).toBe(true);
      expect(result.tags.includes('important')).toBe(false);
    });
    
    it('should replace all tags', async () => {
      const result = await testHarness.executeTool('update_tags', {
        path: 'Notes/Tagged1.md',
        replace: ['completely', 'new', 'tags']
      });
      
      expect(result.success).toBe(true);
      expect(result.tags.length).toBe(3);
      expect(result.tags.includes('project')).toBe(false);
    });
    
    it('should handle tag normalization', async () => {
      const result = await testHarness.executeTool('update_tags', {
        path: 'Notes/NoTags.md',
        add: ['#with-hash', 'With Spaces', 'UPPERCASE']
      });
      
      expect(result.success).toBe(true);
      expect(result.tags.includes('with-hash')).toBe(true);
      expect(result.tags.includes('with-spaces')).toBe(true);
      expect(result.tags.includes('uppercase')).toBe(true);
    });
    
    it('should prevent duplicate tags', async () => {
      const result = await testHarness.executeTool('update_tags', {
        path: 'Notes/Tagged1.md',
        add: ['project', 'new-tag', 'project']  // Duplicate
      });
      
      expect(result.success).toBe(true);
      expect(result.tags.filter(t => t === 'project').length).toBe(1);
    });
  });
  
  describe('rename_tag tool', () => {
    it('should rename tag globally', async () => {
      const result = await testHarness.executeTool('rename_tag', {
        oldTag: 'project',
        newTag: 'project-work'
      });
      
      expect(result.success).toBe(true);
      expect(result.filesUpdated).toBeGreaterThanOrEqual(2);
      
      // Verify changes
      const tags1 = await testHarness.getNoteTags('Notes/Tagged1.md');
      expect(tags1.includes('project-work')).toBe(true);
      expect(tags1.includes('project')).toBe(false);
    });
    
    it('should rename inline tags', async () => {
      const result = await testHarness.executeTool('rename_tag', {
        oldTag: 'inline-tag',
        newTag: 'inline-renamed'
      });
      
      expect(result.success).toBe(true);
      
      // Check content
      await testHarness.assertFileContains('Notes/Tagged1.md', '#inline-renamed');
      const note = await testHarness.readNote('Notes/Tagged1.md');
      expect(note.content.includes('#inline-tag')).toBe(false);
    });
    
    it('should handle hierarchical tag renames', async () => {
      const result = await testHarness.executeTool('rename_tag', {
        oldTag: 'parent/child',
        newTag: 'category/subcategory'
      });
      
      expect(result.success).toBe(true);
      
      // Check both frontmatter and inline
      const tags = await testHarness.getNoteTags('Notes/ComplexTags.md');
      expect(tags.includes('category/subcategory')).toBe(true);
    });
    
    it('should preview changes without applying', async () => {
      // Ensure we have files with the 'project' tag
      await testHarness.createNote('Notes/ExtraProject1.md', 'Extra project 1', { tags: ['project'] });
      await testHarness.createNote('Notes/ExtraProject2.md', 'Extra project 2', { tags: ['project'] });
      
      const result = await testHarness.executeTool('rename_tag', {
        oldTag: 'project',
        newTag: 'project-preview',
        preview: true
      });
      
      expect(result.preview).toBe(true);
      expect(Array.isArray(result.changes)).toBe(true);
      expect(result.changes.length).toBeGreaterThanOrEqual(2);
      
      // Verify no actual changes
      const tags1 = await testHarness.getNoteTags('Notes/ExtraProject1.md');
      expect(tags1.includes('project')).toBe(true);
      expect(tags1.includes('project-preview')).toBe(false);
    });
    
    it('should handle tag not found', async () => {
      const result = await testHarness.executeTool('rename_tag', {
        oldTag: 'non-existent-tag',
        newTag: 'new-name'
      });
      
      expect(result.success).toBe(true);
      expect(result.filesUpdated).toBe(0);
    });
    
    it('should validate new tag name', async () => {
      await expect(
        testHarness.executeTool('rename_tag', {
          oldTag: 'project',
          newTag: 'invalid tag name'  // Spaces not allowed
        })
      ).rejects.toThrow(/invalid.*tag.*name/i);
    });
    
    it('should handle conflicts with existing tags', async () => {
      const result = await testHarness.executeTool('rename_tag', {
        oldTag: 'review',
        newTag: 'important',  // Already exists in Tagged1.md
        merge: true
      });
      
      expect(result.success).toBe(true);
      expect(result.merged).toBe(true);
    });
  });
  
  describe('Tag hierarchy operations', () => {
    it('should respect tag hierarchy when suggesting', async () => {
      const content = 'Working on a child component of the parent system';
      
      const result = await testHarness.executeTool('suggest_tags', {
        content: content,
        respectHierarchy: true
      });
      
      // If suggesting parent/child, should also suggest parent
      if (result.suggestions.includes('parent/child')) {
        expect(result.suggestions.includes('parent')).toBe(true);
      }
    });
    
    it('should analyze tag hierarchy depth', async () => {
      const result = await testHarness.executeTool('analyze_tags');
      
      expect(result.analysis.maxDepth).toBeGreaterThanOrEqual(3);
      expect(result.analysis.hierarchicalTags).toBeDefined();
    });
  });
  
  describe('Error handling', () => {
    it('should handle non-existent file in get_tags', async () => {
      await expect(
        testHarness.executeTool('get_tags', {
          path: 'Notes/DoesNotExist.md'
        })
      ).rejects.toThrow(/not found|does not exist/i);
    });
    
    it('should handle invalid tag characters', async () => {
      await expect(
        testHarness.executeTool('update_tags', {
          path: 'Notes/NoTags.md',
          add: ['tag@with@symbols', 'tag\\with\\backslash']
        })
      ).rejects.toThrow(/invalid.*character/i);
    });
    
    it('should handle circular tag hierarchies gracefully', async () => {
      // Create circular reference
      await testHarness.createNote('Notes/Circular.md', 'Content', {
        tags: ['a/b', 'b/c', 'c/a']  // Circular
      });
      
      const result = await testHarness.executeTool('analyze_tags');
      expect(result.analysis).toBeDefined();
    });
  });
});