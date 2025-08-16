/**
 * Simple Project Initializer
 * 
 * Philosophy: Do the minimum needed to start a project.
 * - Copy a starter template
 * - Replace variables
 * - Get out of the way
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Initialize a project by copying a starter template
 */
export async function initProject({
  projectName,
  description = '',
  starter = 'default',
  targetDate = null
}) {
  if (!projectName) {
    throw new Error('projectName is required');
  }

  // Load config to get vault path
  const { loadConfig } = await import('../utils/config-loader.js');
  const config = await loadConfig();
  
  const projectsFolder = config.projectsFolder || 'Projects';
  const projectPath = path.join(config.vaultPath, projectsFolder, projectName);
  
  // Check if project already exists
  try {
    await fs.access(projectPath);
    throw new Error(`Project "${projectName}" already exists`);
  } catch (error) {
    if (error.message.includes('already exists')) {
      throw error;
    }
    // Path doesn't exist, which is what we want
  }

  // Create project directory
  await fs.mkdir(projectPath, { recursive: true });

  // Define starter templates directory
  const startersPath = path.join(__dirname, '..', '..', 'config', 'project-starters');
  const starterFile = path.join(startersPath, `${starter}.md`);

  // Check if starter exists, fall back to default
  let template;
  try {
    template = await fs.readFile(starterFile, 'utf-8');
  } catch (e) {
    // Try default starter
    try {
      template = await fs.readFile(path.join(startersPath, 'default.md'), 'utf-8');
    } catch (e2) {
      // Use inline minimal template as last resort
      template = `# {{projectName}}

{{description}}

Created: {{date}}
Status: Active

## Next Steps
- [ ] Define objectives
- [ ] Set up structure
- [ ] Begin work
`;
    }
  }

  // Replace variables
  const currentDate = new Date().toISOString().split('T')[0];
  const content = template
    .replace(/{{projectName}}/g, projectName)
    .replace(/{{description}}/g, description || 'No description provided')
    .replace(/{{date}}/g, currentDate)
    .replace(/{{currentDate}}/g, currentDate)
    .replace(/{{targetDate}}/g, targetDate || 'TBD');

  // Write the main project file
  const mainFile = path.join(projectPath, `${projectName}.md`);
  await fs.writeFile(mainFile, content, 'utf-8');

  // Create basic folder structure (minimal)
  const folders = ['Documentation', 'Resources'];
  for (const folder of folders) {
    await fs.mkdir(path.join(projectPath, folder), { recursive: true });
  }

  return {
    success: true,
    projectName,
    projectPath: path.join(projectsFolder, projectName),
    starter: starter,
    filesCreated: [`${projectName}.md`],
    foldersCreated: folders
  };
}

/**
 * List available project starters
 */
export async function listStarters() {
  const startersPath = path.join(__dirname, '..', '..', 'config', 'project-starters');
  
  const starters = [];
  
  try {
    const files = await fs.readdir(startersPath);
    
    for (const file of files) {
      if (file.endsWith('.md')) {
        const name = file.replace('.md', '');
        const content = await fs.readFile(path.join(startersPath, file), 'utf-8');
        const firstLine = content.split('\n')[0];
        
        starters.push({
          key: name,
          name: name.charAt(0).toUpperCase() + name.slice(1),
          description: firstLine.replace(/^#\s*/, '').replace(/{{.*?}}/g, '...'),
          preview: content.slice(0, 200) + '...'
        });
      }
    }
  } catch (e) {
    // Return defaults if directory doesn't exist
    starters.push({
      key: 'default',
      name: 'Default',
      description: 'Standard project starter',
      preview: 'Basic project with documentation'
    });
  }
  
  return { starters };
}
