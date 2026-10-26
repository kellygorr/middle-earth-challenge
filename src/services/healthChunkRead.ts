import { withTimeout } from '../utils/withTimeout';

interface HealthChunkReadOptions {
  timeoutMs: number;
  retryDelayMs: number;
  shouldRetry?: (error: unknown) => boolean;
}

export async function readHealthChunkWithRetry<T>(
  readRecords: () => Promise<T>,
  options: HealthChunkReadOptions,
): Promise<T> {
  try {
    return await withTimeout(readRecords(), options.timeoutMs, 'chunk-timeout');
  } catch (error) {
    if (
      (error instanceof Error && error.message === 'chunk-timeout') ||
      options.shouldRetry?.(error) === false
    ) {
      throw error;
    }
  }

  await new Promise<void>(resolve => setTimeout(resolve, options.retryDelayMs));
  return withTimeout(readRecords(), options.timeoutMs, 'chunk-timeout');
}
