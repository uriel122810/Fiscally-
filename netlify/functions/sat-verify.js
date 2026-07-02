// ─── SAT Verify (VerificaSolicitudDescarga) ─────────────────────────────
// Netlify Function: Checks the status of a download request.
// Returns package IDs when the request is completed (status 3).
//
// SAT Status Codes:
//   1 = Accepted    2 = Processing    3 = Completed (packages ready)
//   4 = Error       5 = Rejected      6 = Expired
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import { Fiel, FielRequestBuilder, Service, HttpsWebClient, ServiceEndpoints } from '@nodecfdi/sat-ws-descarga-masiva';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

function buildSatService(cerBase64, keyBase64, password) {
  const cerBinary = Buffer.from(cerBase64, 'base64').toString('binary');
  const keyBinary = Buffer.from(keyBase64, 'base64').toString('binary');

  const fiel = Fiel.create(cerBinary, keyBinary, password);
  if (!fiel.isValid()) {
    throw new Error('La e.firma (FIEL) no es válida o ha expirado.');
  }

  const requestBuilder = new FielRequestBuilder(fiel);
  const webClient = new HttpsWebClient();
  const endpoints = ServiceEndpoints.cfdi();
  return new Service(requestBuilder, webClient, endpoints);
}

const STATUS_MAP = {
  1: 'accepted',
  2: 'processing',
  3: 'completed',
  4: 'error',
  5: 'rejected',
  6: 'expired',
};

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
    const { password, user_id, requestId } = body;

    if (!password || !requestId) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ success: false, error: 'Se requieren password y requestId.' }),
      };
    }

    // 1. Fetch credentials
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Faltan credenciales de Supabase en el entorno.');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const uid = user_id || '00000000-0000-0000-0000-000000000000';

    const { data: config, error: dbError } = await supabase
      .from('configuracion_sat')
      .select('cer_base64, key_base64')
      .eq('user_id', uid)
      .maybeSingle();

    if (dbError || !config?.cer_base64 || !config?.key_base64) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ success: false, error: 'Credenciales e.firma no encontradas.' }),
      };
    }

    // 2. Build service
    const service = buildSatService(config.cer_base64, config.key_base64, password);

    // 3. Verify the request status
    const result = await service.verify(requestId);

    const statusCode = result.getStatusCode();
    const status = STATUS_MAP[statusCode] || 'unknown';
    const packageIds = result.getPackageIds() || [];
    const cfdiCount = result.getNumberOfCfdis() || 0;

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        data: {
          status,
          statusCode,
          message: result.getMessage(),
          packageIds,
          cfdiCount,
        },
      }),
    };
  } catch (error) {
    console.error('[SAT Verify Error]', error);
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Error al verificar la solicitud.',
      }),
    };
  }
};
