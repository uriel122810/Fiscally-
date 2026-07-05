// ─── SAT Edge Function ──────────────────────────────────────────────────
// Supabase Edge Function (Deno): instancia la e.firma (Fiel) del contribuyente
// a partir de cer_base64/key_base64 (tabla configuracion_sat) + password
// (body), completamente en memoria — sin escribir archivos a disco.
//
// Próximo paso natural (fuera de alcance aquí): con el `Fiel` ya validado,
// construir FielRequestBuilder + HttpsWebClient + ServiceEndpoints.cfdi() +
// Service para llamar authenticate()/query()/verify()/download(), igual que
// ya hacen netlify/functions/sat-authenticate.js, sat-query.js, etc.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import { Fiel } from '@nodecfdi/sat-ws-descarga-masiva';
import { Credential } from '@nodecfdi/credentials';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

const formatPEM = (base64: string, type: 'cer' | 'key') => {
  const cleanBase64 = base64.replace(/^data:.*?;base64,/, '').replace(/\s/g, '');
  const chunks = cleanBase64.match(/.{1,64}/g)?.join('\n') || cleanBase64;
  if (type === 'cer') {
    return `-----BEGIN CERTIFICATE-----\n${chunks}\n-----END CERTIFICATE-----`;
  } else {
    // El SAT usa llaves PKCS#8 encriptadas
    return `-----BEGIN ENCRYPTED PRIVATE KEY-----\n${chunks}\n-----END ENCRYPTED PRIVATE KEY-----`;
  }
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Método no permitido. Usa POST.' });
  }

  // Ruteo mínimo por sub-path. Hoy solo /authenticate está implementado
  // (validación de Fiel). Los otros pasos del pipeline (query/verify/
  // download-packages) ya existen como Netlify Functions
  // (sat-query.js, sat-verify.js, sat-download.js) pero todavía no se
  // portaron aquí — devolvemos un error explícito en vez de una respuesta
  // con forma de éxito pero contenido incorrecto.
  const { pathname } = new URL(req.url);
  if (/\/(query|verify|download-packages)$/.test(pathname)) {
    return jsonResponse({
      success: false,
      notImplemented: true,
      error: 'Esta acción todavía no está implementada en la Edge Function de Supabase. Usa el backend de Netlify mientras tanto.',
    });
  }

  try {
    const { password, user_id } = await req.json();

    if (!password) {
      return jsonResponse({ success: false, error: 'La contraseña de la e.firma es requerida.' });
    }

    const uid = user_id || '00000000-0000-0000-0000-000000000000';

    // SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta automáticamente
    // el runtime de Edge Functions en producción. En local, pasarlas con
    // `supabase functions serve --env-file`.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: config, error: dbError } = await supabase
      .from('configuracion_sat')
      .select('cer_base64, key_base64, rfc')
      .eq('user_id', uid)
      .maybeSingle();

    if (dbError || !config?.cer_base64 || !config?.key_base64) {
      return jsonResponse({
        success: false,
        error: 'No se encontraron las credenciales e.firma. Configúralas primero en Settings.',
      });
    }

    // Base64 (DER) → PEM (texto puro), evitando manipular binarios en Deno.
    const cerPem = formatPEM(config.cer_base64, 'cer');
    const keyPem = formatPEM(config.key_base64, 'key');

    // Fiel: objeto de autenticación para el Web Service de Descarga Masiva.
    const fiel = Fiel.create(cerPem, keyPem, password);

    if (!fiel.isValid()) {
      return jsonResponse({
        success: false,
        error: 'La e.firma (FIEL) no es válida, ha expirado, o es un CSD (no una FIEL).',
      });
    }

    // Credential: metadatos del certificado (rfc, serie, vigencia).
    // OJO: usar Credential.create() (contenido en memoria), NUNCA
    // Credential.openFiles() — pese al nombre "openFiles" acepta rutas de
    // archivo y lee de disco vía node:fs, lo cual rompería en Deno/Edge
    // Functions y viola el requisito de no tocar el sistema de archivos.
    const credential = Credential.create(cerPem, keyPem, password);

    return jsonResponse({
      success: true,
      message: 'Fiel instanciada y validada correctamente.',
      rfc: credential.rfc(),
      isValid: true,
      serialNumber: credential.certificate().serialNumber().bytes(),
      certificateExpiration: credential.certificate().validTo().toISOString(),
    });
  } catch (error) {
    console.error('[SAT Edge Function Error]', error);

    let userMessage = error instanceof Error ? error.message : 'Error interno al procesar la e.firma.';
    if (userMessage.includes('password') || userMessage.includes('decrypt')) {
      userMessage = 'Contraseña de e.firma incorrecta. Verifica e intenta de nuevo.';
    }

    return jsonResponse({ success: false, error: userMessage });
  }
});
