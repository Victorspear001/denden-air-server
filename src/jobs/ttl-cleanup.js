import cron from 'node-cron';
import db from '../db/client.js';

/**
 * TTL Cleanup Job
 * Runs every 5 minutes to purge SMS log records older than 10 minutes.
 * This ensures the database remains lean and stays in sync with the dashboard auto-delete.
 */
export function startTtlCleanup() {
  console.log('[CRON] 🕐 TTL cleanup job scheduled (every 5 minutes, purge >10min old records)');

  cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await db.execute(
        "DELETE FROM sms_logs WHERE created_at < datetime('now', '-10 minutes')"
      );

      const purged = result.rowsAffected || 0;

      if (purged > 0) {
        console.log(`[CRON] 🗑️  Purged ${purged} expired SMS log(s)`);
      } else {
        console.log('[CRON] ✅ No expired records to purge');
      }
    } catch (error) {
      console.error('[CRON] ❌ TTL cleanup error:', error.message);
    }
  });
}
