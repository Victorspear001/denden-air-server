import { Router } from 'express';
import db from '../db/client.js';
import { generateId } from '../utils/id.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/v1/devices
 * Register a new device with its RSA public key.
 * Body: { public_key, device_label? }
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const { public_key, device_label } = req.body;

    if (!public_key) {
      return res.status(400).json({
        error: 'Missing field',
        message: 'public_key is required.',
      });
    }

    const id = generateId();

    await db.execute({
      sql: 'INSERT INTO devices (id, user_id, public_key, device_label) VALUES (?, ?, ?, ?)',
      args: [id, req.user.id, public_key, device_label || null],
    });

    return res.status(201).json({
      message: 'Device registered successfully',
      device: { id, user_id: req.user.id, device_label: device_label || null },
    });
  } catch (error) {
    console.error('[DEVICES] ❌ Registration error:', error.message);
    return res.status(500).json({
      error: 'Server error',
      message: 'An error occurred registering the device.',
    });
  }
});

/**
 * GET /api/v1/devices
 * List all devices for the authenticated user.
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT id, device_label FROM devices WHERE user_id = ?',
      args: [req.user.id],
    });

    return res.json({ devices: result.rows });
  } catch (error) {
    console.error('[DEVICES] ❌ List error:', error.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /api/v1/devices/:id
 * Unregister a device. Only the owning user can delete their devices.
 */
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'DELETE FROM devices WHERE id = ? AND user_id = ?',
      args: [req.params.id, req.user.id],
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        error: 'Device not found',
        message: 'No device with that ID belongs to your account.',
      });
    }

    return res.json({ message: 'Device unregistered successfully' });
  } catch (error) {
    console.error('[DEVICES] ❌ Delete error:', error.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
