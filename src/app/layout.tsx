import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Japanese at Night',
  description: 'Learn through listening, structure, and repetition',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-line bg-surface/80 backdrop-blur sticky top-0 z-10">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
            <Link href="/" className="flex items-baseline gap-2 font-semibold tracking-tight">
              <span className="ja text-accent">夜</span> Japanese at Night
            </Link>
            <div className="flex gap-5 text-sm text-muted">
              <Link href="/" className="hover:text-ink">Curriculum</Link>
              <Link href="/flashcards" className="hover:text-ink">Flashcards</Link>
              <Link href="/settings" className="hover:text-ink">Settings</Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
      </body>
    </html>
  );
}
