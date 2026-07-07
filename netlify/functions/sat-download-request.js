// ─── SAT Download Request (Legacy / Deprecated) ────────────────────────
// This function now redirects to the new sat-authenticate pipeline.
// Kept for backward compatibility with any existing frontend calls.
//
// Use the new pipeline instead:
//   1. POST /api/sat/authenticate
//   2. POST /api/sat/query
//   3. POST /api/sat/verify
//   4. POST /api/sat/download-packages
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import { Fiel, FielRequestBuilder, Service, HttpsWebClient, ServiceEndpoints, WebClientException, CResponse } from '@nodecfdi/sat-ws-descarga-masiva';

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 200, headers, body: JSON.stringify({ success: false, error: 'Método no permitido. Usa POST.' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const { password, user_id } = body;

    if (!password) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: false, error: 'La contraseña de la e.firma es requerida.' }),
      };
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Faltan credenciales de Supabase en el entorno del servidor.');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const uid = user_id || '00000000-0000-0000-0000-000000000000';

    const { data: config, error: dbError } = await supabase
      .from('configuracion_sat')
      .select('cer_base64, key_base64, rfc')
      .eq('user_id', uid)
      .maybeSingle();

    if (dbError || !config?.cer_base64 || !config?.key_base64) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: false, error: 'Credenciales e.firma no encontradas.' }),
      };
    }

    // Use the correct @nodecfdi API to validate credentials
    const cerBinary = Buffer.from(config.cer_base64, 'base64').toString('binary');
    const keyBinary = Buffer.from(config.key_base64, 'base64').toString('binary');

    const fiel = Fiel.create(cerBinary, keyBinary, password);

    if (!fiel.isValid()) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: false, error: 'La e.firma no es válida o ha expirado.' }),
      };
    }

    // Authenticate with SAT
    const requestBuilder = new FielRequestBuilder(fiel);
    const webClient = new HttpsWebClient();

    // FIX bug de la librería: en timeouts (HttpsWebClient sin _timeout) rechaza con
    // un Error plano; ServiceConsumer luego llama webError.getResponse() y crashea
    // con "webError.getResponse is not a function". Normalizamos cualquier rechazo
    // que no sea WebClientException a uno válido, preservando el mensaje real.
    const originalCall = webClient.call.bind(webClient);
    webClient.call = async (request) => {
      try {
        return await originalCall(request);
      } catch (error) {
        if (typeof error?.getResponse === 'function') throw error;
        const message = error?.message || 'Error de red al contactar al SAT';
        // TIMEOUT_CODE hace que checkErrors() lance HttpTimeoutError con el mensaje.
        throw new WebClientException(message, request, new CResponse(CResponse.TIMEOUT_CODE, message, {}));
      }
    };

    const endpoints = ServiceEndpoints.cfdi();
    // OJO firma real: (requestBuilder, webClient, currentToken=null, endpoints).
    const service = new Service(requestBuilder, webClient, null, endpoints);

    await service.authenticate();

    let rfc = config.rfc || 'N/A';
    try { rfc = fiel.getRfc(); } catch { /* use DB rfc */ }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `Conexión al SAT exitosa para RFC: ${rfc}`,
        rfc,
        status: 'authenticated',
        info: 'Este endpoint es legacy. Usa /api/sat/authenticate para el nuevo pipeline.',
      }),
    };
  } catch (error) {
    console.error('[SAT Download Request Error]', error);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Error interno al procesar la solicitud.',
      }),
    };
  }
};
