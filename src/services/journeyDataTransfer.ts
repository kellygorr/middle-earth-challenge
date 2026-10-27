import { NativeModules, Platform } from 'react-native';
import type {
  DistanceEntry,
  DistanceSource,
  LabelSize,
  TextSize,
} from '../types';
import type { ThemeName } from '../styles/themes';
import { database, type JourneyBackup } from './database';
import { useProgressStore } from '../stores/progressStore';
import type { TroubleshootingIssue } from '../stores/progressStore';
import { useSettingsStore } from '../stores/settingsStore';
import { friendProgressService } from './friendProgressService';

interface JourneyDataTransferNativeModule {
  exportJson(fileName: string, content: string): Promise<string | null>;
  importJson(): Promise<string | null>;
}

const nativeModule = NativeModules.JourneyDataTransferModule as
  | JourneyDataTransferNativeModule
  | undefined;

const distanceSources = new Set<DistanceSource>([
  'manual',
  'synced',
  'manual-distance',
  'manual-steps',
  'health-connect',
  'apple-health',
  'pedometer',
  'health-reconciliation',
]);
const labelSizes = new Set<LabelSize>(['small', 'medium', 'large']);
const textSizes = new Set<TextSize>(['small', 'medium', 'large']);
const themes = new Set<ThemeName>(['classic', 'minimalist']);

function assertTransferAvailable(): JourneyDataTransferNativeModule {
  if (Platform.OS !== 'android' || !nativeModule) {
    throw new Error('Journey data transfer is not available on this platform.');
  }
  return nativeModule;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid backup: ${label}`);
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Invalid backup: ${label}`);
  return value;
}

function requireNullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return requireString(value, label);
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid backup: ${label}`);
  }
  return value;
}

function requireEnum<T extends string>(
  value: unknown,
  allowed: Set<T>,
  label: string,
): T {
  const candidate = requireString(value, label);
  if (!allowed.has(candidate as T)) {
    throw new Error(`Invalid backup: ${label}`);
  }
  return candidate as T;
}

function parseDistanceEntry(value: unknown): DistanceEntry {
  if (!isRecord(value)) throw new Error('Invalid backup: distance entry');
  const source = requireString(value.source, 'distance entry source');
  if (!distanceSources.has(source as DistanceSource)) {
    throw new Error(`Invalid backup: distance entry source ${source}`);
  }
  return {
    id: requireString(value.id, 'distance entry id'),
    saveId: 'default',
    date: requireNumber(value.date, 'distance entry date'),
    miles: requireNumber(value.miles, 'distance entry miles'),
    steps: Math.max(
      0,
      Math.round(requireNumber(value.steps, 'distance entry steps')),
    ),
    source: source as DistanceSource,
  };
}

function parseTroubleshootingIssue(
  value: unknown,
): JourneyBackup['troubleshootingIssues'][number] {
  if (!isRecord(value)) throw new Error('Invalid backup: troubleshooting item');
  return {
    slot: requireString(value.slot, 'troubleshooting slot'),
    error: value.error,
    at: requireNumber(value.at, 'troubleshooting timestamp'),
    dismissedAt:
      value.dismissedAt === null
        ? null
        : requireNumber(value.dismissedAt, 'troubleshooting dismissed time'),
    resolvedAt:
      value.resolvedAt === null
        ? null
        : requireNumber(value.resolvedAt, 'troubleshooting resolved time'),
  };
}

function parseBackup(content: string): JourneyBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Invalid backup: file is not readable JSON.');
  }

  if (!isRecord(parsed)) throw new Error('Invalid backup: file shape');
  if (parsed.app !== 'MiddleEarthChallenge') {
    throw new Error('Invalid backup: not a Middle Earth Challenge backup.');
  }
  if (parsed.schemaVersion !== 1 && parsed.schemaVersion !== 2) {
    throw new Error('Invalid backup: unsupported backup version.');
  }
  if (!isRecord(parsed.settings)) {
    throw new Error('Invalid backup: settings');
  }
  if (!Array.isArray(parsed.distanceEntries)) {
    throw new Error('Invalid backup: distance entries');
  }
  const troubleshootingIssues =
    parsed.troubleshootingIssues === undefined
      ? []
      : parsed.troubleshootingIssues;
  if (!Array.isArray(troubleshootingIssues)) {
    throw new Error('Invalid backup: troubleshooting history');
  }

  const settings = parsed.settings;
  let sharing: JourneyBackup['sharing'];
  if (parsed.schemaVersion === 2) {
    if (!isRecord(parsed.sharing)) {
      throw new Error('Invalid backup: sharing settings');
    }
    const enabled = requireBoolean(parsed.sharing.enabled, 'sharing enabled');
    const userId = requireNullableString(parsed.sharing.userId, 'sharing user');
    const displayName = requireNullableString(
      parsed.sharing.displayName,
      'sharing display name',
    );
    const affinity =
      parsed.sharing.affinity === null
        ? null
        : requireEnum(
            parsed.sharing.affinity,
            new Set([
              'woodland',
              'river',
              'hills',
              'coast',
              'cottage',
            ] as const),
            'sharing affinity',
          );
    if (enabled && (!userId || !displayName || !affinity)) {
      throw new Error('Invalid backup: active sharing profile is incomplete');
    }
    const shareIdentityId = requireNullableString(
      parsed.sharing.shareIdentityId,
      'sharing identity',
    );
    if (enabled && !shareIdentityId) {
      throw new Error('Invalid backup: active sharing profile is incomplete');
    }
    sharing = { enabled, userId, displayName, affinity, shareIdentityId };
  }

  return {
    app: 'MiddleEarthChallenge',
    schemaVersion: parsed.schemaVersion,
    exportedAt: requireString(parsed.exportedAt, 'exported date'),
    settings: {
      labelSize: requireEnum(settings.labelSize, labelSizes, 'label size'),
      textSize: requireEnum(settings.textSize, textSizes, 'text size'),
      currentTheme: requireEnum(
        settings.currentTheme,
        themes,
        'theme',
      ) as JourneyBackup['settings']['currentTheme'],
      showPointLabels: requireBoolean(settings.showPointLabels, 'point labels'),
      colorizeMap: requireBoolean(settings.colorizeMap, 'map color'),
      reducedMapTitles: requireBoolean(settings.reducedMapTitles, 'map titles'),
      devMode: requireBoolean(settings.devMode, 'dev mode'),
      useMiles: requireBoolean(settings.useMiles, 'distance units'),
      lastNotifiedCheckpointIndex: Math.round(
        requireNumber(
          settings.lastNotifiedCheckpointIndex,
          'checkpoint notifications',
        ),
      ),
    },
    distanceEntries: parsed.distanceEntries.map(parseDistanceEntry),
    troubleshootingIssues: troubleshootingIssues.map(parseTroubleshootingIssue),
    sharing,
  };
}

export function backupFileName(): string {
  const now = new Date();
  const stamp = `${now.getDate()}-${now.getMonth() + 1}-${String(
    now.getFullYear(),
  ).slice(2)}`;
  return `challenge-backup-${stamp}.json`;
}

export async function exportJourneyData(): Promise<string | null> {
  const transfer = assertTransferAvailable();
  const sharingUserId = await friendProgressService.getCurrentUserId();
  const backup = await database.exportJourneyBackup(sharingUserId);
  const fileName = backupFileName();
  const saved = await transfer.exportJson(
    fileName,
    JSON.stringify(backup, null, 2),
  );
  return saved === null ? null : fileName;
}

export async function importJourneyData(): Promise<boolean> {
  const transfer = assertTransferAvailable();
  const content = await transfer.importJson();
  if (content === null) return false;

  const backup = parseBackup(content);
  const progress = await database.importJourneyBackup(backup);
  await useSettingsStore.getState().loadSettings();
  useProgressStore.setState({
    miles: progress.miles,
    steps: progress.steps,
    distanceEntries: [],
    troubleshootingIssues: backup.troubleshootingIssues.map(issue => ({
      error: issue.error,
      at: issue.at,
      dismissedAt: issue.dismissedAt,
      resolvedAt: issue.resolvedAt,
    })) as TroubleshootingIssue[],
  });
  return true;
}
