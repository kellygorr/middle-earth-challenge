export function getHealthSyncStartTimestamp(
  lastSyncTimestamp: number | null,
  syncStartDate: number,
  lookbackStartTimestamp: number | null = null,
  lookbackMs = 0,
  alignmentMs = 1,
): number {
  if (lastSyncTimestamp === null) return syncStartDate;
  if (lookbackStartTimestamp === null || lookbackMs <= 0) {
    return lastSyncTimestamp;
  }

  const candidate = Math.max(
    lookbackStartTimestamp,
    lastSyncTimestamp - lookbackMs,
  );
  const aligned = Math.floor(candidate / alignmentMs) * alignmentMs;
  return Math.max(lookbackStartTimestamp, aligned);
}

export function getHealthSyncFormatForChunk(
  platform: string,
  currentVersion: number,
  chunkIndex: number,
  chunkCount: number,
): number {
  return platform === 'android' &&
    currentVersion === 0 &&
    chunkIndex === chunkCount - 1
    ? 1
    : currentVersion;
}

export function getHealthLookbackStartForChunk(
  platform: string,
  currentVersion: number,
  nextVersion: number,
  currentLookbackStart: number | null,
  chunkStart: number,
  cursor: number,
): number | null {
  if (currentLookbackStart !== null) return currentLookbackStart;

  if (platform === 'android' && currentVersion === 0) {
    return nextVersion === 0 ? null : cursor;
  }

  return chunkStart;
}
