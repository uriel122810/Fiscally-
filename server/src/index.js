// ─── Fiscally Backend Server ────────────────────────────────────────────
// Express server for SAT Descarga Masiva CFDI integration.
// Handles authentication, CFDI queries, downloads, and PDF generation.
// ─────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';

import { initializeSchema } from './db/schema.js';
import { closeDatabase } from './db/connection.js';
import { getSatService } from './services/SatService.js';

import authRoutes from './routes/auth.js';
import cfdiRoutes from './routes/cfdi.js';
import downloadRoutes from './routes/download.js';
import pdfRoutes from './routes/pdf.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

const app = express();

// ─── Middleware ──────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Request logging ────────────────────────────────────────────────────
app.use((req, _res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ─── Routes ─────────────────────────────────────────────────────────────
app.use('/api/sat/auth', authRoutes);
app.use('/api/sat/cfdi', cfdiRoutes);
app.use('/api/sat/download', downloadRoutes);
app.use('/api/sat/cfdi', pdfRoutes); // PDF routes are under /api/sat/cfdi/:uuid/pdf

// ─── Health check ───────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  const satService = getSatService();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    sat: satService.getStatus(),
  });
});

// ─── 404 handler ────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint no encontrado',
  });
});

// ─── Global error handler ───────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('❌ Unhandled error:', err);

  // Multer-specific errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      error: 'El archivo excede el tamaño máximo permitido (50KB)',
    });
  }

  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'Error interno del servidor'
      : err.message,
  });
});

// ─── Startup ────────────────────────────────────────────────────────────
async function start() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  🏛️  Fiscally — SAT Backend Server                ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log('');

  // Initialize database
  try {
    initializeSchema();
  } catch (err) {
    console.error('❌ Database initialization failed:', err.message);
    process.exit(1);
  }

  // Try to initialize SAT service (non-blocking)
  try {
    const satService = getSatService();
    const initialized = await satService.initialize();
    if (!initialized) {
      console.log('');
      console.log('⚠️  SAT Service not configured. To enable real SAT data:');
      console.log('   1. Copy .env.example to .env');
      console.log('   2. Place your .cer and .key files in server/efirma/');
      console.log('   3. Update SAT_CER_PATH, SAT_KEY_PATH, and SAT_KEY_PASSWORD in .env');
      console.log('   4. Restart the server');
      console.log('');
      console.log('   The server will run with cached/demo data in the meantime.');
      console.log('');
    }
  } catch (err) {
    console.warn('⚠️  SAT Service initialization warning:', err.message);
  }

  // Start listening
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📡 CORS enabled for: ${CORS_ORIGIN}`);
    console.log(`📊 API endpoints:`);
    console.log(`   GET  /api/health`);
    console.log(`   GET  /api/sat/auth/status`);
    console.log(`   POST /api/sat/auth/login`);
    console.log(`   POST /api/sat/auth/upload-efirma`);
    console.log(`   GET  /api/sat/cfdi`);
    console.log(`   GET  /api/sat/cfdi/stats`);
    console.log(`   GET  /api/sat/cfdi/:uuid`);
    console.log(`   GET  /api/sat/cfdi/:uuid/xml`);
    console.log(`   GET  /api/sat/cfdi/:uuid/pdf`);
    console.log(`   POST /api/sat/download/request`);
    console.log(`   GET  /api/sat/download/verify/:requestId`);
    console.log(`   POST /api/sat/download/fetch/:requestId`);
    console.log(`   GET  /api/sat/download/history`);
    console.log('');
  });
}

// ─── Graceful shutdown ──────────────────────────────────────────────────
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', () => {
  closeDatabase();
  process.exit(0);
});

start();
