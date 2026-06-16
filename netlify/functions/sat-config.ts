import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Utility to resolve credential content hybridly (Base64 from Netlify env, or File Path locally).
 */
function resolveCredentialContent(envValue: string | undefined, type: string = 'credencial'): Buffer {
  if (!envValue || envValue.trim() === '') {
    throw new Error(`Falta configurar la variable de entorno para: ${type}`);
  }

  const value = envValue.trim();

  // 1. Try resolving as a local file path (Development mode)
  try {
    const resolvedPath = path.resolve(value);
    if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
      return fs.readFileSync(resolvedPath);
    }
  } catch (err) {
    // Ignore error, fallback to Base64
  }

  // 2. Try parsing as a Base64 string (Production mode)
  const base64Data = value.replace(/^data:[a-zA-Z0-9-+/.]+;base64,/, '');
  const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;

  if (!base64Regex.test(base64Data)) {
    throw new Error(`El valor para ${type} no es una ruta física válida ni un Base64 válido.`);
  }

  const buffer = Buffer.from(base64Data, 'base64');
  if (buffer.length === 0) {
    throw new Error(`La decodificación de ${type} resultó en un archivo vacío.`);
  }

  return buffer;
}

/**
 * Netlify Function handler for SAT configuration.
 */
export const handler = async (event, context) => {
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
    // 1. Resolve Hybrid Credentials
    // This will throw a clean error if they are missing or invalid
    const cerBuffer = resolveCredentialContent(process.env.SAT_CER_PATH, 'CERTIFICADO (.cer)');
    const keyBuffer = resolveCredentialContent(process.env.SAT_KEY_PATH, 'LLAVE PRIVADA (.key)');
    
    if (!process.env.SAT_KEY_PASSWORD) {
      throw new Error('Falta configurar la contraseña de la e.firma (SAT_KEY_PASSWORD).');
    }

    // 2. Initialize Supabase Client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Las credenciales de Supabase no están configuradas en el entorno.');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 3. Query the configuration table
    // Assuming the frontend passed an RFC or User ID via query string or body
    const rfcQuery = event.queryStringParameters?.rfc || process.env.SAT_RFC;

    if (!rfcQuery) {
      throw new Error('No se especificó un RFC para consultar la configuración.');
    }

    const { data: configData, error: dbError } = await supabase
      .from('configuracion_sat')
      .select('rfc, fecha_vencimiento')
      .eq('rfc', rfcQuery)
      .single();

    if (dbError && dbError.code !== 'PGRST116') {
      // Ignore not found errors to return a default structure, but throw on real errors
      throw new Error(`Error consultando Supabase: ${dbError.message}`);
    }

    // 4. Return the standardized JSON structure
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        rfc: configData?.rfc || rfcQuery,
        cer_configurado: cerBuffer.length > 0,
        key_configurado: keyBuffer.length > 0,
        fecha_vencimiento: configData?.fecha_vencimiento || null
      }),
    };

  } catch (error) {
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
