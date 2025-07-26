export interface AICuratorSettings {
  showStatusBar: boolean;
  debugMode: boolean;
  claudeBinary?: string;
  claudeModel?: 'sonnet' | 'opus' | 'haiku';
  consolidationSettings?: {
    autoGitCommit: boolean;
    archiveFolder: string;
    maxCandidates: number;
  };
  apiServer?: {
    enabled: boolean;
    port: number;
  };
}

export const DEFAULT_SETTINGS: AICuratorSettings = {
  showStatusBar: true,
  debugMode: false,
  claudeModel: 'sonnet',
  consolidationSettings: {
    autoGitCommit: true,
    archiveFolder: 'Archive',
    maxCandidates: 50
  },
  apiServer: {
    enabled: true,
    port: 3001
  }
};

