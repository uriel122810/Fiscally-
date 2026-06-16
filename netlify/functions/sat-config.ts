import { createClient } from '@supabase/supabase-js';
import { getStore } from '@netlify/blobs';
import { Credential } from '@nodecfdi/credentials';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Lógica híbrida para leer las llaves de la e.firma
 * Retorna null si el archivo/blob no existe o está vacío
 */
async function loadCredentialSafely(blobKey: string, defaultLocalPath: string, type: string): Promise<Buffer | null> {
  // 1. Entorno de Desarrollo (Archivos Locales)
  if (process.env.NODE_ENV === 'development') {
    const localPath = process.env[blobKey === 'cer_data' ? 'SAT_CER_PATH' : 'SAT_KEY_PATH'] || defaultLocalPath;
    try {
      const resolvedPath = path.resolve(localPath);
      if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
        const fileBuffer = fs.readFileSync(resolvedPath);
        if (fileBuffer.length > 0) return fileBuffer;
      }
    } catch (error) {
      console.warn(`[Local] No se pudo leer ${type} en ${localPath}`);
    }
    return null; // En dev, si falla local, no intentamos blobs
  }

  // 2. Entorno de Producción (Netlify Blobs)
  try {
    const store = getStore('fiscally-sat-credentials');
    const base64Data = await store.get(blobKey);
    
    if (base64Data) {
      const cleanBase64 = base64Data.replace(/^data:[a-zA-Z0-9-+/.]+;base64,/, '');
      const buffer = Buffer.from(cleanBase64, 'base64');
      if (buffer.length > 0) return buffer;
    }
  } catch (error) {
    console.warn(`[Blobs] No se pudo leer ${blobKey} del almacén.`);
  }

  return null;
}

export const handler = async (event: any, context: any) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  // Respuesta base por defecto si todo falla o está vacío
  const defaultResponse = {
    rfc: event.queryStringParameters?.rfc || 'No Configurado',
    cer_configurado: false,
    key_configurado: false,
    fecha_vencimiento: null,
    status: 'pendiente_de_carga'
  };

  try {
    // A) Configurar Cliente Supabase
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    let supabase = null;
    let existingConfig = null;
    
    const user_id = event.queryStringParameters?.user_id || '00000000-0000-0000-0000-000000000000';
    const rfcQuery = event.queryStringParameters?.rfc;

    if (supabaseUrl && supabaseKey) {
      supabase = createClient(supabaseUrl, supabaseKey);
      
      // Consultar estado previo en BD para consistencia
      const query = supabase.from('configuracion_sat').select('rfc, cer_configurado, key_configurado, fecha_vencimiento');
      if (rfcQuery) {
        query.eq('rfc', rfcQuery);
      } else {
        query.eq('user_id', user_id);
      }
      
      const { data } = await query.single();
      if (data) existingConfig = data;
    }

    // B) Obtener Buffers Híbridos
    const cerBuffer = await loadCredentialSafely('cer_data', 'server/efirma/archivo.cer', 'Certificado');
    const keyBuffer = await loadCredentialSafely('key_data', 'server/efirma/archivo.key', 'Llave Privada');

    // C) Validar que existan ambos
    if (!cerBuffer || !keyBuffer) {
      // Si tenemos info en la BD (aunque los blobs falten temporalmente en caché), devolvemos lo que sabe la BD
      if (existingConfig) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            rfc: existingConfig.rfc,
            cer_configurado: existingConfig.cer_configurado,
            key_configurado: existingConfig.key_configurado,
            fecha_vencimiento: existingConfig.fecha_vencimiento,
            status: (existingConfig.cer_configurado && existingConfig.key_configurado) ? 'configurado' : 'pendiente_de_carga',
            mensaje: 'Credenciales pendientes de inicializar en blobs, mostrando estado de BD.'
          })
        };
      }

      // Si no hay nada ni en blobs ni en BD, retornamos default limpio
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ...defaultResponse,
          mensaje: 'Credenciales no inicializadas en el almacenamiento.'
        })
      };
    }

    // D) Procesar credenciales con @nodecfdi/credentials si encontramos los archivos
    const password = process.env.SAT_KEY_PASSWORD;
    if (!password) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ...defaultResponse,
          cer_configurado: true,
          key_configurado: true,
          mensaje: 'Archivos encontrados, pero falta configurar la contraseña de la e.firma (SAT_KEY_PASSWORD).'
        })
      };
    }

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
        body: JSON.stringify({
          ...defaultResponse,
          cer_configurado: true,
          key_configurado: true,
          mensaje: `Error descifrando la e.firma: ${parseError.message}`
        })
      };
    }

    // E) Sincronizar exitosamente con Supabase
    if (supabase) {
      await supabase.from('configuracion_sat').upsert({
        rfc,
        user_id,
        cer_configurado: true,
        key_configurado: true,
        serie_certificado,
        fecha_vencimiento
      }, { onConflict: 'user_id' }).catch(() => { /* ignorar fallo silencioso de BD */ });
    }

    // F) Retornar estado final exitoso
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

  } catch (globalError: any) {
    console.error('[Global SAT Config Catch]', globalError);
    // Bloque Try/Catch Global Impermeable garantizado a retornar 200
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ...defaultResponse,
        mensaje: `Error global capturado: ${globalError.message}`
      })
    };
  }
};
