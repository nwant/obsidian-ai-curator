import { describe, it, beforeEach, afterEach, expect } from '@jest/globals';
import { ObsidianAPIClient } from '../../src/obsidian-api-client.js';
import http from 'http';

describe('ObsidianAPIClient', () => {
  let client;
  let mockServer;
  let serverPort;
  
  beforeEach(async () => {
    // Create a mock HTTP server
    mockServer = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      
      // Route handling
      if (req.url === '/health' && req.method === 'GET') {
        res.statusCode = 200;
        res.end(JSON.stringify({ status: 'ok', version: '1.0.0' }));
      } else if (req.url === '/api/test' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          res.statusCode = 200;
          res.end(JSON.stringify({ 
            success: true, 
            received: JSON.parse(body) 
          }));
        });
      } else if (req.url === '/api/error') {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'Server error' }));
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });
    
    // Start server on random port
    await new Promise((resolve) => {
      mockServer.listen(0, '127.0.0.1', () => {
        serverPort = mockServer.address().port;
        resolve();
      });
    });
    
    client = new ObsidianAPIClient(`http://127.0.0.1:${serverPort}`);
  });
  
  afterEach(async () => {
    // Clean up client timers
    if (client) {
      client.cleanup();
    }
    
    // Close the mock server
    if (mockServer) {
      await new Promise((resolve, reject) => {
        mockServer.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      mockServer = null;
    }
  });
  
  describe('initialization', () => {
    it('should initialize with URL', () => {
      expect(client.baseUrl).toBe(`http://127.0.0.1:${serverPort}`);
      expect(client.connected).toBe(false);
    });
    
    it('should use default URL when not provided', () => {
      const defaultClient = new ObsidianAPIClient();
      expect(defaultClient.baseUrl).toBe('http://localhost:3001');
      defaultClient.cleanup();
    });
  });
  
  describe('checkConnection', () => {
    it('should connect to running server', async () => {
      const result = await client.checkConnection();
      
      expect(result).toBe(true);
      expect(client.connected).toBe(true);
      expect(client.serverInfo).toBeDefined();
      expect(client.serverInfo.version).toBe('1.0.0');
    });
    
    it('should handle connection failure', async () => {
      const badClient = new ObsidianAPIClient('http://localhost:99999');
      const result = await badClient.checkConnection();
      
      expect(result).toBe(false);
      expect(badClient.connected).toBe(false);
      badClient.cleanup();
    });
    
    it('should timeout on slow connections', async () => {
      // Create slow server
      const slowServer = http.createServer((req, res) => {
        // Never respond
      });
      
      await new Promise((resolve) => {
        slowServer.listen(0, '127.0.0.1', resolve);
      });
      
      const slowPort = slowServer.address().port;
      const slowClient = new ObsidianAPIClient(`http://127.0.0.1:${slowPort}`);
      
      const result = await slowClient.checkConnection();
      
      expect(result).toBe(false);
      slowClient.cleanup();
      
      await new Promise((resolve) => {
        slowServer.close(resolve);
      });
    }, 10000); // Increase timeout
  });
  
  describe('isConnected', () => {
    it('should return connection status', () => {
      expect(client.isConnected()).toBe(false);
      
      client.connected = true;
      expect(client.isConnected()).toBe(true);
    });
  });
  
  describe('isAvailable', () => {
    it('should check if API is available', () => {
      expect(client.isAvailable()).toBe(false);
      
      client.connected = true;
      expect(client.isAvailable()).toBe(true);
    });
  });
  
  describe('request', () => {
    beforeEach(async () => {
      // Ensure connected
      await client.checkConnection();
    });
    
    it('should make successful POST request', async () => {
      const result = await client.request('/api/test', {
        test: 'data',
        number: 42
      });
      
      expect(result.success).toBe(true);
      expect(result.received).toEqual({
        test: 'data',
        number: 42
      });
    });
    
    it('should handle server errors', async () => {
      await expect(client.request('/api/error', {}))
        .rejects.toThrow('Server error');
    });
    
    it('should handle 404 errors', async () => {
      await expect(client.request('/api/nonexistent', {}))
        .rejects.toThrow('Not found');
    });
    
    it('should fail when not connected', async () => {
      client.connected = false;
      
      await expect(client.request('/api/test', {}))
        .rejects.toThrow('not connected');
    });
    
    it('should handle request timeout', async () => {
      // Create endpoint that delays response
      let delayTimer = null;
      const slowServer = http.createServer((req, res) => {
        if (req.url === '/health') {
          res.statusCode = 200;
          res.end(JSON.stringify({ status: 'ok' }));
        } else {
          // Delay response beyond timeout
          delayTimer = setTimeout(() => {
            res.statusCode = 200;
            res.end('{}');
          }, 10000);
        }
      });
      
      await new Promise((resolve) => {
        slowServer.listen(0, '127.0.0.1', resolve);
      });
      
      const slowPort = slowServer.address().port;
      const slowClient = new ObsidianAPIClient(`http://127.0.0.1:${slowPort}`);
      await slowClient.checkConnection();
      
      await expect(slowClient.request('/api/slow', {}))
        .rejects.toThrow('Request timeout');
      
      // Clean up timer before closing
      if (delayTimer) {
        clearTimeout(delayTimer);
      }
      
      slowClient.cleanup();
      
      await new Promise((resolve) => {
        slowServer.close(resolve);
      });
    }, 10000); // Increase timeout for this test
  });
  
  describe('fetch wrapper', () => {
    it('should handle network errors', async () => {
      const offlineClient = new ObsidianAPIClient('http://definitely.not.a.real.domain:3001');
      
      const result = await offlineClient.checkConnection();
      expect(result).toBe(false);
      
      offlineClient.cleanup();
    });
    
    it('should include proper headers', async () => {
      // Create server that checks headers
      const headerServer = http.createServer((req, res) => {
        res.setHeader('Content-Type', 'application/json');
        
        if (req.url === '/health') {
          res.statusCode = 200;
          res.end(JSON.stringify({ status: 'ok' }));
        } else if (req.url === '/api/headers') {
          res.statusCode = 200;
          res.end(JSON.stringify({
            headers: {
              'content-type': req.headers['content-type'],
              'accept': req.headers['accept']
            }
          }));
        }
      });
      
      await new Promise((resolve) => {
        headerServer.listen(0, '127.0.0.1', resolve);
      });
      
      const headerPort = headerServer.address().port;
      const headerClient = new ObsidianAPIClient(`http://127.0.0.1:${headerPort}`);
      await headerClient.checkConnection();
      
      const result = await headerClient.request('/api/headers', {});
      
      expect(result.headers['content-type']).toBe('application/json');
      expect(result.headers['accept']).toBe('application/json');
      
      headerClient.cleanup();
      
      await new Promise((resolve) => {
        headerServer.close(resolve);
      });
    });
  });
  
  describe('reconnection', () => {
    it('should handle reconnection', async () => {
      await client.checkConnection();
      expect(client.connected).toBe(true);
      
      // Simulate disconnect
      client.connected = false;
      
      // Should reconnect
      const result = await client.checkConnection();
      expect(result).toBe(true);
      expect(client.connected).toBe(true);
    });
  });
  
  describe('error scenarios', () => {
    it('should handle malformed JSON response', async () => {
      const badServer = http.createServer((req, res) => {
        if (req.url === '/health') {
          res.statusCode = 200;
          res.end('not json');
        }
      });
      
      await new Promise((resolve) => {
        badServer.listen(0, '127.0.0.1', resolve);
      });
      
      const badPort = badServer.address().port;
      const badClient = new ObsidianAPIClient(`http://127.0.0.1:${badPort}`);
      
      const result = await badClient.checkConnection();
      expect(result).toBe(false);
      
      badClient.cleanup();
      
      await new Promise((resolve) => {
        badServer.close(resolve);
      });
    });
    
    it('should handle empty response', async () => {
      const emptyServer = http.createServer((req, res) => {
        if (req.url === '/health') {
          res.statusCode = 200;
          res.end(JSON.stringify({ status: 'ok' }));
        } else {
          res.statusCode = 200;
          res.end('');
        }
      });
      
      await new Promise((resolve) => {
        emptyServer.listen(0, '127.0.0.1', resolve);
      });
      
      const emptyPort = emptyServer.address().port;
      const emptyClient = new ObsidianAPIClient(`http://127.0.0.1:${emptyPort}`);
      await emptyClient.checkConnection();
      
      await expect(emptyClient.request('/api/empty', {}))
        .rejects.toThrow();
      
      emptyClient.cleanup();
      
      await new Promise((resolve) => {
        emptyServer.close(resolve);
      });
    });
  });
});