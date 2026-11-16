import type { TtsProvider, TtsRequest } from './types';
import { TransientError, isTransientStatus } from '../retry';

export class ElevenLabsProvider implements TtsProvider {
  readonly name = 'elevenlabs';
  constructor(readonly model: string, private apiKey = process.env.ELEVENLABS_API_KEY) {
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set (add it to .env, or set the TTS provider to "mock")');
  }

  async synthesize(req: TtsRequest): Promise<Buffer> {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(req.voiceId)}?output_format=mp3_44100_128`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'xi-api-key': this.apiKey!, 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify({
          text: req.text,
          model_id: this.model,
          voice_settings: { stability: req.stability, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: req.speed },
        }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      throw new TransientError(`ElevenLabs request failed: ${(err as Error).message}`);
    }
    if (!res.ok) {
      const body = (await res.text()).slice(0, 500);
      const msg = `ElevenLabs ${res.status}: ${body}`;
      if (isTransientStatus(res.status)) throw new TransientError(msg, res.status);
      throw Object.assign(new Error(msg), { status: res.status });
    }
    return Buffer.from(await res.arrayBuffer());
  }
}
