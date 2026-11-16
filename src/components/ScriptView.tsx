'use client';

import { useEffect, useState } from 'react';
import type { LessonScript } from '@/lib/script/schema';

/** Raw segment view: exactly what goes to the TTS service, with voice, rate and pause. */
export function ScriptView({ generationId }: { generationId: string }) {
  const [s, setS] = useState<LessonScript | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/generations/${generationId}/script`)
      .then(async (r) => (r.ok ? setS(await r.json()) : setError((await r.json()).error)))
      .catch((e) => setError(String(e)));
  }, [generationId]);

  if (error) return <p className="mt-4 text-sm text-bad">{error}</p>;
  if (!s) return <p className="mt-4 text-sm text-muted">Loading script…</p>;

  return (
    <div className="mt-5 border-t border-line pt-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">Script · {s.segments.length} segments</h3>
        <a className="btn" href={`/api/generations/${generationId}/script`} download={`script-${generationId}.json`}>Download JSON</a>
      </div>
      <div className="max-h-[32rem] overflow-auto rounded-lg border border-line">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface-2 text-left text-muted">
            <tr>{['Step', 'Id', 'Voice', 'Lang', 'Rate', 'Pause', 'Text'].map((h) => <th key={h} className="px-2 py-1.5 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {s.segments.map((seg) => (
              <tr key={seg.id} className="border-t border-line align-top">
                <td className="px-2 py-1">{seg.stepNumber}</td>
                <td className="px-2 py-1 text-muted">{seg.id}</td>
                <td className="px-2 py-1">{seg.speaker}</td>
                <td className="px-2 py-1">{seg.language}</td>
                <td className="px-2 py-1">{seg.speechRate}</td>
                <td className="px-2 py-1 text-muted">{seg.pauseAfterMs}</td>
                <td className="ja px-2 py-1 text-sm">{seg.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
