import { Notice } from 'obsidian';
import { MCPMessage, ConnectionState, ConnectionStatus } from './types';

export class MCPClient {
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private messageHandlers: Map<string, (message: MCPMessage) => void> = new Map();
  private requestHandlers: Map<string, (response: MCPMessage) => void> = new Map();
  private messageId = 0;
  
  public state: ConnectionState = {
    status: 'disconnected',
    reconnectAttempts: 0
  };

  constructor(
    private serverUrl: string,
    private onStateChange: (state: ConnectionState) => void,
    private debugMode: boolean = false
  ) {}

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.updateState({ status: 'connecting' });

    try {
      this.ws = new WebSocket(this.serverUrl);
      
      this.ws.onopen = () => {
        this.debug('WebSocket connected');
        this.updateState({
          status: 'connected',
          lastConnected: new Date(),
          reconnectAttempts: 0
        });
        new Notice('AI Curator: Connected to MCP server');
      };

      this.ws.onclose = (event) => {
        this.debug('WebSocket closed', event);
        this.updateState({ status: 'disconnected' });
        
        if (!event.wasClean) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        this.debug('WebSocket error', error);
        this.updateState({
          status: 'error',
          lastError: 'Connection failed'
        });
        new Notice('AI Curator: Connection error', 5000);
      };

      this.ws.onmessage = (event) => {
        try {
          const message: MCPMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse message:', error);
        }
      };
    } catch (error) {
      this.updateState({
        status: 'error',
        lastError: error.message
      });
      throw error;
    }
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.updateState({ status: 'disconnected' });
  }

  async request(method: string, params?: any): Promise<any> {
    if (this.state.status !== 'connected') {
      throw new Error('Not connected to MCP server');
    }

    const id = this.generateId();
    const message: MCPMessage = {
      id,
      type: 'request',
      method,
      params
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.requestHandlers.delete(id);
        reject(new Error('Request timeout'));
      }, 30000);

      this.requestHandlers.set(id, (response) => {
        clearTimeout(timeout);
        this.requestHandlers.delete(id);

        if (response.error) {
          reject(new Error(response.error.message || 'Request failed'));
        } else {
          resolve(response.result);
        }
      });

      this.send(message);
    });
  }

  notify(method: string, params?: any): void {
    if (this.state.status !== 'connected') {
      this.debug('Cannot send notification - not connected');
      return;
    }

    const message: MCPMessage = {
      id: this.generateId(),
      type: 'notification',
      method,
      params
    };

    this.send(message);
  }

  on(method: string, handler: (params: any) => void): void {
    this.messageHandlers.set(method, handler);
  }

  off(method: string): void {
    this.messageHandlers.delete(method);
  }

  private send(message: MCPMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.debug('Sending message:', message);
      this.ws.send(JSON.stringify(message));
    }
  }

  private handleMessage(message: MCPMessage): void {
    this.debug('Received message:', message);

    if (message.type === 'response' && message.id) {
      const handler = this.requestHandlers.get(message.id);
      if (handler) {
        handler(message);
      }
    } else if (message.type === 'notification' && message.method) {
      const handler = this.messageHandlers.get(message.method);
      if (handler) {
        handler(message.params);
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) return;

    const delay = Math.min(1000 * Math.pow(2, this.state.reconnectAttempts), 30000);
    this.debug(`Scheduling reconnect in ${delay}ms`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.updateState({ reconnectAttempts: this.state.reconnectAttempts + 1 });
      this.connect().catch(console.error);
    }, delay);
  }

  private updateState(updates: Partial<ConnectionState>): void {
    this.state = { ...this.state, ...updates };
    this.onStateChange(this.state);
  }

  private generateId(): string {
    return `${Date.now()}-${++this.messageId}`;
  }

  private debug(...args: any[]): void {
    if (this.debugMode) {
      console.log('[AI Curator]', ...args);
    }
  }
}