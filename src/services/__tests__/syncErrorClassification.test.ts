import { HealthProviderReadError } from '../fitnessService';
import { classifySyncError } from '../syncErrorClassification';

describe('sync error classification', () => {
  it('classifies provider read failures as retryable provider errors', () => {
    expect(
      classifySyncError(
        new HealthProviderReadError(
          'health-connect',
          'steps',
          new Error('native query failed'),
        ),
      ),
    ).toMatchObject({
      kind: 'provider',
      provider: 'health-connect',
    });
  });

  it('preserves permission guidance when a provider read reports denial', () => {
    expect(
      classifySyncError(
        new HealthProviderReadError(
          'apple-health',
          'distance',
          new Error('permission denied'),
        ),
      ),
    ).toMatchObject({ kind: 'permission', source: 'health-app' });
  });

  it('keeps unrelated failures in silent diagnostics', () => {
    expect(classifySyncError(new Error('unexpected bug'))).toMatchObject({
      kind: 'unknown',
    });
  });

  it('classifies a missing native module as provider unavailable', () => {
    expect(
      classifySyncError(
        new HealthProviderReadError(
          'apple-health',
          'module',
          new Error('Apple Health module not available'),
        ),
      ),
    ).toMatchObject({ kind: 'unavailable' });
  });
});
