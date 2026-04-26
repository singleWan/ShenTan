import { initDatabase, closeDb } from '@shentan/core';
import { runOrchestrator } from '@shentan/agents';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env') });

export async function collectCommand(
  name: string,
  options: {
    type?: string;
    source?: string;
    rounds?: string;
    aliases?: string;
    db?: string;
  },
) {
  const dbPath = options.db
    ? `file:${resolve(options.db)}`
    : process.env.DATABASE_PATH
      ? `file:${resolve(process.env.DATABASE_PATH)}`
      : 'file:./data/shentan.db';

  const characterType = (options.type === 'fictional' || options.type === 'fiction') ? 'fictional' : 'historical';
  const maxRounds = options.rounds ? parseInt(options.rounds, 10) : 5;

  console.log(`\n🔍 神探 - 角色事迹收集系统`);
  console.log(`角色: ${name}`);
  console.log(`类型: ${characterType === 'fictional' ? '虚构角色' : '历史人物'}`);
  if (options.source) console.log(`来源: ${options.source}`);
  if (options.aliases) console.log(`用户别名: ${options.aliases}`);
  console.log(`拓展轮次: 最少 2 轮，最多 ${maxRounds} 轮（动态收敛）`);
  console.log(`数据库: ${dbPath}\n`);

  const db = await initDatabase(dbPath);

  try {
    const result = await runOrchestrator(db, {
      characterName: name,
      characterType: characterType as 'historical' | 'fictional',
      source: options.source,
      maxExploreRounds: maxRounds,
      aliasesInput: options.aliases,
    });

    console.log('\n📊 收集结果:');
    console.log(`  角色ID: ${result.characterId}`);
    console.log(`  成功: ${result.success ? '是' : '否'}`);
    console.log(`  总事件: ${result.totalEvents}`);
    console.log(`  总反应: ${result.totalReactions}`);
    console.log('\n⏱ 各阶段耗时:');
    for (const stage of result.stages) {
      console.log(`  ${stage.stage}: ${(stage.duration / 1000).toFixed(1)}s ${stage.success ? '✓' : '✗'}`);
    }
  } finally {
    closeDb();
  }
}
