const QUIET = !!process.env.OPENUI_QUIET;
const log = QUIET ? () => {} : console.log.bind(console);

const TIMEOUT_MS = 30_000;
const DELAY_BETWEEN_MS = 2_000;

interface WaitingSession {
  id: string;
  done: () => void;
  timer: ReturnType<typeof setTimeout>;
}

const pending: { id: string; start: () => void }[] = [];
let active: WaitingSession | null = null;
let running = false;
let queued = 0;
let finished = 0;

export function queueProgress() {
  return { queued, finished, currentId: active?.id ?? null, busy: running };
}

export function enqueue(sessionId: string, start: () => void) {
  pending.push({ id: sessionId, start });
  queued++;
  if (!running) drain();
}

export function markReady(sessionId: string) {
  if (!active || active.id !== sessionId) return;
  clearTimeout(active.timer);
  log(`[queue] ${sessionId} ready`);
  const { done } = active;
  active = null;
  setTimeout(done, DELAY_BETWEEN_MS);
}

async function drain() {
  running = true;
  while (pending.length > 0) {
    const next = pending.shift()!;
    log(`[queue] launching ${next.id} (${pending.length} left)`);

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        log(`[queue] ${next.id} timed out after ${TIMEOUT_MS}ms`);
        active = null;
        resolve();
      }, TIMEOUT_MS);

      active = { id: next.id, done: resolve, timer };
      try {
        next.start();
      } catch (err) {
        clearTimeout(timer);
        active = null;
        log(`[queue] ${next.id} failed: ${err}`);
        resolve();
      }
    });
    finished++;
  }
  running = false;
}
