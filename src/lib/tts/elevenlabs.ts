import type { TtsProvider, TtsRequest } from './types';
import { TransientError, isTransientStatus } from '../retry';
import { modelCaps } from './models';
import { changeTempo } from '../audio/ffmpeg';

export class ElevenLabsProvider implements TtsProvider {
  readonly name = 'elevenlabs';
  constructor(readonly model: string, private apiKey = process.env.ELEVENLABS_API_KEY) {
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set (add it to .env, or set the TTS provider to "mock")');
  }

  async synthesize(req: TtsRequest): Promise<Buffer> {
    const caps = modelCaps(this.model);
    const stability = caps.discreteStability ? (req.stability >= 0.75 ? 1 : 0.5) : req.stability;
    const voiceSettings: Record<string, unknown> = { stability, similarity_boost: 0.75 };
    if (caps.speed) Object.assign(voiceSettings, { style: 0, use_speaker_boost: true, speed: req.speed });

    const body: Record<string, unknown> = { text: req.text, model_id: this.model, voice_settings: voiceSettings };
    if (caps.languageCode) body.language_code = req.language === 'ja-JP' ? 'ja' : 'en';
    if (caps.contextText) {
      if (req.previousText) body.previous_text = req.previousText;
      if (req.nextText) body.next_text = req.nextText;
    }

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(req.voiceId)}?output_format=mp3_44100_128`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'xi-api-key': this.apiKey!, 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      throw new TransientError(`ElevenLabs request failed: ${(err as Error).message}`);
    }
    if (!res.ok) {
      const text = (await res.text()).slice(0, 500);
      const msg = `ElevenLabs ${res.status}: ${text}`;
      if (isTransientStatus(res.status)) throw new TransientError(msg, res.status);
      throw Object.assign(new Error(msg), { status: res.status });
    }
    const audio = Buffer.from(await res.arrayBuffer());
    // Models without a speed setting (Eleven v3/v4): slow down afterwards, pitch preserved.
    return !caps.speed && Math.abs(req.speed - 1) > 0.01 ? changeTempo(audio, req.speed) : audio;
  }
}
