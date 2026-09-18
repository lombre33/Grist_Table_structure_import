export const GRIST_CALL_TIMEOUT_MS = 8000;

export function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

/**
 * Best-effort human-readable text for a caught error, including whatever
 * extra detail the Grist widget RPC layer attaches (`details`/`data`, seen
 * on some `applyUserActions` rejections in addition to `message`) so a
 * failure is actionable instead of a bare "[object Object]". Also logs the
 * raw error to the console (`console.error`), so a report of "it didn't
 * work" can be paired with the real stack trace/detail from devtools.
 */
export function errorMessage(err) {
  console.error(err);
  if (!err) return String(err);
  const base = err.message || String(err);
  const extra = err.details || (err.data && err.data.details);
  return extra && extra !== base ? `${base} (${extra})` : base;
}

export function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
