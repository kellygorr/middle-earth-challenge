import { JourneySegment } from '../types';

// Journey segments based on distance.md
export const JOURNEY_SEGMENTS: JourneySegment[] = [
  {
    id: 1,
    from: 'The Shire',
    to: 'Bree',
    miles: 120,
    startMiles: 0,
    endMiles: 120,
  },
  {
    id: 2,
    from: 'Bree',
    to: 'Rivendell',
    miles: 300,
    startMiles: 120,
    endMiles: 420,
  },
  {
    id: 3,
    from: 'Rivendell',
    to: 'Lothlorien',
    miles: 175,
    startMiles: 420,
    endMiles: 595,
  },
  {
    id: 4,
    from: 'Lothlorien',
    to: 'Parth Galen',
    miles: 300,
    startMiles: 595,
    endMiles: 895,
  },
  {
    id: 5,
    from: 'Parth Galen',
    to: 'The Black Gates',
    miles: 160,
    startMiles: 895,
    endMiles: 1055,
  },
  {
    id: 6,
    from: 'The Black Gates',
    to: 'Minas Morgul',
    miles: 110,
    startMiles: 1055,
    endMiles: 1165,
  },
  {
    id: 7,
    from: 'Minas Morgul',
    to: 'Mount Doom',
    miles: 70,
    startMiles: 1165,
    endMiles: 1235,
  },
];

export const TOTAL_JOURNEY_MILES = 1235;
export const TOTAL_CHECKPOINTS = 8; // Including start and end
export const TOTAL_SEGMENTS = 7;

// Helper function to get current segment based on total miles
export const getCurrentSegment = (totalMiles: number): JourneySegment => {
  if (totalMiles >= TOTAL_JOURNEY_MILES) {
    return JOURNEY_SEGMENTS[JOURNEY_SEGMENTS.length - 1];
  }
  
  const segment = JOURNEY_SEGMENTS.find(
    seg => totalMiles >= seg.startMiles && totalMiles < seg.endMiles
  );
  
  return segment || JOURNEY_SEGMENTS[0];
};

// Helper function to calculate progress within current segment
export const getSegmentProgress = (
  totalMiles: number,
  segment: JourneySegment
): number => {
  const milesIntoSegment = totalMiles - segment.startMiles;
  return Math.min(Math.max(milesIntoSegment / segment.miles, 0), 1);
};
