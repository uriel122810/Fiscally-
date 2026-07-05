import { createClient } from '@supabase/supabase-js';

export const handler = async (event: any, context: any) => {
  // CORS Headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  // Manejo de pre-flight CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: false, error: 'Método no permitido. Solo se acepta POST.' })
      };
    }

    if (!event.body) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: false, error: 'Cuerpo de la petición vacío.' })
      };
    }

    // 1. Recibir directamente el JSON del body
    // Al enviarse como JSON desde el cliente, evitamos la corrupción de multipart
    let bodyData;
    try {
      bodyData = JSON.parse(event.body);
    } catch (e) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: false, error: 'El cuerpo de la petición debe ser un JSON válido.' })
      };
    }

    const { cer_base64, key_base64, rfc, user_id } = bodyData;

    if (!cer_base64 || !key_base64 || !rfc) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: false, error: 'Faltan datos (cer_base64, key_base64, rfc).' })
      };
    }

    // 2. Pasatubos seguro: sin validación criptográfica aquí (no hay contraseña
    // en este endpoint). Solo limpieza agresiva de prefijos data-URL.
    const pureCer = cer_base64.replace(/^data:.*?;base64,/, '');
    const pureKey = key_base64.replace(/^data:.*?;base64,/, '');

    // 3. Guardar de forma segura en Netlify Blobs y en Supabase (Bloque try/catch impermeable)
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    const uid = user_id || '00000000-0000-0000-0000-000000000000';

    if (supabaseUrl && supabaseKey) {
      try {
        // Almacenar en Netlify Blobs
        const { getStore } = await import('@netlify/blobs');
        const store = getStore('fiscally-sat-credentials');
        await store.set('cer_data', pureCer);
        await store.set('key_data', pureKey);
        
        // Upsert en la tabla 'configuracion_sat' de Supabase
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { error: upsertError } = await supabase
          .from('configuracion_sat')
          .upsert({
            user_id: uid,
            rfc,
            cer_base64: pureCer,
            key_base64: pureKey,
            cer_configurado: true,
            key_configurado: true
          }, { onConflict: 'user_id' });

        if (upsertError) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: false, error: `Error sincronizando base de datos: ${upsertError.message}` })
          };
        }
      } catch (storageError: any) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: false, error: 'Error guardando los datos en la nube (Blobs/Supabase).' })
        };
      }
    } else {
       console.warn("Faltan credenciales de Supabase en el entorno.");
    }

    // Respuesta exitosa
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        cer_configurado: true,
        key_configurado: true
      })
    };

  } catch (error: any) {
    // 4. Manejo Absoluto de Errores: NUNCA lanzar excepción que tumbe el servidor
    console.error('[Upload e.firma Error Global]', error);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Ocurrió un error inesperado al procesar la solicitud.'
      })
    };
  }
};
