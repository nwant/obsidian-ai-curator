export class ObsidianAPIClient {
  constructor(apiUrl = 'http://localhost:3001') {
    this.apiUrl = apiUrl;
    this.baseUrl = apiUrl; // Alias for test compatibility
    this.available = false;
    this.connected = false; // Alias for test compatibility
    this.lastCheck = 0;
    this.checkInterval = 5000; // Check every 5 seconds
    this.checkTimer = null;
    
    // Don't auto-check in test environment
    if (process.env.NODE_ENV !== 'test') {
      this.checkAvailability();
    }
  }

  async checkAvailability() {
    try {
      const response = await fetch(`${this.apiUrl}/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(1000) // 1 second timeout
      });
      
      if (response.ok) {
        const data = await response.json();
        const wasAvailable = this.available;
        this.available = data.success && data.data?.status === 'ok';
        this.connected = this.available; // Keep in sync
        // Only log when status changes
        if (this.available && !wasAvailable) {
          console.error(`Obsidian API server available at ${this.apiUrl}`);
        }
      } else {
        this.available = false;
        this.connected = false;
      }
    } catch (error) {
      this.available = false;
      this.connected = false;
      // Silently fail - API server might not be running
    }
    
    this.lastCheck = Date.now();
    
    // Schedule next check (but store timer reference for cleanup)
    if (process.env.NODE_ENV !== 'test') {
      this.checkTimer = setTimeout(() => this.checkAvailability(), this.checkInterval);
    }
  }
  
  /**
   * Clean up timers (for testing)
   */
  cleanup() {
    if (this.checkTimer) {
      clearTimeout(this.checkTimer);
      this.checkTimer = null;
    }
  }

  isAvailable() {
    // Re-check if last check was too long ago
    if (Date.now() - this.lastCheck > this.checkInterval * 2 && process.env.NODE_ENV !== 'test') {
      this.checkAvailability();
    }
    return this.available;
  }
  
  /**
   * Check connection status (for testing)
   * @stub - Basic implementation
   */
  async checkConnection() {
    await this.checkAvailability();
    return this.connected;
  }

  async request(endpoint, params = {}) {
    if (!this.available) {
      return null;
    }

    try {
      const url = new URL(`${this.apiUrl}${endpoint}`);
      Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          return data.data;
        } else {
          console.error('API error:', data.error);
          return null;
        }
      } else {
        console.error('API request failed:', response.status, response.statusText);
        this.available = false; // Mark as unavailable on error
        return null;
      }
    } catch (error) {
      console.error('API request error:', error);
      this.available = false; // Mark as unavailable on error
      return null;
    }
  }

  async search(query, options = {}) {
    return this.request('/api/search', {
      query,
      maxResults: options.maxResults,
      contextLines: options.contextLines
    });
  }

  async getTags(path = null) {
    return this.request('/api/tags', path ? { path } : {});
  }

  async getLinks(path, type = 'both') {
    return this.request('/api/links', { path, type });
  }

  async getMetadata(paths) {
    if (!Array.isArray(paths)) {
      paths = [paths];
    }
    return this.request('/api/metadata', { paths: paths.join(',') });
  }

  async getVaultInfo() {
    return this.request('/api/vault-info');
  }

  async getAllMetadata() {
    // Get vault info first to know how many files we have
    const vaultInfo = await this.getVaultInfo();
    if (!vaultInfo || !vaultInfo.fileCount) {
      return null;
    }

    // For now, we'll need to implement a new endpoint or use vault scan
    // This is a placeholder - the API server would need to provide this
    return null;
  }
}