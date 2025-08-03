import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

/**
 * Daily notes tools
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