import { AppState, AppStateStatus } from 'react-native';

export function isAppBackgrounded(): boolean {
  const state = AppState.currentState;
  return state === 'background' || state === 'inactive';
}

/** Wait until the app is active again (e.g. user returns from another app). */
export function waitForAppActive(timeoutMs = 30 * 60 * 1000): Promise<boolean> {
  if (!isAppBackgrounded()) return Promise.resolve(true);

  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    let settled = false;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      sub.remove();
      clearInterval(timer);
      resolve(ok);
    };

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') finish(true);
    });

    const timer = setInterval(() => {
      if (!isAppBackgrounded()) {
        finish(true);
      } else if (Date.now() >= deadline) {
        finish(false);
      }
    }, 500);
  });
}

export function isSuspendableUploadError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
  return (
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('xhr') ||
    msg.includes('abort') ||
    msg.includes('paused') ||
    msg.includes('background') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('failed to fetch') ||
    msg.includes('connection') ||
    msg.includes('socket') ||
    msg.includes('cancelled') ||
    msg.includes('canceled')
  );
}

export type UploadRetryCallbacks = {
  onSuspended?: () => void;
  onResumed?: () => void;
};

/**
 * Retry an upload when the OS suspends networking (app backgrounded).
 * Waits for the user to return instead of failing immediately.
 */
export async function withUploadForegroundRetry<T>(
  run: () => Promise<T>,
  options?: UploadRetryCallbacks & {
    maxForegroundRetries?: number;
    maxBackgroundCycles?: number;
    resumeSettleMs?: number;
  },
): Promise<T> {
  const maxForegroundRetries = options?.maxForegroundRetries ?? 8;
  const maxBackgroundCycles = options?.maxBackgroundCycles ?? 40;
  const resumeSettleMs = options?.resumeSettleMs ?? 900;
  let foregroundAttempt = 0;
  let backgroundCycles = 0;
  let resumedFromBackground = false;

  while (true) {
    foregroundAttempt++;
    try {
      const result = await run();
      return result;
    } catch (error) {
      if (!isSuspendableUploadError(error)) throw error;

      if (isAppBackgrounded()) {
        backgroundCycles++;
        if (backgroundCycles > maxBackgroundCycles) throw error;
        options?.onSuspended?.();
        const resumed = await waitForAppActive();
        options?.onResumed?.();
        if (!resumed) throw error;
        resumedFromBackground = true;
        foregroundAttempt = 0;
        await new Promise((r) => setTimeout(r, resumeSettleMs));
        continue;
      }

      // Error right after returning — treat as background interruption, not a hard fail.
      if (resumedFromBackground || (error instanceof Error && error.message.includes('backgrounded'))) {
        resumedFromBackground = false;
        await new Promise((r) => setTimeout(r, resumeSettleMs));
        foregroundAttempt = 0;
        continue;
      }

      if (foregroundAttempt < maxForegroundRetries) {
        const delay = Math.min(8000, Math.pow(2, foregroundAttempt) * 1000);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      throw error;
    }
  }
}
