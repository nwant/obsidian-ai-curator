import fs from 'fs/promises';
import nodePath from 'path';
import matter from 'gray-matter';
import { validatePath } from './path-validator.js';

/**
 * Writing tools for creating and updating notes
 */

export async function write_note(args) {
  const { path: filePath, content, preserveFrontmatter = false } = args;
  
  if (!filePath) {
    throw new Error('Path parameter is required');
  }
  
  if (content === undefined) {
    throw new Error('Content parameter is required');
  }
  
  // Get vault path from config
  const configPath = nodePath.join(process.cwd(), 'config', process.env.NODE_ENV === 'test' ? 'test-config.json' : 'config.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
  const vaultPath = config.vaultPath;
  
  // Validate the path for security
  const validatedPath = validatePath(filePath, vaultPath);
  const fullPath = nodePath.join(vaultPath, validatedPath);
  
  // Create directory if needed
  await fs.mkdir(nodePath.dirname(fullPath), { recursive: true });
  
  let finalFrontmatter = {};
  
  // If preserving frontmatter, read existing file first
  if (preserveFrontmatter) {
    try {
      const existingContent = await fs.readFile(fullPath, 'utf-8');
      const existingParsed = matter(existingContent);
      finalFrontmatter = existingParsed.data;
    } catch {
      // File doesn't exist, that's ok
    }
  }
  
  // Parse new content
  const parsed = matter(content);
  
  // Convert markdown links to wikilinks in the content
  let processedContent = parsed.content;
  
  // Match markdown links with relative paths (not external URLs)
  const markdownLinkRegex = /\[([^\]]+)\]\((?!https?:\/\/)([^)]+\.md)\)/g;
  processedContent = processedContent.replace(markdownLinkRegex, (match, text, linkPath) => {
    // Extract just the filename without path and extension
    const filename = nodePath.basename(linkPath, '.md');
    
    
    // If the text is different from filename, use alias syntax
    if (text !== filename) {
      return `[[${filename}|${text}]]`;
    } else {
      return `[[${filename}]]`;
    }
  });
  
  // Merge frontmatter if preserving, otherwise use new frontmatter
  if (preserveFrontmatter) {
    finalFrontmatter = { ...finalFrontmatter, ...parsed.data };
  } else {
    finalFrontmatter = parsed.data;
  }
  
  // Normalize date fields to YYYY-MM-DD format
  const dateFields = ['created', 'modified', 'date', 'updated'];
  for (const field of dateFields) {
    if (finalFrontmatter[field]) {
      // Try to parse and normalize the date
      const parsedDate = new Date(finalFrontmatter[field]);
      if (!isNaN(parsedDate.getTime())) {
        finalFrontmatter[field] = parsedDate.toISOString().split('T')[0];
      }
    }
  }
  
  // Auto-add timestamps if not present
  if (!finalFrontmatter.created) {
    finalFrontmatter.created = new Date().toISOString().split('T')[0];
  }
  
  // Only update modified if it doesn't exist
  if (!finalFrontmatter.modified) {
    finalFrontmatter.modified = new Date().toISOString().split('T')[0];
  }
  
  // Clean up tags
  if (finalFrontmatter.tags && Array.isArray(finalFrontmatter.tags)) {
    finalFrontmatter.tags = finalFrontmatter.tags.map(tag => {
      // Remove # prefix if present
      tag = tag.replace(/^#/, '');
      // Replace spaces with hyphens
      tag = tag.replace(/\s+/g, '-');
      // Convert to lowercase
      tag = tag.toLowerCase();
      return tag;
    });
  }
  
  // Format content with frontmatter
  const formattedContent = matter.stringify(processedContent, finalFrontmatter);
  
  // Write file
  await fs.writeFile(fullPath, formattedContent);
  
  return {
    path: filePath,
    success: true,
    frontmatter: finalFrontmatter
  };
}

export async function append_to_daily_note(args) {
  const { content, date = 'today', section = 'Notes' } = args;
  
  // Get vault path from config
  const configPath = nodePath.join(process.cwd(), 'config', process.env.NODE_ENV === 'test' ? 'test-config.json' : 'config.json');
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
  const dailyPath = nodePath.join('Daily', `${dateStr}.md`);
  const fullPath = nodePath.join(vaultPath, dailyPath);
  
  // Read or create daily note
  let existingContent = '';
  try {
    existingContent = await fs.readFile(fullPath, 'utf-8');
  } catch {
    // Create new daily note
    existingContent = `---
created: ${new Date().toISOString()}
modified: ${new Date().toISOString()}
type: daily-note
---

# ${dateStr}

## ${section}

`;
  }
  
  // Parse content
  const parsed = matter(existingContent);
  
  // Find or create section
  const lines = parsed.content.split('\n');
  let sectionIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === `## ${section}`) {
      sectionIndex = i;
      break;
    }
  }
  
  if (sectionIndex === -1) {
    // Add new section
    lines.push('', `## ${section}`, '');
    sectionIndex = lines.length - 2;
  }
  
  // Find where to insert content (after section header)
  let insertIndex = sectionIndex + 1;
  while (insertIndex < lines.length && lines[insertIndex].trim() === '') {
    insertIndex++;
  }
  
  // Insert content
  lines.splice(insertIndex, 0, content, '');
  
  // Update modified timestamp
  parsed.data.modified = new Date().toISOString();
  
  // Write back
  const newContent = matter.stringify(lines.join('\n'), parsed.data);
  await fs.writeFile(fullPath, newContent);
  
  return {
    path: dailyPath,
    date: dateStr,
    section,
    success: true
  };
}

export async function add_daily_task(args) {
  const { task, date = 'today', completed = false, priority } = args;
  
  // Format task with checkbox
  let taskLine = completed ? '- [x] ' : '- [ ] ';
  
  if (priority) {
    const priorityEmojis = {
      high: '🔴',
      medium: '🟡',
      low: '🟢'
    };
    taskLine += `${priorityEmojis[priority]} `;
  }
  
  taskLine += task;
  
  // Append to Tasks section
  return await append_to_daily_note({
    content: taskLine,
    date,
    section: 'Tasks'
  });
}