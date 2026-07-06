// ─── SAT Query (Solicita Descarga) ──────────────────────────────────────
// Netlify Function: Requests a bulk download from the SAT.
// Supports both emitidos ('issued') and recibidos ('received') CFDI downloads.
//
// Misma estructura que sat-authenticate.js: reenvía el JWT del usuario para el
// RLS, lee las credenciales de configuracion_sat e importa la librería SAT de
// forma dinámica (evita el error ESM/CommonJS de Netlify).
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

async function buildSatService(cerBase64, keyBase64, password) {
  const { Fiel, FielRequestBuilder, Service, HttpsWebClient, ServiceEndpoints } =
    await import('@nodecfdi/sat-ws-descarga-masiva');

  const pureCer = cerBase64.includes(',') ? cerBase64.split(',')[1] : cerBase64;
  const pureKey = keyBase64.includes(',') ? keyBase64.split(',')[1] : keyBase64;

  const cerBinary = Buffer.from(pureCer, 'base64').toString('binary');
  const keyBinary = Buffer.from(pureKey, 'base64').toString('binary');

  const fiel = Fiel.create(cerBinary, keyBinary, password);
  if (!fiel.isValid()) {
    throw new Error('La e.firma (FIEL) no es válida o ha expirado.');
  }

  const requestBuilder = new FielRequestBuilder(fiel);
  const webClient = new HttpsWebClient();
  const endpoints = ServiceEndpoints.cfdi();
  // OJO firma real: (requestBuilder, webClient, currentToken=null, endpoints).
  // El 3er slot es el token; pasar endpoints ahí causa
  // "this._currentToken.isValid is not a function" al hacer query().
  return new Service(requestBuilder, webClient, null, endpoints);
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

    if (!password) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ success: false, error: 'La contraseña de la e.firma es requerida.' }),
      };
    }

    if (!type || !['emitidos', 'recibidos'].includes(type)) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ success: false, error: 'type debe ser "emitidos" o "recibidos".' }),
      };
    }

    if (!dateStart || !dateEnd) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ success: false, error: 'Se requieren dateStart y dateEnd.' }),
      };
    }

    // 1. Fetch credentials — reenviar el JWT del usuario para abrir el RLS.
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Faltan credenciales de Supabase en el entorno.');
    }

    const authHeader = event.headers.authorization || event.headers.Authorization;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const uid = user_id || '00000000-0000-0000-0000-000000000000';

    console.log("UserID recibido:", user_id);

    const { data, error: dbError } = await supabase
      .from('configuracion_sat')
      .select('cer_base64, key_base64')
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

    // 2. Build service and authenticate
    const service = await buildSatService(data[0].cer_base64, data[0].key_base64, password);
    await service.authenticate();

    // 3. Build query parameters con la API real v2:
    //    DownloadType = emitidos('issued') | recibidos('received')
    //    RequestType  = metadata | xml
    const { DateTimePeriod, DownloadType, RequestType, QueryParameters } =
      await import('@nodecfdi/sat-ws-descarga-masiva');

    const period = DateTimePeriod.createFromValues(dateStart, dateEnd);
    const downloadType = type === 'emitidos'
      ? new DownloadType('issued')
      : new DownloadType('received');
    const reqType = requestType === 'xml'
      ? new RequestType('xml')
      : new RequestType('metadata');

    const parameters = QueryParameters.create(period, downloadType, reqType);

    // 4. Execute the query (solicita descarga)
    const queryResult = await service.query(parameters);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        idSolicitud: queryResult.getRequestId(),
        data: {
          requestId: queryResult.getRequestId(),
          statusCode: queryResult.getStatusCode(),
          message: queryResult.getMessage(),
          type,
          dateRange: { start: dateStart, end: dateEnd },
          requestType,
        },
      }),
    };
  } catch (error) {
    console.error('[SAT Query Error]', error);
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Error al solicitar la descarga al SAT.',
      }),
    };
  }
};
