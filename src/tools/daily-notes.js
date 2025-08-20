import fs from 'fs/promises';
import path from 'path';

/**
 * Daily notes tools class - receives dependencies via constructor
 */
export class DailyNotes {
  constructor(config, frontmatterManager, dateManager) {
    if (!config || !frontmatterManager || !dateManager) {
      throw new Error('DailyNotes initialization failed: missing required dependencies (config, frontmatterManager, dateManager)');
    }
    
    this.config = config;
    this.frontmatterManager = frontmatterManager;
    this.dateManager = dateManager;
    this.dailyNotesPath = config.dailyNotesPath || 'Daily';
  }

  /**
   * Get or create daily note for a specific date
   */
  async get_daily_note(args = {}) {
    const { date = 'today' } = args;
    
    // Get the formatted date string using DateManager
    let dateStr;
    let targetDate;
    
    if (date === 'today') {
      dateStr = this.dateManager.getToday();
      targetDate = new Date();
    } else if (date === 'yesterday') {
      dateStr = this.dateManager.getYesterday();
      targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - 1);
    } else if (date === 'tomorrow') {
      dateStr = this.dateManager.getTomorrow();
      targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 1);
    } else {
      // Parse custom date string
      targetDate = this.dateManager.parseDate(date);
      if (!targetDate) {
        throw new Error(`Invalid date: ${date}`);
      }
      dateStr = this.dateManager.formatDate(targetDate);
    }
    
    const filename = this.dateManager.getDailyNoteFilename(targetDate);
    const dailyPath = path.join(this.dailyNotesPath, filename);
    const fullPath = path.join(this.config.vaultPath, dailyPath);
    
    // Check if daily note exists
    let exists = false;
    let content = '';
    let frontmatter = {};
    
    try {
      content = await fs.readFile(fullPath, 'utf-8');
      const parsed = this.frontmatterManager.extractFrontmatter(content);
      frontmatter = parsed.frontmatter;
      exists = true;
    } catch {
      // Create new daily note with proper frontmatter
      frontmatter = this.frontmatterManager.getDailyNoteFrontmatter(dateStr);
      
      // Empty content - no templating
      const noteContent = '';
      
      // Build content with frontmatter
      content = this.frontmatterManager.buildContentWithFrontmatter(noteContent, frontmatter);
      
      // Create directory if needed
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      
      // Write new daily note
      await fs.writeFile(fullPath, content);
    }
    
    return {
      path: dailyPath,
      date: dateStr,
      exists: exists,
      created: !exists,
      frontmatter,
      content: this.frontmatterManager.extractFrontmatter(content).content
    };
  }

  /**
   * Append content to a daily note section
   */
  async append_to_daily_note(args = {}) {
    const { 
      content: newContent, 
      date = 'today', 
      section = 'Notes' 
    } = args;
    
    if (!newContent) {
      throw new Error('Content is required');
    }
    
    // Get or create the daily note
    const dailyNote = await this.get_daily_note({ date });
    const fullPath = path.join(this.config.vaultPath, dailyNote.path);
    
    // Read current content
    let fileContent = await fs.readFile(fullPath, 'utf-8');
    const parsed = this.frontmatterManager.extractFrontmatter(fileContent);
    let content = parsed.content;
    
    // Find the section and append content
    const sectionRegex = new RegExp(`^## ${section}\\s*$`, 'mi');
    const match = content.match(sectionRegex);
    
    if (match) {
      // Find the next section or end of file
      const sectionStart = match.index + match[0].length;
      const nextSectionMatch = content.slice(sectionStart).match(/^## /m);
      const sectionEnd = nextSectionMatch ? sectionStart + nextSectionMatch.index : content.length;
      
      // Insert content before the next section
      const beforeSection = content.slice(0, sectionEnd);
      const afterSection = content.slice(sectionEnd);
      
      // Add newline if section doesn't end with one
      const separator = beforeSection.endsWith('\n') ? '' : '\n';
      content = beforeSection + separator + newContent + '\n' + afterSection;
    } else {
      // Section doesn't exist, create it at the end
      content = content.trimEnd() + '\n\n## ' + section + '\n' + newContent + '\n';
    }
    
    // Update modified date using DateManager
    parsed.frontmatter.modified = this.dateManager.getCurrentDate();
    
    // Write back using FrontmatterManager
    fileContent = this.frontmatterManager.buildContentWithFrontmatter(content, parsed.frontmatter);
    await fs.writeFile(fullPath, fileContent);
    
    return {
      success: true,
      path: dailyNote.path,
      date: dailyNote.date,
      section,
      appended: newContent
    };
  }

  /**
   * Add a task to daily note
   */
  async add_daily_task(args = {}) {
    const { 
      task, 
      date = 'today',
      completed = false,
      priority
    } = args;
    
    if (!task) {
      throw new Error('Task description is required');
    }
    
    // Format task with checkbox and priority
    let taskLine = completed ? '- [x] ' : '- [ ] ';
    if (priority) {
      taskLine += `(${priority}) `;
    }
    taskLine += task;
    
    // Append to Tasks section
    return this.append_to_daily_note({
      content: taskLine,
      date,
      section: 'Tasks'
    });
  }
}

// Legacy singleton instance for backward compatibility
let dailyNotesInstance = null;

/**
 * Initialize daily notes with dependencies
 * For backward compatibility with existing MCP server
 */
export function initDailyNotes(config, frontmatterManager, dateManager) {
  dailyNotesInstance = new DailyNotes(config, frontmatterManager, dateManager);
}

/**
 * Legacy function exports for backward compatibility
 */
export async function get_daily_note(args) {
  if (!dailyNotesInstance) {
    throw new Error('Daily notes not initialized. Call initDailyNotes first.');
  }
  return dailyNotesInstance.get_daily_note(args);
}

export async function append_to_daily_note(args) {
  if (!dailyNotesInstance) {
    throw new Error('Daily notes not initialized. Call initDailyNotes first.');
  }
  return dailyNotesInstance.append_to_daily_note(args);
}

export async function add_daily_task(args) {
  if (!dailyNotesInstance) {
    throw new Error('Daily notes not initialized. Call initDailyNotes first.');
  }
  return dailyNotesInstance.add_daily_task(args);
}