// ─── SAT Download (DescargaMasiva) ──────────────────────────────────────
// Netlify Function: Downloads a completed package from the SAT,
// extracts the XML files from the ZIP, parses them, and stores
// the invoice data in Supabase.
//
// This is the final step of the Descarga Masiva lifecycle.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import { Fiel, FielRequestBuilder, Service, HttpsWebClient, ServiceEndpoints } from '@nodecfdi/sat-ws-descarga-masiva';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

function buildSatService(cerBase64, keyBase64, password) {
  const cerBinary = Buffer.from(cerBase64, 'base64').toString('binary');
  const keyBinary = Buffer.from(keyBase64, 'base64').toString('binary');

  const fiel = Fiel.create(cerBinary, keyBinary, password);
  if (!fiel.isValid()) {
    throw new Error('La e.firma (FIEL) no es válida o ha expirado.');
  }

  const requestBuilder = new FielRequestBuilder(fiel);
  const webClient = new HttpsWebClient();
  const endpoints = ServiceEndpoints.cfdi();
  // OJO firma real: (requestBuilder, webClient, currentToken=null, endpoints).
  return new Service(requestBuilder, webClient, null, endpoints);
}

/**
 * Parse a metadata line from SAT metadata download.
 * SAT metadata is tilde-delimited (~).
 */
function parseMetadataLine(line) {
  const fields = line.split('~');
  return {
    uuid: fields[0]?.trim() || '',
    rfc_emisor: fields[1]?.trim() || '',
    nombre_emisor: fields[2]?.trim() || '',
    rfc_receptor: fields[3]?.trim() || '',
    nombre_receptor: fields[4]?.trim() || '',
    rfc_pac: fields[5]?.trim() || '',
    fecha_emision: fields[6]?.trim() || '',
    fecha_certificacion: fields[7]?.trim() || '',
    monto: parseFloat(fields[8]?.trim() || '0'),
    efecto: fields[9]?.trim() || '',
    estatus: fields[10]?.trim() || '',
    fecha_cancelacion: fields[11]?.trim() || '',
  };
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

    const body = JSON.parse(event.body || '{}');
    const { password, user_id, packageIds, type = 'emitidos' } = body;

    if (!password || !packageIds || !Array.isArray(packageIds) || packageIds.length === 0) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error: 'Se requieren password y packageIds (array).',
        }),
      };
    }

    // 1. Fetch credentials
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Faltan credenciales de Supabase en el entorno.');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const uid = user_id || '00000000-0000-0000-0000-000000000000';

    const { data: config, error: dbError } = await supabase
      .from('configuracion_sat')
      .select('cer_base64, key_base64, rfc')
      .eq('user_id', uid)
      .maybeSingle();

    if (dbError || !config?.cer_base64 || !config?.key_base64) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ success: false, error: 'Credenciales e.firma no encontradas.' }),
      };
    }

    // 2. Build service
    const service = buildSatService(config.cer_base64, config.key_base64, password);

    const direction = type === 'emitidos' ? 'emitida' : 'recibida';
    let totalProcessed = 0;
    let totalErrors = 0;

    // 3. Download each package
    for (const packageId of packageIds) {
      try {
        const downloadResult = await service.download(packageId);
        const packageContent = downloadResult.getPackageContent();

        // The content is Base64-encoded — decode it
        const contentBuffer = Buffer.from(packageContent, 'base64');

        // Determine if it's metadata (text) or XML (zip)
        // Metadata downloads come as plain text with tilde-separated values
        const contentString = contentBuffer.toString('utf-8');

        if (contentString.includes('~') && !contentString.includes('<?xml')) {
          // Metadata format — parse line by line
          const lines = contentString.split('\n').filter(l => l.trim().length > 0);

          for (const line of lines) {
            try {
              const parsed = parseMetadataLine(line);
              if (!parsed.uuid) continue;

              // Insert into Supabase facturas table
              const { error: insertError } = await supabase
                .from('facturas')
                .upsert({
                  uuid_cfdi: parsed.uuid,
                  user_id: uid,
                  rfc_emisor: parsed.rfc_emisor,
                  rfc_receptor: parsed.rfc_receptor,
                  nombre_emisor: parsed.nombre_emisor,
                  nombre_receptor: parsed.nombre_receptor,
                  fecha: parsed.fecha_emision,
                  fecha_timbrado: parsed.fecha_certificacion,
                  total: parsed.monto,
                  direction,
                  sat_status: parsed.estatus?.toLowerCase() === 'cancelado' ? 'cancelada' : 'vigente',
                  tipo_comprobante: parsed.efecto || 'I',
                  source: 'sat_descarga',
                  updated_at: new Date().toISOString(),
                }, { onConflict: 'uuid_cfdi' });

              if (insertError) {
                console.error(`Error inserting ${parsed.uuid}:`, insertError.message);
                totalErrors++;
              } else {
                totalProcessed++;
              }
            } catch (lineError) {
              console.error('Error parsing metadata line:', lineError.message);
              totalErrors++;
            }
          }
        } else {
          // ZIP format (XML download) — would need AdmZip
          // For now, try to process as individual XML or skip
          console.log(`Package ${packageId}: ZIP format detected (${contentBuffer.length} bytes). XML parsing requires AdmZip.`);
          
          // Try to dynamically import AdmZip if available
          try {
            const AdmZip = (await import('adm-zip')).default;
            const zip = new AdmZip(contentBuffer);
            const entries = zip.getEntries();

            for (const entry of entries) {
              if (entry.isDirectory || !entry.entryName.endsWith('.xml')) continue;
              
              try {
                const xmlContent = entry.getData().toString('utf-8');
                
                // Extract UUID from XML (simple regex extraction)
                const uuidMatch = xmlContent.match(/UUID="([^"]+)"/i);
                const uuid = uuidMatch ? uuidMatch[1] : null;
                
                if (!uuid) {
                  totalErrors++;
                  continue;
                }

                // Extract key fields with regex (lightweight, no full parser needed)
                const rfcEmisor = xmlContent.match(/Rfc="([^"]+)".*?Emisor/s)?.[1] || 
                                  xmlContent.match(/cfdi:Emisor[^>]*Rfc="([^"]+)"/)?.[1] || '';
                const rfcReceptor = xmlContent.match(/cfdi:Receptor[^>]*Rfc="([^"]+)"/)?.[1] || '';
                const nombreEmisor = xmlContent.match(/cfdi:Emisor[^>]*Nombre="([^"]+)"/)?.[1] || '';
                const nombreReceptor = xmlContent.match(/cfdi:Receptor[^>]*Nombre="([^"]+)"/)?.[1] || '';
                const total = parseFloat(xmlContent.match(/Total="([^"]+)"/)?.[1] || '0');
                const subtotal = parseFloat(xmlContent.match(/SubTotal="([^"]+)"/)?.[1] || '0');
                const fecha = xmlContent.match(/Fecha="([^"]+)"/)?.[1] || '';
                const tipoComprobante = xmlContent.match(/TipoDeComprobante="([^"]+)"/)?.[1] || 'I';
                const moneda = xmlContent.match(/Moneda="([^"]+)"/)?.[1] || 'MXN';
                const serie = xmlContent.match(/Serie="([^"]+)"/)?.[1] || '';
                const folio = xmlContent.match(/Folio="([^"]+)"/)?.[1] || '';
                const formaPago = xmlContent.match(/FormaPago="([^"]+)"/)?.[1] || '';
                const metodoPago = xmlContent.match(/MetodoPago="([^"]+)"/)?.[1] || '';

                const { error: insertError } = await supabase
                  .from('facturas')
                  .upsert({
                    uuid_cfdi: uuid,
                    user_id: uid,
                    rfc_emisor: rfcEmisor,
                    rfc_receptor: rfcReceptor,
                    nombre_emisor: nombreEmisor,
                    nombre_receptor: nombreReceptor,
                    fecha,
                    total,
                    subtotal,
                    direction,
                    sat_status: 'vigente',
                    tipo_comprobante: tipoComprobante,
                    moneda,
                    serie,
                    folio,
                    forma_pago: formaPago,
                    metodo_pago: metodoPago,
                    xml_content: xmlContent,
                    source: 'sat_descarga',
                    updated_at: new Date().toISOString(),
                  }, { onConflict: 'uuid_cfdi' });

                if (insertError) {
                  console.error(`Error inserting ${uuid}:`, insertError.message);
                  totalErrors++;
                } else {
                  totalProcessed++;
                }
              } catch (xmlError) {
                console.error(`Error parsing XML ${entry.entryName}:`, xmlError.message);
                totalErrors++;
              }
            }
          } catch (zipError) {
            console.error('AdmZip not available or ZIP processing failed:', zipError.message);
            totalErrors++;
          }
        }

        console.log(`📦 Package ${packageId}: processed`);
      } catch (pkgError) {
        console.error(`Error downloading package ${packageId}:`, pkgError.message);
        totalErrors++;
      }
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        data: {
          totalProcessed,
          totalErrors,
          packageCount: packageIds.length,
          message: `${totalProcessed} CFDI(s) procesados exitosamente${totalErrors > 0 ? `, ${totalErrors} errores` : ''}`,
        },
      }),
    };
  } catch (error) {
    console.error('[SAT Download Error]', error);
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Error al descargar los paquetes del SAT.',
      }),
    };
  }
};
