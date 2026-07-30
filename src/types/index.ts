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
//
// `manual` is retained as a legacy value for rows written by older
// versions of the app. New manual entries are tagged as either
// `manual-distance` or `manual-steps` so we can reopen the edit modal
// in the same mode the user originally typed in.
export type DistanceSource =
  | 'manual'
  | 'manual-distance'
  | 'manual-steps'
  | 'health-connect'
  | 'apple-health'
  | 'pedometer'
  | 'health-reconciliation';

// Distance entry types
export interface DistanceEntry {
  id: string;
  saveId: string;
  date: number; // Unix timestamp (ms)
  miles: number;
  steps: number; // Always populated; derived from miles for non-step sources.
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

/**
 * Where the app gets step / distance data from:
 *  - 'health-app'  Health Connect (Android) / Apple Health (iOS). Default.
 *  - 'pedometer'   Raw step counter via a foreground service on Android.
 *                  Not yet supported on iOS — see docs/pedometer-mode.md.
 */
export type TrackingMode = 'health-app' | 'pedometer' | 'dual';

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
  lastHealthReconciledThrough: number | null; // Exclusive local-midnight boundary for dual mode
  liveSyncEnabled: boolean; // Auto-sync while app is open (health-app mode only)
  trackingMode: TrackingMode; // Source of step / distance data
  /**
   * True after the user has been shown the OEM battery-manager
   * follow-up prompt once (on aggressive-battery phones like Samsung /
   * Xiaomi / Huawei etc., where Google's standard battery-opt allowlist
   * isn't enough). We never re-prompt after the first dismissal so the
   * follow-up doesn't feel like nagging — users can always revisit the
   * setting via the "Battery settings" bullet in Required Access.
   */
  hasSeenOemBatteryPrompt: boolean;
  /**
   * True while a Health Connect revoke has landed but the app process
   * hasn't restarted yet. HC keeps reporting the old grants as active
   * for the lifetime of the process, so the Required Access checklist
   * uses this flag to show the ↻ symbol instead of a false ✓ during
   * that window. Cleared automatically the first time HC actually
   * reports the grants as revoked (i.e. after a real restart).
   */
  hcRevokePendingRestart: boolean;
  /**
   * Highest checkpoint index (0-based) for which we've already fired a
   * "You reached {checkpoint}!" system notification. `-1` means no
   * milestone notified yet. Guards the pedometer commit path against
   * re-notifying for the same checkpoint if the same window is
   * re-processed for any reason (backfill, dev tools, retry).
   */
  lastNotifiedCheckpointIndex: number;
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

// Individual health record from Health Connect / Apple Health
export interface HealthDistanceRecord {
  id: string; // metadata.id from Health Connect
  startTime: string; // ISO timestamp
  endTime: string; // ISO timestamp
  distanceMeters: number;
  steps: number; // Measured (Steps record) or derived (Distance record).
}

// Map position
export interface MapPosition {
  x: number;
  y: number;
  checkpointNumber: number;
  segmentProgress: number; // 0-1 (percentage through current segment)
}
