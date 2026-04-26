// 共享类型定义

export type CharacterType = 'historical' | 'fictional';
export type CharacterStatus = 'pending' | 'collecting' | 'completed' | 'failed';
export type EventCategory = 'life' | 'career' | 'political' | 'conflict' | 'achievement' | 'scandal' | 'speech' | 'policy' | 'statement' | 'rumor' | 'other';
export type ReactorType = 'person' | 'organization' | 'country' | 'media' | 'group';
export type Sentiment = 'positive' | 'negative' | 'neutral' | 'mixed';
export type AgentType = 'biographer' | 'event-explorer' | 'reaction-collector' | 'statement-collector';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface CharacterAlias {
  name: string;
  language: 'chinese' | 'english' | 'original' | 'other';
  type: 'formal' | 'nickname' | 'abbreviation' | 'handle' | 'maiden' | 'title';
  usageContext?: string;
  source?: 'ai' | 'user';
}

export interface Character {
  id: number;
  name: string;
  type: CharacterType;
  source: string | null;
  description: string | null;
  aliases: string | null;
  status: CharacterStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Event {
  id: number;
  characterId: number;
  parentEventId: number | null;
  title: string;
  description: string | null;
  dateText: string | null;
  dateSortable: string | null;
  category: EventCategory;
  content: string | null;
  platform: string | null;
  authorHandle: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  importance: number;
  metadata: string | null;
  createdAt: string;
}

export interface Reaction {
  id: number;
  eventId: number | null;
  reactor: string;
  reactorType: ReactorType;
  reactionText: string | null;
  sentiment: Sentiment | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  createdAt: string;
}

export interface SearchTask {
  id: number;
  characterId: number;
  agentType: AgentType;
  status: TaskStatus;
  query: string;
  resultSummary: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

// Agent 工具入参类型
export interface SearchInput {
  query: string;
}

export interface ScrapeInput {
  url: string;
}

export interface SaveEventsInput {
  characterId: number;
  events: Array<{
    parentEventId?: number;
    title: string;
    description?: string;
    dateText?: string;
    dateSortable?: string;
    category?: EventCategory;
    content?: string;
    platform?: string;
    authorHandle?: string;
    sourceUrl?: string;
    sourceTitle?: string;
    importance?: number;
  }>;
}

export interface SaveReactionsInput {
  eventId: number;
  reactions: ReactionInput[];
}

export type ReactionInput = {
  reactor: string;
  reactorType: ReactorType;
  reactionText?: string;
  sentiment?: Sentiment;
  sourceUrl?: string;
  sourceTitle?: string;
};

export interface GetEventsInput {
  characterId: number;
  minImportance?: number;
  category?: EventCategory;
}

// 导出格式
export interface CharacterExport {
  character: Pick<Character, 'name' | 'type' | 'source' | 'description' | 'aliases'>;
  timeline: Array<{
    id: number;
    date: string | null;
    title: string;
    description: string | null;
    category: EventCategory;
    content: string | null;
    platform: string | null;
    authorHandle: string | null;
    importance: number;
    children: number[];
    reactions: Array<{
      reactor: string;
      reactorType: ReactorType;
      reactionText: string | null;
      sentiment: Sentiment | null;
    }>;
  }>;
  metadata: {
    totalEvents: number;
    totalReactions: number;
    collectedAt: string;
  };
}
