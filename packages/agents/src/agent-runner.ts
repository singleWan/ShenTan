import { generateText, stepCountIs } from 'ai';
import type { LanguageModel, ModelMessage } from 'ai';
import { createTools } from './tools/index.js';
import type { Database } from '@shentan/core';

export interface AgentRunResult {
  success: boolean;
  message: string;
  tokensUsed?: { input: number; output: number };
}

export interface RunAgentParams {
  model: LanguageModel;
  db: Database;
  systemPrompt: string;
  userPrompt: string;
  maxIterations: number;
  maxOutputTokens: number;
  agentName: string;
  onLog?: (msg: string) => void;
}

export async function runAgentLoop(params: RunAgentParams): Promise<AgentRunResult> {
  const { model, db, systemPrompt, userPrompt, maxIterations, maxOutputTokens, agentName, onLog } = params;
  const tools = createTools(db);

  try {
    const result = await generateText({
      model,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt } satisfies ModelMessage],
      tools: tools.all,
      maxOutputTokens,
      stopWhen: stepCountIs(maxIterations),
    });

    const text = result.text || '(无文本输出)';
    onLog?.(`[${agentName}] 完成: ${text.substring(0, 200)}`);

    return {
      success: true,
      message: text,
      tokensUsed: {
        input: result.usage.inputTokens ?? 0,
        output: result.usage.outputTokens ?? 0,
      },
    };
  } catch (error) {
    const msg = (error as Error).message;
    onLog?.(`[${agentName}] 错误: ${msg}`);
    return { success: false, message: msg };
  }
}
