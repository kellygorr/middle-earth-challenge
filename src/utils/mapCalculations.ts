import { MapPosition } from '../types';
import { getCurrentSegment, getSegmentProgress } from '../constants/journey';
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
  const x = startCheckpoint.x + (endCheckpoint.x - startCheckpoint.x) * progress;
  const y = startCheckpoint.y + (endCheckpoint.y - startCheckpoint.y) * progress;

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
  y2: number
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
  radius: number
): boolean => {
  const distance = calculateDistance(pointX, pointY, centerX, centerY);
  return distance <= radius;
};
