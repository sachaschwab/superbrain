import type { Settings } from './config';

export type CostEstimate = {
  ttsCharacters: number;
  llmInputTokens: number;
  llmOutputTokens: number;
  /** null when one of the needed prices is not configured. */
  usd: number | null;
  missingPrices: string[];
  basis: string;
};

export function priceUsage(settings: Settings, u: { ttsCharacters?: number; llmInputTokens?: number; llmOutputTokens?: number }) {
  const p = settings.pricing;
  const missing: string[] = [];
  let usd = 0;
  if (u.ttsCharacters) {
    if (p.ttsPer1kCharsUsd == null) missing.push('TTS price per 1k characters');
    else usd += (u.ttsCharacters / 1000) * p.ttsPer1kCharsUsd;
  }
  if (u.llmInputTokens) {
    if (p.llmInputPerMTokUsd == null) missing.push('LLM input price per million tokens');
    else usd += (u.llmInputTokens / 1e6) * p.llmInputPerMTokUsd;
  }
  if (u.llmOutputTokens) {
    if (p.llmOutputPerMTokUsd == null) missing.push('LLM output price per million tokens');
    else usd += (u.llmOutputTokens / 1e6) * p.llmOutputPerMTokUsd;
  }
  return { usd: missing.length ? null : Math.round(usd * 10000) / 10000, missing };
}

/**
 * Rough pre-production estimate for a full generation. Assumptions: ~65% of the lesson is speech,
 * ~10 characters per spoken second (English/Japanese mix); script + review + ~1 correction pass.
 */
export function estimateFullGeneration(settings: Settings): CostEstimate {
  const ttsCharacters = Math.round(settings.targetDurationMinutes * 60 * 0.65 * 10);
  const calls = 1 + (settings.llm.linguisticReview ? 1 : 0) + 1;
  const llmInputTokens = 9000 * calls;
  const llmOutputTokens = 32000 * 2 + (settings.llm.linguisticReview ? 4000 : 0);
  const llm = settings.llm.provider === 'mock' ? { llmInputTokens: 0, llmOutputTokens: 0 } : { llmInputTokens, llmOutputTokens };
  const tts = settings.tts.provider === 'mock' ? 0 : ttsCharacters;
  const { usd, missing } = priceUsage(settings, { ttsCharacters: tts, ...llm });
  return {
    ttsCharacters: tts,
    ...llm,
    usd,
    missingPrices: missing,
    basis: `Rough estimate: ~${ttsCharacters.toLocaleString()} TTS characters for ${settings.targetDurationMinutes} min, plus script generation, review and one correction pass.`,
  };
}

export function estimateAudioOnly(settings: Settings, uncachedCharacters: number): CostEstimate {
  const tts = settings.tts.provider === 'mock' ? 0 : uncachedCharacters;
  const { usd, missing } = priceUsage(settings, { ttsCharacters: tts });
  return { ttsCharacters: tts, llmInputTokens: 0, llmOutputTokens: 0, usd, missingPrices: missing, basis: 'Exact: characters not yet in the TTS cache for the existing script.' };
}

export function exceedsLimit(settings: Settings, est: CostEstimate) {
  const max = settings.maxEstimatedCostPerLessonUsd;
  return max != null && est.usd != null && est.usd > max;
}
