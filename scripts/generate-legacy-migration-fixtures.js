#!/usr/bin/env node

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const START_DATE = '2026-07-28';
const END_DATE = '2026-09-01';
const MIN_ENTRIES_PER_DAY = 5;
const MAX_ENTRIES_PER_DAY = 20;
const OUTPUT_DIR = path.resolve(
  process.cwd(),
  '.migration-fixtures/android-1.1.3',
);
const STRIDE_MILES = 0.762 * 0.000621371;

const profiles = [
  {
    id: 'manual-only',
    sources: ['manual', 'manual-distance', 'manual-steps'],
    trackingMode: 'health-app',
    syncEnabled: 0,
    syncProvider: 'none',
  },
  {
    id: 'health-only',
    sources: ['health-connect'],
    trackingMode: 'health-app',
    syncEnabled: 1,
    syncProvider: 'health-connect',
  },
  {
    id: 'health-manual',
    sources: ['health-connect', 'health-connect', 'health-connect', 'manual'],
    trackingMode: 'health-app',
    syncEnabled: 1,
    syncProvider: 'health-connect',
  },
  {
    id: 'pedometer-only',
    sources: ['pedometer'],
    trackingMode: 'pedometer',
    syncEnabled: 1,
    syncProvider: 'none',
  },
  {
    id: 'pedometer-manual',
    sources: ['pedometer', 'pedometer', 'pedometer', 'manual-steps'],
    trackingMode: 'pedometer',
    syncEnabled: 1,
    syncProvider: 'none',
  },
  {
    id: 'health-pedometer',
    sources: ['health-connect', 'pedometer'],
    trackingMode: 'health-app',
    syncEnabled: 1,
    syncProvider: 'health-connect',
  },
  {
    id: 'source-switching-stress',
    sources: [
      'health-connect',
      'pedometer',
      'manual-distance',
      'health-connect',
      'pedometer',
      'manual-steps',
    ],
    trackingMode: 'pedometer',
    syncEnabled: 1,
    syncProvider: 'none',
    switchesDaily: true,
  },
];

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function dateRange(start, end) {
  const dates = [];
  const cursor = new Date(`${start}T12:00:00`);
  const finalDate = new Date(`${end}T12:00:00`);
  while (cursor <= finalDate) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function entryCountForDay(dayIndex) {
  const range = MAX_ENTRIES_PER_DAY - MIN_ENTRIES_PER_DAY + 1;
  return MIN_ENTRIES_PER_DAY + ((dayIndex * 7 + 11) % range);
}

function buildEntries(profile) {
  const entries = [];
  for (const [dayIndex, day] of dateRange(START_DATE, END_DATE).entries()) {
    const dateKey = localDateKey(day);
    const count = entryCountForDay(dayIndex);
    const sources =
      profile.switchesDaily && dayIndex % 2 === 1
        ? [profile.sources[1], profile.sources[0], ...profile.sources.slice(2)]
        : profile.sources;
    for (let entryIndex = 0; entryIndex < count; entryIndex += 1) {
      const source = sources[entryIndex % sources.length];
      const steps = 180 + ((dayIndex * 137 + entryIndex * 89) % 1250);
      const sourceMultiplier = source === 'health-connect' ? 1.015 : 1;
      const miles = Number(
        (steps * STRIDE_MILES * sourceMultiplier).toFixed(6),
      );
      const minuteOfDay = 7 * 60 + Math.floor(((13 * 60) / count) * entryIndex);
      const timestamp = new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        Math.floor(minuteOfDay / 60),
        minuteOfDay % 60,
      ).getTime();
      entries.push({
        id: `${profile.id}_${dateKey}_${String(entryIndex + 1).padStart(
          2,
          '0',
        )}`,
        date: timestamp,
        miles,
        steps,
        source,
      });
    }
  }
  return entries;
}

function createSql(profile, entries) {
  const totalMiles = entries.reduce((sum, entry) => sum + entry.miles, 0);
  const totalSteps = entries.reduce((sum, entry) => sum + entry.steps, 0);
  const firstTimestamp = entries[0].date;
  const lastTimestamp = entries[entries.length - 1].date;
  const statements = [
    'PRAGMA journal_mode = DELETE;',
    'BEGIN IMMEDIATE;',
    `CREATE TABLE user_settings (
      id TEXT PRIMARY KEY,
      label_size TEXT NOT NULL DEFAULT 'medium',
      text_size TEXT NOT NULL DEFAULT 'medium',
      current_theme TEXT NOT NULL DEFAULT 'minimalist',
      show_checkpoint_labels INTEGER NOT NULL DEFAULT 1,
      colorize_map INTEGER NOT NULL DEFAULT 1,
      reduced_map_titles INTEGER NOT NULL DEFAULT 1,
      dev_mode INTEGER NOT NULL DEFAULT 0,
      use_miles INTEGER NOT NULL DEFAULT 1,
      sync_enabled INTEGER NOT NULL DEFAULT 0,
      sync_provider TEXT NOT NULL DEFAULT 'none',
      sync_start_date INTEGER,
      last_sync_timestamp INTEGER,
      live_sync_enabled INTEGER NOT NULL DEFAULT 0,
      tracking_mode TEXT NOT NULL DEFAULT 'health-app',
      has_seen_oem_battery_prompt INTEGER NOT NULL DEFAULT 0,
      hc_revoke_pending_restart INTEGER NOT NULL DEFAULT 0,
      last_notified_checkpoint_index INTEGER NOT NULL DEFAULT -1
    );`,
    `CREATE TABLE distance_entries (
      id TEXT PRIMARY KEY,
      save_id TEXT NOT NULL,
      date INTEGER NOT NULL,
      miles REAL NOT NULL,
      steps INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual'
    );`,
    `CREATE TABLE progress_snapshot (
      id TEXT PRIMARY KEY,
      miles REAL NOT NULL DEFAULT 0,
      steps INTEGER NOT NULL DEFAULT 0,
      last_updated INTEGER NOT NULL DEFAULT 0
    );`,
    `INSERT INTO user_settings (
      id, label_size, text_size, current_theme, show_checkpoint_labels,
      colorize_map, reduced_map_titles, dev_mode, use_miles, sync_enabled,
      sync_provider, sync_start_date, last_sync_timestamp, live_sync_enabled,
      tracking_mode, has_seen_oem_battery_prompt, hc_revoke_pending_restart,
      last_notified_checkpoint_index
    ) VALUES (
      'default', 'large', 'small', 'classic', 0,
      0, 0, 1, 0, ${profile.syncEnabled},
      ${sqlString(
        profile.syncProvider,
      )}, ${firstTimestamp}, ${lastTimestamp}, 1,
      ${sqlString(profile.trackingMode)}, 1, 0, 3
    );`,
  ];

  for (const entry of entries) {
    statements.push(
      `INSERT INTO distance_entries (id, save_id, date, miles, steps, source) VALUES (` +
        `${sqlString(entry.id)}, 'default', ${entry.date}, ${entry.miles}, ` +
        `${entry.steps}, ${sqlString(entry.source)});`,
    );
  }

  statements.push(
    `INSERT INTO progress_snapshot (id, miles, steps, last_updated) VALUES (` +
      `'default', ${totalMiles.toFixed(6)}, ${totalSteps}, ${lastTimestamp});`,
    'COMMIT;',
  );
  return statements.join('\n');
}

function queryJson(databasePath, sql) {
  const output = execFileSync('sqlite3', ['-json', databasePath, sql], {
    encoding: 'utf8',
  }).trim();
  return output ? JSON.parse(output) : [];
}

function validateFixture(profile, databasePath, expectedEntryCount) {
  const [density] = queryJson(
    databasePath,
    `SELECT COUNT(*) AS dayCount, MIN(entry_count) AS minimum, ` +
      `MAX(entry_count) AS maximum, SUM(entry_count >= 15) AS highDensityDays FROM (` +
      `SELECT date(date / 1000, 'unixepoch', 'localtime') AS day, ` +
      `COUNT(*) AS entry_count FROM distance_entries GROUP BY day);`,
  );
  if (
    density.dayCount !== dateRange(START_DATE, END_DATE).length ||
    density.minimum !== MIN_ENTRIES_PER_DAY ||
    density.maximum !== MAX_ENTRIES_PER_DAY ||
    density.highDensityDays < 10
  ) {
    throw new Error(`${profile.id}: invalid date coverage or daily density`);
  }

  const [integrity] = queryJson(
    databasePath,
    `SELECT COUNT(*) AS entryCount, COUNT(DISTINCT id) AS uniqueIds, ` +
      `ABS((SELECT miles FROM progress_snapshot) - SUM(miles)) < 0.000001 ` +
      `AS milesMatch, (SELECT steps FROM progress_snapshot) = SUM(steps) ` +
      `AS stepsMatch FROM distance_entries;`,
  );
  if (
    integrity.entryCount !== expectedEntryCount ||
    integrity.uniqueIds !== expectedEntryCount ||
    integrity.milesMatch !== 1 ||
    integrity.stepsMatch !== 1
  ) {
    throw new Error(`${profile.id}: entries or snapshot failed validation`);
  }

  const newSchemaColumns = queryJson(
    databasePath,
    `SELECT name FROM pragma_table_info('user_settings') WHERE name IN (` +
      `'health_sync_format_version', 'pedometer_cursor', ` +
      `'sharing_enabled') UNION ALL SELECT name FROM ` +
      `pragma_table_info('progress_snapshot') WHERE name = 'cache_version';`,
  );
  if (newSchemaColumns.length > 0) {
    throw new Error(`${profile.id}: fixture contains post-1.1.3 columns`);
  }

  if (profile.switchesDaily) {
    const days = queryJson(
      databasePath,
      `WITH ordered AS (` +
        `SELECT date(date / 1000, 'unixepoch', 'localtime') AS day, source, ` +
        `LAG(source) OVER (PARTITION BY date(date / 1000, 'unixepoch', ` +
        `'localtime') ORDER BY date) AS previous_source FROM distance_entries` +
        `) SELECT day, COUNT(DISTINCT source) AS sourceCount, ` +
        `SUM(source LIKE 'manual%') AS manualCount, ` +
        `SUM(previous_source IS NOT NULL AND previous_source <> source) ` +
        `AS transitions FROM ordered GROUP BY day;`,
    );
    if (
      days.length !== dateRange(START_DATE, END_DATE).length ||
      days.some(
        day =>
          day.sourceCount < 3 || day.manualCount < 1 || day.transitions < 4,
      )
    ) {
      throw new Error(`${profile.id}: insufficient daily source switching`);
    }
  }
}

function generate() {
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const manifest = {
    legacyVersion: '1.1.3',
    range: { start: START_DATE, end: END_DATE },
    entriesPerDay: {
      minimum: MIN_ENTRIES_PER_DAY,
      maximum: MAX_ENTRIES_PER_DAY,
      schedule: Object.fromEntries(
        dateRange(START_DATE, END_DATE).map((date, dayIndex) => [
          localDateKey(date),
          entryCountForDay(dayIndex),
        ]),
      ),
    },
    profiles: [],
  };
  const expectedEntryCount = Object.values(
    manifest.entriesPerDay.schedule,
  ).reduce((sum, count) => sum + count, 0);

  for (const profile of profiles) {
    const entries = buildEntries(profile);
    const databasePath = path.join(OUTPUT_DIR, `${profile.id}.db`);
    execFileSync('sqlite3', [databasePath], {
      input: createSql(profile, entries),
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    validateFixture(profile, databasePath, expectedEntryCount);

    const [totals] = queryJson(
      databasePath,
      `SELECT COUNT(*) AS entryCount, ROUND(SUM(miles), 6) AS miles, ` +
        `SUM(steps) AS steps, COUNT(DISTINCT date(date / 1000, 'unixepoch', ` +
        `'localtime')) AS dayCount FROM distance_entries;`,
    );
    const sources = queryJson(
      databasePath,
      `SELECT source, COUNT(*) AS entryCount FROM distance_entries ` +
        `GROUP BY source ORDER BY source;`,
    );
    const dailySourceCoverage = profile.switchesDaily
      ? queryJson(
          databasePath,
          `SELECT date(date / 1000, 'unixepoch', 'localtime') AS day, ` +
            `COUNT(DISTINCT source) AS sourceCount, ` +
            `SUM(source LIKE 'manual%') AS manualCount FROM distance_entries ` +
            `GROUP BY day ORDER BY day;`,
        )
      : undefined;
    manifest.profiles.push({
      id: profile.id,
      file: path.relative(process.cwd(), databasePath),
      trackingMode: profile.trackingMode,
      syncEnabled: profile.syncEnabled === 1,
      syncProvider: profile.syncProvider,
      ...totals,
      sources,
      ...(dailySourceCoverage ? { dailySourceCoverage } : {}),
    });
  }

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  process.stdout.write(
    `Generated and validated ${
      profiles.length
    } legacy fixtures in ${path.relative(
      process.cwd(),
      OUTPUT_DIR,
    )} (${expectedEntryCount} entries each)\n`,
  );
}

generate();
