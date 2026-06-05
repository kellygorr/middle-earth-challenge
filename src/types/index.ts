import type { ThemeName } from '../styles/themes';

// Point (Checkpoint/Trivia) unified type
export interface PointType {
  id?: number | string; // Optional, can be derived from name
  index?: number; // index in checkpoints/trivia array (0-based)
  type?: 'checkpoint' | 'trivia';
  name: string;
  x: number;
  y: number;
  labelPosition?: 'top' | 'right';
  description?: {
    text: string;
    image?: string;
  };
  image?: string; // Checkpoint image filename
  CUMULATIVE_MILES: number;
  // Checkpoint-specific fields
  isStart?: boolean;
  isEnd?: boolean;
  isActive?: boolean;
  checkpointActivationMiles?: number;
  postCheckpointOffsetMiles?: number;
  // Derived indices added at render time
}

// Save types
export interface Save {
  id: string;
  name: string;
  createdDate: string;
  lastAccessedDate: string;
  isActive: boolean;
  status: 'in_progress' | 'completed';
}

// Distance source types
export type DistanceSource =
  | 'manual'
  | 'health-connect'
  | 'apple-health'
  | 'synced';

// Distance entry types
export interface DistanceEntry {
  id: string;
  saveId: string;
  date: number; // Unix timestamp (ms)
  miles: number;
  source: DistanceSource;
}

// Trivia unlock types
export interface TriviaUnlock {
  id: string;
  saveId: string;
  triviaId: string;
  unlockedDate: string;
}

// User settings types
export type LabelSize = 'small' | 'medium' | 'large';
export type TextSize = 'small' | 'medium' | 'large';
export type SyncProvider = 'none' | 'health-connect' | 'apple-health';

export interface UserSettings {
  id: string;
  labelSize: LabelSize;
  textSize: TextSize;
  currentTheme: ThemeName;
  showPointLabels: boolean;
  colorizeMap: boolean;
  reducedMapTitles: boolean;
  devMode: boolean;
  useMiles: boolean; // true = miles, false = kilometers
  // Health sync settings
  syncEnabled: boolean;
  syncProvider: SyncProvider; // Which fitness service to sync with
  syncStartDate: number | null; // Unix timestamp when sync was enabled
  lastSyncTimestamp: number | null; // Last successful sync timestamp
  liveSyncEnabled: boolean; // Auto-sync every minute while app is open
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

// Health data types
export interface HealthData {
  distance: number; // in miles
  steps: number;
  date: string;
}

// Individual health record from Health Connect
export interface HealthDistanceRecord {
  id: string; // metadata.id from Health Connect
  startTime: string; // ISO timestamp
  endTime: string; // ISO timestamp
  distanceMeters: number;
}

// Map position
export interface MapPosition {
  x: number;
  y: number;
  checkpointNumber: number;
  segmentProgress: number; // 0-1 (percentage through current segment)
}
