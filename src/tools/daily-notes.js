import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

/**
 * Daily notes tools
 */

/**
 * Get or create daily note for a specific date
 */
export async function get_daily_note(args = {}) {
  const { date = 'today' } = args;
  
  // Get vault path from config
  const configPath = path.join(process.cwd(), 'config', process.env.NODE_ENV === 'test' ? 'test-config.json' : 'config.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
  const vaultPath = config.vaultPath;
  
  // Calculate date
  let targetDate = new Date();
  if (date === 'yesterday') {
    targetDate.setDate(targetDate.getDate() - 1);
  } else if (date === 'tomorrow') {
    targetDate.setDate(targetDate.getDate() + 1);
  } else if (date !== 'today') {
    targetDate = new Date(date);
  }
  
  const dateStr = targetDate.toISOString().split('T')[0];
  const dailyPath = path.join('Daily', `${dateStr}.md`);
  const fullPath = path.join(vaultPath, dailyPath);
  
  // Check if daily note exists
  let exists = false;
  let content = '';
  let frontmatter = {};
  
  try {
    content = await fs.readFile(fullPath, 'utf-8');
    const parsed = matter(content);
    frontmatter = parsed.data;
    exists = true;
  } catch {
    // Create new daily note content
    frontmatter = {
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      type: 'daily-note',
      date: dateStr
    };
    
    content = matter.stringify(`# ${dateStr}

## Tasks
- [ ] 

## Notes


## Journal


`, frontmatter);
    
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
    content: matter(content).content
  };
}

/**
 * Append content to a daily note section
 */
export async function append_to_daily_note(args = {}) {
  const { 
    content: newContent, 
    date = 'today', 
    section = 'Notes' 
  } = args;
  
  if (!newContent) {
    throw new Error('Content is required');
  }
  
  // Get or create the daily note
  const dailyNote = await get_daily_note({ date });
  
  // Get vault path from config
  const configPath = path.join(process.cwd(), 'config', process.env.NODE_ENV === 'test' ? 'test-config.json' : 'config.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
  const vaultPath = config.vaultPath;
  const fullPath = path.join(vaultPath, dailyNote.path);
  
  // Read current content
  let fileContent = await fs.readFile(fullPath, 'utf-8');
  const parsed = matter(fileContent);
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
  
  // Update modified date
  parsed.data.modified = new Date().toISOString();
  
  // Write back
  fileContent = matter.stringify(content, parsed.data);
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
export async function add_daily_task(args = {}) {
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
  return append_to_daily_note({
    content: taskLine,
    date,
    section: 'Tasks'
  });
}