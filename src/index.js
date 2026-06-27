import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { runMigrations } from './db/migrate.js';
// TTL cleanup removed — messages now persist permanently

import authRoutes from './routes/auth.js';
import deviceRoutes from './routes/devices.js';
import smsRoutes from './routes/sms.js';
import streamRoutes from './routes/stream.js';

// Load environment variables
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// ─── Security & Parsing Middleware ──────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
    },
  },
}));
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ─── Static Files (Web Dashboard) ──────────────────────────────
app.use(express.static(join(__dirname, '..', 'public')));

// ─── API Routes ────────────────────────────────────────────────
app.use('/api/v1', authRoutes);
app.use('/api/v1/devices', deviceRoutes);
app.use('/api/v1', smsRoutes);
app.use('/api/v1/sms', streamRoutes);

// ─── Health Check ──────────────────────────────────────────────
app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'operational',
    service: 'Denden Air Gateway',
    timestamp: new Date().toISOString(),
  });
});

// ─── 404 Fallback ──────────────────────────────────────────────
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Not found', message: `Route ${req.method} ${req.originalUrl} not found` });
});

// ─── SPA Fallback (serve index.html for non-API routes) ────────
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '..', 'public', 'index.html'));
});

// ─── Global Error Handler ──────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[SERVER] ❌ Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Bootstrap ─────────────────────────────────────────────────
async function start() {
  try {
    console.log('');
    console.log('  ╔══════════════════════════════════════════╗');
    console.log('  ║        🌀 DENDEN AIR — Gateway API       ║');
    console.log('  ╚══════════════════════════════════════════╝');
    console.log('');

    // Run database migrations
    await runMigrations();

    // Messages persist permanently (no TTL cleanup)

    // Start HTTP server (Render binds HOST automatically)
    app.listen(PORT, () => {
      console.log(`[SERVER] 🚀 Listening on port ${PORT}`);
      console.log(`[SERVER] 📊 Dashboard: http://localhost:${PORT}/`);
      console.log(`[SERVER] 🔗 API Base:  http://localhost:${PORT}/api/v1`);
      console.log('');
    });
  } catch (error) {
    console.error('[SERVER] ❌ Failed to start:', error);
    process.exit(1);
  }
}

start();
