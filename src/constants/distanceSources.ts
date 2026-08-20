import type { DistanceSource } from '../types';

export const MANUAL_DISTANCE_SOURCES: DistanceSource[] = [
  'manual',
  'manual-distance',
  'manual-steps',
];

const MANUAL_DISTANCE_SOURCE_SET = new Set<string>(MANUAL_DISTANCE_SOURCES);

const SYNCED_SOURCE_LABELS: Partial<Record<DistanceSource, string>> = {
  synced: 'Synced',
  'health-connect': 'Health Connect',
  'apple-health': 'Apple Health',
  pedometer: 'Pedometer',
  'health-reconciliation': 'Health adjustment',
};

export function isManualDistanceSource(source: string): boolean {
  return MANUAL_DISTANCE_SOURCE_SET.has(source);
}

export function isSyncedDistanceSource(source: string): boolean {
  return !isManualDistanceSource(source);
}

export function getDistanceSourceLabel(source: string): string {
  if (isManualDistanceSource(source)) return 'Manual';
  return SYNCED_SOURCE_LABELS[source as DistanceSource] ?? 'Synced';
}
