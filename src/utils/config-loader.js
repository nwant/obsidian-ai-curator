import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let cachedConfig = null;
let lastLoadTime = 0;
const CACHE_DURATION = 60000; // Cache for 1 minute

/**
 * Load configuration file with proper path resolution
 * This ensures the config is loaded from the correct location
 * regardless of the current working directory
 */
export async function loadConfig() {
  // Check if we have a recent cached config
  const now = Date.now();
  if (cachedConfig && (now - lastLoadTime) < CACHE_DURATION) {
    return cachedConfig;
  }
  
  try {
    // Resolve config path relative to the project root
    const configPath = path.join(
      __dirname, 
      '..', 
      '..', 
      'config', 
      process.env.NODE_ENV === 'test' ? 'test-config.json' : 'config.json'
    );
    
    const configData = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configData);
    
    // Fallback to environment variable if vault path not in config
    config.vaultPath = config.vaultPath || process.env.OBSIDIAN_VAULT_PATH || '';
    
    if (!config.vaultPath) {
      throw new Error('Vault path not configured. Please set vaultPath in config/config.json or OBSIDIAN_VAULT_PATH environment variable.');
    }
    
    // Cache the config
    cachedConfig = config;
    lastLoadTime = now;
    
    return config;
  } catch (error) {
    // Don't cache errors
    cachedConfig = null;
    throw error;
  }
}

/**
 * Clear the config cache (useful for testing)
 */
export function clearConfigCache() {
  cachedConfig = null;
  lastLoadTime = 0;
}

/**
 * Get the vault path from config
 */
export async function getVaultPath() {
  const config = await loadConfig();
  return config.vaultPath;
}