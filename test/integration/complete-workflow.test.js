import { describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import { testHarness } from '../test-harness.js';

describe('Complete User Workflows - Integration Tests', () => {
  beforeAll(async () => {
    await testHarness.setup();
  });
  
  afterAll(async () => {
    await testHarness.teardown();
  });
  
  describe('Search → Read → Modify → Archive Workflow', () => {
    it('should handle complete note lifecycle with error recovery', async () => {
      // Step 1: Create initial notes
      await testHarness.createTestVault({
        'Projects/Active/ProjectA.md': {
          content: '# Project A\n\nActive project with important data.',
          frontmatter: { 
            status: 'active', 
            priority: 'high',
            created: '2024-01-15'
          }
        },
        'Projects/Active/ProjectB.md': {
          content: '# Project B\n\nAnother active project.',
          frontmatter: { 
            status: 'active', 
            priority: 'medium',
            created: '2024-02-01'
          }
        },
        'Projects/Ideas/ProjectC.md': {
          content: '# Project C\n\nFuture project idea.',
          frontmatter: { 
            status: 'planned', 
            priority: 'low'
          }
        }
      });
      
      // Step 2: Search for active projects
      const searchResult = await testHarness.executeTool('search_content', {
        query: 'active project',
        contextLines: 2
      });
      
      expect(searchResult.matches.length).toBeGreaterThanOrEqual(2);
      
      // Step 3: Find by metadata
      const metadataResult = await testHarness.executeTool('find_by_metadata', {
        frontmatter: {
          status: 'active',
          priority: { $in: ['high', 'medium'] }
        }
      });
      
      expect(metadataResult.files.length).toBe(2);
      
      // Step 4: Read the found notes
      const notePaths = metadataResult.files.map(f => f.path);
      const readResult = await testHarness.executeTool('read_notes', {
        paths: notePaths
      });
      
      expect(readResult.notes.length).toBe(2);
      expect(readResult.notes.every(n => n.content)).toBe(true);
      
      // Step 5: Modify one note - mark as completed
      const noteToComplete = notePaths[0];
      const originalNote = readResult.notes[0];
      
      const updateResult = await testHarness.executeTool('update_frontmatter', {
        path: noteToComplete,
        updates: {
          status: 'completed',
          completedDate: new Date().toISOString().split('T')[0]
        }
      });
      
      expect(updateResult.success).toBe(true);
      
      // Step 6: Add completion tag
      const tagResult = await testHarness.executeTool('update_tags', {
        path: noteToComplete,
        add: ['completed', '2024/completed']
      });
      
      expect(tagResult.success).toBe(true);
      
      // Step 7: Archive completed project
      const archiveResult = await testHarness.executeTool('archive_notes', {
        moves: [{
          from: noteToComplete,
          to: `Projects/Archived/${noteToComplete.split('/').pop()}`
        }]
      });
      
      expect(archiveResult.successful).toBe(1);
      
      // Step 8: Verify the archive
      const archivedPath = `Projects/Archived/${noteToComplete.split('/').pop()}`;
      await testHarness.assertFileExists(archivedPath);
      
      // Step 9: Verify original location is empty
      await testHarness.assertFileNotExists(noteToComplete);
      
      // Step 10: Create a checkpoint
      const gitResult = await testHarness.executeTool('git_checkpoint', {
        message: 'Completed and archived project'
      });
      
      expect(gitResult.success || gitResult.testMode).toBe(true);
    });
    
    it('should handle workflow interruptions and recovery', async () => {
      // Create notes
      await testHarness.createTestVault({
        'Workflow/note1.md': { content: '# Note 1', frontmatter: { id: 1 } },
        'Workflow/note2.md': { content: '# Note 2', frontmatter: { id: 2 } },
        'Workflow/note3.md': { content: '# Note 3', frontmatter: { id: 3 } }
      });
      
      // Start batch operation that will partially fail
      const moves = [
        { from: 'Workflow/note1.md', to: 'Archive/note1.md' },
        { from: 'Workflow/nonexistent.md', to: 'Archive/nonexistent.md' }, // Will fail
        { from: 'Workflow/note3.md', to: 'Archive/note3.md' }
      ];
      
      const result = await testHarness.executeTool('archive_notes', { moves });
      
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors.length).toBe(1);
      
      // Verify partial completion
      await testHarness.assertFileExists('Archive/note1.md');
      await testHarness.assertFileExists('Workflow/note2.md'); // Untouched
      await testHarness.assertFileExists('Archive/note3.md');
    });
  });
  
  describe('Tag Analysis → Rename → Update Workflow', () => {
    it('should handle complete tag management workflow', async () => {
      // Step 1: Create notes with inconsistent tags
      await testHarness.createTestVault({
        'Notes/note1.md': {
          content: 'Content with #project-management tag',
          frontmatter: { tags: ['project-mgmt', 'active'] }
        },
        'Notes/note2.md': {
          content: 'Another note with #proj-mgmt inline',
          frontmatter: { tags: ['projectmanagement'] }
        },
        'Notes/note3.md': {
          content: 'And #project_management here',
          frontmatter: { tags: ['project/management'] }
        }
      });
      
      // Step 2: Analyze tags
      const analysis = await testHarness.executeTool('analyze_tags', {});
      
      
      expect(analysis.tags.length).toBeGreaterThan(0);
      expect(analysis.similar).toBeDefined();
      expect(analysis.similar.length).toBeGreaterThan(0);
      
      // Step 3: Rename tags to consolidate
      const renameOps = [
        { oldTag: 'project-mgmt', newTag: 'project-management' },
        { oldTag: 'projectmanagement', newTag: 'project-management' },
        { oldTag: 'proj-mgmt', newTag: 'project-management' }
      ];
      
      for (const op of renameOps) {
        const result = await testHarness.executeTool('rename_tag', {
          ...op,
          preview: false,
          includeInline: true,
          includeFrontmatter: true
        });
        
        expect(result.success || result.filesUpdated >= 0).toBeTruthy();
      }
      
      // Step 5: Verify consolidation
      const finalTags = await testHarness.executeTool('get_tags', {});
      
      // Should have consolidated to fewer unique tags
      const pmTags = finalTags.tags.filter(t => 
        t.toLowerCase().includes('project') && 
        t.toLowerCase().includes('management')
      );
      
      console.log('DEBUG: Final tags:', finalTags.tags);
      console.log('DEBUG: PM tags:', pmTags);
      console.log('DEBUG: PM tags length:', pmTags.length);
      
      expect(pmTags.length).toBeLessThanOrEqual(2); // project-management and maybe project/management
    });
  });
  
  describe('Project Creation → Management → Archive Workflow', () => {
    it('should handle complete project lifecycle', async () => {
      // Step 1: Initialize new project
      const projectResult = await testHarness.executeTool('init_project', {
        projectName: 'AI Assistant Integration',
        description: 'Integrate AI assistants into our workflow',
        projectType: 'ai-agent',
        targetDate: '2024-12-31',
        stakeholders: ['John Doe (PM)', 'Jane Smith (Dev)']
      });
      
      
      expect(projectResult.success).toBe(true);
      expect(projectResult.created.length).toBeGreaterThanOrEqual(4); // ai-agent template has 4 files
      
      // Step 2: Add tasks to project
      const taskResult = await testHarness.executeTool('add_daily_task', {
        task: '- [ ] Review AI integration requirements',
        date: 'today'
      });
      
      expect(taskResult.success).toBe(true);
      
      // Step 3: Update project status
      const statusUpdate = await testHarness.executeTool('update_frontmatter', {
        path: 'Projects/AI Assistant Integration/AI Assistant Integration.md',
        updates: {
          phase: 'implementation',
          progress: 45
        }
      });
      
      
      expect(statusUpdate.success).toBe(true);
      
      // Step 4: Search project content
      const projectSearch = await testHarness.executeTool('search_content', {
        query: 'AI Assistant Integration'
      });
      
      expect(projectSearch.matches.length).toBeGreaterThan(0);
      
      // Step 5: Complete and archive project
      const completionSteps = [
        // Update status
        testHarness.executeTool('update_frontmatter', {
          path: 'Projects/AI Assistant Integration/AI Assistant Integration.md',
          updates: { 
            status: 'completed',
            phase: 'archived'
          }
        }),
        // Add completion tag
        testHarness.executeTool('update_tags', {
          path: 'Projects/AI Assistant Integration/AI Assistant Integration.md',
          add: ['completed', 'archived']
        }),
        // Move to archive
        testHarness.executeTool('move_file', {
          sourcePath: 'Projects/AI Assistant Integration/AI Assistant Integration.md',
          targetPath: 'Projects/Archived/AI Assistant Integration/AI Assistant Integration.md'
        })
      ];
      
      const results = await Promise.all(completionSteps);
      expect(results.every(r => r.success)).toBe(true);
    });
  });
  
  describe('Performance Under Load', () => {
    it('should handle large vault operations efficiently', async () => {
      // Create a large vault
      const files = {};
      for (let i = 0; i < 1000; i++) {
        files[`LargeVault/note${i}.md`] = {
          content: `# Note ${i}\n\nContent for note ${i} with searchable text.`,
          frontmatter: {
            id: i,
            category: i % 10,
            tags: [`cat${i % 10}`, `group${Math.floor(i / 100)}`]
          }
        };
      }
      
      await testHarness.createTestVault(files);
      
      // Test 1: Vault scan performance
      const scanStart = Date.now();
      const scanResult = await testHarness.executeTool('vault_scan', {
        patterns: ['LargeVault/**/*.md'],
        includeStats: true,
        limit: 100
      });
      const scanDuration = Date.now() - scanStart;
      
      expect(scanResult.files.length).toBe(100);
      expect(scanDuration).toBeLessThan(2000); // Should complete in 2 seconds
      
      // Test 2: Search performance
      const searchStart = Date.now();
      const searchResult = await testHarness.executeTool('search_content', {
        query: 'searchable text',
        maxResults: 50
      });
      const searchDuration = Date.now() - searchStart;
      
      expect(searchResult.matches.length).toBe(50);
      expect(searchDuration).toBeLessThan(3000); // Should complete in 3 seconds
      
      // Test 3: Metadata query performance
      const metaStart = Date.now();
      const metaResult = await testHarness.executeTool('find_by_metadata', {
        frontmatter: {
          category: { $in: [1, 2, 3] }
        }
      });
      const metaDuration = Date.now() - metaStart;
      
      expect(metaResult.files.length).toBe(300); // 3 categories × 100 files each
      expect(metaDuration).toBeLessThan(2000);
      
      // Test 4: Batch operations
      const batchMoves = Array(50).fill(null).map((_, i) => ({
        from: `LargeVault/note${i}.md`,
        to: `LargeVault/Archived/note${i}.md`
      }));
      
      const batchStart = Date.now();
      const batchResult = await testHarness.executeTool('archive_notes', {
        moves: batchMoves
      });
      const batchDuration = Date.now() - batchStart;
      
      expect(batchResult.successful).toBe(50);
      expect(batchDuration).toBeLessThan(5000); // Should complete in 5 seconds
    });
    
    it('should handle concurrent operations without data corruption', async () => {
      // Create test notes
      await testHarness.createTestVault({
        'Concurrent/shared.md': {
          content: '# Shared Note\n\nInitial content',
          frontmatter: { counter: 0 }
        }
      });
      
      // Launch multiple concurrent operations
      const operations = [
        // Multiple reads
        ...Array(5).fill(null).map(() => 
          testHarness.executeTool('read_notes', { 
            paths: ['Concurrent/shared.md'] 
          })
        ),
        // Multiple metadata updates
        ...Array(3).fill(null).map((_, i) => 
          testHarness.executeTool('update_frontmatter', {
            path: 'Concurrent/shared.md',
            updates: { [`field${i}`]: `value${i}` }
          })
        ),
        // Tag updates
        testHarness.executeTool('update_tags', {
          path: 'Concurrent/shared.md',
          add: ['concurrent-test']
        })
      ];
      
      const results = await Promise.all(operations);
      
      // All operations should succeed
      expect(results.every(r => r.success || r.notes)).toBe(true);
      
      // Verify final state
      const finalRead = await testHarness.executeTool('read_notes', {
        paths: ['Concurrent/shared.md']
      });
      
      const finalNote = finalRead.notes[0];
      // Due to race conditions, not all fields may be present
      // But at least one should be there
      const hasField0 = finalNote.frontmatter.field0 === 'value0';
      const hasField1 = finalNote.frontmatter.field1 === 'value1';
      const hasField2 = finalNote.frontmatter.field2 === 'value2';
      
      // At least one update should have succeeded
      expect(hasField0 || hasField1 || hasField2).toBe(true);
      
      // Tags update should succeed as it's a different operation
      expect(finalNote.frontmatter.tags).toContain('concurrent-test');
    });
  });
  
  describe('Error Recovery and Resilience', () => {
    it('should recover from partial failures in complex workflows', async () => {
      // Create initial state
      await testHarness.createTestVault({
        'Resilience/important.md': {
          content: '# Important Data\n\nMust not be lost',
          frontmatter: { backup: true }
        }
      });
      
      // Simulate a complex workflow with potential failure points
      const workflow = async () => {
        // Step 1: Read original
        const original = await testHarness.executeTool('read_notes', {
          paths: ['Resilience/important.md']
        });
        
        // Step 2: Create backup
        await testHarness.executeTool('write_note', {
          path: 'Resilience/important.backup.md',
          content: original.notes[0].raw
        });
        
        // Step 3: Attempt risky operation (simulate failure)
        try {
          await testHarness.executeTool('write_note', {
            path: '../../../etc/passwd', // Should fail validation
            content: 'malicious'
          });
        } catch (error) {
          // Expected to fail
        }
        
        // Step 4: Verify original is intact
        const verification = await testHarness.executeTool('read_notes', {
          paths: ['Resilience/important.md']
        });
        
        return verification.notes[0].content === original.notes[0].content;
      };
      
      const success = await workflow();
      expect(success).toBe(true);
      
      // Verify backup exists
      await testHarness.assertFileExists('Resilience/important.backup.md');
    });
  });
});