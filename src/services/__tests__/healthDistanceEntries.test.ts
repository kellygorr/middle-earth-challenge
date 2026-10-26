import { buildHealthDistanceEntryChanges } from '../healthDistanceEntries';

describe('buildHealthDistanceEntryChanges', () => {
  it('adds a late-arriving record from behind the cursor', () => {
    const result = buildHealthDistanceEntryChanges(
      [
        {
          id: 'late-day',
          startTime: '2026-07-30T00:00:00.000Z',
          endTime: '2026-07-31T00:00:00.000Z',
          distanceMeters: 1609.344,
          steps: 2000,
        },
      ],
      'health-connect',
      'health_connect',
      [],
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      id: 'health_connect_late-day',
      steps: 2000,
    });
    expect(result.entries[0].miles).toBeCloseTo(1);
  });

  it('amends any stable aggregate ID returned by the bounded overlap', () => {
    const existing = {
      id: 'health_connect_hc_aggregate_100',
      saveId: 'default',
      date: 100,
      miles: 1,
      steps: 2000,
      source: 'health-connect' as const,
    };

    const result = buildHealthDistanceEntryChanges(
      [
        {
          id: 'hc_aggregate_100',
          startTime: new Date(100).toISOString(),
          endTime: new Date(200).toISOString(),
          distanceMeters: 3218.688,
          steps: 4000,
        },
      ],
      'health-connect',
      'health_connect',
      [existing],
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      id: existing.id,
      saveId: existing.saveId,
      date: existing.date,
      source: existing.source,
      steps: 4000,
    });
    expect(result.entries[0].miles).toBeCloseTo(2);
    expect(result.milesChanged).toBeCloseTo(1);
  });
});
