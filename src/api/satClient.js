// ─── SAT API Client ─────────────────────────────────────────────────────
// HTTP client wrapper for all backend SAT API calls.
// Supports two modes:
//   1. Supabase Edge Functions (production on Netlify)
//   2. Local Express backend (development with Vite proxy)
// ─────────────────────────────────────────────────────────────────────────

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Determinar si estamos usando Supabase Edge Functions como backend
const isSupabaseMode = !!(supabaseUrl && supabaseKey);

// En modo Supabase:  https://<PROJECT_REF>.supabase.co/functions/v1
// En modo local:     '' (rutas relativas como /api/sat/...)
const FUNCTIONS_BASE = isSupabaseMode
  ? `${supabaseUrl.replace(/\/$/, '')}/functions/v1`
  : '';

// Base para las rutas de API SAT
// Supabase: https://<ref>.supabase.co/functions/v1/sat-sync  (cada función es un nombre)
// Local:    /api/sat
const API_BASE = isSupabaseMode ? `${FUNCTIONS_BASE}/sat` : '/api/sat';

/**
 * Construye una URL completa a partir de un path.
 * Si el path ya es absoluto (https://...), lo devuelve tal cual.
 * Si es relativo (/api/...), lo resuelve contra window.location.origin.
 */
function buildUrl(path, params = {}) {
  // Si el path ya contiene un protocolo, es una URL absoluta (modo Supabase)
  const isAbsolute = path.startsWith('http://') || path.startsWith('https://');
  const url = isAbsolute ? new URL(path) : new URL(path, window.location.origin);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

/**
 * Base fetch wrapper with error handling.
 */
async function request(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Inyectar Authorization para Supabase Edge Functions
  if (isSupabaseMode) {
    headers['Authorization'] = `Bearer ${supabaseKey}`;
    headers['apikey'] = supabaseKey;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Handle file downloads
    if (options.responseType === 'blob') {
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Error de descarga' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }
      return response;
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
  } catch (error) {
    // Generar un mensaje de error contextual según el modo de operación
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      if (isSupabaseMode) {
        throw new Error(`No se pudo conectar a Supabase Edge Functions. Verifica que VITE_SUPABASE_URL sea correcto.`);
      } else {
        throw new Error('No se pudo conectar al servidor backend. ¿Está corriendo el servidor en el puerto 3001?');
      }
    }
    throw error;
  }
}

/**
 * GET request helper.
 */
async function get(path, params = {}) {
  return request(buildUrl(path, params));
}

/**
 * POST request helper.
 */
async function post(path, body = {}) {
  return request(buildUrl(path), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Download file helper — triggers browser download.
 */
async function downloadFile(path, filename) {
  const response = await request(buildUrl(path), {
    responseType: 'blob',
  });

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── API Methods ────────────────────────────────────────────────────────

export const satApi = {
  // ── Health ────────────────────────────────────────────────────────
  /**
   * Check if the backend is reachable.
   * En modo Supabase, llama a la Edge Function /sat/health.
   * En modo local, llama a /api/health.
   */
  health: () => {
    if (isSupabaseMode) {
      // Probar conectividad a Supabase llamando al endpoint de la función SAT
      return get(`${API_BASE}/health`);
    }
    return get('/api/health');
  },

  // ── Auth ──────────────────────────────────────────────────────────
  /**
   * Get SAT authentication status.
   */
  getAuthStatus: () => get(`${API_BASE}/auth/status`),

  /**
   * Authenticate with SAT using configured e.firma.
   */
  authenticate: () => post(`${API_BASE}/auth/login`),

  /**
   * Upload e.firma files (.cer + .key).
   * Uses FormData for file upload.
   */
  uploadEfirma: async (cerFile, keyFile, password) => {
    const formData = new FormData();
    formData.append('cer', cerFile);
    formData.append('key', keyFile);
    formData.append('password', password);

    const url = buildUrl(`${API_BASE}/auth/upload-efirma`);
    const headers = {};

    // Para FormData, NO establecer Content-Type (el browser pone el boundary)
    if (isSupabaseMode) {
      headers['Authorization'] = `Bearer ${supabaseKey}`;
      headers['apikey'] = supabaseKey;
    }

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      headers,
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error subiendo e.firma');
    return data;
  },

  // ── CFDI Queries ──────────────────────────────────────────────────
  /**
   * List CFDIs with filters.
   * @param {object} params - { direction, year, month, rfc, tipo, status, search, limit, offset }
   */
  getCfdis: (params = {}) => get(`${API_BASE}/cfdi`, params),

  /**
   * Get single CFDI detail by UUID.
   */
  getCfdiDetail: (uuid) => get(`${API_BASE}/cfdi/${uuid}`),

  /**
   * Get aggregated statistics (KPIs, charts).
   * @param {object} params - { year, month }
   */
  getStats: (params = {}) => get(`${API_BASE}/cfdi/stats`, params),

  // ── Downloads ─────────────────────────────────────────────────────
  /**
   * Download raw CFDI XML file. (Simulated for Netlify)
   */
  downloadXml: async (uuid, filename) => {
    await new Promise(r => setTimeout(r, 800));
    alert(`📄 Simulación: Descargando ${filename || `${uuid}.xml`}`);
  },

  /**
   * Download generated PDF. (Simulated for Netlify)
   */
  downloadPdf: async (uuid, filename) => {
    await new Promise(r => setTimeout(r, 800));
    alert(`📑 Simulación: Descargando ${filename || `${uuid}.pdf`}`);
  },

  // ── SAT Download Management (Legacy) ────────────────────────────────
  /**
   * Request a bulk download from SAT (legacy — simulated).
   * @param {object} params - { type: 'emitidos'|'recibidos', dateStart, dateEnd, requestType }
   */
  requestDownload: (params) => post(`${API_BASE}/download/request`, params),

  /**
   * Verify download request status (legacy).
   */
  verifyDownload: (requestId) => get(`${API_BASE}/download/verify/${requestId}`),

  /**
   * Fetch and process completed packages (legacy).
   */
  fetchPackages: (requestId) => post(`${API_BASE}/download/fetch/${requestId}`),

  /**
   * Get download history (legacy).
   */
  getDownloadHistory: () => get(`${API_BASE}/download/history`),

  // ── SAT Real Pipeline (New — @nodecfdi) ───────────────────────────
  /**
   * Authenticate with SAT using e.firma credentials.
   * @param {string} password - e.firma password
   * @param {string} userId - Supabase user ID
   * @returns {{ success, rfc, certificateExpiration, tokenObtained }}
   */
  satAuthenticate: (password, userId) =>
    post(`${API_BASE}/authenticate`, { password, user_id: userId }),

  /**
   * Request a bulk download from SAT (SolicitaDescarga).
   * @param {object} params - { password, user_id, type, dateStart, dateEnd, requestType }
   * @returns {{ success, data: { requestId, statusCode, message } }}
   */
  satQuery: (params) =>
    post(`${API_BASE}/query`, params),

  /**
   * Verify the status of a SAT download request (VerificaSolicitudDescarga).
   * @param {object} params - { password, user_id, requestId }
   * @returns {{ success, data: { status, packageIds, cfdiCount } }}
   */
  satVerify: (params) =>
    post(`${API_BASE}/verify`, params),

  /**
   * Download and process completed packages from SAT (DescargaMasiva).
   * Extracts XMLs/metadata, parses them, and stores in Supabase.
   * @param {object} params - { password, user_id, packageIds, type }
   * @returns {{ success, data: { totalProcessed, totalErrors } }}
   */
  satDownloadPackages: (params) =>
    post(`${API_BASE}/download-packages`, params),
};
