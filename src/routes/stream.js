import { Router } from 'express';
import jwt from 'jsonwebtoken';
import db from '../db/client.js';

const router = Router();

/**
 * GET /api/v1/sms/stream
 * Server-Sent Events endpoint for real-time SMS updates.
 * Auth via query param: ?token=<jwt>
 * 
 * The client opens an EventSource connection and receives new SMS
 * entries as they appear in the database (polled every 1.5 seconds).
 */
router.get('/stream', (req, res) => {
  try {
    // Authenticate via query parameter (EventSource doesn't support headers)
    const token = req.query.token;

    if (!token) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Provide a token query parameter.',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'The provided token is invalid or expired.',
      });
    }

    const userId = decoded.id;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering
    res.flushHeaders();

    // Send initial connection event
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE stream established' })}\n\n`);

    let lastTimestamp = new Date().toISOString();

    // Poll database every 1.5 seconds for more real-time delivery
    const intervalId = setInterval(async () => {
      try {
        const result = await db.execute({
          sql: `SELECT id, sender_identity, message_payload, message_type, created_at 
                FROM sms_logs 
                WHERE user_id = ? AND created_at > ? 
                ORDER BY created_at ASC`,
          args: [userId, lastTimestamp],
        });

        if (result.rows.length > 0) {
          for (const row of result.rows) {
            res.write(`data: ${JSON.stringify({ type: 'new_sms', sms: row })}\n\n`);
          }
          // Update the cursor to the latest row's timestamp
          lastTimestamp = result.rows[result.rows.length - 1].created_at;
        }

        // Heartbeat to keep connection alive
        res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch (err) {
        console.error('[SSE] ❌ Poll error:', err.message);
      }
    }, 1500);

    // Clean up on client disconnect
    req.on('close', () => {
      clearInterval(intervalId);
      console.log(`[SSE] 🔌 Client disconnected (user: ${decoded.email})`);
    });
  } catch (error) {
    console.error('[SSE] ❌ Stream setup error:', error.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Server error' });
    }
  }
});

export default router;
