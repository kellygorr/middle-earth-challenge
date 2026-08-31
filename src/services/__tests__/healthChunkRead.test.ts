import { readHealthChunkWithRetry } from '../healthChunkRead';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('readHealthChunkWithRetry', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not overlap a retry with a timed-out read or apply its late result', async () => {
    jest.useFakeTimers();
    const nativeRead = deferred<string[]>();
    const readRecords = jest.fn(() => nativeRead.promise);
    const applyRecords = jest.fn();
    const result = readHealthChunkWithRetry(readRecords, {
      timeoutMs: 100,
      retryDelayMs: 10,
    }).then(applyRecords);
    let timeoutError: unknown;
    const settledResult = result.catch(error => {
      timeoutError = error;
    });

    await jest.advanceTimersByTimeAsync(100);
    await settledResult;
    expect(timeoutError).toEqual(new Error('chunk-timeout'));
    expect(readRecords).toHaveBeenCalledTimes(1);

    nativeRead.resolve(['late-record']);
    await Promise.resolve();
    expect(applyRecords).not.toHaveBeenCalled();
    expect(readRecords).toHaveBeenCalledTimes(1);
  });

  it('retains one delayed retry for a settled transient failure', async () => {
    jest.useFakeTimers();
    const readRecords = jest
      .fn<Promise<string[]>, []>()
      .mockRejectedValueOnce(new Error('provider busy'))
      .mockResolvedValueOnce(['record']);

    const result = readHealthChunkWithRetry(readRecords, {
      timeoutMs: 100,
      retryDelayMs: 10,
    });

    await jest.advanceTimersByTimeAsync(10);
    await expect(result).resolves.toEqual(['record']);
    expect(readRecords).toHaveBeenCalledTimes(2);
  });
});
