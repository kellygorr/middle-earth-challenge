/**
 * Races a promise against a timeout. Does NOT cancel the underlying
 * operation — the original promise keeps running and its eventual
 * resolution/rejection is simply ignored once the timeout wins. Only wrap
 * calls where that's safe: a pure read with no side effects tied to its
 * completion, so a late, abandoned resolution has nothing left to affect.
 * Do not wrap multi-step operations that mutate state after the awaited
 * call — an abandoned continuation there can still fire later, after the
 * caller has moved on, and mutate state out from under it.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage = 'timeout',
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(timeoutMessage)),
      timeoutMs,
    );
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
