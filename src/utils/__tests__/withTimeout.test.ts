import { withTimeout } from '../withTimeout';

describe('withTimeout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves with the original value when it settles before the timeout', async () => {
    const promise = withTimeout(Promise.resolve('done'), 1000);
    await expect(promise).resolves.toBe('done');
  });

  it('propagates the original rejection when it settles before the timeout', async () => {
    const promise = withTimeout(
      Promise.reject(new Error('real failure')),
      1000,
    );
    await expect(promise).rejects.toThrow('real failure');
  });

  it('rejects with the default timeout message once the timeout elapses', async () => {
    let resolveOriginal: (() => void) | undefined;
    const original = new Promise<void>(resolve => {
      resolveOriginal = resolve;
    });

    const promise = withTimeout(original, 1000);
    jest.advanceTimersByTime(1000);
    await expect(promise).rejects.toThrow('timeout');

    // The abandoned original promise settling afterward must not throw an
    // unhandled rejection or otherwise affect anything — nothing is
    // listening to it once withTimeout's own promise has already settled.
    resolveOriginal?.();
  });

  it('rejects with a custom timeout message when provided', async () => {
    const original = new Promise<void>(() => {});
    const promise = withTimeout(original, 500, 'custom-timeout');
    jest.advanceTimersByTime(500);
    await expect(promise).rejects.toThrow('custom-timeout');
  });

  it('does not fire the timeout after the original promise already resolved', async () => {
    const promise = withTimeout(Promise.resolve('fast'), 1000);
    await expect(promise).resolves.toBe('fast');

    // If the timer weren't cleared on resolution, advancing past it would
    // reject an already-settled promise, which is a silent no-op in Jest
    // but would indicate a leaked timer in real usage. Assert no pending
    // timers remain instead, which does catch that leak.
    expect(jest.getTimerCount()).toBe(0);
  });
});
