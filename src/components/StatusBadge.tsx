const LABELS: Record<string, { label: string; cls: string }> = {
  not_generated: { label: 'Not generated', cls: 'bg-surface-2 text-muted' },
  queued: { label: 'Queued', cls: 'bg-accent-soft text-accent' },
  script_generation: { label: 'Writing script', cls: 'bg-accent-soft text-accent' },
  script_validation: { label: 'Validating', cls: 'bg-accent-soft text-accent' },
  speech_synthesis: { label: 'Synthesising', cls: 'bg-accent-soft text-accent' },
  audio_assembly: { label: 'Assembling', cls: 'bg-accent-soft text-accent' },
  ready: { label: 'Ready', cls: 'bg-ok/15 text-ok' },
  failed: { label: 'Failed', cls: 'bg-bad/15 text-bad' },
};

export const isActive = (s: string) => ['queued', 'script_generation', 'script_validation', 'speech_synthesis', 'audio_assembly'].includes(s);

export function StatusBadge({ status }: { status: string }) {
  const s = LABELS[status] ?? LABELS.not_generated;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>
      {isActive(status) && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {s.label}
    </span>
  );
}
