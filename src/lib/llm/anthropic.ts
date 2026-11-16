import Anthropic from '@anthropic-ai/sdk';
import type { JsonRequest, LlmProvider } from './types';
import { withRetry } from '../retry';

export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';
  private client: Anthropic;

  constructor(readonly model: string, apiKey = process.env.ANTHROPIC_API_KEY) {
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set (add it to .env, or set the LLM provider to "mock")');
    // The SDK retries 429/5xx itself; we add an outer retry for dropped streams.
    this.client = new Anthropic({ apiKey, maxRetries: 3, timeout: 20 * 60 * 1000 });
  }

  async generateJson(req: JsonRequest) {
    return withRetry(async () => {
      // Streaming keeps long generations (tens of thousands of tokens) from hitting HTTP timeouts.
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: [{ role: 'user', content: req.user }],
        output_config: { format: { type: 'json_schema', schema: req.schema } },
      });
      const msg = await stream.finalMessage();
      const usage = { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens };
      if (msg.stop_reason === 'max_tokens') throw new Error(`LLM output was cut off at max_tokens (${req.maxTokens}); the script is too long`);
      if (msg.stop_reason === 'refusal') throw new Error('The model declined to produce this script');
      const text = msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`LLM returned invalid JSON (stop_reason ${msg.stop_reason})`);
      }
      return { data, usage, stopReason: msg.stop_reason };
    }, { attempts: 2, baseMs: 3000 });
  }
}
