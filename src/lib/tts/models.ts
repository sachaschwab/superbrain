/**
 * What each ElevenLabs model accepts. Unknown models are treated like the newest generation
 * (language enforcement on, no native speed, no request stitching) because that is the safe side.
 */
export type ModelCaps = {
  /** voice_settings.speed is honoured; otherwise we time-stretch afterwards with FFmpeg. */
  speed: boolean;
  /** previous_text / next_text context for prosody and language continuity. */
  contextText: boolean;
  /** language_code ('ja' / 'en') forces the language and its pronunciation. */
  languageCode: boolean;
  /** v3/v4 accept only stability 0, 0.5 or 1. */
  discreteStability: boolean;
};

export function modelCaps(model: string): ModelCaps {
  const m = model.toLowerCase();
  const v2Family = /^eleven_(multilingual_v2|flash_v2_5|turbo_v2_5|flash_v2|turbo_v2)$/.test(m);
  const noLanguageCode = m === 'eleven_multilingual_v2' || /^eleven_(flash|turbo)_v2$/.test(m) || m.startsWith('eleven_monolingual');
  return {
    speed: v2Family,
    contextText: v2Family,
    languageCode: !noLanguageCode,
    discreteStability: !v2Family,
  };
}
