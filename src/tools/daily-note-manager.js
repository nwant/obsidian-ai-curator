import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { DateManager } from './date-manager.js';

export class DailyNoteManager {
  constructor(config, cache) {
    this.config = config || {};
    this.cache = cache;
    // Support both naming conventions for backward compatibility
    this.dailyNotesPath = this.config.dailyNotesPath || this.config.dailyNotesFolder || 'Daily Notes';
    this.dailyNotesFolder = this.dailyNotesPath; // Alias for test compatibility
    this.dateFormat = this.config.dailyNoteDateFormat || this.config.dateFormat || 'yyyy-MM-dd';
    this.template = this.config.dailyNoteTemplate || this.config.template || this.getDefaultTemplate();
    this.vaultPath = this.config.vaultPath || '';
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
   * Parse date string into Date object
   */
  parseDate(dateStr) {
    if (!dateStr || dateStr === 'today') {
      return new Date();
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (dateStr === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday;
    }
    
    if (dateStr === 'tomorrow') {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
    
    // Try to parse as ISO date
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
    
    throw new Error(`Invalid date: ${dateStr}`);
  }
  
  /**
   * Format date for display
   */
  formatDate(date, format = null) {
    format = format || this.dateFormat;
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    // Simple format replacements - order matters for overlapping patterns
    return format
      .replace(/yyyy/g, year)
      .replace(/dd/g, day)
      .replace(/MM/g, month);
  }
  
  /**
   * Get daily note filename
   */
  getDailyNoteFilename(date) {
    return this.formatDate(date) + '.md';
  }
  
  /**
   * Get daily note path
   */
  getDailyNotePath(date) {
    const filename = this.getDailyNoteFilename(date);
    return path.join(this.dailyNotesPath, filename);
  }
  
  /**
   * Check if daily note exists
   */
  async dailyNoteExists(date) {
    const notePath = this.getDailyNotePath(date);
    const fullPath = path.join(this.vaultPath, notePath);
    
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Get all daily notes
   */
  async getAllDailyNotes() {
    const dailyPath = path.join(this.vaultPath, this.dailyNotesPath);
    
    try {
      const files = await fs.readdir(dailyPath);
      return files
        .filter(f => f.endsWith('.md'))
        .map(f => path.join(this.dailyNotesPath, f))
        .sort()
        .reverse();
    } catch {
      return [];
    }
  }
  
  /**
   * Get or create daily note
   */
  async getDailyNote(date, createIfMissing = false) {
    const parsedDate = typeof date === 'string' ? this.parseDate(date) : date;
    const notePath = this.getDailyNotePath(parsedDate);
    const fullPath = path.join(this.vaultPath, notePath);
    
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const parsed = matter(content);
      return {
        exists: true,
        path: notePath,
        content: content,
        frontmatter: parsed.data,
        body: parsed.content
      };
    } catch {
      if (createIfMissing) {
        // Create new daily note
        const created = await this.createDailyNote(parsedDate);
        return {
          ...created,
          exists: true,
          created: true
        };
      } else {
        // Return empty result
        return {
          exists: false,
          path: notePath,
          content: '',
          frontmatter: {},
          body: ''
        };
      }
    }
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
   * Append content to a section
   */
  async appendToSection(dateOrPath, sectionOrContent, contentOrSection, newContent) {
    // Handle two different call signatures for backward compatibility
    if (arguments.length === 4) {
      // Test signature: (path, existingContent, section, newContent)
      const filePath = dateOrPath;
      const existingContent = sectionOrContent;
      const section = contentOrSection;
      const contentToAdd = newContent;
      
      const sectionHeader = `## ${section}`;
      const lines = existingContent.split('\n');
      let sectionIndex = -1;
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === sectionHeader) {
          sectionIndex = i;
          break;
        }
      }
      
      if (sectionIndex === -1) {
        // Section doesn't exist, add it
        return existingContent + `\n\n${sectionHeader}\n${contentToAdd}`;
      } else {
        // Find next section or end
        let nextSectionIndex = lines.length;
        for (let i = sectionIndex + 1; i < lines.length; i++) {
          if (lines[i].startsWith('## ')) {
            nextSectionIndex = i;
            break;
          }
        }
        
        // Insert content before next section
        lines.splice(nextSectionIndex, 0, contentToAdd);
        return lines.join('\n');
      }
    } else {
      // Original signature: (date, section, content)
      const parsedDate = typeof dateOrPath === 'string' ? this.parseDate(dateOrPath) : dateOrPath;
      const note = await this.getDailyNote(parsedDate);
      const section = sectionOrContent;
      const content = contentOrSection;
      
      // Find section in body
      const sectionHeader = `## ${section}`;
      const lines = note.body.split('\n');
      let sectionIndex = -1;
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === sectionHeader) {
          sectionIndex = i;
          break;
        }
      }
      
      if (sectionIndex === -1) {
        // Section doesn't exist, add it
        note.body += `\n\n${sectionHeader}\n${content}`;
      } else {
        // Find next section or end
        let nextSectionIndex = lines.length;
        for (let i = sectionIndex + 1; i < lines.length; i++) {
          if (lines[i].startsWith('## ')) {
            nextSectionIndex = i;
            break;
          }
        }
        
        // Insert content before next section
        lines.splice(nextSectionIndex, 0, content);
        note.body = lines.join('\n');
      }
      
      // Save the note
      const fullContent = matter.stringify(note.body, note.frontmatter);
      const fullPath = path.join(this.vaultPath, note.path);
      await fs.writeFile(fullPath, fullContent);
      
      return {
        success: true,
        path: note.path,
        section,
        content
      };
    }
  }
  
  /**
   * Add a task to daily note
   */
  async addTask(date, task, completed = false, priority = null) {
    const parsedDate = typeof date === 'string' ? this.parseDate(date) : date;
    const checkbox = completed ? '[x]' : '[ ]';
    const priorityStr = priority ? ` [${priority}]` : '';
    const taskLine = `- ${checkbox}${priorityStr} ${task}`;
    
    return this.appendToSection(parsedDate, 'Tasks', taskLine);
  }
  
  /**
   * Add a note to daily note
   */
  async addNote(date, content, metadata = {}) {
    const parsedDate = typeof date === 'string' ? this.parseDate(date) : date;
    const timestamp = metadata.timestamp ? `[${new Date().toLocaleTimeString()}] ` : '';
    const noteContent = `${timestamp}${content}`;
    
    return this.appendToSection(parsedDate, 'Notes', noteContent);
  }
  
  /**
   * Get tasks from daily note
   */
  async getTasks(date) {
    const parsedDate = typeof date === 'string' ? this.parseDate(date) : date;
    const note = await this.getDailyNote(parsedDate);
    
    const tasks = [];
    const lines = note.body.split('\n');
    let inTaskSection = false;
    
    for (const line of lines) {
      if (line.trim() === '## Tasks') {
        inTaskSection = true;
        continue;
      }
      
      if (inTaskSection && line.startsWith('## ')) {
        break;
      }
      
      if (inTaskSection && line.trim().startsWith('- [')) {
        const completed = line.includes('[x]');
        const match = line.match(/- \[[x ]\](.*)/);
        if (match) {
          const text = match[1].trim();
          const priorityMatch = text.match(/^\[([^\]]+)\]\s*(.*)/);
          
          if (priorityMatch) {
            tasks.push({
              text: priorityMatch[2],
              completed,
              priority: priorityMatch[1]
            });
          } else {
            tasks.push({
              text,
              completed,
              priority: null
            });
          }
        }
      }
    }
    
    return tasks;
  }
  
  /**
   * Update task status
   */
  async updateTaskStatus(date, taskIndex, completed) {
    const parsedDate = typeof date === 'string' ? this.parseDate(date) : date;
    const note = await this.getDailyNote(parsedDate);
    
    const lines = note.body.split('\n');
    let taskCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('- [')) {
        if (taskCount === taskIndex) {
          if (completed) {
            lines[i] = lines[i].replace('[ ]', '[x]');
          } else {
            lines[i] = lines[i].replace('[x]', '[ ]');
          }
          break;
        }
        taskCount++;
      }
    }
    
    note.body = lines.join('\n');
    
    // Save the note
    const fullContent = matter.stringify(note.body, note.frontmatter);
    const fullPath = path.join(this.vaultPath, note.path);
    await fs.writeFile(fullPath, fullContent);
    
    return { success: true };
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
   * Extract tasks from content
   */
  extractTasks(content) {
    const tasks = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const taskMatch = line.match(/^[\s-]*\[([x ])\]\s*(.*)$/);
      if (taskMatch) {
        const completed = taskMatch[1].toLowerCase() === 'x';
        const text = taskMatch[2].trim();
        
        // Extract priority if present
        let priority = null;
        let cleanText = text;
        
        if (text.includes('⏫')) {
          priority = 'high';
          cleanText = text.replace('⏫', '').trim();
        } else if (text.includes('🔼')) {
          priority = 'medium';
          cleanText = text.replace('🔼', '').trim();
        } else if (text.includes('🔽')) {
          priority = 'low';
          cleanText = text.replace('🔽', '').trim();
        }
        
        // Extract due date if present
        let due = null;
        const dueMatch = cleanText.match(/📅\s*(\S+)/);
        if (dueMatch) {
          due = dueMatch[1];
          cleanText = cleanText.replace(/📅\s*\S+/, '').trim();
        }
        
        // Extract tags
        const tags = [];
        const tagMatches = cleanText.match(/#[\w-]+/g);
        if (tagMatches) {
          tags.push(...tagMatches.map(t => t.substring(1)));
          cleanText = cleanText.replace(/#[\w-]+/g, '').trim();
        }
        
        tasks.push({
          text: cleanText,
          completed,
          priority,
          due,
          tags,
          raw: line
        });
      }
    }
    
    return tasks;
  }
  
  /**
   * Format a task with options
   */
  formatTask(text, options = {}) {
    const { completed = false, priority = null, due = null, tags = [] } = options;
    
    let taskLine = '- ';
    taskLine += completed ? '[x] ' : '[ ] ';
    
    if (priority) {
      const priorityMap = {
        'high': '⏫',
        'medium': '🔼',
        'low': '🔽'
      };
      taskLine += `${priorityMap[priority.toLowerCase()] || ''} `;
    }
    
    taskLine += text;
    
    if (due) {
      taskLine += ` 📅 ${due}`;
    }
    
    if (tags && tags.length > 0) {
      taskLine += ' ' + tags.map(tag => `#${tag}`).join(' ');
    }
    
    return taskLine;
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