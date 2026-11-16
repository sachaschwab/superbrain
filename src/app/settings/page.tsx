import { getSettings } from '@/lib/settings';
import { SettingsForm } from './SettingsForm';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">Saved on this machine and applied to the next generation. Each generation keeps a snapshot of the settings it used.</p>
      </div>
      <SettingsForm
        initial={getSettings()}
        keys={{ anthropic: !!process.env.ANTHROPIC_API_KEY, elevenlabs: !!process.env.ELEVENLABS_API_KEY }}
      />
    </div>
  );
}
