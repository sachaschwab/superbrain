export class TransientError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export const isTransientStatus = (status: number) => status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;

/** Retry an async operation on transient failures with exponential backoff and jitter. */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  { attempts = 4, baseMs = 1000, onRetry }: { attempts?: number; baseMs?: number; onRetry?: (err: unknown, attempt: number) => void } = {}
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || attempt === attempts) throw err;
      onRetry?.(err, attempt);
      const delay = baseMs * 2 ** (attempt - 1) * (0.75 + Math.random() * 0.5);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export function isTransient(err: unknown): boolean {
  if (err instanceof TransientError) return true;
  const e = err as { status?: number; code?: string; name?: string } | undefined;
  if (typeof e?.status === 'number') return isTransientStatus(e.status);
  return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_SOCKET'].includes(e?.code ?? '') || e?.name === 'APIConnectionError';
}

/** Strip anything that looks like a credential before storing or showing an error. */
export function safeErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg
    .replace(/sk-ant-[A-Za-z0-9_\-]+/g, 'sk-ant-***')
    .replace(/(xi-api-key|x-api-key|authorization)["':\s]+[^\s"',}]+/gi, '$1: ***')
    .slice(0, 2000);
}
