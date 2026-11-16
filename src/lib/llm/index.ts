import type { Settings } from '../config';
import type { LlmProvider } from './types';
import { AnthropicProvider } from './anthropic';
import { MockLlmProvider } from './mock';

export * from './types';

export function createLlmProvider(settings: Settings): LlmProvider {
  if (settings.llm.provider === 'mock') return new MockLlmProvider(settings);
  return new AnthropicProvider(settings.llm.model);
}
