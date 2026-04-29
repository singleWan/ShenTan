import { eq, or, and, sql, inArray } from 'drizzle-orm';
import type { Database } from './connection.js';
import { characterRelations, characters } from './schema.js';

export interface CharacterRelation {
  id: number;
  fromCharacterId: number;
  toCharacterId: number;
  relationType: string;
  description: string | null;
  sourceUrl: string | null;
  confidence: string | null;
  createdAt: string;
  fromName?: string;
  toName?: string;
}

export type RelationType =
  | 'ally'
  | 'enemy'
  | 'family'
  | 'colleague'
  | 'rival'
  | 'mentor'
  | 'friend'
  | 'other';

export async function saveRelations(
  db: Database,
  input: {
    characterId: number;
    relations: Array<{
      targetName: string;
      relationType: RelationType;
      description?: string;
      sourceUrl?: string;
      confidence?: string;
    }>;
  },
): Promise<{ saved: number; skipped: number }> {
  if (input.relations.length === 0) return { saved: 0, skipped: 0 };

  // 批量查询目标角色
  const targetNames = [...new Set(input.relations.map((r) => r.targetName))];
  const targetChars = await db
    .select({ id: characters.id, name: characters.name })
    .from(characters)
    .where(inArray(characters.name, targetNames));
  const nameToId = new Map(targetChars.map((c) => [c.name, c.id]));

  // 为未找到的目标角色创建 placeholder
  const missingNames = targetNames.filter((n) => !nameToId.has(n));
  for (const name of missingNames) {
    const result = await db
      .insert(characters)
      .values({
        name,
        type: 'historical',
        status: 'placeholder',
        isPlaceholder: 1,
      })
      .returning();
    if (result[0]) {
      nameToId.set(name, result[0].id);
    }
  }

  // 预加载已有关系
  const existingRels = await db
    .select({
      toId: characterRelations.toCharacterId,
      type: characterRelations.relationType,
    })
    .from(characterRelations)
    .where(eq(characterRelations.fromCharacterId, input.characterId));
  const existingSet = new Set(existingRels.map((r) => `${r.toId}:${r.type}`));

  let saved = 0;
  let skipped = 0;

  for (const rel of input.relations) {
    const targetId = nameToId.get(rel.targetName);
    if (!targetId) {
      skipped++;
      continue;
    }
    if (existingSet.has(`${targetId}:${rel.relationType}`)) {
      skipped++;
      continue;
    }

    await db.insert(characterRelations).values({
      fromCharacterId: input.characterId,
      toCharacterId: targetId,
      relationType: rel.relationType,
      description: rel.description ?? null,
      sourceUrl: rel.sourceUrl ?? null,
      confidence: rel.confidence ?? null,
    });
    existingSet.add(`${targetId}:${rel.relationType}`);
    saved++;
  }

  return { saved, skipped };
}

export async function getCharacterRelations(
  db: Database,
  characterId: number,
): Promise<CharacterRelation[]> {
  const allRels = await db
    .select({
      id: characterRelations.id,
      fromCharacterId: characterRelations.fromCharacterId,
      toCharacterId: characterRelations.toCharacterId,
      relationType: characterRelations.relationType,
      description: characterRelations.description,
      sourceUrl: characterRelations.sourceUrl,
      confidence: characterRelations.confidence,
      createdAt: characterRelations.createdAt,
    })
    .from(characterRelations)
    .where(
      or(
        eq(characterRelations.fromCharacterId, characterId),
        eq(characterRelations.toCharacterId, characterId),
      ),
    );

  // 去重
  const uniqueRelations = [...new Map(allRels.map((r) => [r.id, r])).values()];

  // 批量查询角色名称
  const charIds = [
    ...new Set(uniqueRelations.flatMap((r) => [r.fromCharacterId, r.toCharacterId])),
  ];
  if (charIds.length === 0) return [];

  const chars = await db
    .select({ id: characters.id, name: characters.name })
    .from(characters)
    .where(inArray(characters.id, charIds));
  const charMap = new Map(chars.map((c) => [c.id, c.name]));

  return uniqueRelations.map((r) => ({
    ...r,
    fromName: charMap.get(r.fromCharacterId),
    toName: charMap.get(r.toCharacterId),
  }));
}

export async function getRelationGraph(db: Database): Promise<{
  nodes: Array<{ id: number; name: string; type: string }>;
  edges: Array<{ from: number; to: number; type: string; description: string | null }>;
}> {
  const allRels = await db.select().from(characterRelations);

  // 只返回有关系的角色
  const charIds = [...new Set(allRels.flatMap((r) => [r.fromCharacterId, r.toCharacterId]))];
  if (charIds.length === 0) return { nodes: [], edges: [] };

  const nodes = await db
    .select({
      id: characters.id,
      name: characters.name,
      type: characters.type,
    })
    .from(characters)
    .where(inArray(characters.id, charIds));

  return {
    nodes,
    edges: allRels.map((r) => ({
      from: r.fromCharacterId,
      to: r.toCharacterId,
      type: r.relationType,
      description: r.description,
    })),
  };
}
