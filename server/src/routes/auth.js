// ─── Auth Routes ────────────────────────────────────────────────────────
// Handles SAT e.firma authentication, certificate status, and upload.
// ─────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getSatService } from '../services/SatService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// Configure multer for e.firma file uploads
const efirmaDir = path.join(__dirname, '../../efirma');
if (!fs.existsSync(efirmaDir)) {
  fs.mkdirSync(efirmaDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, efirmaDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext === '.cer') cb(null, 'certificado.cer');
      else if (ext === '.key') cb(null, 'llave.key');
      else cb(new Error('Extensión de archivo no válida. Solo .cer y .key'));
    },
  }),
  limits: {
    fileSize: 50 * 1024, // 50KB max — e.firma files are small
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.cer', '.key'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos .cer y .key'));
    }
  },
});

/**
 * GET /api/sat/auth/status
 * Check the current SAT authentication status.
 */
router.get('/status', (_req, res) => {
  try {
    const satService = getSatService();
    const status = satService.getStatus();

    // Check if credential files exist
    const cerExists = fs.existsSync(path.join(efirmaDir, 'certificado.cer'));
    const keyExists = fs.existsSync(path.join(efirmaDir, 'llave.key'));

    res.json({
      success: true,
      data: {
        ...status,
        cerFileExists: cerExists,
        keyFileExists: keyExists,
        credentialsConfigured: cerExists && keyExists,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/sat/auth/login
 * Authenticate with the SAT using the configured e.firma.
 */
router.post('/login', async (req, res) => {
  try {
    const satService = getSatService();

    if (!satService.isReady()) {
      const initialized = await satService.initialize();
      if (!initialized) {
        return res.status(400).json({
          success: false,
          error: 'No se pudo inicializar el servicio SAT. Verifica que los archivos de e.firma estén configurados correctamente.',
        });
      }
    }

    const result = await satService.authenticate();

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/sat/auth/upload-efirma
 * Upload .cer and .key files for e.firma authentication.
 * Requires the password in the request body.
 */
router.post('/upload-efirma', upload.fields([
  { name: 'cer', maxCount: 1 },
  { name: 'key', maxCount: 1 },
]), async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        error: 'La contraseña de la e.firma es requerida.',
      });
    }

    const cerFile = req.files?.cer?.[0];
    const keyFile = req.files?.key?.[0];

    if (!cerFile || !keyFile) {
      return res.status(400).json({
        success: false,
        error: 'Ambos archivos (.cer y .key) son requeridos.',
      });
    }

    // Try to load credentials to validate them
    const satService = getSatService();
    try {
      const credential = await satService.loadCredentials(
        cerFile.path,
        keyFile.path,
        password
      );

      // Update environment variables for this session
      process.env.SAT_CER_PATH = cerFile.path;
      process.env.SAT_KEY_PATH = keyFile.path;
      process.env.SAT_KEY_PASSWORD = password;

      // Re-initialize the service
      await satService.initialize();

      res.json({
        success: true,
        data: {
          message: 'e.firma cargada y validada exitosamente',
          rfc: satService.getRfc(),
          certificateExpiration: satService.getCertificateExpiration(),
          certificateSerial: satService.getCertificateSerial(),
        },
      });
    } catch (validationError) {
      // Delete uploaded files if validation fails
      try {
        if (cerFile.path) fs.unlinkSync(cerFile.path);
        if (keyFile.path) fs.unlinkSync(keyFile.path);
      } catch { /* ignore cleanup errors */ }

      return res.status(400).json({
        success: false,
        error: `Error validando e.firma: ${validationError.message}`,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
