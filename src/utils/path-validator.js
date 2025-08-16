import path from 'path';

/**
 * Validates and sanitizes file paths to prevent path traversal attacks
 */
export class PathValidator {
  /**
   * Check if a path is safe (no traversal attempts)
   */
  static isPathSafe(userPath, basePath) {
    if (!userPath || !basePath) {
      return false;
    }

    // Normalize paths
    const normalizedUser = path.normalize(userPath);
    const normalizedBase = path.normalize(basePath);
    
    // Resolve to absolute paths
    const resolvedPath = path.resolve(normalizedBase, normalizedUser);
    const resolvedBase = path.resolve(normalizedBase);
    
    // Check if resolved path is within base path
    return resolvedPath.startsWith(resolvedBase + path.sep) || 
           resolvedPath === resolvedBase;
  }

  /**
   * Validate a note path
   */
  static validateNotePath(notePath) {
    if (!notePath || typeof notePath !== 'string') {
      throw new Error('Invalid path: must be a non-empty string');
    }

    // Check for null bytes
    if (notePath.includes('\0')) {
      throw new Error('Invalid path: contains null bytes');
    }

    // Check for absolute paths
    if (path.isAbsolute(notePath)) {
      throw new Error('Invalid path: absolute paths not allowed');
    }

    // Check for path traversal
    const normalized = path.normalize(notePath);
    if (normalized.includes('..') || normalized.startsWith('/')) {
      throw new Error('Invalid path: path traversal not allowed');
    }

    // Check for invalid characters (Windows)
    const invalidChars = /[<>:"|?*]/;
    if (process.platform === 'win32' && invalidChars.test(notePath)) {
      throw new Error('Invalid path: contains invalid characters');
    }

    return normalized;
  }

  /**
   * Sanitize a file path
   */
  static sanitizePath(userPath) {
    if (!userPath || typeof userPath !== 'string') {
      return '';
    }

    // Remove null bytes
    let sanitized = userPath.replace(/\0/g, '');
    
    // Normalize path separators
    sanitized = sanitized.replace(/\\/g, '/');
    
    // Remove leading slashes
    sanitized = sanitized.replace(/^\/+/, '');
    
    // Remove path traversal attempts
    sanitized = sanitized.replace(/\.\./g, '');
    
    // Remove double slashes
    sanitized = sanitized.replace(/\/+/g, '/');
    
    return sanitized;
  }
}