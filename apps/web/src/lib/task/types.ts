export type TaskType = 'expand-events' | 'collect-reactions';

export type TaskStatus = 'starting' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface TaskOptions {
  characterId: number;
  characterName: string;
  characterAliases?: string;
}

export interface ExpandTaskOptions extends TaskOptions {
  mode: 'range' | 'around';
  afterEvent?: {
    id: number;
    title: string;
    dateText?: string | null;
    dateSortable?: string | null;
    description?: string | null;
  };
  beforeEvent?: {
    id: number;
    title: string;
    dateText?: string | null;
    dateSortable?: string | null;
    description?: string | null;
  };
  centerEvent?: {
    id: number;
    title: string;
    dateText?: string | null;
    dateSortable?: string | null;
    description?: string | null;
    category?: string | null;
    importance?: number | null;
  };
}

export interface ReactionTaskOptions extends TaskOptions {
  eventContext: {
    id: number;
    title: string;
    description?: string | null;
    dateText?: string | null;
    category?: string | null;
    importance?: number | null;
  };
}

export interface Task {
  id: string;
  type: TaskType;
  status: TaskStatus;
  startedAt: string;
  logs: Array<{ timestamp: string; message: string }>;
  result?: { success: boolean; message: string };
  error?: string;
  subscribers: Set<(data: TaskSSEData) => void>;
}

export type TaskSSEData =
  | { type: 'log'; message: string; timestamp: string }
  | { type: 'status'; status: TaskStatus }
  | { type: 'complete'; result: Task['result'] }
  | { type: 'error'; message: string }
  | { type: 'cancelled' };
