import { createClient } from '@supabase/supabase-js';
import { getStore } from '@netlify/blobs';
import { Credential } from '@nodecfdi/credentials';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 1. Comportamiento Híbrido Avanzado
 * Intenta recuperar el archivo desde Netlify Blobs (Producción).
 * Si falla o no está configurado, intenta leer la ruta física del .env (Local).
 */
async function resolveCredentialHybrid(
  storeName: string,
  blobKey: string,
  envPath: string | undefined,
  type: string
): Promise<Buffer> {
  let base64Data: string | null = null;

  try {
    // A) Intentar desde Netlify Blobs (Producción)
    const store = getStore(storeName);
    base64Data = await store.get(blobKey);
  } catch (err) {
    // Blobs API puede fallar en entorno local si no se usa netlify dev
    console.warn(`[Blobs] No se pudo acceder al blob '${blobKey}' en '${storeName}'. Modo fallback.`);
  }

  // Si encontró data en Blobs, la convertimos
  if (base64Data) {
    // Netlify Blobs puede retornar el string con el prefijo "data:application..." 
    // dependiendo de cómo se guardó, limpiamos por seguridad:
    const cleanBase64 = base64Data.replace(/^data:[a-zA-Z0-9-+/.]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    
    if (buffer.length > 0) return buffer;
  }

  // B) Fallback: Intentar leer desde la ruta local (Desarrollo)
  if (envPath && envPath.trim() !== '') {
    try {
      const resolvedPath = path.resolve(envPath.trim());
      if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
        const fileBuffer = fs.readFileSync(resolvedPath);
        if (fileBuffer.length > 0) return fileBuffer;
      }
    } catch (err) {
      console.warn(`[LocalFS] Error leyendo archivo físico: ${err.message}`);
    }
  }

  throw new Error(`Falta configurar o el contenido está vacío para: ${type}. No se encontró ni en Netlify Blobs ni en ruta local.`);
}

/**
 * Netlify Function handler
 */
export const handler = async (event: any, context: any) => {
  // CORS Headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const password = process.env.SAT_KEY_PASSWORD;
    if (!password) {
      throw new Error('Falta configurar la contraseña de la e.firma (SAT_KEY_PASSWORD).');
    }

    // 1. Resolver Buffers de forma Híbrida
    const cerBuffer = await resolveCredentialHybrid('fiscally-sat-credentials', 'cer_data', process.env.SAT_CER_PATH, 'CERTIFICADO (.cer)');
    const keyBuffer = await resolveCredentialHybrid('fiscally-sat-credentials', 'key_data', process.env.SAT_KEY_PATH, 'LLAVE PRIVADA (.key)');

    // 2. Extraer metadatos usando @nodecfdi/credentials
    let rfc, serie_certificado, fecha_vencimiento;
    try {
      // openFiles espera strings binarios en vez de Buffer nativo para Node < 16, pero con Buffer moderno lo pasamos directo convirtiéndolo a cadena binaria.
      const credential = Credential.openFiles(
        cerBuffer.toString('binary'),
        keyBuffer.toString('binary'),
        password
      );

      rfc = credential.rfc();
      serie_certificado = credential.certificate().serialNumber().bytes();
      fecha_vencimiento = credential.certificate().validTo().toISOString(); // formato ISO
    } catch (err) {
      throw new Error(`Error descifrando la e.firma (¿contraseña incorrecta?): ${err.message}`);
    }

    // 3. Inicializar Cliente de Supabase
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Las credenciales de Supabase no están configuradas en el entorno.');
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Obtener user_id (En un sistema real, este ID viene del JWT del usuario autenticado)
    // Usaremos un identificador o simularemos uno para poder hacer upsert con el RFC como fallback de identidad.
    const user_id = event.queryStringParameters?.user_id || '00000000-0000-0000-0000-000000000000'; // Fallback simulado para la prueba

    // 4. Sincronización (Upsert) en Supabase
    const payload = {
      rfc,
      user_id, // Necesario si la tabla asocia la configuración a un usuario
      cer_configurado: true,
      key_configurado: true,
      serie_certificado,
      fecha_vencimiento
    };

    // Upsert usando la llave primaria (user_id) o la llave única (rfc)
    const { error: upsertError } = await supabase
      .from('configuracion_sat')
      .upsert(payload, { onConflict: 'user_id' }); // Cambiar 'user_id' por 'rfc' si el rfc es el constraint único real

    if (upsertError) {
      throw new Error(`Error guardando en Supabase: ${upsertError.message}`);
    }

    // 5. Respuesta Limpia Estructurada
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        rfc,
        cer_configurado: true,
        key_configurado: true,
        fecha_vencimiento
      }),
    };

  } catch (error: any) {
    console.error('[SAT Config Error]', error.message);
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: true,
        message: error.message
      }),
    };
  }
};
