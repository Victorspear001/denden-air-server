import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/client.js';
import { generateId } from '../utils/id.js';
import { authenticate, generateToken } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/v1/register
 * Create a new user account.
 * Body: { email, password }
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Missing fields',
        message: 'Email and password are required.',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: 'Weak password',
        message: 'Password must be at least 8 characters.',
      });
    }

    // Check for existing user
    const existing = await db.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: [email.toLowerCase().trim()],
    });

    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: 'Email taken',
        message: 'An account with this email already exists.',
      });
    }

    const id = generateId();
    const passwordHash = await bcrypt.hash(password, 12);

    await db.execute({
      sql: 'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)',
      args: [id, email.toLowerCase().trim(), passwordHash],
    });

    const token = generateToken({ id, email: email.toLowerCase().trim() });

    return res.status(201).json({
      message: 'Account created successfully',
      token,
      user: { id, email: email.toLowerCase().trim() },
    });
  } catch (error) {
    console.error('[AUTH] ❌ Registration error:', error.message);
    return res.status(500).json({
      error: 'Server error',
      message: 'An error occurred during registration.',
    });
  }
});

/**
 * POST /api/v1/login
 * Authenticate with email and password.
 * Body: { email, password }
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Missing fields',
        message: 'Email and password are required.',
      });
    }

    const result = await db.execute({
      sql: 'SELECT id, email, password_hash FROM users WHERE email = ?',
      args: [email.toLowerCase().trim()],
    });

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'No account found with this email.',
      });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Incorrect password.',
      });
    }

    const token = generateToken({ id: user.id, email: user.email });

    return res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, email: user.email },
    });
  } catch (error) {
    console.error('[AUTH] ❌ Login error:', error.message);
    return res.status(500).json({
      error: 'Server error',
      message: 'An error occurred during login.',
    });
  }
});

/**
 * GET /api/v1/me
 * Get the current authenticated user's profile.
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT id, email, created_at FROM users WHERE id = ?',
      args: [req.user.id],
    });

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('[AUTH] ❌ Profile fetch error:', error.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
