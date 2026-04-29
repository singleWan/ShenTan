import { initDatabase, closeDb, queries } from '@shentan/core';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import * as readline from 'node:readline';

config({ path: resolve(process.cwd(), '.env') });

function askConfirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      return resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

function getDbPath(dbOption?: string): string {
  return dbOption
    ? `file:${resolve(dbOption)}`
    : process.env.DATABASE_PATH
      ? `file:${resolve(process.env.DATABASE_PATH)}`
      : 'file:./data/shentan.db';
}

export async function deleteCharacterCommand(
  nameOrId: string,
  options: { db?: string; force?: boolean },
) {
  const db = await initDatabase(getDbPath(options.db));

  try {
    const parsedId = parseInt(nameOrId, 10);
    let characterId: number;
    let characterName: string;

    if (!isNaN(parsedId)) {
      const character = await queries.getCharacter(db, parsedId);
      if (!character) {
        console.error(`未找到角色 ID: ${parsedId}`);
        process.exit(1);
      }
      characterId = character.id;
      characterName = character.name;
    } else {
      const character = await queries.getCharacterByName(db, nameOrId);
      if (!character) {
        console.error(`未找到角色: ${nameOrId}`);
        process.exit(1);
      }
      characterId = character.id;
      characterName = character.name;
    }

    if (!options.force) {
      const confirmed = await askConfirm(
        `确定要删除角色「${characterName}」(ID: ${characterId}) 及其所有事件和反应吗？(y/N) `,
      );
      if (!confirmed) {
        console.log('已取消');
        return;
      }
    }

    await queries.deleteCharacter(db, characterId);
    console.log(`已删除角色: ${characterName} (ID: ${characterId})`);
  } finally {
    closeDb();
  }
}

export async function deleteEventCommand(id: string, options: { db?: string; force?: boolean }) {
  const db = await initDatabase(getDbPath(options.db));
  const eventId = parseInt(id, 10);

  try {
    if (isNaN(eventId)) {
      console.error('请提供有效的数字事件 ID');
      process.exit(1);
    }

    const event = await queries.getEvent(db, eventId);
    if (!event) {
      console.error(`未找到事件 ID: ${eventId}`);
      process.exit(1);
    }

    if (!options.force) {
      const confirmed = await askConfirm(
        `确定要删除事件「${event.title}」(ID: ${eventId}) 及其所有反应吗？(y/N) `,
      );
      if (!confirmed) {
        console.log('已取消');
        return;
      }
    }

    await queries.deleteEvent(db, eventId);
    console.log(`已删除事件: ${event.title} (ID: ${eventId})`);
  } finally {
    closeDb();
  }
}

export async function deleteReactionCommand(id: string, options: { db?: string; force?: boolean }) {
  const db = await initDatabase(getDbPath(options.db));
  const reactionId = parseInt(id, 10);

  try {
    if (isNaN(reactionId)) {
      console.error('请提供有效的数字反应 ID');
      process.exit(1);
    }

    if (!options.force) {
      const confirmed = await askConfirm(`确定要删除反应 ID: ${reactionId} 吗？(y/N) `);
      if (!confirmed) {
        console.log('已取消');
        return;
      }
    }

    await queries.deleteReaction(db, reactionId);
    console.log(`已删除反应 (ID: ${reactionId})`);
  } finally {
    closeDb();
  }
}
