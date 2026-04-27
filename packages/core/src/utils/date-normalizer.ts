/**
 * 日期规范化模块
 *
 * 将各种日期格式统一为可排序的标准格式：
 * - 历史人物：YYYY-MM-DD（ISO 格式）
 * - 虚构角色：FIC- 前缀格式（按叙事顺序排序）
 */

export interface NormalizedDate {
  dateSortable: string;
  confidence: 'exact' | 'approximate' | 'unparseable';
}

// ─── 中文数字转阿拉伯数字 ────────────────────────────────

const CHINESE_DIGITS: Record<string, number> = {
  '零': 0, '〇': 0, '一': 1, '二': 2, '三': 3, '四': 4,
  '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
  '十': 10, '百': 100, '千': 1000, '万': 10000,
};

export function chineseNumToArabic(text: string): number {
  if (!text) return 0;

  // 纯阿拉伯数字
  if (/^\d+$/.test(text)) return parseInt(text, 10);

  let result = 0;
  let current = 0;

  for (const ch of text) {
    const val = CHINESE_DIGITS[ch];
    if (val === undefined) continue;

    if (val >= 10) {
      // 十、百、千、万 — 乘法器
      if (current === 0) current = 1;
      if (val === 10000) {
        result = (result + current * val);
        current = 0;
      } else {
        current *= val;
      }
    } else {
      // 单个数字
      current += val;
    }
  }

  return result + current;
}

// ─── 零填充工具 ────────────────────────────────────────

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

// ─── 历史人物日期解析 ──────────────────────────────────

function parseHistoricalDate(dateText: string): NormalizedDate {
  const text = dateText.trim();

  // 1. 已经是正确的 YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return { dateSortable: text, confidence: 'exact' };
  }

  // 2. YYYY-MM 或 YYYY/MM 或 YYYY.MM（缺日）
  let m = text.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (m) {
    return { dateSortable: `${m[1]}-${pad(+m[2], 2)}-01`, confidence: 'approximate' };
  }

  // 3. YYYY-MM-DD 或 YYYY/MM/DD 或 YYYY.MM.DD
  m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    return { dateSortable: `${m[1]}-${pad(+m[2], 2)}-${pad(+m[3], 2)}`, confidence: 'exact' };
  }

  // 4. 中文完整日期：1946年6月14日
  m = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (m) {
    return { dateSortable: `${m[1]}-${pad(+m[2], 2)}-${pad(+m[3], 2)}`, confidence: 'exact' };
  }

  // 5. 中文年月：1946年6月
  m = text.match(/(\d{4})年(\d{1,2})月/);
  if (m) {
    return { dateSortable: `${m[1]}-${pad(+m[2], 2)}-01`, confidence: 'approximate' };
  }

  // 6. 中文年份：1946年
  m = text.match(/(\d{4})年/);
  if (m) {
    return { dateSortable: `${m[1]}-01-01`, confidence: 'approximate' };
  }

  // 7. 纯四位数字年份：1946
  if (/^\d{4}$/.test(text)) {
    return { dateSortable: `${text}-01-01`, confidence: 'approximate' };
  }

  // 8. 带约/大约/约公元/约公元前的年份
  m = text.match(/约(?:公元前)?(\d{1,4})年?/);
  if (m) {
    return { dateSortable: `${pad(+m[1], 4)}-01-01`, confidence: 'approximate' };
  }

  // 9. 公元前/BC/BCE
  m = text.match(/公元前(\d{1,4})年?/);
  if (m) {
    return { dateSortable: `-${pad(+m[1], 4)}-01-01`, confidence: 'approximate' };
  }
  m = text.match(/(\d{1,4})\s*(?:BC|BCE|bc|bce)/);
  if (m) {
    return { dateSortable: `-${pad(+m[1], 4)}-01-01`, confidence: 'approximate' };
  }

  // 10. 民国纪年：民国35年 → 1912 + 35 = 1947
  m = text.match(/民国(\d{1,3})年/);
  if (m) {
    const year = 1912 + parseInt(m[1], 10);
    return { dateSortable: `${year}-01-01`, confidence: 'approximate' };
  }

  // 11. circa/C. 格式
  m = text.match(/(?:circa|c\.?|约)\s*(\d{4})/i);
  if (m) {
    return { dateSortable: `${m[1]}-01-01`, confidence: 'approximate' };
  }

  // 12. 英文月名格式：June 14, 1946 或 14 June 1946
  const months: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8,
    sep: 9, oct: 10, nov: 11, dec: 12,
  };
  m = text.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/i);
  if (m) {
    const month = months[m[2].toLowerCase()];
    if (month) {
      return { dateSortable: `${m[3]}-${pad(month, 2)}-${pad(+m[1], 2)}`, confidence: 'exact' };
    }
  }
  m = text.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (m) {
    const month = months[m[1].toLowerCase()];
    if (month) {
      return { dateSortable: `${m[3]}-${pad(month, 2)}-${pad(+m[2], 2)}`, confidence: 'exact' };
    }
  }

  // 13. 从文本中提取任意四位数字年份作为最后手段
  m = text.match(/(\d{4})/);
  if (m) {
    return { dateSortable: `${m[1]}-01-01`, confidence: 'approximate' };
  }

  return { dateSortable: '', confidence: 'unparseable' };
}

// ─── 虚构角色日期解析 ──────────────────────────────────

// 常见故事阶段排序映射
const STORY_PHASES: [RegExp, number][] = [
  [/序[章言曲幕]|引子|楔子|开篇/, 0],
  [/童年|幼年|小时候/, 1],
  [/少年|青春期/, 2],
  [/青年|壮年/, 3],
  [/中年|成年/, 4],
  [/晚年|老年|暮年|结局|尾声|终[章局幕]/, 9],
];

function parseFictionalDate(dateText: string): NormalizedDate {
  const text = dateText.trim();

  // 1. 章节引用：第三章、第25章、第二十五章
  let m = text.match(/第([一二三四五六七八九十百千万零〇\d]+)[章节回卷幕]/);
  if (m) {
    const num = chineseNumToArabic(m[1]);
    return { dateSortable: `FIC-CH${pad(num, 4)}`, confidence: 'exact' };
  }

  // 2. 故事阶段：童年时期、少年时期等
  for (const [regex, order] of STORY_PHASES) {
    if (regex.test(text)) {
      return { dateSortable: `FIC-PH${pad(order, 3)}`, confidence: 'approximate' };
    }
  }

  // 3. 虚构年号/年数：天宝三年、永乐十二年、第三年、3年后
  m = text.match(/[^\d]*?([一二三四五六七八九十百千万零〇\d]+)\s*年/);
  if (m) {
    const num = chineseNumToArabic(m[1]);
    if (num > 0) {
      return { dateSortable: `FIC-VY${pad(num, 4)}`, confidence: 'approximate' };
    }
  }

  // 4. 纯数字引用（第几个事件等）
  m = text.match(/(\d+)/);
  if (m) {
    return { dateSortable: `FIC-NR${pad(+m[1], 4)}`, confidence: 'approximate' };
  }

  return { dateSortable: 'FIC-UNK00', confidence: 'unparseable' };
}

// ─── 校验函数 ──────────────────────────────────────────

export function isValidHistoricalDateSortable(value: string): boolean {
  return /^-?\d{4}-\d{2}-\d{2}(~\d+)?$/.test(value);
}

export function isValidFictionalDateSortable(value: string): boolean {
  return /^FIC-[A-Z]{2}\d+(\.\d+)?$/.test(value);
}

// ─── 主入口 ────────────────────────────────────────────

export function normalizeDate(
  dateText: string | undefined | null,
  dateSortable: string | undefined | null,
  characterType: string,
): NormalizedDate {
  const isFictional = characterType === 'fictional';
  const isValidFn = isFictional ? isValidFictionalDateSortable : isValidHistoricalDateSortable;

  // 优先使用已有的 dateSortable（如果格式正确）
  if (dateSortable) {
    const trimmed = dateSortable.trim();
    if (trimmed && isValidFn(trimmed)) {
      return { dateSortable: trimmed, confidence: 'exact' };
    }
    // 尝试将已有的 dateSortable 当作日期文本来解析
    const fromSortable = isFictional
      ? parseFictionalDate(trimmed)
      : parseHistoricalDate(trimmed);
    if (fromSortable.confidence !== 'unparseable') {
      return fromSortable;
    }
  }

  // 从 dateText 解析
  if (dateText) {
    const trimmed = dateText.trim();
    if (trimmed) {
      return isFictional
        ? parseFictionalDate(trimmed)
        : parseHistoricalDate(trimmed);
    }
  }

  return { dateSortable: '', confidence: 'unparseable' };
}

// ─── 日期插值（根据前后锚点事件排序不明确日期）──────────

export function interpolateDateSortables(
  batch: Array<{ dateSortable: string | null }>,
  existingDbDates: string[],
  characterType: string,
): void {
  const isFictional = characterType === 'fictional';
  const isValidFn = isFictional ? isValidFictionalDateSortable : isValidHistoricalDateSortable;

  // 从已有 DB 事件中提取最后一个有效日期作为初始锚点
  const sortedDbDates = existingDbDates
    .filter((d): d is string => !!d && isValidFn(d))
    .sort();
  let lastAnchor: string | null = sortedDbDates.length > 0
    ? sortedDbDates[sortedDbDates.length - 1]
    : null;
  let seqCounter = 0;

  for (const evt of batch) {
    if (evt.dateSortable) {
      // 有明确日期，重置锚点
      lastAnchor = evt.dateSortable;
      seqCounter = 0;
    } else if (lastAnchor) {
      // 无明确日期：基于上一个锚点插值
      seqCounter++;
      evt.dateSortable = isFictional
        ? `${lastAnchor}.${seqCounter}`
        : `${lastAnchor}~${String(seqCounter).padStart(3, '0')}`;
    }
    // 没有锚点且无法解析 → 保持 null，排序时兜底到末尾
  }
}
