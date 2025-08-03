import path from 'path';

/**
 * Path validation utility for security
 */

export function validatePath(filePath, vaultPath) {
  // Reject absolute paths
  if (path.isAbsolute(filePath)) {
    throw new Error('Invalid path: absolute paths not allowed');
  }
  
  // Normalize the path to prevent traversal
  const normalized = path.normalize(filePath);
  
  // Check for path traversal attempts
  if (normalized.includes('..')) {
    throw new Error('Invalid path: traversal outside vault not allowed');
  }
  
  // Ensure the resolved path is within the vault
  const resolvedPath = path.resolve(vaultPath, normalized);
  const resolvedVaultPath = path.resolve(vaultPath);
  
  if (!resolvedPath.startsWith(resolvedVaultPath)) {
    throw new Error('Invalid path: must be within vault');
  }
  
  // Check for special characters that might cause issues
  const invalidChars = /[<>:"|?*\x00-\x1f]/g;
  if (invalidChars.test(filePath)) {
    throw new Error('Invalid path: contains invalid characters');
  }
  
  // Check for reserved names on Windows
  const reservedNames = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
  const basename = path.basename(normalized, path.extname(normalized));
  if (reservedNames.test(basename)) {
    throw new Error('Path contains reserved name');
  }
  
  return normalized;
}