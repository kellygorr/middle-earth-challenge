import { MapPosition, JourneySegment } from '../types';
import { TOTAL_JOURNEY_MILES } from '../constants/gameConstants';
import checkpointsData from '../constants/checkpoints.json';

/**
 * Calculate the map position based on total miles traveled
 * This determines where to place the progress indicator on the map
 *
 * @param totalMiles Total miles traveled since start of journey
 * @returns Map position with x, y coordinates and segment info
 */
export const calculateMapPosition = (totalMiles: number): MapPosition => {
  const segment = getCurrentSegment(totalMiles);
  const progress = getSegmentProgress(totalMiles, segment);

  // Get start and end checkpoint for this segment
  const startCheckpoint = checkpointsData[segment.id - 1];
  const endCheckpoint = checkpointsData[segment.id];

  // Interpolate between start and end checkpoint coordinates
  const x =
    startCheckpoint.x + (endCheckpoint.x - startCheckpoint.x) * progress;
  const y =
    startCheckpoint.y + (endCheckpoint.y - startCheckpoint.y) * progress;

  return {
    x,
    y,
    checkpointNumber: segment.id,
    segmentProgress: progress,
  };
};

/**
 * Calculate distance between two points
 */
export const calculateDistance = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number => {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
};

/**
 * Check if a point is within a circular radius
 */
export const isWithinRadius = (
  pointX: number,
  pointY: number,
  centerX: number,
  centerY: number,
  radius: number,
): boolean => {
  const distance = calculateDistance(pointX, pointY, centerX, centerY);
  return distance <= radius;
};

/**
 * Helper function to get current segment based on total miles
 */
export const getCurrentSegment = (totalMiles: number): JourneySegment => {
  if (totalMiles >= TOTAL_JOURNEY_MILES) {
    return getJourneySegments()[getJourneySegments().length - 1];
  }

  const segments = getJourneySegments();
  const segment = segments.find(
    seg => totalMiles >= seg.startMiles && totalMiles < seg.endMiles,
  );

  return segment || segments[0];
};

/**
 * Helper function to calculate progress within current segment
 */
export const getSegmentProgress = (
  totalMiles: number,
  segment: JourneySegment,
): number => {
  const milesIntoSegment = totalMiles - segment.startMiles;
  return Math.min(Math.max(milesIntoSegment / segment.miles, 0), 1);
};

/**
 * Build journey segments from checkpoint data
 */
const getJourneySegments = (): JourneySegment[] => {
  const segments: JourneySegment[] = [];

  for (let i = 0; i < checkpointsData.length - 1; i++) {
    const currentCheckpoint = checkpointsData[i];
    const nextCheckpoint = checkpointsData[i + 1];
    const segmentMiles =
      nextCheckpoint.CUMULATIVE_MILES - currentCheckpoint.CUMULATIVE_MILES;

    segments.push({
      id: i + 1,
      from: currentCheckpoint.name,
      to: nextCheckpoint.name,
      miles: segmentMiles,
      startMiles: currentCheckpoint.CUMULATIVE_MILES,
      endMiles: nextCheckpoint.CUMULATIVE_MILES,
    });
  }

  return segments;
};
