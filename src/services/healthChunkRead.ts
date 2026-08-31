interface HealthChunkReadOptions {
  timeoutMs: number;
  retryDelayMs: number;
  shouldRetry?: (error: unknown) => boolean;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('chunk-timeout')),
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

export async function readHealthChunkWithRetry<T>(
  readRecords: () => Promise<T>,
  options: HealthChunkReadOptions,
): Promise<T> {
  try {
    return await withTimeout(readRecords(), options.timeoutMs);
  } catch (error) {
    if (
      (error instanceof Error && error.message === 'chunk-timeout') ||
      options.shouldRetry?.(error) === false
    ) {
      throw error;
    }
  }

  await new Promise<void>(resolve => setTimeout(resolve, options.retryDelayMs));
  return withTimeout(readRecords(), options.timeoutMs);
}
