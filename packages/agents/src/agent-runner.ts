import { generateText, stepCountIs } from 'ai';
import type { LanguageModel, ModelMessage } from 'ai';
import type { ProviderOptions } from './config/types.js';
import { createTools } from './tools/index.js';
import type { Database } from '@shentan/core';

// 检查是否为 AI SDK 的 RetryError（包含原始错误信息）
function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'reason' in error && 'lastError' in error) {
    const lastError = (error as { lastError: unknown }).lastError;
    if (lastError instanceof Error) {
      return lastError.message;
    }
  }
  return (error as Error).message;
}

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
  providerOptions?: ProviderOptions;
  onLog?: (msg: string) => void;
  signal?: AbortSignal;
}

export async function runAgentLoop(params: RunAgentParams): Promise<AgentRunResult> {
  const {
    model,
    db,
    systemPrompt,
    userPrompt,
    maxIterations,
    maxOutputTokens,
    agentName,
    providerOptions,
    onLog,
    signal,
  } = params;
  const tools = createTools(db);

  // 检查是否已取消
  if (signal?.aborted) {
    onLog?.(`[${agentName}] 任务已取消`);
    return { success: false, message: '任务已取消' };
  }

  try {
    const result = await generateText({
      model,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt } satisfies ModelMessage],
      tools: tools.all,
      maxOutputTokens,
      maxRetries: 0,
      stopWhen: stepCountIs(maxIterations),
      abortSignal: signal,
      providerOptions,
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
    if (signal?.aborted) {
      onLog?.(`[${agentName}] 任务已取消`);
      return { success: false, message: '任务已取消' };
    }
    const msg = extractErrorMessage(error);
    onLog?.(`[${agentName}] 错误: ${msg}`);
    return { success: false, message: msg };
  }
}
