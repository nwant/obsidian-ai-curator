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
    // Clear any existing timer first
    if (this.checkTimer) {
      clearTimeout(this.checkTimer);
      this.checkTimer = null;
    }
    
    try {
      const response = await fetch(`${this.apiUrl}/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(1000) // 1 second timeout
      });
      
      if (response.ok) {
        const data = await response.json();
        const wasAvailable = this.available;
        // Accept both formats for compatibility
        this.available = (data.success && data.data?.status === 'ok') || data.status === 'ok';
        this.connected = this.available; // Keep in sync
        
        // Store server info if available
        if (data.version) {
          this.serverInfo = { version: data.version };
        }
        
        // Only log when status changes
        if (this.available && !wasAvailable && process.env.NODE_ENV !== 'test') {
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
    return this.connected; // Use connected for consistency with tests
  }
  
  /**
   * Check connection status (for testing)
   */
  async checkConnection() {
    // Clear any existing timer first
    if (this.checkTimer) {
      clearTimeout(this.checkTimer);
      this.checkTimer = null;
    }
    
    await this.checkAvailability();
    return this.connected;
  }
  
  /**
   * Check if connected (alias for testing)
   */
  isConnected() {
    return this.connected;
  }

  async request(endpoint, params = {}) {
    if (!this.connected) {
      throw new Error('API client not connected');
    }

    try {
      const response = await fetch(`${this.apiUrl}${endpoint}`, {
        method: 'POST',
        headers: { 
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      if (response.ok) {
        const text = await response.text();
        if (!text) {
          throw new Error('Empty response');
        }
        const data = JSON.parse(text);
        
        // Return data directly for test compatibility
        if (data.error) {
          throw new Error(data.error);
        }
        return data;
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
    } catch (error) {
      if (error.name === 'AbortError' || error.message?.includes('timeout')) {
        throw new Error('Request timeout');
      }
      throw error;
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