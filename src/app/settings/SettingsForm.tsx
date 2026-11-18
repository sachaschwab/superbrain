'use client';

import { useState } from 'react';
import type { Settings } from '@/lib/config';

type Path = string;

function get(obj: unknown, path: Path): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);
}
function set<T>(obj: T, path: Path, value: unknown): T {
  const keys = path.split('.');
  const copy = structuredClone(obj) as Record<string, unknown>;
  let cur = copy;
  for (const k of keys.slice(0, -1)) cur = cur[k] as Record<string, unknown>;
  cur[keys.at(-1)!] = value;
  return copy as T;
}

export function SettingsForm({ initial, keys }: { initial: Settings; keys: { anthropic: boolean; elevenlabs: boolean } }) {
  const [s, setS] = useState(initial);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const num = (path: Path, opts: { step?: number; min?: number; max?: number; nullable?: boolean } = {}) => (
    <input
      type="number"
      className="field"
      step={opts.step ?? 1}
      min={opts.min}
      max={opts.max}
      value={(get(s, path) as number | null) ?? ''}
      placeholder={opts.nullable ? 'not set' : undefined}
      onChange={(e) => setS(set(s, path, e.target.value === '' ? (opts.nullable ? null : 0) : Number(e.target.value)))}
    />
  );
  const text = (path: Path, placeholder?: string) => (
    <input className="field font-mono" value={(get(s, path) as string) ?? ''} placeholder={placeholder} onChange={(e) => setS(set(s, path, e.target.value))} />
  );
  const select = (path: Path, options: string[]) => (
    <select className="field" value={get(s, path) as string} onChange={(e) => setS(set(s, path, e.target.value))}>
      {options.map((o) => <option key={o}>{o}</option>)}
    </select>
  );
  const check = (path: Path, label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={!!get(s, path)} onChange={(e) => setS(set(s, path, e.target.checked))} /> {label}
    </label>
  );

  const [previewing, setPreviewing] = useState<string | null>(null);
  async function preview(path: Path, language: 'ja-JP' | 'en') {
    const voiceId = (get(s, path) as string) || s.voices.female;
    setPreviewing(path);
    setStatus(null);
    try {
      const res = await fetch('/api/tts/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ voiceId, language, model: s.tts.model, provider: s.tts.provider }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audio.onended = () => setPreviewing(null);
      await audio.play();
    } catch (err) {
      setStatus({ ok: false, text: `Preview failed: ${(err as Error).message}` });
      setPreviewing(null);
    }
  }
  const voice = (path: Path, language: 'ja-JP' | 'en', placeholder?: string) => (
    <div className="flex gap-2">
      {text(path, placeholder)}
      <button type="button" className="btn shrink-0" disabled={!!previewing} onClick={() => preview(path, language)}>
        {previewing === path ? 'Playing…' : '▶ Test'}
      </button>
    </div>
  );

  async function save() {
    setSaving(true);
    setStatus(null);
    const res = await fetch('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(s) });
    const data = await res.json();
    setSaving(false);
    if (res.ok) {
      setS(data.settings);
      setStatus({ ok: true, text: 'Saved.' });
    } else {
      setStatus({ ok: false, text: data.issues ? data.issues.map((i: { path: string[]; message: string }) => `${i.path.join('.')}: ${i.message}`).join('; ') : data.error });
    }
  }

  return (
    <div className="space-y-6">
      <Group title="Lesson">
        <Row label="Target duration (minutes)">{num('targetDurationMinutes', { min: 5, max: 40 })}</Row>
        <Row label="New vocabulary per lesson">
          <div className="flex items-center gap-2">{num('newVocabularyMin', { min: 3, max: 20 })}<span className="text-muted">to</span>{num('newVocabularyMax', { min: 3, max: 20 })}</div>
        </Row>
        <Row label="Dialogue turns (Step 1)">
          <div className="flex items-center gap-2">{num('dialogueTurnsMin', { min: 2, max: 12 })}<span className="text-muted">to</span>{num('dialogueTurnsMax', { min: 2, max: 14 })}</div>
        </Row>
        <Row label="Grammar depth">{select('grammarDepth', ['light', 'standard', 'deep'])}</Row>
        <Row label="Review intensity">{select('reviewIntensity', ['light', 'standard', 'strong'])}</Row>
        <Row label="Explanation language" hint="Language code, e.g. en">{text('explanationLanguage')}</Row>
        <div className="grid gap-2 pt-2 sm:grid-cols-2">
          {check('includePoliteSpeech', 'Include polite speech')}
          {check('includeCasualSpeech', 'Include casual speech')}
          {check('enableStructuralTranslation', 'Structural translations')}
          {check('enableGrammarAnalysis', 'Grammar analysis')}
          {check('enablePatternVariations', 'Pattern variations')}
          {check('enableMentalRetrieval', 'Mental retrieval prompts')}
          {check('includePreviousLessonReview', 'Review earlier lessons')}
          {check('endWithRelaxedListening', 'End with relaxed listening')}
        </div>
      </Group>

      <Group title="Voices & speech">
        <Row label="TTS provider">{select('tts.provider', ['elevenlabs', 'mock'])}</Row>
        <Row label="TTS model" hint="eleven_v4 has the best Japanese accent but no speed setting (speed is applied afterwards)">
          <input className="field font-mono" list="tts-models" value={s.tts.model} onChange={(e) => setS(set(s, 'tts.model', e.target.value))} />
          <datalist id="tts-models">
            {['eleven_v4', 'eleven_multilingual_v2', 'eleven_v4_turbo', 'eleven_v3', 'eleven_flash_v2_5', 'eleven_turbo_v2_5'].map((m) => <option key={m} value={m} />)}
          </datalist>
        </Row>
        {s.tts.provider === 'elevenlabs' && !keys.elevenlabs && <Warn>ELEVENLABS_API_KEY is not set in .env</Warn>}
        <Row label="Speech speed" hint="0.7–1.2, applied on top of each segment's rate">{num('speechSpeed', { step: 0.05, min: 0.7, max: 1.2 })}</Row>
        <Row label="Female voice ID" hint="Japanese dialogue">{voice('voices.female', 'ja-JP')}</Row>
        <Row label="Male voice ID" hint="Japanese dialogue">{voice('voices.male', 'ja-JP')}</Row>
        <Row label="Narrator voice ID" hint="English explanations">{voice('voices.narrator', 'en')}</Row>
        <Row label="Narrator Japanese voice ID" hint="Japanese examples inside explanations; empty = female voice">{voice('voices.narratorJapanese', 'ja-JP', 'same as female')}</Row>
        <p className="text-xs text-muted">
          Find voice IDs in the ElevenLabs Voice Library (filter: Japanese) and add them to My Voices. Native Japanese voices sound far better
          than the default English ones. ▶ Test plays a short sample with the model above (a few dozen characters; repeated tests are cached).
        </p>
      </Group>

      <Group title="Script generation">
        <Row label="LLM provider">{select('llm.provider', ['anthropic', 'mock'])}</Row>
        <Row label="Model">{text('llm.model')}</Row>
        {s.llm.provider === 'anthropic' && !keys.anthropic && <Warn>ANTHROPIC_API_KEY is not set in .env</Warn>}
        <Row label="Correction rounds" hint="How often a failed script is sent back for targeted fixes">{num('llm.maxCorrectionRounds', { min: 0, max: 4 })}</Row>
        <div className="pt-1">{check('llm.linguisticReview', 'Second LLM pass to review Japanese, translations and register')}</div>
      </Group>

      <Group title="Cost controls">
        <p className="text-xs text-muted">Enter your providers' current prices to see estimated costs. Nothing is assumed by default.</p>
        <Row label="LLM input, USD per million tokens">{num('pricing.llmInputPerMTokUsd', { step: 0.01, min: 0, nullable: true })}</Row>
        <Row label="LLM output, USD per million tokens">{num('pricing.llmOutputPerMTokUsd', { step: 0.01, min: 0, nullable: true })}</Row>
        <Row label="TTS, USD per 1,000 characters">{num('pricing.ttsPer1kCharsUsd', { step: 0.001, min: 0, nullable: true })}</Row>
        <Row label="Ask before exceeding (USD per lesson)">{num('maxEstimatedCostPerLessonUsd', { step: 0.1, min: 0, nullable: true })}</Row>
      </Group>

      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
        {status && <span className={`text-sm ${status.ok ? 'text-ok' : 'text-bad'}`}>{status.text}</span>}
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{title}</h2>
      {children}
    </section>
  );
}
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid items-center gap-1 sm:grid-cols-[14rem_1fr] sm:gap-4">
      <div>
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      {children}
    </div>
  );
}
function Warn({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">{children}</p>;
}
