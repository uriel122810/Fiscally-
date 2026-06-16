import { createClient } from '@supabase/supabase-js';
import { Credential } from '@nodecfdi/credentials';
import Busboy from 'busboy';

export const handler = async (event: any, context: any) => {
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

    const contentType = event.headers['content-type'] || event.headers['Content-Type'];
    if (!contentType || !contentType.includes('multipart/form-data')) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: false, error: 'El Content-Type debe ser multipart/form-data.' })
      };
    }

    // 1. Parsear multipart/form-data con busboy
    const parseMultipart = () => new Promise<{ fields: Record<string, string>, files: Record<string, Buffer> }>((resolve, reject) => {
      const fields: Record<string, string> = {};
      const files: Record<string, Buffer> = {};

      const busboy = Busboy({ headers: { 'content-type': contentType } });

      busboy.on('file', (name, file, info) => {
        const chunks: Buffer[] = [];
        file.on('data', (data) => chunks.push(data));
        file.on('end', () => {
          files[name] = Buffer.concat(chunks);
        });
      });

      busboy.on('field', (name, val) => {
        fields[name] = val;
      });

      busboy.on('finish', () => {
        resolve({ fields, files });
      });

      busboy.on('error', (err) => {
        reject(err);
      });

      // En Netlify Functions / AWS Lambda, el event.body para binarios suele estar en base64
      // o como string literal si no fue codificado, usamos la bandera isBase64Encoded
      const buffer = event.isBase64Encoded 
        ? Buffer.from(event.body, 'base64') 
        : Buffer.from(event.body);

      busboy.end(buffer);
    });

    const { fields, files } = await parseMultipart();

    const cerBuffer = files.cer;
    const keyBuffer = files.key;
    const password = fields.password;
    const user_id = fields.user_id; // Puede ser enviado en el FormData

    if (!cerBuffer || !keyBuffer || !password) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: false, error: 'Faltan archivos (.cer, .key) o la contraseña.' })
      };
    }

    // 2. Conversión automática en el Servidor a Base64
    const cer_base64 = cerBuffer.toString('base64');
    const key_base64 = keyBuffer.toString('base64');

    // Extraer datos con NodeCFDI
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
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: false, error: 'Contraseña incorrecta o certificado inválido' })
      };
    }

    // 3. Sincronización Blindada con Supabase y Blobs
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    const uid = user_id || '00000000-0000-0000-0000-000000000000';

    if (supabaseUrl && supabaseKey) {
      // Guardar de forma segura en Netlify Blobs
      try {
        const { getStore } = await import('@netlify/blobs');
        const store = getStore('fiscally-sat-credentials');
        await store.set('cer_data', cer_base64);
        await store.set('key_data', key_base64);
      } catch (blobErr: any) {
        console.warn('Advertencia: No se pudo guardar en Netlify Blobs.', blobErr.message);
      }

      // Upsert en la base de datos de Supabase
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

      if (upsertError) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: false, error: `Error sincronizando base de datos: ${upsertError.message}` })
        };
      }
    } else {
       console.warn("Faltan credenciales de Supabase en el entorno.");
    }

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
    // 4. Manejo Absoluto de Errores: Nunca lanzar excepción del sistema (Evitar el 502)
    console.error('[Upload e.firma Error Global]', error);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Ocurrió un error interno al procesar los archivos.'
      })
    };
  }
};
