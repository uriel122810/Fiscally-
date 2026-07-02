// ─── SAT Query (Solicita Descarga) ──────────────────────────────────────
// Netlify Function: Requests a bulk download from the SAT.
// Supports both emitidos and recibidos CFDI downloads.
//
// Uses @nodecfdi/sat-ws-descarga-masiva v2 for the query call.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import {
  Fiel, FielRequestBuilder, Service, HttpsWebClient, ServiceEndpoints,
  QueryParameters, RequestType, DownloadType,
} from '@nodecfdi/sat-ws-descarga-masiva';

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
    const { password, user_id, type, dateStart, dateEnd, requestType = 'metadata' } = body;

    // Validate required fields
    if (!password) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ success: false, error: 'La contraseña de la e.firma es requerida.' }),
      };
    }

    if (!type || !['emitidos', 'recibidos'].includes(type)) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ success: false, error: 'type debe ser "emitidos" o "recibidos".' }),
      };
    }

    if (!dateStart || !dateEnd) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ success: false, error: 'Se requieren dateStart y dateEnd.' }),
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

    // 2. Build service and authenticate
    const service = buildSatService(config.cer_base64, config.key_base64, password);

    // The library handles authentication internally when calling query()
    // But we authenticate explicitly first to catch auth errors early
    await service.authenticate();

    // 3. Build query parameters
    const downloadType = requestType === 'xml' ? DownloadType.xml : DownloadType.metadata;

    const parameters = QueryParameters.create(
      new Date(dateStart),
      new Date(dateEnd),
      downloadType,
      RequestType.cfdi,
    );

    // 4. Execute the query (solicita descarga)
    const result = await service.query(parameters);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        data: {
          requestId: result.getRequestId(),
          statusCode: result.getStatusCode(),
          message: result.getMessage(),
          type,
          dateRange: { start: dateStart, end: dateEnd },
          requestType,
        },
      }),
    };
  } catch (error) {
    console.error('[SAT Query Error]', error);
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Error al solicitar la descarga al SAT.',
      }),
    };
  }
};
