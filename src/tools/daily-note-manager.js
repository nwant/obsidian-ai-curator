import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { DateManager } from './date-manager.js';

export class DailyNoteManager {
  constructor(config, cache) {
    this.config = config;
    this.cache = cache;
    this.dailyNotesPath = config.dailyNotesPath || 'Daily';
    this.dateFormat = config.dailyNoteDateFormat || 'yyyy-MM-dd';
    this.template = config.dailyNoteTemplate || this.getDefaultTemplate();
  }

  /**
   * Get default daily note template
   */
  getDefaultTemplate() {
    return `---
date: {{date}}
tags: [#daily-note]
---

# {{title}}

## Tasks
- [ ] 

## Notes


## Reflections


`;
  }

  /**
   * Get or create daily note for a specific date
   */
  async getOrCreateDailyNote(date = new Date()) {
    const filename = DateManager.getDailyNoteFilename(date, this.dateFormat);
    const relativePath = path.join(this.dailyNotesPath, filename);
    const fullPath = path.join(this.config.vaultPath, relativePath);
    
    try {
      // Check if daily note exists
      await fs.access(fullPath);
      
      // Read existing daily note
      const content = await fs.readFile(fullPath, 'utf-8');
      const parsed = matter(content);
      
      return {
        exists: true,
        path: relativePath,
        content,
        frontmatter: parsed.data,
        body: parsed.content
      };
    } catch (error) {
      // Daily note doesn't exist, create it
      const newContent = await this.createDailyNote(date);
      
      return {
        exists: false,
        created: true,
        path: relativePath,
        content: newContent.content,
        frontmatter: newContent.frontmatter,
        body: newContent.body
      };
    }
  }

  /**
   * Create a new daily note
   */
  async createDailyNote(date = new Date()) {
    const filename = DateManager.getDailyNoteFilename(date, this.dateFormat);
    const relativePath = path.join(this.dailyNotesPath, filename);
    const fullPath = path.join(this.config.vaultPath, relativePath);
    
    // Ensure directory exists
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    
    // Format date strings
    const dateStr = DateManager.formatForDisplay(date, this.dateFormat);
    const titleDate = DateManager.formatForDisplay(date, 'EEEE, MMMM d, yyyy');
    
    // Apply template
    let content = this.template
      .replace(/{{date}}/g, dateStr)
      .replace(/{{title}}/g, titleDate)
      .replace(/{{datetime}}/g, date.toISOString());
    
    // Ensure proper timestamps
    content = DateManager.ensureTimestamps(content, {
      isNewFile: true,
      dateFormat: this.dateFormat,
      includeTime: false
    });
    
    // Write the file
    await fs.writeFile(fullPath, content, 'utf-8');
    
    // Parse for return
    const parsed = matter(content);
    
    return {
      path: relativePath,
      content,
      frontmatter: parsed.data,
      body: parsed.content
    };
  }

  /**
   * Append content to daily note
   */
  async appendToDailyNote(content, options = {}) {
    const { 
      date = new Date(), 
      section = 'Notes',
      createIfMissing = true 
    } = options;
    
    const dailyNote = await this.getOrCreateDailyNote(date);
    
    if (!dailyNote.exists && !createIfMissing) {
      throw new Error(`Daily note for ${DateManager.formatForDisplay(date)} does not exist`);
    }
    
    let updatedContent = dailyNote.content;
    
    // Find the section to append to
    const sectionRegex = new RegExp(`^## ${section}\\s*$`, 'mi');
    const sectionMatch = updatedContent.match(sectionRegex);
    
    if (sectionMatch) {
      // Find the next section or end of file
      const sectionStart = sectionMatch.index + sectionMatch[0].length;
      const restOfContent = updatedContent.substring(sectionStart);
      const nextSectionMatch = restOfContent.match(/^## /m);
      
      let insertPosition;
      if (nextSectionMatch) {
        insertPosition = sectionStart + nextSectionMatch.index;
      } else {
        insertPosition = updatedContent.length;
      }
      
      // Insert content with timestamp
      const timestamp = new Date().toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      const contentToInsert = `\n- **${timestamp}**: ${content}\n`;
      
      updatedContent = updatedContent.slice(0, insertPosition) + 
                      contentToInsert + 
                      updatedContent.slice(insertPosition);
    } else {
      // Section doesn't exist, append at end
      updatedContent += `\n## ${section}\n- **${new Date().toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })}**: ${content}\n`;
    }
    
    // Update modified timestamp
    updatedContent = DateManager.ensureTimestamps(updatedContent, {
      isNewFile: false,
      dateFormat: this.dateFormat
    });
    
    // Write back
    const fullPath = path.join(this.config.vaultPath, dailyNote.path);
    await fs.writeFile(fullPath, updatedContent, 'utf-8');
    
    return {
      path: dailyNote.path,
      section,
      content: updatedContent,
      appended: content
    };
  }

  /**
   * Add task to daily note
   */
  async addTaskToDailyNote(task, options = {}) {
    const { 
      date = new Date(), 
      completed = false,
      priority = null 
    } = options;
    
    let taskLine = `- [${completed ? 'x' : ' '}] `;
    if (priority) {
      taskLine += `[${priority.toUpperCase()}] `;
    }
    taskLine += task;
    
    return await this.appendToDailyNote(taskLine, {
      date,
      section: 'Tasks',
      createIfMissing: true
    });
  }

  /**
   * Get daily notes for a date range
   */
  async getDailyNotesInRange(startDate, endDate) {
    const notes = [];
    const current = new Date(startDate);
    const end = new Date(endDate);
    
    while (current <= end) {
      const filename = DateManager.getDailyNoteFilename(current, this.dateFormat);
      const relativePath = path.join(this.dailyNotesPath, filename);
      const fullPath = path.join(this.config.vaultPath, relativePath);
      
      try {
        await fs.access(fullPath);
        const content = await fs.readFile(fullPath, 'utf-8');
        const parsed = matter(content);
        
        notes.push({
          date: new Date(current),
          path: relativePath,
          exists: true,
          frontmatter: parsed.data,
          hasContent: parsed.content.trim().length > 0
        });
      } catch (error) {
        notes.push({
          date: new Date(current),
          path: relativePath,
          exists: false
        });
      }
      
      current.setDate(current.getDate() + 1);
    }
    
    return notes;
  }

  /**
   * Find daily note by relative reference
   */
  async findDailyNote(reference) {
    // Handle relative references
    if (reference === 'today') {
      return await this.getOrCreateDailyNote(new Date());
    } else if (reference === 'yesterday') {
      const date = new Date();
      date.setDate(date.getDate() - 1);
      return await this.getOrCreateDailyNote(date);
    } else if (reference === 'tomorrow') {
      const date = new Date();
      date.setDate(date.getDate() + 1);
      return await this.getOrCreateDailyNote(date);
    }
    
    // Try to parse as date
    const parsed = DateManager.parseDate(reference);
    if (parsed) {
      return await this.getOrCreateDailyNote(parsed);
    }
    
    throw new Error(`Unable to parse daily note reference: ${reference}`);
  }

  /**
   * Get daily note statistics
   */
  async getDailyNoteStats(days = 30) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const notes = await this.getDailyNotesInRange(startDate, endDate);
    
    const stats = {
      totalDays: days,
      notesCreated: notes.filter(n => n.exists).length,
      notesWithContent: notes.filter(n => n.exists && n.hasContent).length,
      missingDays: notes.filter(n => !n.exists).length,
      completionRate: (notes.filter(n => n.exists).length / days * 100).toFixed(1) + '%',
      streaks: this.calculateStreaks(notes)
    };
    
    return stats;
  }

  /**
   * Calculate consecutive day streaks
   */
  calculateStreaks(notes) {
    let currentStreak = 0;
    let longestStreak = 0;
    let currentStreakCount = 0;
    
    // Start from most recent
    for (let i = notes.length - 1; i >= 0; i--) {
      if (notes[i].exists) {
        currentStreakCount++;
        if (i === notes.length - 1) {
          currentStreak = currentStreakCount;
        }
        longestStreak = Math.max(longestStreak, currentStreakCount);
      } else {
        if (i === notes.length - 1) {
          currentStreak = 0;
        }
        currentStreakCount = 0;
      }
    }
    
    return { current: currentStreak, longest: longestStreak };
  }
}