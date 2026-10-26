import { evaluatePedometerCommitHealth } from '../pedometerHealth';
import {
  PEDOMETER_BG_COMMIT_INTERVAL_MS,
  PEDOMETER_STALL_THRESHOLD_MS,
} from '../../constants/sync';

const NOW = new Date(2026, 7, 21, 12).getTime();

const input = (
  overrides: Partial<Parameters<typeof evaluatePedometerCommitHealth>[0]> = {},
) => ({
  trackingMode: 'pedometer' as const,
  lastCommitAt: NOW - 60_000,
  now: NOW,
  serviceRunning: true,
  ...overrides,
});

describe('evaluatePedometerCommitHealth', () => {
  it('reports ok while commits are landing', () => {
    expect(evaluatePedometerCommitHealth(input())).toEqual({ status: 'ok' });
  });

  it.each(['pedometer', 'dual'] as const)(
    'applies to the %s tracking mode',
    trackingMode => {
      const result = evaluatePedometerCommitHealth(
        input({
          trackingMode,
          serviceRunning: false,
          lastCommitAt: NOW - PEDOMETER_STALL_THRESHOLD_MS - 1,
        }),
      );
      expect(result.status).toBe('service-stopped');
    },
  );

  it('does not apply to health-app tracking', () => {
    const result = evaluatePedometerCommitHealth(
      input({ trackingMode: 'health-app', lastCommitAt: 0 }),
    );
    expect(result).toEqual({ status: 'not-applicable', reason: 'mode' });
  });

  it('does not apply before the first commit', () => {
    const result = evaluatePedometerCommitHealth(input({ lastCommitAt: null }));
    expect(result).toEqual({
      status: 'not-applicable',
      reason: 'never-committed',
    });
  });

  it('reports a stopped service ahead of staleness', () => {
    // Both conditions are true; the stopped service is the actionable one.
    const result = evaluatePedometerCommitHealth(
      input({
        serviceRunning: false,
        lastCommitAt: NOW - PEDOMETER_STALL_THRESHOLD_MS - 1,
      }),
    );
    expect(result).toEqual({
      status: 'service-stopped',
      lastCommitAt: NOW - PEDOMETER_STALL_THRESHOLD_MS - 1,
      staleForMs: PEDOMETER_STALL_THRESHOLD_MS + 1,
    });
  });

  it('does not report a brief service interruption', () => {
    const result = evaluatePedometerCommitHealth(
      input({ serviceRunning: false }),
    );
    expect(result).toEqual({ status: 'ok' });
  });

  it('silently recovers delayed commits when native recording continued', () => {
    const lastCommitAt = NOW - PEDOMETER_STALL_THRESHOLD_MS - 1;
    expect(evaluatePedometerCommitHealth(input({ lastCommitAt }))).toEqual({
      status: 'ok',
    });
  });

  it('does not report an interruption exactly at the threshold', () => {
    const result = evaluatePedometerCommitHealth(
      input({ lastCommitAt: NOW - PEDOMETER_STALL_THRESHOLD_MS }),
    );
    expect(result).toEqual({ status: 'ok' });
  });

  it('tolerates a single delayed sweep', () => {
    // OEM throttling stretches the ~4.8h cadence; one late sweep is not a fault.
    const result = evaluatePedometerCommitHealth(
      input({ lastCommitAt: NOW - PEDOMETER_BG_COMMIT_INTERVAL_MS * 2 }),
    );
    expect(result).toEqual({ status: 'ok' });
  });

  it('treats a watermark ahead of the clock as ok', () => {
    // A backwards device clock change must not be reported as a fault.
    const result = evaluatePedometerCommitHealth(
      input({ lastCommitAt: NOW + 60_000 }),
    );
    expect(result).toEqual({ status: 'ok' });
  });

  it('does not confuse an idle user with a stall', () => {
    // A zero-step window still advances the watermark, so an idle-but-healthy
    // device looks exactly like an active one to this check.
    const idleButCommitting = evaluatePedometerCommitHealth(
      input({ lastCommitAt: NOW - 5_000 }),
    );
    expect(idleButCommitting).toEqual({ status: 'ok' });
  });
});
