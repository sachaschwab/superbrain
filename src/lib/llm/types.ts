import type { LessonContext } from '../curriculum/types';

export type LlmUsage = { inputTokens: number; outputTokens: number };

export type JsonRequest = {
  /** What is being asked; the mock provider uses this to answer without an API. */
  kind: 'script' | 'correction' | 'review';
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  ctx: LessonContext;
};

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  generateJson(req: JsonRequest): Promise<{ data: unknown; usage: LlmUsage; stopReason: string | null }>;
}
