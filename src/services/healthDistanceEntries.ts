import { DEFAULT_SAVE_ID } from '../constants/gameConstants';
import type {
  DistanceEntry,
  DistanceSource,
  HealthDistanceRecord,
} from '../types';
import { METERS_TO_MILES } from '../utils/stride';

export function buildHealthDistanceEntryChanges(
  records: HealthDistanceRecord[],
  healthSource: DistanceSource,
  idPrefix: string,
  existingEntries: DistanceEntry[],
): { entries: DistanceEntry[]; milesChanged: number } {
  const existingEntriesMap = new Map(
    existingEntries.map(entry => [entry.id, entry]),
  );
  const entries: DistanceEntry[] = [];
  let milesChanged = 0;

  for (const record of records) {
    const entryId = `${idPrefix}_${record.id}`;
    const existing = existingEntriesMap.get(entryId);
    const miles = record.distanceMeters * METERS_TO_MILES;

    if (!existing) {
      entries.push({
        id: entryId,
        saveId: DEFAULT_SAVE_ID,
        date: new Date(record.startTime).getTime(),
        miles,
        steps: record.steps,
        source: healthSource,
      });
      milesChanged += miles;
      continue;
    }

    if (
      Math.abs(existing.miles - miles) > 0.001 ||
      existing.steps !== record.steps
    ) {
      entries.push({ ...existing, miles, steps: record.steps });
      milesChanged += miles - existing.miles;
    }
  }

  return { entries, milesChanged };
}
