// ─── SAT API Client ─────────────────────────────────────────────────────
// HTTP client wrapper for all backend SAT API calls.
// Used by React hooks to fetch real CFDI data from the Express backend.
// ─────────────────────────────────────────────────────────────────────────

const API_BASE = '/api/sat';

/**
 * Base fetch wrapper with error handling.
 */
async function request(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
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
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('No se pudo conectar al servidor backend. ¿Está corriendo el servidor en el puerto 3001?');
    }
    throw error;
  }
}

/**
 * GET request helper.
 */
async function get(path, params = {}) {
  const url = new URL(path, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });
  return request(url.toString());
}

/**
 * POST request helper.
 */
async function post(path, body = {}) {
  return request(`${window.location.origin}${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Download file helper — triggers browser download.
 */
async function downloadFile(path, filename) {
  const response = await request(`${window.location.origin}${path}`, {
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
   * Check if the backend server is running.
   */
  health: () => get('/api/health'),

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

    const response = await fetch(`${API_BASE}/auth/upload-efirma`, {
      method: 'POST',
      body: formData,
      // Don't set Content-Type — browser sets it with boundary for FormData
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

  // ── SAT Download Management ───────────────────────────────────────
  /**
   * Request a bulk download from SAT.
   * @param {object} params - { type: 'emitidos'|'recibidos', dateStart, dateEnd, requestType }
   */
  requestDownload: (params) => post(`${API_BASE}/download/request`, params),

  /**
   * Verify download request status.
   */
  verifyDownload: (requestId) => get(`${API_BASE}/download/verify/${requestId}`),

  /**
   * Fetch and process completed packages.
   */
  fetchPackages: (requestId) => post(`${API_BASE}/download/fetch/${requestId}`),

  /**
   * Get download history.
   */
  getDownloadHistory: () => get(`${API_BASE}/download/history`),
};
