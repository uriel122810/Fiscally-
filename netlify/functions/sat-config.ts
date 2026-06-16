import { createClient } from '@supabase/supabase-js';
import { getStore } from '@netlify/blobs';
import { Credential } from '@nodecfdi/credentials';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Recupera el buffer, retorna nulo de forma segura si no existe (no lanza error).
 */
async function getCredentialSafely(storeName: string, blobKey: string, envPath: string | undefined): Promise<Buffer | null> {
  let base64Data: string | null = null;

  try {
    const store = getStore(storeName);
    base64Data = await store.get(blobKey);
  } catch (err) {
    // Falla limpia si la tienda o blob no existe
  }

  if (base64Data) {
    const cleanBase64 = base64Data.replace(/^data:[a-zA-Z0-9-+/.]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    if (buffer.length > 0) return buffer;
  }

  if (envPath && envPath.trim() !== '') {
    try {
      const resolvedPath = path.resolve(envPath.trim());
      if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
        const fileBuffer = fs.readFileSync(resolvedPath);
        if (fileBuffer.length > 0) return fileBuffer;
      }
    } catch (err) {
      // Ignorar lectura local si falla
    }
  }

  return null;
}

export const handler = async (event: any, context: any) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const cerBuffer = await getCredentialSafely('fiscally-sat-credentials', 'cer_data', process.env.SAT_CER_PATH);
    const keyBuffer = await getCredentialSafely('fiscally-sat-credentials', 'key_data', process.env.SAT_KEY_PATH);

    // Si falta alguno de los archivos, devolvemos un 200 limpio sin crashear el sistema.
    if (!cerBuffer || !keyBuffer) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          cer_configurado: !!cerBuffer,
          key_configurado: !!keyBuffer,
          mensaje: "Credenciales no inicializadas en el almacenamiento."
        })
      };
    }

    const password = process.env.SAT_KEY_PASSWORD;
    if (!password) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          cer_configurado: true,
          key_configurado: true,
          mensaje: "Falta configurar la contraseña de la e.firma (SAT_KEY_PASSWORD)."
        })
      };
    }

    // Extraer metadatos
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
    } catch (err) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          cer_configurado: true,
          key_configurado: true,
          mensaje: `Error descifrando la e.firma: ${err.message}`
        })
      };
    }

    // Opcional: Sincronización con Supabase (comentada si no está configurada para evitar crash)
    if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
      try {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const user_id = event.queryStringParameters?.user_id || '00000000-0000-0000-0000-000000000000';
        
        await supabase.from('configuracion_sat').upsert({
          rfc, user_id, cer_configurado: true, key_configurado: true, serie_certificado, fecha_vencimiento
        }, { onConflict: 'user_id' });
      } catch (err) {
        console.warn('No se pudo guardar en Supabase', err.message);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ rfc, cer_configurado: true, key_configurado: true, fecha_vencimiento })
    };

  } catch (error: any) {
    console.error('[SAT Config Critical Error]', error);
    // Última red de seguridad, devolver un 500 estructurado en formato JSON
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: true, mensaje: 'Error interno del servidor.' })
    };
  }
};
