import {
  getAggregatedAndroidDistanceRecords,
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

    expect(mockAggregateRecord).toHaveBeenCalledTimes(2);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: `hc_steps_aggregate_${start.getTime()}_${end.getTime()}`,
      steps: 7000,
    });
  });

  it('preserves measured steps when the distance aggregate wins', async () => {
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
      id: `hc_distance_aggregate_${start.getTime()}_${end.getTime()}`,
      distanceMeters: 5000,
      steps: 2000,
    });
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
});

describe('fitnessService Apple Health sample selection', () => {
  const startDate = '2026-07-30T00:00:00.000Z';
  const endDate = '2026-07-31T00:00:00.000Z';

  it('preserves measured steps when daily distance wins', () => {
    const records = selectAppleHealthDistanceRecords(
      [{ value: 3, startDate, endDate }],
      [{ value: 2000, startDate, endDate }],
    );

    expect(records[0].distanceMeters).toBeCloseTo(3 * 1609.344, 2);
    expect(records[0].steps).toBe(2000);
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
});
