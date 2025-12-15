import { open, type DB } from '@op-engineering/op-sqlite';
import { UserSettings, LabelSize } from '../types';
import { ThemeName } from '../styles/themes';

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
    await this.db.executeAsync(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id TEXT PRIMARY KEY,
        label_size TEXT NOT NULL DEFAULT 'regular',
        current_theme TEXT NOT NULL DEFAULT 'classic',
        show_trivia_markers INTEGER NOT NULL DEFAULT 1,
        show_checkpoint_labels INTEGER NOT NULL DEFAULT 1,
        colorize_map INTEGER NOT NULL DEFAULT 0,
        reduced_map_titles INTEGER NOT NULL DEFAULT 1
      )
    `);
  }

  private async initializeDefaultSettings(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Use INSERT OR IGNORE to avoid UNIQUE constraint errors on race conditions
    await this.db.executeAsync(
      `INSERT OR IGNORE INTO user_settings (id, label_size, current_theme, show_trivia_markers, show_checkpoint_labels, colorize_map, reduced_map_titles)
       VALUES ('default', 'regular', 'classic', 1, 1, 0, 1)`,
    );
  }

  // User settings operations
  async getUserSettings(): Promise<UserSettings> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.executeAsync(
      'SELECT * FROM user_settings WHERE id = ? LIMIT 1',
      ['default'],
    );

    let row = result.rows?.[0];

    // If no settings found, create defaults
    if (!row) {
      await this.db.executeAsync(
        `INSERT OR REPLACE INTO user_settings (id, label_size, current_theme, show_trivia_markers, show_checkpoint_labels, colorize_map, reduced_map_titles)
         VALUES ('default', 'regular', 'classic', 1, 1, 0, 1)`,
      );

      const newResult = await this.db.executeAsync(
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
      labelSize: row.label_size as LabelSize,
      currentTheme: row.current_theme as ThemeName,
      showTriviaMarkers: row.show_trivia_markers === 1,
      showCheckpointLabels: row.show_checkpoint_labels === 1,
      colorizeMap: row.colorize_map === 1,
      reducedMapTitles: row.reduced_map_titles === 1,
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
    if (updates.currentTheme !== undefined) {
      fields.push('current_theme = ?');
      values.push(updates.currentTheme);
    }
    if (updates.showTriviaMarkers !== undefined) {
      fields.push('show_trivia_markers = ?');
      values.push(updates.showTriviaMarkers ? 1 : 0);
    }
    if (updates.showCheckpointLabels !== undefined) {
      fields.push('show_checkpoint_labels = ?');
      values.push(updates.showCheckpointLabels ? 1 : 0);
    }
    if (updates.colorizeMap !== undefined) {
      fields.push('colorize_map = ?');
      values.push(updates.colorizeMap ? 1 : 0);
    }
    if (updates.reducedMapTitles !== undefined) {
      fields.push('reduced_map_titles = ?');
      values.push(updates.reducedMapTitles ? 1 : 0);
    }

    if (fields.length === 0) return;

    await this.db.executeAsync(
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
}

export const database = new Database();
