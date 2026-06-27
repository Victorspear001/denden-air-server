import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import db from './client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Runs all SQL migration files in order against the Turso database.
 * Uses IF NOT EXISTS guards so migrations are idempotent.
 * Tracks applied migrations in a _migrations table to avoid re-running.
 */
export async function runMigrations() {
  const migrationsDir = join(__dirname, '..', 'migrations');

  try {
    // Create migrations tracking table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get all migration files sorted by name
    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      // Check if already applied
      const check = await db.execute({
        sql: 'SELECT name FROM _migrations WHERE name = ?',
        args: [file],
      });

      if (check.rows.length > 0) {
        continue; // Already applied
      }

      const filePath = join(migrationsDir, file);
      const sql = readFileSync(filePath, 'utf-8');

      // Split on semicolons and execute each statement individually
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        try {
          await db.execute(statement);
        } catch (err) {
          // Ignore "column already exists" or "table already exists" for idempotency
          if (err.message?.includes('already exists') || err.message?.includes('duplicate column')) {
            console.log(`[DB] ℹ️  Skipping (already exists): ${err.message}`);
          } else {
            throw err;
          }
        }
      }

      // Mark migration as applied
      await db.execute({
        sql: 'INSERT INTO _migrations (name) VALUES (?)',
        args: [file],
      });

      console.log(`[DB] ✅ Applied migration: ${file}`);
    }

    console.log('[DB] ✅ All migrations up to date');
  } catch (error) {
    if (error.message?.includes('already exists')) {
      console.log('[DB] ℹ️  Schema already up to date');
    } else {
      console.error('[DB] ❌ Migration error:', error.message);
      throw error;
    }
  }
}
