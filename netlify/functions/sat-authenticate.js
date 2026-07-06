// ─── SAT Authenticate ───────────────────────────────────────────────────
// Netlify Function: Authenticates with the SAT Descarga Masiva WS
// using the user's e.firma stored in Supabase.
//
// Uses @nodecfdi/sat-ws-descarga-masiva v2 for correct SOAP/WS-Security.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

// CORS headers for all responses
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

/**
 * Build the SAT service from Base64-encoded credentials stored in Supabase.
 * 
 * Fiel.create() expects the raw binary content of .cer and .key files
 * read as 'binary' encoding (latin1 string), plus the password.
 * 
 * @param {string} cerBase64 - Base64-encoded .cer file content
 * @param {string} keyBase64 - Base64-encoded .key file content (encrypted PKCS#8)
 * @param {string} password - Password to decrypt the .key file
 * @returns {{ service: Service, fiel: Fiel }}
 */
async function buildSatService(cerBase64, keyBase64, password) {
  // Importación dinámica para evitar el error ESM/CommonJS de Netlify
  // (require of ES Module not supported) con @nodecfdi/sat-ws-descarga-masiva.
  const { Fiel, FielRequestBuilder, Service, HttpsWebClient, ServiceEndpoints } =
    await import('@nodecfdi/sat-ws-descarga-masiva');

  // Limpiar prefijo data-URL si viene del frontend
  const pureCer = cerBase64.includes(',') ? cerBase64.split(',')[1] : cerBase64;
  const pureKey = keyBase64.includes(',') ? keyBase64.split(',')[1] : keyBase64;

  // Decode Base64 → Buffer → binary string (latin1, as expected by Fiel.create)
  const cerBinary = Buffer.from(pureCer, 'base64').toString('binary');
  const keyBinary = Buffer.from(pureKey, 'base64').toString('binary');

  // Create FIEL directly from binary content (v2 API)
  const fiel = Fiel.create(cerBinary, keyBinary, password);

  if (!fiel.isValid()) {
    throw new Error('La e.firma (FIEL) no es válida, ha expirado, o es un CSD (no una FIEL).');
  }

  // Build the service with CFDI endpoints (not retenciones)
  const requestBuilder = new FielRequestBuilder(fiel);
  const webClient = new HttpsWebClient();
  const endpoints = ServiceEndpoints.cfdi();
  const service = new Service(requestBuilder, webClient, endpoints);

  return { service, fiel };
}

export { buildSatService, CORS_HEADERS };

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ success: false, error: 'Método no permitido. Usa POST.' }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const { password, user_id } = body;

    if (!password) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error: 'La contraseña de la e.firma es requerida.',
        }),
      };
    }

    // 1. Fetch credentials from Supabase
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Faltan credenciales de Supabase en el entorno del servidor.');
    }

    // Reenviar el JWT del usuario para que Supabase abra el candado del RLS.
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const uid = user_id || '00000000-0000-0000-0000-000000000000';

    console.log("UserID recibido:", user_id);

    const { data, error: dbError } = await supabase
      .from('configuracion_sat')
      .select('cer_base64, key_base64, rfc')
      .eq('user_id', uid)
      .limit(1);

    if (dbError || !data || data.length === 0 || !data[0].cer_base64 || !data[0].key_base64) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error: 'Error en BD o permisos RLS: ' + (dbError?.message || 'No data'),
        }),
      };
    }

    const config = data[0];

    // 2. Build the SAT service and authenticate
    const { service, fiel } = await buildSatService(
      config.cer_base64,
      config.key_base64,
      password,
    );

    // 3. Authenticate with the SAT WS — obtains a token valid for ~5 min
    const authResult = await service.authenticate();

    // Extract RFC and certificate info from the FIEL
    let rfc = config.rfc || 'N/A';
    try { rfc = fiel.getRfc(); } catch { /* use DB rfc */ }

    let certificateExpiration = null;
    try { certificateExpiration = fiel.getCertificate().validTo().toISOString(); } catch { /* ignore */ }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        message: `Autenticación exitosa con el SAT para RFC: ${rfc}`,
        rfc,
        certificateExpiration,
        tokenObtained: true,
      }),
    };
  } catch (error) {
    console.error('[SAT Authenticate Error]', error);

    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: error.message || 'Error interno desconocido' }),
    };
  }
};
