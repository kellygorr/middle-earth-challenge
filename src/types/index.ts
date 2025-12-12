// Checkpoint types
export interface Checkpoint {
  id: number;
  name: string;
  description: string;
  isStart?: boolean;
  isEnd?: boolean;
  isActive?: boolean;
  x: number;
  y: number;
  labelPosition?: 'top' | 'right';
  cumulativeMiles: number;
}

// Trivia types
export interface Trivia {
  id: string;
  name: string;
  description: string;
  imageFile: string;
  x: number;
  y: number;
  triggerRadius: number;
  approximateMiles: number;
}

// Save types
export interface Save {
  id: string;
  name: string;
  createdDate: string;
  lastAccessedDate: string;
  isActive: boolean;
  status: 'in_progress' | 'completed';
  startDate?: string;
  endDate?: string;
}

// Journey progress types
export interface JourneyProgress {
  id: string;
  saveId: string;
  currentCheckpoint: number; // 1-7 (which segment they're on)
  totalMiles: number;
  currentCheckpointMiles: number; // Miles completed in current segment
  lastSyncDate: string;
}

// Checkpoint completion types
export interface CheckpointCompletion {
  id: string;
  saveId: string;
  checkpointNumber: number;
  completedDate: string;
  daysToComplete: number;
  avgMilesPerDay: number;
}

// Daily distance types
export interface DailyDistance {
  id: string;
  saveId: string;
  date: string; // YYYY-MM-DD
  miles: number;
}

// Trivia unlock types
export interface TriviaUnlock {
  id: string;
  saveId: string;
  triviaId: string;
  unlockedDate: string;
}

// User settings types
export type LabelSize = 'regular' | 'large';

export interface UserSettings {
  id: string;
  labelSize: LabelSize;
  currentTheme: 'classic' | 'minimalist';
  showTriviaMarkers: boolean;
  showCheckpointLabels: boolean;
  colorizeMap: boolean;
  showMapTitles: boolean;
}

// Journey segment definition (from distance.md)
export interface JourneySegment {
  id: number;
  from: string;
  to: string;
  miles: number;
  startMiles: number; // Cumulative start
  endMiles: number; // Cumulative end
}

// Checkpoint statistics
export interface CheckpointStats {
  checkpointNumber: number;
  checkpointName: string;
  miles: number;
  daysToComplete: number;
  avgMilesPerDay: number;
  completedDate?: string;
}

// Journey statistics (for all saves)
export interface JourneyStats {
  saveId: string;
  saveName: string;
  totalMiles: number;
  totalDays: number;
  avgMilesPerDay: number;
  status: 'in_progress' | 'completed';
  startDate: string;
  endDate?: string;
  checkpoints: CheckpointStats[];
  triviaUnlocked: number;
}

// Health data types
export interface HealthData {
  distance: number; // in miles
  steps: number;
  date: string;
}

// Map position
export interface MapPosition {
  x: number;
  y: number;
  checkpointNumber: number;
  segmentProgress: number; // 0-1 (percentage through current segment)
}
