import SQLite from 'react-native-sqlite-storage';
import {
  Save,
  JourneyProgress,
  CheckpointCompletion,
  DailyDistance,
  TriviaUnlock,
  UserSettings,
} from '../types';

SQLite.enablePromise(true);

class Database {
  private db: SQLite.SQLiteDatabase | null = null;

  async init(): Promise<void> {
    try {
      this.db = await SQLite.openDatabase({
        name: 'MiddleEarthTracker.db',
        location: 'default',
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

    // Saves table
    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS saves (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_date TEXT NOT NULL,
        last_accessed_date TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK(status IN ('in_progress', 'completed')),
        start_date TEXT,
        end_date TEXT
      )
    `);

    // Journey progress table
    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS journey_progress (
        id TEXT PRIMARY KEY,
        save_id TEXT NOT NULL,
        current_checkpoint INTEGER NOT NULL,
        total_miles REAL NOT NULL,
        current_checkpoint_miles REAL NOT NULL,
        last_sync_date TEXT NOT NULL,
        FOREIGN KEY (save_id) REFERENCES saves(id) ON DELETE CASCADE
      )
    `);

    // Checkpoint completions table
    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS checkpoint_completions (
        id TEXT PRIMARY KEY,
        save_id TEXT NOT NULL,
        checkpoint_number INTEGER NOT NULL,
        completed_date TEXT NOT NULL,
        days_to_complete INTEGER NOT NULL,
        avg_miles_per_day REAL NOT NULL,
        FOREIGN KEY (save_id) REFERENCES saves(id) ON DELETE CASCADE,
        UNIQUE(save_id, checkpoint_number)
      )
    `);

    // Daily distance table
    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS daily_distance (
        id TEXT PRIMARY KEY,
        save_id TEXT NOT NULL,
        date TEXT NOT NULL,
        miles REAL NOT NULL,
        FOREIGN KEY (save_id) REFERENCES saves(id) ON DELETE CASCADE,
        UNIQUE(save_id, date)
      )
    `);

    // Trivia unlocks table
    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS trivia_unlocks (
        id TEXT PRIMARY KEY,
        save_id TEXT NOT NULL,
        trivia_id TEXT NOT NULL,
        unlocked_date TEXT NOT NULL,
        FOREIGN KEY (save_id) REFERENCES saves(id) ON DELETE CASCADE,
        UNIQUE(save_id, trivia_id)
      )
    `);

    // User settings table
    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id TEXT PRIMARY KEY,
        checkpoint_label_size INTEGER NOT NULL DEFAULT 2,
        current_theme TEXT NOT NULL DEFAULT 'classic',
        show_trivia_markers INTEGER NOT NULL DEFAULT 1
      )
    `);

    // Create indexes for better query performance
    await this.db.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_journey_progress_save_id 
      ON journey_progress(save_id)
    `);

    await this.db.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_checkpoint_completions_save_id 
      ON checkpoint_completions(save_id)
    `);

    await this.db.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_daily_distance_save_id_date 
      ON daily_distance(save_id, date)
    `);

    await this.db.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_trivia_unlocks_save_id 
      ON trivia_unlocks(save_id)
    `);
  }

  private async initializeDefaultSettings(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const [result] = await this.db.executeSql(
      'SELECT COUNT(*) as count FROM user_settings'
    );

    if (result.rows.item(0).count === 0) {
      await this.db.executeSql(
        `INSERT INTO user_settings (id, checkpoint_label_size, current_theme, show_trivia_markers)
         VALUES ('default', 2, 'classic', 1)`
      );
    }
  }

  // Save operations
  async createSave(save: Omit<Save, 'id'>): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');

    const id = `save_${Date.now()}`;
    await this.db.executeSql(
      `INSERT INTO saves (id, name, created_date, last_accessed_date, is_active, status, start_date, end_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        save.name,
        save.createdDate,
        save.lastAccessedDate,
        save.isActive ? 1 : 0,
        save.status,
        save.startDate || null,
        save.endDate || null,
      ]
    );

    // Create initial journey progress
    await this.db.executeSql(
      `INSERT INTO journey_progress (id, save_id, current_checkpoint, total_miles, current_checkpoint_miles, last_sync_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [`progress_${id}`, id, 1, 0, 0, new Date().toISOString()]
    );

    return id;
  }

  async getSaves(): Promise<Save[]> {
    if (!this.db) throw new Error('Database not initialized');

    const [result] = await this.db.executeSql(
      'SELECT * FROM saves ORDER BY last_accessed_date DESC'
    );

    const saves: Save[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows.item(i);
      saves.push({
        id: row.id,
        name: row.name,
        createdDate: row.created_date,
        lastAccessedDate: row.last_accessed_date,
        isActive: row.is_active === 1,
        status: row.status,
        startDate: row.start_date,
        endDate: row.end_date,
      });
    }

    return saves;
  }

  async getActiveSave(): Promise<Save | null> {
    if (!this.db) throw new Error('Database not initialized');

    const [result] = await this.db.executeSql(
      'SELECT * FROM saves WHERE is_active = 1 LIMIT 1'
    );

    if (result.rows.length === 0) return null;

    const row = result.rows.item(0);
    return {
      id: row.id,
      name: row.name,
      createdDate: row.created_date,
      lastAccessedDate: row.last_accessed_date,
      isActive: row.is_active === 1,
      status: row.status,
      startDate: row.start_date,
      endDate: row.end_date,
    };
  }

  async setActiveSave(saveId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Deactivate all saves
    await this.db.executeSql('UPDATE saves SET is_active = 0');

    // Activate the specified save and update last accessed date
    await this.db.executeSql(
      'UPDATE saves SET is_active = 1, last_accessed_date = ? WHERE id = ?',
      [new Date().toISOString(), saveId]
    );
  }

  async deleteSave(saveId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.executeSql('DELETE FROM saves WHERE id = ?', [saveId]);
  }

  // Journey progress operations
  async getJourneyProgress(saveId: string): Promise<JourneyProgress | null> {
    if (!this.db) throw new Error('Database not initialized');

    const [result] = await this.db.executeSql(
      'SELECT * FROM journey_progress WHERE save_id = ? LIMIT 1',
      [saveId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows.item(0);
    return {
      id: row.id,
      saveId: row.save_id,
      currentCheckpoint: row.current_checkpoint,
      totalMiles: row.total_miles,
      currentCheckpointMiles: row.current_checkpoint_miles,
      lastSyncDate: row.last_sync_date,
    };
  }

  async updateJourneyProgress(
    saveId: string,
    updates: Partial<Omit<JourneyProgress, 'id' | 'saveId'>>
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.currentCheckpoint !== undefined) {
      fields.push('current_checkpoint = ?');
      values.push(updates.currentCheckpoint);
    }
    if (updates.totalMiles !== undefined) {
      fields.push('total_miles = ?');
      values.push(updates.totalMiles);
    }
    if (updates.currentCheckpointMiles !== undefined) {
      fields.push('current_checkpoint_miles = ?');
      values.push(updates.currentCheckpointMiles);
    }
    if (updates.lastSyncDate !== undefined) {
      fields.push('last_sync_date = ?');
      values.push(updates.lastSyncDate);
    }

    if (fields.length === 0) return;

    values.push(saveId);

    await this.db.executeSql(
      `UPDATE journey_progress SET ${fields.join(', ')} WHERE save_id = ?`,
      values
    );
  }

  // Checkpoint completion operations
  async addCheckpointCompletion(
    completion: Omit<CheckpointCompletion, 'id'>
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const id = `completion_${Date.now()}_${completion.checkpointNumber}`;
    await this.db.executeSql(
      `INSERT INTO checkpoint_completions (id, save_id, checkpoint_number, completed_date, days_to_complete, avg_miles_per_day)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        completion.saveId,
        completion.checkpointNumber,
        completion.completedDate,
        completion.daysToComplete,
        completion.avgMilesPerDay,
      ]
    );
  }

  async getCheckpointCompletions(
    saveId: string
  ): Promise<CheckpointCompletion[]> {
    if (!this.db) throw new Error('Database not initialized');

    const [result] = await this.db.executeSql(
      'SELECT * FROM checkpoint_completions WHERE save_id = ? ORDER BY checkpoint_number',
      [saveId]
    );

    const completions: CheckpointCompletion[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows.item(i);
      completions.push({
        id: row.id,
        saveId: row.save_id,
        checkpointNumber: row.checkpoint_number,
        completedDate: row.completed_date,
        daysToComplete: row.days_to_complete,
        avgMilesPerDay: row.avg_miles_per_day,
      });
    }

    return completions;
  }

  // Daily distance operations
  async addDailyDistance(distance: Omit<DailyDistance, 'id'>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const id = `daily_${Date.now()}`;
    await this.db.executeSql(
      `INSERT OR REPLACE INTO daily_distance (id, save_id, date, miles)
       VALUES (?, ?, ?, ?)`,
      [id, distance.saveId, distance.date, distance.miles]
    );
  }

  async getDailyDistances(saveId: string): Promise<DailyDistance[]> {
    if (!this.db) throw new Error('Database not initialized');

    const [result] = await this.db.executeSql(
      'SELECT * FROM daily_distance WHERE save_id = ? ORDER BY date DESC',
      [saveId]
    );

    const distances: DailyDistance[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows.item(i);
      distances.push({
        id: row.id,
        saveId: row.save_id,
        date: row.date,
        miles: row.miles,
      });
    }

    return distances;
  }

  // Trivia unlock operations
  async unlockTrivia(unlock: Omit<TriviaUnlock, 'id'>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const id = `unlock_${Date.now()}_${unlock.triviaId}`;
    try {
      await this.db.executeSql(
        `INSERT INTO trivia_unlocks (id, save_id, trivia_id, unlocked_date)
         VALUES (?, ?, ?, ?)`,
        [id, unlock.saveId, unlock.triviaId, unlock.unlockedDate]
      );
    } catch (error) {
      // Ignore duplicate key errors (trivia already unlocked)
      if (!String(error).includes('UNIQUE constraint')) {
        throw error;
      }
    }
  }

  async getTriviaUnlocks(saveId: string): Promise<TriviaUnlock[]> {
    if (!this.db) throw new Error('Database not initialized');

    const [result] = await this.db.executeSql(
      'SELECT * FROM trivia_unlocks WHERE save_id = ? ORDER BY unlocked_date',
      [saveId]
    );

    const unlocks: TriviaUnlock[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows.item(i);
      unlocks.push({
        id: row.id,
        saveId: row.save_id,
        triviaId: row.trivia_id,
        unlockedDate: row.unlocked_date,
      });
    }

    return unlocks;
  }

  async isTriviaUnlocked(saveId: string, triviaId: string): Promise<boolean> {
    if (!this.db) throw new Error('Database not initialized');

    const [result] = await this.db.executeSql(
      'SELECT COUNT(*) as count FROM trivia_unlocks WHERE save_id = ? AND trivia_id = ?',
      [saveId, triviaId]
    );

    return result.rows.item(0).count > 0;
  }

  // User settings operations
  async getUserSettings(): Promise<UserSettings> {
    if (!this.db) throw new Error('Database not initialized');

    const [result] = await this.db.executeSql(
      'SELECT * FROM user_settings WHERE id = ? LIMIT 1',
      ['default']
    );

    const row = result.rows.item(0);
    return {
      id: row.id,
      checkpointLabelSize: row.checkpoint_label_size,
      currentTheme: row.current_theme,
      showTriviaMarkers: row.show_trivia_markers === 1,
    };
  }

  async updateUserSettings(
    updates: Partial<Omit<UserSettings, 'id'>>
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.checkpointLabelSize !== undefined) {
      fields.push('checkpoint_label_size = ?');
      values.push(updates.checkpointLabelSize);
    }
    if (updates.currentTheme !== undefined) {
      fields.push('current_theme = ?');
      values.push(updates.currentTheme);
    }
    if (updates.showTriviaMarkers !== undefined) {
      fields.push('show_trivia_markers = ?');
      values.push(updates.showTriviaMarkers ? 1 : 0);
    }

    if (fields.length === 0) return;

    await this.db.executeSql(
      `UPDATE user_settings SET ${fields.join(', ')} WHERE id = 'default'`,
      values
    );
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }
}

export const database = new Database();
