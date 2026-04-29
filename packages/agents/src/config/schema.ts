import { z } from 'zod';

const providerTypeSchema = z.enum(['anthropic', 'openai', 'openai-compatible']);

const providerConfigSchema = z.object({
  type: providerTypeSchema,
  model: z.string().min(1, '模型名称不能为空'),
  apiKey: z.string().optional(),
  baseURL: z.string().optional(),
  maxTokens: z.number().int().min(1).max(65536).optional(),
});

const agentConfigSchema = z.object({
  provider: z.string().optional(),
  maxIterations: z.number().int().min(1).max(100).optional(),
  maxTokens: z.number().int().min(1).max(65536).optional(),
});

export const shentanConfigSchema = z.object({
  default: z.string().min(1, '必须指定默认 provider'),
  providers: z
    .record(z.string(), providerConfigSchema)
    .refine((providers) => Object.keys(providers).length > 0, {
      message: '至少需要配置一个 provider',
    }),
  maxTokens: z.number().int().min(1).max(65536).optional(),
  searxng: z
    .object({
      baseUrl: z.string().url().optional().default('http://localhost:8080'),
      enabled: z.boolean().optional().default(true),
      cacheTTL: z.number().int().min(0).optional().default(1800),
    })
    .optional(),
  quality: z
    .object({
      maxExploreRounds: z.number().int().min(1).max(20).optional(),
      minExploreRounds: z.number().int().min(1).max(10).optional(),
      convergenceThreshold: z.number().int().min(0).max(20).optional(),
      consecutiveDryRounds: z.number().int().min(1).max(5).optional(),
    })
    .optional(),
  agents: z.record(z.string(), agentConfigSchema).optional(),
});

export type ShentanConfigInput = z.input<typeof shentanConfigSchema>;
