export interface CollectOptions {
  characterName: string;
  characterType: 'historical' | 'fictional';
  source?: string[];
  maxRounds?: number;
  aliases?: string;
}

export type TaskStatus = 'starting' | 'running' | 'completed' | 'failed';

export interface CollectTask {
  id: string;
  characterName: string;
  status: TaskStatus;
  startedAt: string;
  logs: Array<{ timestamp: string; message: string }>;
  result?: {
    characterId: number;
    success: boolean;
    totalEvents: number;
    totalReactions: number;
    stages: Array<{ stage: string; success: boolean; duration: number }>;
  };
  error?: string;
  subscribers: Set<(data: SSEData) => void>;
}

export type SSEData =
  | { type: 'log'; message: string; timestamp: string }
  | { type: 'status'; status: TaskStatus }
  | { type: 'complete'; result: CollectTask['result'] }
  | { type: 'error'; message: string };
