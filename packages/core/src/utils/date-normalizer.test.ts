import { describe, it, expect } from 'vitest';
import { normalizeDate, chineseNumToArabic, isValidHistoricalDateSortable, isValidFictionalDateSortable } from './date-normalizer.js';

describe('chineseNumToArabic', () => {
  it('转换单个数字', () => {
    expect(chineseNumToArabic('一')).toBe(1);
    expect(chineseNumToArabic('九')).toBe(9);
    expect(chineseNumToArabic('零')).toBe(0);
  });

  it('转换十位数', () => {
    expect(chineseNumToArabic('十')).toBe(10);
    expect(chineseNumToArabic('二十')).toBe(20);
    expect(chineseNumToArabic('十五')).toBe(15);
    expect(chineseNumToArabic('三十五')).toBe(35);
  });

  it('转换百位数', () => {
    expect(chineseNumToArabic('一百')).toBe(100);
    expect(chineseNumToArabic('二百二十一')).toBe(221);
    expect(chineseNumToArabic('三百零五')).toBe(305);
  });

  it('转换大数字', () => {
    expect(chineseNumToArabic('一千九百四十六')).toBe(1946);
    expect(chineseNumToArabic('二千零二十四')).toBe(2024);
  });
});

describe('normalizeDate — 历史人物', () => {
  const type = 'historical';

  it('解析中文完整日期', () => {
    const result = normalizeDate('1946年6月14日', undefined, type);
    expect(result.dateSortable).toBe('1946-06-14');
    expect(result.confidence).toBe('exact');
  });

  it('解析中文年月', () => {
    const result = normalizeDate('1946年6月', undefined, type);
    expect(result.dateSortable).toBe('1946-06-01');
    expect(result.confidence).toBe('approximate');
  });

  it('解析中文年份', () => {
    const result = normalizeDate('1946年', undefined, type);
    expect(result.dateSortable).toBe('1946-01-01');
    expect(result.confidence).toBe('approximate');
  });

  it('解析公元前日期', () => {
    const result = normalizeDate('公元前221年', undefined, type);
    expect(result.dateSortable).toBe('-0221-01-01');
    expect(result.confidence).toBe('approximate');
  });

  it('解析英文完整日期', () => {
    const result = normalizeDate('June 14, 1946', undefined, type);
    expect(result.dateSortable).toBe('1946-06-14');
    expect(result.confidence).toBe('exact');
  });

  it('解析纯数字年份', () => {
    const result = normalizeDate('1946', undefined, type);
    expect(result.dateSortable).toBe('1946-01-01');
    expect(result.confidence).toBe('approximate');
  });

  it('解析民国纪年', () => {
    const result = normalizeDate('民国35年', undefined, type);
    // 1912 + 35 = 1947
    expect(result.dateSortable).toBe('1947-01-01');
    expect(result.confidence).toBe('approximate');
  });

  it('无法解析返回 unparseable', () => {
    const result = normalizeDate('很久以前', undefined, type);
    expect(result.confidence).toBe('unparseable');
  });

  it('空值返回 unparseable', () => {
    const result = normalizeDate(undefined, undefined, type);
    expect(result.confidence).toBe('unparseable');
  });

  it('优先使用 dateSortable 如果已提供', () => {
    const result = normalizeDate('some text', '2024-01-15', type);
    expect(result.dateSortable).toBe('2024-01-15');
    expect(result.confidence).toBe('exact');
  });
});

describe('normalizeDate — 虚构角色', () => {
  const type = 'fictional';

  it('解析章节：第三章', () => {
    const result = normalizeDate('第三章', undefined, type);
    expect(result.dateSortable).toBe('FIC-CH0003');
    expect(result.confidence).toBe('exact');
  });

  it('解析章节：第25回', () => {
    const result = normalizeDate('第25回', undefined, type);
    expect(result.dateSortable).toBe('FIC-CH0025');
  });

  it('解析故事阶段：童年时期', () => {
    const result = normalizeDate('童年时期', undefined, type);
    expect(result.dateSortable).toBe('FIC-PH001');
    expect(result.confidence).toBe('approximate');
  });

  it('解析故事阶段：序章', () => {
    const result = normalizeDate('序章', undefined, type);
    expect(result.dateSortable).toBe('FIC-PH000');
  });

  it('无法识别返回 UNK', () => {
    const result = normalizeDate('一些模糊的时间', undefined, type);
    expect(result.dateSortable).toBe('FIC-UNK00');
    expect(result.confidence).toBe('unparseable');
  });
});

describe('isValidHistoricalDateSortable', () => {
  it('完整日期格式通过', () => {
    expect(isValidHistoricalDateSortable('2024-01-15')).toBe(true);
    expect(isValidHistoricalDateSortable('-0221-01-01')).toBe(true);
    expect(isValidHistoricalDateSortable('2024-06-14~1')).toBe(true);
  });

  it('不完整格式不通过', () => {
    expect(isValidHistoricalDateSortable('2024')).toBe(false);
    expect(isValidHistoricalDateSortable('2024-01')).toBe(false);
    expect(isValidHistoricalDateSortable('-0221')).toBe(false);
    expect(isValidHistoricalDateSortable('')).toBe(false);
    expect(isValidHistoricalDateSortable('abc')).toBe(false);
    expect(isValidHistoricalDateSortable('FIC-CH0001')).toBe(false);
  });
});

describe('isValidFictionalDateSortable', () => {
  it('有效虚构格式通过', () => {
    expect(isValidFictionalDateSortable('FIC-CH0001')).toBe(true);
    expect(isValidFictionalDateSortable('FIC-PH002')).toBe(true);
    expect(isValidFictionalDateSortable('FIC-VY0001')).toBe(true);
    expect(isValidFictionalDateSortable('FIC-PH002.1')).toBe(true);
  });

  it('无效格式不通过', () => {
    expect(isValidFictionalDateSortable('2024-01-15')).toBe(false);
    expect(isValidFictionalDateSortable('FIC-CH-01')).toBe(false);
    expect(isValidFictionalDateSortable('FIC-SEQ-001')).toBe(false);
  });
});
