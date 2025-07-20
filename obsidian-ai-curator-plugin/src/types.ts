export interface AICuratorSettings {
  mpcServerUrl: string;
  autoConnect: boolean;
  showStatusBar: boolean;
  debugMode: boolean;
}

export const DEFAULT_SETTINGS: AICuratorSettings = {
  mpcServerUrl: 'ws://localhost:3000',
  autoConnect: true,
  showStatusBar: true,
  debugMode: false
};

export interface MCPMessage {
  id: string;
  type: 'request' | 'response' | 'notification';
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}

export interface FileChangeNotification {
  type: 'create' | 'modify' | 'delete' | 'rename';
  path: string;
  oldPath?: string; // For rename events
  metadata?: FileMetadata;
}

export interface FileMetadata {
  frontmatter: Record<string, any>;
  links: LinkInfo[];
  tags: string[];
  headings: HeadingInfo[];
  backlinks?: string[];
}

export interface LinkInfo {
  link: string;
  displayText?: string;
  position: { line: number; col: number };
}

export interface HeadingInfo {
  heading: string;
  level: number;
  position: { line: number; col: number };
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ConnectionState {
  status: ConnectionStatus;
  lastConnected?: Date;
  lastError?: string;
  reconnectAttempts: number;
}