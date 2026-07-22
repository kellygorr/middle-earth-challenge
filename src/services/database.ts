import { open, type DB } from '@op-engineering/op-sqlite';
import {
  UserSettings,
  LabelSize,
  TextSize,
  SyncProvider,
  DistanceSource,
} from '../types';
import { ThemeName } from '../styles/themes';

// Coerce legacy 'regular' (pre-three-tier label size) to 'medium'.
function normalizeLabelSize(value: unknown): LabelSize {
  if (value === 'small' || value === 'medium' || value === 'large') {
    return value;
  }
  return 'medium';
}

function normalizeTextSize(value: unknown): TextSize {
  if (value === 'small' || value === 'medium' || value === 'large') {
    return value;
  }
  return 'medium';
}

class Database {
  private db: DB | null = null;

  async init(): Promise<void> {
    try {
      this.db = open({
        name: 'MiddleEarthSettings.db',
      });

      await this.createTables();
      await this.initializeDefaultSettings();
    } catch (error) {
      console.error('Database initialization error:', error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // User settings table - simple key-value style for app preferences
    this.db.executeSync(`
      CREATE TABLE IF NOT EXISTS user_settings (
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
        live_sync_enabled INTEGER NOT NULL DEFAULT 0
      )
    `);

    // Migration: add text_size column for installs that pre-date it.
    try {
      this.db.executeSync(
        `ALTER TABLE user_settings ADD COLUMN text_size TEXT NOT NULL DEFAULT 'medium'`,
      );
    } catch {
      // Column already exists; ignore.
    }

    // Distance entries table
    this.db.executeSync(`
      CREATE TABLE IF NOT EXISTS distance_entries (
        id TEXT PRIMARY KEY,
        save_id TEXT NOT NULL,
        date INTEGER NOT NULL, -- Unix timestamp (ms)
        miles REAL NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual' -- 'manual' or 'synced'
      )
    `);

    // Progress snapshot table (single row per save id)
    this.db.executeSync(`
      CREATE TABLE IF NOT EXISTS progress_snapshot (
        id TEXT PRIMARY KEY,
        miles REAL NOT NULL DEFAULT 0,
        last_updated INTEGER NOT NULL DEFAULT 0
      )
    `);
  }

  private async initializeDefaultSettings(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Use INSERT OR IGNORE to avoid UNIQUE constraint errors on race conditions
    this.db.executeSync(
      `INSERT OR IGNORE INTO user_settings (id, label_size, text_size, current_theme, show_checkpoint_labels, colorize_map, reduced_map_titles, dev_mode, use_miles, sync_enabled, sync_provider, sync_start_date, last_sync_timestamp, live_sync_enabled)
       VALUES ('default', 'medium', 'medium', 'minimalist', 1, 1, 1, 0, 1, 0, 'none', NULL, NULL, 0)`,
    );
  }

  // User settings operations
  async getUserSettings(): Promise<UserSettings> {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db.executeSync(
      'SELECT * FROM user_settings WHERE id = ? LIMIT 1',
      ['default'],
    );

    let row = result.rows?.[0];

    // If no settings found, create defaults
    if (!row) {
      this.db.executeSync(
        `INSERT OR REPLACE INTO user_settings (id, label_size, text_size, current_theme, show_checkpoint_labels, colorize_map, reduced_map_titles, dev_mode, use_miles, sync_enabled, sync_provider, sync_start_date, last_sync_timestamp, live_sync_enabled)
         VALUES ('default', 'medium', 'medium', 'minimalist', 1, 1, 1, 0, 1, 0, 'none', NULL, NULL, 0)`,
      );

      const newResult = this.db.executeSync(
        'SELECT * FROM user_settings WHERE id = ? LIMIT 1',
        ['default'],
      );
      row = newResult.rows?.[0];
    }

    if (!row) {
      throw new Error('Failed to create default settings');
    }

    return {
      id: row.id as string,
      labelSize: normalizeLabelSize(row.label_size),
      textSize: normalizeTextSize((row as any).text_size),
      currentTheme: row.current_theme as ThemeName,
      showPointLabels: row.show_checkpoint_labels === 1,
      colorizeMap: row.colorize_map === 1,
      reducedMapTitles: row.reduced_map_titles === 1,
      devMode:
        (row as any).dev_mode === 1 ||
        (row as any).dev_mode === true ||
        (row as any).dev_mode === '1',
      useMiles: (row as any).use_miles !== 0,
      syncEnabled: (row as any).sync_enabled === 1,
      syncProvider: ((row as any).sync_provider as SyncProvider) ?? 'none',
      syncStartDate: (row as any).sync_start_date ?? null,
      lastSyncTimestamp: (row as any).last_sync_timestamp ?? null,
      liveSyncEnabled: (row as any).live_sync_enabled === 1,
    };
  }

  async updateUserSettings(
    updates: Partial<Omit<UserSettings, 'id'>>,
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const fields: string[] = [];
    const values: (string | number)[] = [];

    if (updates.labelSize !== undefined) {
      fields.push('label_size = ?');
      values.push(updates.labelSize);
    }
    if (updates.textSize !== undefined) {
      fields.push('text_size = ?');
      values.push(updates.textSize);
    }
    if (updates.currentTheme !== undefined) {
      fields.push('current_theme = ?');
      values.push(updates.currentTheme);
    }
    if (updates.showPointLabels !== undefined) {
      fields.push('show_checkpoint_labels = ?');
      values.push(updates.showPointLabels ? 1 : 0);
    }
    if (updates.colorizeMap !== undefined) {
      fields.push('colorize_map = ?');
      values.push(updates.colorizeMap ? 1 : 0);
    }
    if (updates.reducedMapTitles !== undefined) {
      fields.push('reduced_map_titles = ?');
      values.push(updates.reducedMapTitles ? 1 : 0);
    }
    if (updates.devMode !== undefined) {
      fields.push('dev_mode = ?');
      values.push(updates.devMode ? 1 : 0);
    }
    if (updates.useMiles !== undefined) {
      fields.push('use_miles = ?');
      values.push(updates.useMiles ? 1 : 0);
    }
    if (updates.syncEnabled !== undefined) {
      fields.push('sync_enabled = ?');
      values.push(updates.syncEnabled ? 1 : 0);
    }
    if (updates.syncProvider !== undefined) {
      fields.push('sync_provider = ?');
      values.push(updates.syncProvider);
    }
    if (updates.syncStartDate !== undefined) {
      fields.push('sync_start_date = ?');
      values.push(updates.syncStartDate ?? 0);
    }
    if (updates.lastSyncTimestamp !== undefined) {
      fields.push('last_sync_timestamp = ?');
      values.push(updates.lastSyncTimestamp ?? 0);
    }
    if (updates.liveSyncEnabled !== undefined) {
      fields.push('live_sync_enabled = ?');
      values.push(updates.liveSyncEnabled ? 1 : 0);
    }

    if (fields.length === 0) return;

    this.db.executeSync(
      `UPDATE user_settings SET ${fields.join(', ')} WHERE id = 'default'`,
      values,
    );
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // Distance entry operations
  async addDistanceEntry(entry: {
    id: string;
    saveId: string;
    date: number;
    miles: number;
    source?: 'manual' | 'health-connect' | 'apple-health' | 'synced';
  }): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    this.db.executeSync(
      `INSERT OR REPLACE INTO distance_entries (id, save_id, date, miles, source) VALUES (?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.saveId,
        entry.date,
        entry.miles,
        entry.source || 'manual',
      ],
    );
  }

  /**
   * Bulk insert distance entries inside a single transaction.
   * Massively faster than N individual addDistanceEntry calls when ingesting
   * a chunk of health records (hundreds of samples per day on Android).
   */
  async addDistanceEntriesBulk(
    entries: Array<{
      id: string;
      saveId: string;
      date: number;
      miles: number;
      source?: 'manual' | 'health-connect' | 'apple-health' | 'synced';
    }>,
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    if (entries.length === 0) return;
    this.db.executeSync('BEGIN TRANSACTION');
    try {
      for (const entry of entries) {
        this.db.executeSync(
          `INSERT OR REPLACE INTO distance_entries (id, save_id, date, miles, source) VALUES (?, ?, ?, ?, ?)`,
          [
            entry.id,
            entry.saveId,
            entry.date,
            entry.miles,
            entry.source || 'manual',
          ],
        );
      }
      this.db.executeSync('COMMIT');
    } catch (e) {
      this.db.executeSync('ROLLBACK');
      throw e;
    }
  }

  async getDistanceEntries(saveId: string): Promise<
    {
      id: string;
      saveId: string;
      date: number;
      miles: number;
      source: 'manual' | 'health-connect' | 'synced';
    }[]
  > {
    if (!this.db) throw new Error('Database not initialized');
    const result = this.db.executeSync(
      `SELECT id, save_id as saveId, date, miles, source FROM distance_entries WHERE save_id = ? ORDER BY date ASC`,
      [saveId],
    );
    const rows = result.rows || [];
    return rows.map((r: any) => ({
      id: String(r.id),
      saveId: String(r.saveId),
      date: Number(r.date),
      miles: Number(r.miles),
      source: (r.source || 'manual') as 'manual' | 'health-connect' | 'synced',
    }));
  }

  async removeDistanceEntry(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    this.db.executeSync(`DELETE FROM distance_entries WHERE id = ?`, [id]);
  }

  async clearDistanceEntries(saveId?: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    if (saveId) {
      this.db.executeSync(`DELETE FROM distance_entries WHERE save_id = ?`, [
        saveId,
      ]);
    } else {
      this.db.executeSync(`DELETE FROM distance_entries`);
    }
  }

  /**
   * Bulk-delete distance entries whose `source` matches any value in
   * `sources`. Executed as a single parameterised SQL statement so a
   * "delete synced data" or "delete manual data" tap doesn't block the
   * JS thread with N round-trips per entry.
   */
  async clearDistanceEntriesBySource(
    saveId: string,
    sources: DistanceSource[],
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    if (sources.length === 0) return;
    const placeholders = sources.map(() => '?').join(', ');
    this.db.executeSync(
      `DELETE FROM distance_entries WHERE save_id = ? AND source IN (${placeholders})`,
      [saveId, ...sources],
    );
  }

  async setMilesSnapshot(id: string, miles: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const ts = Date.now();
    this.db.executeSync(
      `INSERT OR REPLACE INTO progress_snapshot (id, miles, last_updated) VALUES (?, ?, ?)`,
      [id, miles, ts],
    );
  }

  async getMilesSnapshot(id: string): Promise<number | null> {
    if (!this.db) throw new Error('Database not initialized');
    const result = this.db.executeSync(
      `SELECT miles FROM progress_snapshot WHERE id = ? LIMIT 1`,
      [id],
    );
    const row = result.rows?.[0];
    if (!row) return null;
    const miles = Number((row as any).miles);
    return Number.isFinite(miles) ? miles : null;
  }
}

export const database = new Database();
