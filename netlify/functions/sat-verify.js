// ─── SAT Verify (VerificaSolicitudDescarga) ─────────────────────────────
// Netlify Function: Checks the status of a download request.
// Returns package IDs when the request is completed (estadoSolicitud 3).
//
// Misma estructura que sat-query.js: reenvía el JWT del usuario para el RLS,
// lee las credenciales de configuracion_sat e importa la librería SAT de forma
// dinámica (evita el error ESM/CommonJS de Netlify).
//
// estadoSolicitud: 1=Aceptada 2=EnProceso 3=Terminada 4=Error 5=Rechazada 6=Vencida
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

async function buildSatService(cerBase64, keyBase64, password) {
  const { Fiel, FielRequestBuilder, Service, HttpsWebClient, ServiceEndpoints, WebClientException, CResponse } =
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

    const { idSolicitud, password, user_id } = JSON.parse(event.body);

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

    // 2. Build service and verify
    const service = await buildSatService(data[0].cer_base64, data[0].key_base64, password);
    const verifyResult = await service.verify(idSolicitud);

    const status = verifyResult.getStatus();
    const estado = status.getMessage();                        // Ej: "Solicitud recibida con éxito"
    const codigoEstado = verifyResult.getCodeRequest().getValue();     // Ej: 5000
    const estadoSolicitud = verifyResult.getStatusRequest().getValue(); // 1..6
    const paquetes = verifyResult.getPackageIds();             // string[]

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        estado,
        codigoEstado,
        estadoSolicitud,
        paquetes,
      }),
    };
  } catch (error) {
    console.error("Error en verify:", error);
    return {
      statusCode: 400,
      body: JSON.stringify({
        success: false,
        error: error.message || "Error al contactar al SAT"
      })
    };
  }
};
