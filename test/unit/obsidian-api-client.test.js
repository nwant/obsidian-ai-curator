import { describe, it, beforeEach, afterEach, expect } from '@jest/globals';
import { ObsidianAPIClient } from '../../src/obsidian-api-client.js';

// Mock fetch globally
global.fetch = jest.fn();

describe('ObsidianAPIClient', () => {
  let client;
  
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Reset fetch mock
    global.fetch.mockReset();
    
    // Create client instance
    client = new ObsidianAPIClient();
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('Constructor and initialization', () => {
    it('should initialize with default values', () => {
      expect(client.baseUrl).toBe('http://localhost:3001');
      expect(client.apiKey).toBe('obsidian-ai-curator');
      expect(client.connected).toBe(false);
      expect(client.lastCheck).toBe(0);
    });
    
    it('should use environment variables if available', () => {
      process.env.OBSIDIAN_API_URL = 'http://custom:4000';
      process.env.OBSIDIAN_API_KEY = 'custom-key';
      
      const customClient = new ObsidianAPIClient();
      
      expect(customClient.baseUrl).toBe('http://custom:4000');
      expect(customClient.apiKey).toBe('custom-key');
      
      // Clean up
      delete process.env.OBSIDIAN_API_URL;
      delete process.env.OBSIDIAN_API_KEY;
    });
  });
  
  describe('checkConnection', () => {
    it('should detect successful connection', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ connected: true, version: '1.0.0' })
      });
      
      const result = await client.checkConnection();
      
      expect(result).toBe(true);
      expect(client.connected).toBe(true);
      expect(client.lastCheck).toBeGreaterThan(0);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/health',
        expect.objectContaining({
          headers: { 'X-API-Key': 'obsidian-ai-curator' }
        })
      );
    });
    
    it('should handle connection failure', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Connection refused'));
      
      const result = await client.checkConnection();
      
      expect(result).toBe(false);
      expect(client.connected).toBe(false);
    });
    
    it('should handle non-OK response', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      });
      
      const result = await client.checkConnection();
      
      expect(result).toBe(false);
      expect(client.connected).toBe(false);
    });
    
    it('should use cached connection status within 30 seconds', async () => {
      // First check - successful
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ connected: true })
      });
      
      await client.checkConnection();
      expect(global.fetch).toHaveBeenCalledTimes(1);
      
      // Second check within 30 seconds - should use cache
      const result = await client.checkConnection();
      
      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(1); // Not called again
    });
    
    it('should recheck after 30 seconds', async () => {
      // First check
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ connected: true })
      });
      
      await client.checkConnection();
      
      // Simulate time passing
      client.lastCheck = Date.now() - 31000;
      
      // Second check should make new request
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ connected: true })
      });
      
      await client.checkConnection();
      
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
  
  describe('isConnected', () => {
    it('should return current connection status', () => {
      expect(client.isConnected()).toBe(false);
      
      client.connected = true;
      expect(client.isConnected()).toBe(true);
    });
  });
  
  describe('request', () => {
    beforeEach(async () => {
      // Set up as connected
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ connected: true })
      });
      await client.checkConnection();
    });
    
    it('should make successful API request', async () => {
      const mockResponse = { data: { files: ['test.md'] }, success: true };
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });
      
      const result = await client.request('vault/scan', { patterns: ['*.md'] });
      
      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/vault/scan',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'obsidian-ai-curator'
          },
          body: JSON.stringify({ patterns: ['*.md'] })
        })
      );
    });
    
    it('should use GET method for specified endpoints', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tags: [] })
      });
      
      await client.request('tags/all');
      
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/tags/all',
        expect.objectContaining({
          method: 'GET'
        })
      );
    });
    
    it('should throw error on non-OK response', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request'
      });
      
      await expect(client.request('invalid/endpoint')).rejects.toThrow('API request failed: 400 Bad Request');
    });
    
    it('should throw error on network failure', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));
      
      await expect(client.request('test/endpoint')).rejects.toThrow('Network error');
    });
    
    it('should throw error if not connected', async () => {
      client.connected = false;
      
      await expect(client.request('test/endpoint')).rejects.toThrow('Not connected to Obsidian API');
    });
    
    it('should set connection timeout', async () => {
      let timeoutId;
      const mockSetTimeout = jest.spyOn(global, 'setTimeout').mockImplementation((fn, delay) => {
        timeoutId = 123;
        return timeoutId;
      });
      
      global.fetch.mockImplementation(() => new Promise(() => {})); // Never resolves
      
      const promise = client.request('slow/endpoint');
      
      // Should timeout after 5 seconds
      expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);
      
      mockSetTimeout.mockRestore();
    });
  });
  
  describe('Error scenarios', () => {
    it('should handle malformed JSON response', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => { throw new Error('Invalid JSON'); }
      });
      
      await expect(client.request('bad/json')).rejects.toThrow('Invalid JSON');
    });
    
    it('should handle missing response body', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => null
      });
      
      const result = await client.request('empty/response');
      expect(result).toBeNull();
    });
  });
  
  describe('Integration patterns', () => {
    it('should support common vault operations', async () => {
      // Mock successful connection
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ connected: true })
      });
      await client.checkConnection();
      
      // Test vault scan
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          success: true, 
          data: { files: [], total: 0 } 
        })
      });
      
      const scanResult = await client.request('vault/scan', { 
        patterns: ['**/*.md'] 
      });
      
      expect(scanResult.success).toBe(true);
      expect(scanResult.data).toHaveProperty('files');
    });
  });
});