import { createClient } from '@supabase/supabase-js';
import { Credential } from '@nodecfdi/credentials';

export const handler = async (event, context) => {
  // CORS Headers
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
      return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: 'Método no permitido. Usa POST.' }) };
    }

    let bodyData = {};
    if (event.body) {
      try {
        bodyData = JSON.parse(event.body);
      } catch (e) {
        // Ignorar error de parseo, tal vez no mandaron nada
      }
    }

    const password = bodyData.password;
    const user_id = bodyData.user_id || '00000000-0000-0000-0000-000000000000'; // Extraer del token en prod

    if (!password) {
      return {
        statusCode: 200, // Status 200 para evitar 502/400 duros en Netlify
        headers,
        body: JSON.stringify({ success: false, error: 'La contraseña de la e.firma es requerida para usar el certificado.' })
      };
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Faltan credenciales de Supabase en el entorno del servidor.');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Obtener la configuracion_sat desde Supabase
    const { data: configData, error: dbError } = await supabase
      .from('configuracion_sat')
      .select('cer_base64, key_base64')
      .eq('user_id', user_id)
      .maybeSingle();

    if (dbError || !configData || !configData.cer_base64 || !configData.key_base64) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: false, error: 'No se encontraron las credenciales e.firma para este usuario. Configúralas primero.' })
      };
    }

    // 2. Reconstruir los Buffers binarios en memoria a partir del Base64
    const cerBuffer = Buffer.from(configData.cer_base64, 'base64');
    const keyBuffer = Buffer.from(configData.key_base64, 'base64');

    // 3. Probar la e.firma y extraer datos reales
    let rfc, serie_certificado;
    try {
      const credential = Credential.openFiles(
        cerBuffer.toString('binary'),
        keyBuffer.toString('binary'),
        password
      );

      rfc = credential.rfc();
      serie_certificado = credential.certificate().serialNumber().bytes();

    } catch (authError) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: false, error: 'Contraseña de e.firma incorrecta o archivos corruptos.' })
      };
    }

    // 4. Aquí iría el código real para comunicarse con el SAT Web Service (ej. FielApiClient)
    // usando rfc, cerBuffer, keyBuffer y password.
    // ...

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `Conexión al SAT simulada con éxito para RFC: ${rfc}`,
        serie_certificado,
        requestId: 'REQ-MOCK-' + Math.floor(Math.random() * 1000000),
        status: 'accepted'
      })
    };

  } catch (error) {
    console.error('[SAT Download Error]', error);
    // Manejo absoluto para evitar 502/Crash
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Error interno al procesar la solicitud de descarga.'
      })
    };
  }
};
