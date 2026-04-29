export interface CollectOptions {
  characterName: string;
  characterType: 'historical' | 'fictional';
  source?: string[];
  maxRounds?: number;
  aliases?: string;
  existingCharacterId?: number;
}

export type TaskStatus =
  | 'starting'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export interface ProgressData {
  stage: string;
  stageIndex: number;
  totalStages: number;
  roundIndex?: number;
  maxRounds?: number;
  eventsCount?: number;
  reactionsCount?: number;
  message?: string;
}

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
  progress?: ProgressData;
  subscribers: Set<(data: SSEData) => void>;
}

export type SSEData =
  | { type: 'log'; message: string; timestamp: string }
  | { type: 'status'; status: TaskStatus }
  | { type: 'progress'; progress: ProgressData }
  | { type: 'complete'; result: CollectTask['result'] }
  | { type: 'error'; message: string }
  | { type: 'cancelled' };
