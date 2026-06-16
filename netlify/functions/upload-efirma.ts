import { createClient } from '@supabase/supabase-js';
import { Credential } from '@nodecfdi/credentials';

export const handler = async (event: any, context: any) => {
  // CORS Headers requeridos
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    if (event.httpMethod !== 'POST') {
      throw new Error('Método no permitido. Solo se acepta POST.');
    }

    if (!event.body) {
      throw new Error('Cuerpo de la petición vacío.');
    }

    const { cer_base64, key_base64, password, user_id } = JSON.parse(event.body);

    if (!cer_base64 || !key_base64 || !password) {
      throw new Error('Faltan datos requeridos (cer_base64, key_base64, o password).');
    }

    // 1. Validar y transformar Base64 a Buffer
    const cerBuffer = Buffer.from(cer_base64, 'base64');
    const keyBuffer = Buffer.from(key_base64, 'base64');

    if (cerBuffer.length === 0 || keyBuffer.length === 0) {
      throw new Error('Los archivos enviados están vacíos o corruptos.');
    }

    // 2. Desencriptar y Extraer con NodeCFDI
    let rfc, serie_certificado, fecha_vencimiento;
    try {
      const credential = Credential.openFiles(
        cerBuffer.toString('binary'),
        keyBuffer.toString('binary'),
        password
      );

      rfc = credential.rfc();
      serie_certificado = credential.certificate().serialNumber().bytes();
      fecha_vencimiento = credential.certificate().validTo().toISOString();
    } catch (parseError: any) {
      throw new Error(`Contraseña incorrecta o llaves inválidas: ${parseError.message}`);
    }

    // 3. Opcional: Persistir buffers en Netlify Blobs en producción
    // En tu arquitectura, ya habías migrado a Blobs ('fiscally-sat-credentials').
    // Para simplificar esta migración, aquí los almacenamos también allí por consistencia,
    // o simplemente actualizamos Supabase.
    // Usaremos Supabase obligatoriamente.
    
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    const uid = user_id || '00000000-0000-0000-0000-000000000000';

    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const { error: upsertError } = await supabase
        .from('configuracion_sat')
        .upsert({
          rfc,
          user_id: uid,
          cer_configurado: true,
          key_configurado: true,
          serie_certificado,
          fecha_vencimiento
        }, { onConflict: 'user_id' });

      if (upsertError) throw new Error(`Error guardando en BD: ${upsertError.message}`);
      
      // NOTA: Para una integración perfecta (como mencionas "evitar límites de Netlify"),
      // Idealmente, se guardan las llaves en los Blobs aquí mismo si es producción, 
      // para que sat-config.ts los pueda leer.
      try {
        const { getStore } = await import('@netlify/blobs');
        const store = getStore('fiscally-sat-credentials');
        await store.set('cer_data', cer_base64);
        await store.set('key_data', key_base64);
      } catch (blobErr) {
        console.warn('Advertencia: No se pudo actualizar Netlify Blobs.', blobErr.message);
      }
    }

    // 4. Formato Estricto de Respuesta para la UI
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        rfc,
        cer_configurado: true,
        key_configurado: true,
        fecha_vencimiento,
        status: 'configurado'
      })
    };

  } catch (error: any) {
    console.error('[Upload e.firma Error]', error.message);
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: true,
        message: error.message
      })
    };
  }
};
