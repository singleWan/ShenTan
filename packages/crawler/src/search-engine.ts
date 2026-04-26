export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  engine?: string;
  publishedDate?: string;
}

export interface SearchOptions {
  maxResults?: number;
  categories?: string[];
  engines?: string[];
  language?: string;
  timeRange?: 'day' | 'week' | 'month' | 'year';
  pagenumber?: number;
  pageCount?: number;
  /** 关联性关键词：用于逐页评分，弱关联页面触发早停 */
  relevantKeywords?: string[];
}

export interface SearchEngine {
  readonly name: string;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  isAvailable(): Promise<boolean>;
}
