'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { getGenerationView } from '@/lib/generations';
import type { CostEstimate } from '@/lib/cost';
import { StatusBadge, isActive } from '@/components/StatusBadge';
import { TranscriptView } from '@/components/TranscriptView';
import { ScriptView } from '@/components/ScriptView';

type Gen = NonNullable<ReturnType<typeof getGenerationView>>;
type Props = {
  lessonId: string;
  initialGenerations: Gen[];
  fullEstimate: CostEstimate;
  fullExceedsLimit: boolean;
  limitUsd: number | null;
  providers: { llm: string; tts: string };
};

const PHASES = ['queued', 'script_generation', 'script_validation', 'speech_synthesis', 'audio_assembly', 'ready'];

const fmtDuration = (s?: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '—');
const fmtUsd = (n: number | null | undefined) => (n == null ? null : `$${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`);

function describeEstimate(e: CostEstimate) {
  const parts = [];
  if (e.ttsCharacters) parts.push(`~${e.ttsCharacters.toLocaleString()} TTS characters`);
  if (e.llmOutputTokens) parts.push(`~${Math.round((e.llmInputTokens + e.llmOutputTokens) / 1000)}k LLM tokens`);
  if (!parts.length) return 'no paid API calls (mock mode)';
  const price = fmtUsd(e.usd);
  return price ? `≈ ${price} (${parts.join(', ')})` : `${parts.join(', ')}${e.missingPrices.length ? ' · add prices in Settings to see cost' : ''}`;
}

export function LessonClient({ lessonId, initialGenerations, fullEstimate, fullExceedsLimit, limitUsd, providers }: Props) {
  const router = useRouter();
  const [gens, setGens] = useState<Gen[]>(initialGenerations);
  const [selectedId, setSelectedId] = useState<string | null>(initialGenerations.find((g) => g.status === 'ready')?.id ?? null);
  const [panel, setPanel] = useState<'none' | 'transcript' | 'script'>('none');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  const active = gens.find((g) => isActive(g.status));
  const latest = gens[0];
  const selected = gens.find((g) => g.id === selectedId) ?? gens.find((g) => g.status === 'ready');
  const latestWithScript = gens.find((g) => g.hasScript);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/lessons/${lessonId}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setGens(data.generations);
      return data.generations as Gen[];
    }
    return gens;
  }, [lessonId, gens]);

  // Poll while a job is running; the page stays usable meanwhile.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(async () => {
      const next = await refresh();
      const g = next.find((x) => x.id === active.id);
      if (g && g.status === 'ready') {
        setSelectedId(g.id);
        router.refresh();
      }
      if (g && g.status === 'failed') router.refresh();
    }, 2000);
    return () => clearInterval(t);
  }, [active, refresh, router]);

  async function produce(mode: 'full' | 'audio_only', confirmCost = false) {
    setBusy(true);
    setNotice(null);
    try {
      const body = { mode, confirmCost, sourceGenerationId: mode === 'audio_only' ? latestWithScript?.id : undefined };
      const res = await fetch(`/api/lessons/${lessonId}/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (res.status === 402 && data.needsConfirmation) {
        if (window.confirm(`${data.error}.\n\nProduce anyway?`)) return produce(mode, true);
        return;
      }
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      await refresh();
    } catch (err) {
      setNotice({ kind: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function retry(id: string) {
    setBusy(true);
    setNotice(null);
    const res = await fetch(`/api/generations/${id}/retry`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) setNotice({ kind: 'error', text: data.error });
    await refresh();
    setBusy(false);
  }

  async function confirmAndProduce(mode: 'full' | 'audio_only') {
    if (mode === 'full' && fullExceedsLimit && !window.confirm(`Estimated cost ${fmtUsd(fullEstimate.usd)} is above your limit of ${fmtUsd(limitUsd)}. Produce anyway?`)) return;
    await produce(mode, mode === 'full' && fullExceedsLimit);
  }

  const phaseIndex = active ? PHASES.indexOf(active.status) : -1;
  const progressPct = active?.job ? Math.round(active.job.progress * 100) : 0;
  const failed = latest?.status === 'failed' ? latest : null;
  const validationIssues = useMemo(() => {
    const v = (failed ?? selected)?.validation as { errors?: { message: string }[]; warnings?: { message: string }[]; reviewIssues?: { segmentId: string; severity: string; problem: string; suggestedFix: string }[] } | null;
    return v;
  }, [failed, selected]);

  return (
    <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
      {/* Primary area */}
      {selected && selected.hasAudio ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <StatusBadge status="ready" />
              <span className="text-sm text-muted">
                {fmtDuration(selected.durationSeconds)} · {new Date(selected.completedAt ?? selected.createdAt).toLocaleString()}
                {selected.mode === 'audio_only' && ' · audio-only regeneration'}
              </span>
            </div>
            <span className="text-xs text-muted">{selected.tts}</span>
          </div>
          <audio key={selected.id} controls preload="metadata" src={`/api/generations/${selected.id}/audio`} />
          <div className="flex flex-wrap gap-2">
            <a href={`/api/generations/${selected.id}/audio?download=1`} className="btn">Download MP3</a>
            <button className="btn" onClick={() => setPanel(panel === 'transcript' ? 'none' : 'transcript')}>
              {panel === 'transcript' ? 'Hide transcript' : 'View transcript'}
            </button>
            <button className="btn" onClick={() => setPanel(panel === 'script' ? 'none' : 'script')}>
              {panel === 'script' ? 'Hide script' : 'Inspect script'}
            </button>
            <span className="mx-1 hidden w-px bg-line sm:block" />
            <button className="btn" disabled={busy || !!active} onClick={() => confirmAndProduce('audio_only')} title="Same script, current voices and speed">
              Regenerate audio only
            </button>
            <button className="btn" disabled={busy || !!active} onClick={() => confirmAndProduce('full')} title="New script and new audio">
              Regenerate script + audio
            </button>
          </div>
        </div>
      ) : (
        !active && (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold">Produce this lesson</h2>
              <p className="text-sm text-muted">
                Writes a validated 12-step script, synthesises it with three voices and assembles one MP3.
              </p>
            </div>
            <button className="btn-primary" disabled={busy} onClick={() => confirmAndProduce('full')}>
              {busy ? 'Starting…' : 'Produce audio'}
            </button>
          </div>
        )
      )}

      {!active && (
        <p className="mt-3 text-xs text-muted">
          Estimate for a new generation: {describeEstimate(fullEstimate)} · {providers.llm} · {providers.tts}
          {limitUsd != null && ` · limit ${fmtUsd(limitUsd)}`}
        </p>
      )}

      {/* Progress */}
      {active && (
        <div className="mt-1 space-y-3">
          <div className="flex items-center justify-between">
            <StatusBadge status={active.status} />
            <span className="text-sm text-muted">{progressPct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${Math.max(3, progressPct)}%` }} />
          </div>
          <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {['Script', 'Validation', 'Speech', 'Assembly'].map((p, i) => (
              <li key={p} className={phaseIndex > i + 1 ? 'text-ok' : phaseIndex === i + 1 ? 'font-medium text-ink' : ''}>
                {phaseIndex > i + 1 ? '✓ ' : ''}{p}
              </li>
            ))}
          </ol>
          <p className="text-sm">{active.job?.message}</p>
          <p className="text-xs text-muted">This can take several minutes. You can leave this page — the job keeps running.</p>
        </div>
      )}

      {/* Failure */}
      {failed && !active && (
        <div className="mt-4 rounded-lg border border-bad/40 bg-bad/5 p-4 text-sm">
          <div className="font-medium text-bad">The last generation failed</div>
          <p className="mt-1 break-words">{failed.errorMessage}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn" disabled={busy} onClick={() => retry(failed.id)}>
              {failed.hasScript ? 'Retry (keeps script and finished audio)' : 'Retry'}
            </button>
            {!selected?.hasAudio && <button className="btn" disabled={busy} onClick={() => confirmAndProduce('full')}>Start over with a new script</button>}
          </div>
        </div>
      )}

      {notice && <p className={`mt-3 text-sm ${notice.kind === 'error' ? 'text-bad' : 'text-muted'}`}>{notice.text}</p>}

      {/* Validation detail */}
      {validationIssues && ((validationIssues.errors?.length ?? 0) + (validationIssues.warnings?.length ?? 0) + (validationIssues.reviewIssues?.length ?? 0) > 0) && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-muted">
            Validation notes ({validationIssues.errors?.length ?? 0} errors, {validationIssues.warnings?.length ?? 0} warnings, {validationIssues.reviewIssues?.length ?? 0} review notes)
          </summary>
          <ul className="ja mt-2 space-y-1 pl-4">
            {validationIssues.errors?.map((e, i) => <li key={`e${i}`} className="text-bad">● {e.message}</li>)}
            {validationIssues.reviewIssues?.map((r, i) => (
              <li key={`r${i}`} className={r.severity === 'error' ? 'text-bad' : 'text-warn'}>● {r.segmentId}: {r.problem} → {r.suggestedFix}</li>
            ))}
            {validationIssues.warnings?.map((w, i) => <li key={`w${i}`} className="text-warn">○ {w.message}</li>)}
          </ul>
        </details>
      )}

      {panel === 'transcript' && selected && <TranscriptView generationId={selected.id} />}
      {panel === 'script' && (selected ?? latestWithScript) && <ScriptView generationId={(selected ?? latestWithScript)!.id} />}

      {/* History */}
      {gens.length > 0 && (
        <details className="mt-5 border-t border-line pt-4 text-sm" open={gens.length > 1}>
          <summary className="cursor-pointer text-muted">Generation history ({gens.length})</summary>
          <table className="mt-3 w-full">
            <thead className="text-left text-xs text-muted">
              <tr><th className="py-1 font-normal">When</th><th className="font-normal">Type</th><th className="font-normal">Status</th><th className="font-normal">Length</th><th className="font-normal">Usage / cost</th><th /></tr>
            </thead>
            <tbody>
              {gens.map((g) => (
                <tr key={g.id} className={`border-t border-line ${g.id === selected?.id ? 'bg-accent-soft/50' : ''}`}>
                  <td className="py-2 pr-2">{new Date(g.createdAt).toLocaleString()}</td>
                  <td className="pr-2">{g.mode === 'audio_only' ? 'Audio only' : 'Script + audio'}</td>
                  <td className="pr-2"><StatusBadge status={g.status} /></td>
                  <td className="pr-2">{fmtDuration(g.durationSeconds)}</td>
                  <td className="pr-2 text-xs text-muted">
                    {fmtUsd(g.usage.costUsd) ?? `${g.usage.ttsCharacters.toLocaleString()} chars · ${Math.round((g.usage.llmInputTokens + g.usage.llmOutputTokens) / 1000)}k tok`}
                  </td>
                  <td className="text-right">
                    {g.hasAudio && g.id !== selected?.id && <button className="text-accent hover:underline" onClick={() => setSelectedId(g.id)}>Play</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}
