/**
 * Smooths bursty / missing native upload progress into a monotonic, gradually
 * increasing percentage. React Native XHR often omits lengthComputable or fires
 * once at the end — this keeps the bar moving during long uploads.
 */
export function createSmoothProgressEmitter(
  emit: (pct: number, msg?: string, phase?: string) => void,
  options?: { tickMs?: number; uploadPhaseMax?: number }
) {
  const uploadPhaseMax = options?.uploadPhaseMax ?? 38;
  const tickMs = options?.tickMs ?? 100;
  let displayed = 0;
  let target = 0;
  let lastMsg = 'Preparing upload...';
  let lastPhase = 'upload';
  let lastEmitted = -1;
  let timer: ReturnType<typeof setInterval> | null = null;

  function tick() {
    if (displayed < target) {
      const delta = Math.max(0.08, (target - displayed) * 0.2);
      displayed = Math.min(displayed + delta, target);
    } else if (lastPhase === 'upload' && displayed < uploadPhaseMax - 0.15) {
      // No byte events: gentle crawl through the upload phase
      displayed = Math.min(displayed + 0.14, uploadPhaseMax - 0.15);
    }
    const rounded = Math.round(displayed * 10) / 10;
    if (rounded === lastEmitted) return;
    lastEmitted = rounded;
    emit(rounded, lastMsg, lastPhase);
  }

  function setTarget(pct: number, msg?: string, phase?: string) {
    const clamped = Math.max(0, Math.min(100, pct));
    target = Math.max(target, clamped);
    if (msg !== undefined) lastMsg = msg;
    if (phase !== undefined) lastPhase = phase;
  }

  function setMessage(msg: string, phase?: string) {
    const msgChanged = msg !== lastMsg;
    const phaseChanged = phase !== undefined && phase !== lastPhase;
    lastMsg = msg;
    if (phase !== undefined) lastPhase = phase;
    if (msgChanged || phaseChanged) {
      const rounded = Math.round(displayed * 10) / 10;
      emit(rounded, lastMsg, lastPhase);
      lastEmitted = rounded;
    }
  }

  function start() {
    if (timer) return;
    timer = setInterval(tick, tickMs);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { setTarget, setMessage, start, stop };
}
