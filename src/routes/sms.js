import { Router } from 'express';
import db from '../db/client.js';
import { generateId } from '../utils/id.js';
import { authenticate } from '../middleware/auth.js';
import { verifySignature } from '../middleware/crypto.js';

const router = Router();

/**
 * POST /api/v1/forward-sms
 * Receive a cryptographically signed SMS payload from a mobile device.
 * Requires JWT authentication AND valid RSA signature.
 * Body: { device_id, sender_identity, message_payload, timestamp, signature, message_type? }
 */
router.post('/forward-sms', authenticate, verifySignature, async (req, res) => {
  try {
    const { sender_identity, message_payload, message_type } = req.body;

    if (!sender_identity || !message_payload) {
      return res.status(400).json({
        error: 'Missing fields',
        message: 'sender_identity and message_payload are required.',
      });
    }

    // Determine message type: explicit field > auto-detect from sender prefix > default 'sms'
    let type = message_type || 'sms';
    if (!message_type && sender_identity.startsWith('[WhatsApp]')) {
      type = 'whatsapp';
    }

    const id = generateId();

    await db.execute({
      sql: 'INSERT INTO sms_logs (id, user_id, sender_identity, message_payload, message_type) VALUES (?, ?, ?, ?, ?)',
      args: [id, req.user.id, sender_identity, message_payload, type],
    });

    console.log(`[SMS] 📨 New ${type} message forwarded for user ${req.user.email} from ${sender_identity}`);

    return res.status(201).json({
      message: 'SMS logged successfully',
      sms: { id, sender_identity, message_type: type, created_at: new Date().toISOString() },
    });
  } catch (error) {
    console.error('[SMS] ❌ Forward error:', error.message);
    return res.status(500).json({
      error: 'Server error',
      message: 'An error occurred storing the SMS.',
    });
  }
});

/**
 * GET /api/v1/sms
 * Fetch recent SMS logs for the authenticated user.
 * Query params: ?limit=50&offset=0&type=sms|whatsapp|all
 */
router.get('/sms', authenticate, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const type = req.query.type; // 'sms', 'whatsapp', or undefined/all

    let whereClauses = ['user_id = ?'];
    let args = [req.user.id];

    if (type && type !== 'all') {
      whereClauses.push('message_type = ?');
      args.push(type);
    }

    const whereStr = whereClauses.join(' AND ');

    const result = await db.execute({
      sql: `SELECT id, sender_identity, message_payload, message_type, created_at 
            FROM sms_logs 
            WHERE ${whereStr} 
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?`,
      args: [...args, limit, offset],
    });

    // Get total count for pagination
    const countResult = await db.execute({
      sql: `SELECT COUNT(*) as total FROM sms_logs WHERE ${whereStr}`,
      args: args,
    });

    return res.json({
      sms_logs: result.rows,
      pagination: {
        total: countResult.rows[0].total,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('[SMS] ❌ Fetch error:', error.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /api/v1/sms/all
 * Delete all messages for the authenticated user.
 * Query params: ?type=sms|whatsapp (optional, deletes all if not specified)
 */
router.delete('/sms/all', authenticate, async (req, res) => {
  try {
    const type = req.query.type;

    let sql = 'DELETE FROM sms_logs WHERE user_id = ?';
    let args = [req.user.id];

    if (type && type !== 'all') {
      sql += ' AND message_type = ?';
      args.push(type);
    }

    const result = await db.execute({ sql, args });
    const deleted = result.rowsAffected || 0;

    console.log(`[SMS] 🗑️ Deleted ${deleted} ${type || 'all'} message(s) for user ${req.user.email}`);

    return res.json({
      message: `Deleted ${deleted} message(s)`,
      deleted_count: deleted,
    });
  } catch (error) {
    console.error('[SMS] ❌ Delete all error:', error.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /api/v1/sms/:id
 * Delete a specific message for the authenticated user.
 */
router.delete('/sms/:id', authenticate, async (req, res) => {
  try {
    const id = req.params.id;
    // Don't match /all here (though it's defined before this, so it's safe)
    if (id === 'all') return res.status(400).json({ error: 'Invalid id' });

    const result = await db.execute({
      sql: 'DELETE FROM sms_logs WHERE id = ? AND user_id = ?',
      args: [id, req.user.id],
    });

    if (result.rowsAffected > 0) {
      return res.json({ message: 'Deleted successfully' });
    } else {
      return res.status(404).json({ error: 'Message not found' });
    }
  } catch (error) {
    console.error('[SMS] ❌ Delete error:', error.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
