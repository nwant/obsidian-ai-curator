import fs from 'fs/promises';
import { loadConfig, getVaultPath } from '../utils/config-loader.js';
import path from 'path';
import matter from 'gray-matter';
import { NoteHandler } from '../handlers/note-handler.js';
import { VaultCache } from '../cache/vault-cache.js';
import { ObsidianAPIClient } from '../obsidian-api-client.js';

/**
 * Note operation tools for compatibility with tests
 */

// Get config
async function getConfig() {
  const config = await loadConfig();
  return config;
}

// Write note function for test compatibility
export async function write_note(args) {
  const { path: notePath, content } = args;
  
  if (!notePath) {
    throw new Error('path parameter is required');
  }
  
  if (content === undefined || content === null) {
    throw new Error('content parameter is required');
  }
  
  const config = await getConfig();
  const cache = new VaultCache(config);
  const apiClient = new ObsidianAPIClient(config);
  const handler = new NoteHandler(config, cache, apiClient);
  
  // Pass all args to handler, not just path and content
  return handler.writeNote(args);
}

// Read notes function for test compatibility
export async function read_notes(args) {
  const { paths, renderDataview = false, dataviewMode = 'smart' } = args;
  
  if (!paths || !Array.isArray(paths)) {
    throw new Error('paths parameter is required and must be an array');
  }
  
  const config = await getConfig();
  const cache = new VaultCache(config);
  const apiClient = new ObsidianAPIClient(config);
  const handler = new NoteHandler(config, cache, apiClient);
  
  return handler.readNotes({ paths, renderDataview, dataviewMode });
}

// Archive notes function
export async function archive_notes(args) {
  const { moves } = args;
  
  if (!moves || !Array.isArray(moves)) {
    throw new Error('moves parameter is required and must be an array');
  }
  
  const config = await getConfig();
  const cache = new VaultCache(config);
  const apiClient = new ObsidianAPIClient(config);
  const handler = new NoteHandler(config, cache, apiClient);
  
  return handler.archiveNotes({ moves });
}

// Update frontmatter function
export async function update_frontmatter(args) {
  const { path: notePath, updates, merge = true } = args;
  
  if (!notePath) {
    throw new Error('path parameter is required');
  }
  
  if (!updates) {
    throw new Error('updates parameter is required');
  }
  
  const config = await getConfig();
  const cache = new VaultCache(config);
  const apiClient = new ObsidianAPIClient(config);
  const handler = new NoteHandler(config, cache, apiClient);
  
  return handler.updateFrontmatter({ path: notePath, updates, merge });
}

// Get frontmatter function
export async function get_frontmatter(args) {
  const { path: notePath } = args;
  
  if (!notePath) {
    throw new Error('path parameter is required');
  }
  
  const config = await getConfig();
  const cache = new VaultCache(config);
  const apiClient = new ObsidianAPIClient(config);
  const handler = new NoteHandler(config, cache, apiClient);
  
  return handler.getFrontmatter({ path: notePath });
}