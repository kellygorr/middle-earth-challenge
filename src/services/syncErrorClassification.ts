import type { SyncError } from '../stores/progressStore';
import { HealthProviderReadError } from './fitnessService';

export function classifySyncError(error: unknown): SyncError {
  const message = error instanceof Error ? error.message : String(error);

  if (/SecurityException|permission|unauthor/i.test(message)) {
    return { kind: 'permission', source: 'health-app', message };
  }

  if (
    /sdk.*unavailable|not installed|update.*required|module not available/i.test(
      message,
    )
  ) {
    return { kind: 'unavailable', message };
  }

  if (error instanceof HealthProviderReadError) {
    return {
      kind: 'provider',
      provider: error.provider,
      message,
    };
  }

  return { kind: 'unknown', message };
}
