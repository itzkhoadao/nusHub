/** Releases the caller on cancellation even if a dependency ignores its signal.
 * The dependency must also receive the signal so underlying I/O can stop. */
export function awaitWithAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", abort);
    const abort = () => { cleanup(); reject(signal.reason ?? new DOMException("Request aborted", "AbortError")); };
    work.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
  });
}
