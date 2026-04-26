import { initDatabase, closeDb, queries } from '@shentan/core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '.env') });

const CATEGORY_LABELS: Record<string, string> = {
  life: '个人生活',
  career: '职业生涯',
  political: '政治活动',
  conflict: '冲突争议',
  achievement: '成就荣誉',
  scandal: '丑闻争议',
  speech: '重要发言',
  policy: '政策法规',
  statement: '公开声明',
  rumor: '坊间传闻',
  other: '其他',
};

export async function exportCommand(
  nameOrId: string,
  options: {
    format?: string;
    output?: string;
    db?: string;
  },
) {
  const dbPath = options.db
    ? `file:${resolve(options.db)}`
    : process.env.DATABASE_PATH
      ? `file:${resolve(process.env.DATABASE_PATH)}`
      : 'file:./data/shentan.db';

  const db = await initDatabase(dbPath);

  try {
    // 通过 ID 或名称查找角色
    let characterId: number;
    const parsedId = parseInt(nameOrId, 10);

    if (!isNaN(parsedId)) {
      characterId = parsedId;
    } else {
      const character = await queries.getCharacterByName(db, nameOrId);
      if (!character) {
        console.error(`未找到角色: ${nameOrId}`);
        process.exit(1);
      }
      characterId = character.id;
    }

    const data = await queries.exportCharacter(db, characterId);
    if (!data) {
      console.error(`未找到角色ID: ${characterId}`);
      process.exit(1);
    }

    const format = options.format ?? 'json';
    const outputDir = options.output
      ? resolve(options.output)
      : resolve('./output');

    mkdirSync(outputDir, { recursive: true });

    const safeName = data.character.name.replace(/[/\\?%*:|"<>]/g, '_');

    if (format === 'json') {
      const outputPath = resolve(outputDir, `${safeName}.json`);
      writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`导出完成: ${outputPath}`);
    } else if (format === 'markdown' || format === 'md') {
      const outputPath = resolve(outputDir, `${safeName}.md`);
      const md = generateMarkdown(data);
      writeFileSync(outputPath, md, 'utf-8');
      console.log(`导出完成: ${outputPath}`);
    }

    console.log(`\n统计:`);
    console.log(`  角色: ${data.character.name}`);
    console.log(`  类型: ${data.character.type}`);
    console.log(`  事件数: ${data.metadata.totalEvents}`);
    console.log(`  反应数: ${data.metadata.totalReactions}`);
  } finally {
    closeDb();
  }
}

function generateMarkdown(data: Awaited<ReturnType<typeof queries.exportCharacter>>): string {
  const lines: string[] = [];
  lines.push(`# ${data!.character.name}`);
  lines.push('');
  if (data!.character.description) {
    lines.push(data!.character.description);
    lines.push('');
  }
  lines.push(`> 类型: ${data!.character.type}${data!.character.source ? ` | 来源: ${data!.character.source}` : ''}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 时间线');
  lines.push('');

  for (const event of data!.timeline) {
    const dateStr = event.date ? `**${event.date}** - ` : '';
    const importanceStr = '⭐'.repeat(Math.min(event.importance, 5));
    const categoryLabel = CATEGORY_LABELS[event.category] ?? event.category;
    lines.push(`### ${dateStr}${event.title} ${importanceStr}`);
    lines.push(`> 分类: ${categoryLabel}`);
    lines.push('');

    if (event.description) {
      lines.push(event.description);
      lines.push('');
    }

    // 发言/政策/声明类事件显示完整内容
    if (event.content && ['speech', 'policy', 'statement'].includes(event.category)) {
      const platformStr = event.platform ? ` [${event.platform}]` : '';
      lines.push(`**内容${platformStr}:**`);
      lines.push('');
      lines.push(event.content);
      lines.push('');
    }

    if (event.reactions.length > 0) {
      lines.push('**各方反应:**');
      lines.push('');
      for (const r of event.reactions) {
        const sentiment = r.sentiment ? ` [${r.sentiment}]` : '';
        lines.push(`- **${r.reactor}** (${r.reactorType})${sentiment}: ${r.reactionText ?? ''}`);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push(`*收集时间: ${data!.metadata.collectedAt}*`);
  lines.push(`*总事件: ${data!.metadata.totalEvents} | 总反应: ${data!.metadata.totalReactions}*`);

  return lines.join('\n');
}
