export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const { startWorker } = await import('./lib/jobs/worker');
    startWorker();
    console.log('[superbrain] database ready, job worker started');
  } catch (err) {
    // Don't take the dev server down; show why the database/worker could not start.
    console.error('[superbrain] could not start the database / job worker:', err);
  }
}
