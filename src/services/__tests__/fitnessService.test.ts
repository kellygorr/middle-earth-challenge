import {
  getAppleHealthDistanceRecords,
  getAggregatedAndroidDistanceRecords,
  getLegacyAndroidDistanceRecords,
  HealthProviderReadError,
  selectAppleHealthDistanceRecords,
} from '../fitnessService';
import { milesToSteps } from '../../utils/stride';

describe('fitnessService Android aggregation', () => {
  const mockAggregateRecord = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses Health Connect aggregates so overlapping device records are deduplicated', async () => {
    mockAggregateRecord.mockImplementation(
      ({ recordType }: { recordType: string }) =>
        Promise.resolve(
          recordType === 'Steps'
            ? { COUNT_TOTAL: 7000, dataOrigins: ['garmin', 'phone'] }
            : {
                DISTANCE: { inMeters: 4000 },
                dataOrigins: ['garmin', 'phone'],
              },
        ),
    );

    const start = new Date('2026-07-30T00:00:00.000Z');
    const end = new Date('2026-07-31T00:00:00.000Z');

    const records = await getAggregatedAndroidDistanceRecords(
      { aggregateRecord: mockAggregateRecord },
      start,
      end,
    );

    expect(mockAggregateRecord).toHaveBeenCalledTimes(1);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: `hc_aggregate_${start.getTime()}`,
      steps: 7000,
    });
  });

  it('keeps an aggregate ID stable when a late record changes the window total', async () => {
    mockAggregateRecord.mockImplementation(
      ({ recordType }: { recordType: string }) =>
        Promise.resolve(
          recordType === 'Steps'
            ? { COUNT_TOTAL: 1000 }
            : { DISTANCE: { inMeters: 500 } },
        ),
    );
    const start = new Date('2026-07-30T00:00:00.000Z');

    const first = await getAggregatedAndroidDistanceRecords(
      { aggregateRecord: mockAggregateRecord },
      start,
      new Date('2026-07-31T00:00:00.000Z'),
    );
    mockAggregateRecord.mockImplementation(
      ({ recordType }: { recordType: string }) =>
        Promise.resolve(
          recordType === 'Steps'
            ? { COUNT_TOTAL: 1500 }
            : { DISTANCE: { inMeters: 700 } },
        ),
    );
    const amended = await getAggregatedAndroidDistanceRecords(
      { aggregateRecord: mockAggregateRecord },
      start,
      new Date('2026-07-31T12:00:00.000Z'),
    );

    expect(amended[0].id).toBe(first[0].id);
    expect(amended[0].steps).toBeGreaterThan(first[0].steps);
  });

  it('uses Health Connect steps as the canonical aggregate when both signals exist', async () => {
    mockAggregateRecord.mockImplementation(
      ({ recordType }: { recordType: string }) =>
        Promise.resolve(
          recordType === 'Steps'
            ? { COUNT_TOTAL: 2000 }
            : { DISTANCE: { inMeters: 5000 } },
        ),
    );

    const start = new Date('2026-07-30T00:00:00.000Z');
    const end = new Date('2026-07-31T00:00:00.000Z');
    const records = await getAggregatedAndroidDistanceRecords(
      { aggregateRecord: mockAggregateRecord },
      start,
      end,
    );

    expect(records[0]).toMatchObject({
      id: `hc_aggregate_${start.getTime()}`,
      steps: 2000,
    });
    expect(records[0].distanceMeters).toBeCloseTo(2000 * 0.762);
  });

  it('does not require a Distance aggregate when Steps succeeds', async () => {
    mockAggregateRecord.mockImplementation(
      ({ recordType }: { recordType: string }) =>
        recordType === 'Steps'
          ? Promise.resolve({ COUNT_TOTAL: 7501 })
          : Promise.reject(new Error('distance permission missing')),
    );

    const records = await getAggregatedAndroidDistanceRecords(
      { aggregateRecord: mockAggregateRecord },
      new Date('2026-08-30T07:00:00.000Z'),
      new Date('2026-08-31T07:00:00.000Z'),
    );

    expect(mockAggregateRecord).toHaveBeenCalledTimes(1);
    expect(records[0].steps).toBe(7501);
    expect(records[0].distanceMeters).toBeCloseTo(7501 * 0.762);
  });

  it('derives distance when Health Connect only has steps', async () => {
    mockAggregateRecord.mockImplementation(
      ({ recordType }: { recordType: string }) =>
        Promise.resolve(
          recordType === 'Steps'
            ? { COUNT_TOTAL: 4200 }
            : { DISTANCE: { inMeters: 0 } },
        ),
    );

    const records = await getAggregatedAndroidDistanceRecords(
      { aggregateRecord: mockAggregateRecord },
      new Date('2026-07-30T00:00:00.000Z'),
      new Date('2026-07-31T00:00:00.000Z'),
    );

    expect(records[0].steps).toBe(4200);
    expect(records[0].distanceMeters).toBeGreaterThan(0);
  });

  it('derives steps when Health Connect only has distance', async () => {
    mockAggregateRecord.mockImplementation(
      ({ recordType }: { recordType: string }) =>
        Promise.resolve(
          recordType === 'Steps'
            ? { COUNT_TOTAL: 0 }
            : { DISTANCE: { inMeters: 3200 } },
        ),
    );

    const records = await getAggregatedAndroidDistanceRecords(
      { aggregateRecord: mockAggregateRecord },
      new Date('2026-07-30T00:00:00.000Z'),
      new Date('2026-07-31T00:00:00.000Z'),
    );

    expect(records[0].distanceMeters).toBe(3200);
    expect(records[0].steps).toBeGreaterThan(0);
  });

  it('rejects when both aggregate signals fail', async () => {
    mockAggregateRecord.mockRejectedValue(new Error('Health Connect offline'));
    const start = new Date('2026-07-30T00:00:00.000Z');
    const end = new Date('2026-07-31T00:00:00.000Z');

    await expect(
      getAggregatedAndroidDistanceRecords(
        { aggregateRecord: mockAggregateRecord },
        start,
        end,
      ),
    ).rejects.toThrow('Health Connect offline');
  });

  it('rejects an incomplete aggregate instead of treating it as empty', async () => {
    mockAggregateRecord.mockImplementation(
      ({ recordType }: { recordType: string }) =>
        recordType === 'Distance'
          ? Promise.reject(new Error('distance provider offline'))
          : Promise.resolve({ COUNT_TOTAL: 0 }),
    );

    await expect(
      getAggregatedAndroidDistanceRecords(
        { aggregateRecord: mockAggregateRecord },
        new Date('2026-07-30T00:00:00.000Z'),
        new Date('2026-07-31T00:00:00.000Z'),
      ),
    ).rejects.toMatchObject({
      name: 'HealthProviderReadError',
      provider: 'health-connect',
      signal: 'distance',
    });
  });

  it('returns an empty list only when both aggregate reads succeed empty', async () => {
    mockAggregateRecord.mockImplementation(
      ({ recordType }: { recordType: string }) =>
        Promise.resolve(
          recordType === 'Steps'
            ? { COUNT_TOTAL: 0 }
            : { DISTANCE: { inMeters: 0 } },
        ),
    );

    await expect(
      getAggregatedAndroidDistanceRecords(
        { aggregateRecord: mockAggregateRecord },
        new Date('2026-07-30T00:00:00.000Z'),
        new Date('2026-07-31T00:00:00.000Z'),
      ),
    ).resolves.toEqual([]);
  });
});

describe('fitnessService Android legacy cutover', () => {
  it('preserves LIVE raw record IDs so existing entries deduplicate', async () => {
    const readRecords = jest.fn(async (recordType: 'Distance' | 'Steps') => ({
      records:
        recordType === 'Steps'
          ? [
              {
                metadata: { id: 'live-step-id' },
                startTime: '2026-07-30T08:00:00.000Z',
                endTime: '2026-07-30T08:15:00.000Z',
                count: 3000,
              },
            ]
          : [],
    }));

    const records = await getLegacyAndroidDistanceRecords(
      { readRecords } as never,
      new Date('2026-07-30T00:00:00.000Z'),
      new Date('2026-07-31T00:00:00.000Z'),
    );

    expect(records).toHaveLength(1);
    expect(records[0].id).toBe('live-step-id');
  });

  it('rejects a failed raw read instead of advancing the cutover as empty', async () => {
    const readRecords = jest.fn((recordType: 'Distance' | 'Steps') =>
      recordType === 'Distance'
        ? Promise.reject(new Error('raw provider failed'))
        : Promise.resolve({ records: [] }),
    );

    await expect(
      getLegacyAndroidDistanceRecords(
        { readRecords } as never,
        new Date('2026-07-30T00:00:00.000Z'),
        new Date('2026-07-31T00:00:00.000Z'),
      ),
    ).rejects.toMatchObject({
      name: 'HealthProviderReadError',
      provider: 'health-connect',
      signal: 'distance',
    });
  });
});

describe('fitnessService Apple Health sample selection', () => {
  const startDate = '2026-07-30T00:00:00.000Z';
  const endDate = '2026-07-31T00:00:00.000Z';

  it('uses Apple Health steps as the canonical sample when both signals exist', () => {
    const records = selectAppleHealthDistanceRecords(
      [{ value: 3, startDate, endDate }],
      [{ value: 2000, startDate, endDate }],
    );

    expect(records[0].steps).toBe(2000);
    expect(records[0].distanceMeters).toBeCloseTo(2000 * 0.762);
  });

  it('derives steps when no measured sample overlaps the distance day', () => {
    const records = selectAppleHealthDistanceRecords(
      [{ value: 3, startDate, endDate }],
      [],
    );

    expect(records[0].steps).toBe(milesToSteps(3));
  });

  it('derives distance when Apple Health only has steps', () => {
    const records = selectAppleHealthDistanceRecords(
      [],
      [{ value: 4200, startDate, endDate }],
    );

    expect(records[0].steps).toBe(4200);
    expect(records[0].distanceMeters).toBeGreaterThan(0);
  });

  it('records both values when Apple Health only has distance', () => {
    const records = selectAppleHealthDistanceRecords(
      [{ value: 3, startDate, endDate }],
      [],
    );

    expect(records[0].distanceMeters).toBeGreaterThan(0);
    expect(records[0].steps).toBe(milesToSteps(3));
  });

  it('returns an empty list when both Apple Health reads succeed empty', async () => {
    await expect(
      getAppleHealthDistanceRecords(
        () => Promise.resolve([]),
        () => Promise.resolve([]),
      ),
    ).resolves.toEqual([]);
  });

  it('rejects when either Apple Health signal fails', async () => {
    const failure = getAppleHealthDistanceRecords(
      () => Promise.resolve([]),
      () => Promise.reject(new Error('HealthKit query failed')),
    );

    await expect(failure).rejects.toBeInstanceOf(HealthProviderReadError);
    await expect(failure).rejects.toMatchObject({
      provider: 'apple-health',
      signal: 'steps',
    });
  });
});
