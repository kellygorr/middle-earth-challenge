import { getAggregatedAndroidDistanceRecords } from '../fitnessService';

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
