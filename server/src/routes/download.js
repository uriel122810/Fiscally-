// ─── Download Routes ────────────────────────────────────────────────────
// Manages the SAT Descarga Masiva lifecycle:
// 1. Request download (emitidos/recibidos)
// 2. Verify request status
// 3. Download and process packages
// ─────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import AdmZip from 'adm-zip';
import { getDatabase } from '../db/connection.js';
import { getSatService } from '../services/SatService.js';
import { parseCfdiXml } from '../services/XmlParser.js';

const router = Router();

/**
 * POST /api/sat/download/request
 * Start a new bulk download request with the SAT.
 * Body: { type: 'emitidos'|'recibidos', dateStart, dateEnd, requestType: 'xml'|'metadata' }
 */
router.post('/request', async (req, res) => {
  try {
    const { type, dateStart, dateEnd, requestType = 'xml' } = req.body;

    if (!type || !dateStart || !dateEnd) {
      return res.status(400).json({
        success: false,
        error: 'Parámetros requeridos: type, dateStart, dateEnd',
      });
    }

    if (!['emitidos', 'recibidos'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'type debe ser "emitidos" o "recibidos"',
      });
    }

    const satService = getSatService();

    if (!satService.isReady()) {
      return res.status(400).json({
        success: false,
        error: 'SAT Service no inicializado. Configura la e.firma primero.',
      });
    }

    let result;
    if (type === 'emitidos') {
      result = await satService.requestDownloadEmitidos(dateStart, dateEnd, requestType);
    } else {
      result = await satService.requestDownloadRecibidos(dateStart, dateEnd, requestType);
    }

    // Save to database for tracking
    const db = getDatabase();
    const insertStmt = db.prepare(`
      INSERT INTO download_requests (request_id, type, request_type, date_start, date_end, status, status_code, message)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
    `);
    insertStmt.run(result.requestId, type, requestType, dateStart, dateEnd, result.statusCode, result.message);

    res.json({
      success: true,
      data: {
        requestId: result.requestId,
        statusCode: result.statusCode,
        message: result.message,
        type,
        dateRange: { start: dateStart, end: dateEnd },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/sat/download/verify/:requestId
 * Check the status of a download request.
 * Returns package IDs when the request is completed.
 */
router.get('/verify/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;
    const satService = getSatService();

    if (!satService.isReady()) {
      return res.status(400).json({
        success: false,
        error: 'SAT Service no inicializado.',
      });
    }

    const result = await satService.verifyRequest(requestId);

    // Update database record
    const db = getDatabase();
    const updateStmt = db.prepare(`
      UPDATE download_requests
      SET status = ?, status_code = ?, message = ?, package_ids = ?, cfdi_count = ?,
          completed_at = CASE WHEN ? IN ('completed', 'error', 'rejected', 'expired') THEN datetime('now') ELSE completed_at END
      WHERE request_id = ?
    `);
    updateStmt.run(
      result.status,
      result.statusCode,
      result.message,
      JSON.stringify(result.packageIds),
      result.cfdiCount,
      result.status,
      requestId
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/sat/download/fetch/:requestId
 * Download and process completed packages.
 * Extracts XMLs from ZIPs, parses them, and stores in the database.
 */
router.post('/fetch/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;
    const db = getDatabase();
    const satService = getSatService();

    if (!satService.isReady()) {
      return res.status(400).json({
        success: false,
        error: 'SAT Service no inicializado.',
      });
    }

    // Get the download request record
    const requestStmt = db.prepare('SELECT * FROM download_requests WHERE request_id = ?');
    const requestRecord = requestStmt.get(requestId);

    if (!requestRecord) {
      return res.status(404).json({
        success: false,
        error: `Solicitud ${requestId} no encontrada`,
      });
    }

    let packageIds;
    try {
      packageIds = JSON.parse(requestRecord.package_ids || '[]');
    } catch {
      packageIds = [];
    }

    if (packageIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No hay paquetes disponibles para descargar. Verifica el estatus primero.',
      });
    }

    const companyRfc = process.env.SAT_RFC || '';
    const direction = requestRecord.type === 'emitidos' ? 'emitida' : 'recibida';
    let totalProcessed = 0;
    let totalErrors = 0;

    // Prepare insert statements
    const insertCfdi = db.prepare(`
      INSERT OR REPLACE INTO cfdi
      (uuid, rfc_emisor, rfc_receptor, nombre_emisor, nombre_receptor,
       regimen_fiscal_emisor, uso_cfdi, fecha, fecha_timbrado,
       tipo_comprobante, subtotal, descuento, total, moneda, tipo_cambio,
       serie, folio, forma_pago, metodo_pago, lugar_expedicion,
       direction, sat_status, xml_content, parsed_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'vigente', ?, ?, datetime('now'))
    `);

    const insertConcepto = db.prepare(`
      INSERT INTO cfdi_conceptos (cfdi_uuid, clave_prod_serv, clave_unidad, descripcion, cantidad, valor_unitario, importe, descuento)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertImpuesto = db.prepare(`
      INSERT INTO cfdi_impuestos (cfdi_uuid, tipo, impuesto, tipo_factor, tasa_o_cuota, base, importe)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertTimbre = db.prepare(`
      INSERT OR REPLACE INTO cfdi_timbre (uuid, fecha_timbrado, rfc_prov_certif, sello_cfd, no_certificado_sat, sello_sat)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const deleteConceptos = db.prepare('DELETE FROM cfdi_conceptos WHERE cfdi_uuid = ?');
    const deleteImpuestos = db.prepare('DELETE FROM cfdi_impuestos WHERE cfdi_uuid = ?');

    // Process each package
    for (const packageId of packageIds) {
      try {
        const packageContent = await satService.downloadPackage(packageId);
        const zip = new AdmZip(Buffer.from(packageContent));
        const entries = zip.getEntries();

        // Process each XML in the ZIP
        const processTransaction = db.transaction(() => {
          for (const entry of entries) {
            if (entry.isDirectory || !entry.entryName.endsWith('.xml')) continue;

            try {
              const xmlContent = entry.getData().toString('utf-8');
              const parsed = parseCfdiXml(xmlContent);

              if (!parsed.uuid && !parsed.timbreFiscal?.uuid) {
                console.warn(`  ⚠️  XML sin UUID: ${entry.entryName}`);
                totalErrors++;
                continue;
              }

              const uuid = parsed.uuid || parsed.timbreFiscal?.uuid;

              // Insert CFDI main record
              insertCfdi.run(
                uuid,
                parsed.emisor?.rfc || '',
                parsed.receptor?.rfc || '',
                parsed.emisor?.nombre || '',
                parsed.receptor?.nombre || '',
                parsed.emisor?.regimenFiscal || '',
                parsed.receptor?.usoCFDI || '',
                parsed.fecha || '',
                parsed.timbreFiscal?.fechaTimbrado || '',
                parsed.tipoDeComprobante || 'I',
                parsed.subtotal || 0,
                parsed.descuento || 0,
                parsed.total || 0,
                parsed.moneda || 'MXN',
                parsed.tipoCambio || 1,
                parsed.serie || '',
                parsed.folio || '',
                parsed.formaPago || '',
                parsed.metodoPago || '',
                parsed.lugarExpedicion || '',
                direction,
                xmlContent,
                JSON.stringify(parsed),
              );

              // Clear old conceptos/impuestos for this UUID
              deleteConceptos.run(uuid);
              deleteImpuestos.run(uuid);

              // Insert conceptos
              for (const concepto of (parsed.conceptos || [])) {
                insertConcepto.run(
                  uuid,
                  concepto.claveProdServ || '',
                  concepto.claveUnidad || '',
                  concepto.descripcion || '',
                  concepto.cantidad || 1,
                  concepto.valorUnitario || 0,
                  concepto.importe || 0,
                  concepto.descuento || 0,
                );
              }

              // Insert impuestos
              for (const traslado of (parsed.impuestos?.traslados || [])) {
                insertImpuesto.run(
                  uuid, 'traslado',
                  traslado.impuesto, traslado.tipoFactor,
                  traslado.tasaOCuota, traslado.base, traslado.importe,
                );
              }
              for (const retencion of (parsed.impuestos?.retenciones || [])) {
                insertImpuesto.run(
                  uuid, 'retencion',
                  retencion.impuesto, '', 0, 0, retencion.importe,
                );
              }

              // Insert timbre
              if (parsed.timbreFiscal) {
                insertTimbre.run(
                  uuid,
                  parsed.timbreFiscal.fechaTimbrado || '',
                  parsed.timbreFiscal.rfcProvCertif || '',
                  parsed.timbreFiscal.selloCFD || '',
                  parsed.timbreFiscal.noCertificadoSAT || '',
                  parsed.timbreFiscal.selloSAT || '',
                );
              }

              totalProcessed++;
            } catch (xmlError) {
              console.error(`  ❌ Error parsing ${entry.entryName}:`, xmlError.message);
              totalErrors++;
            }
          }
        });

        processTransaction();
        console.log(`📦 Package ${packageId}: processed`);

      } catch (pkgError) {
        console.error(`❌ Error downloading package ${packageId}:`, pkgError.message);
        totalErrors++;
      }
    }

    // Update download request status
    const finalUpdate = db.prepare(`
      UPDATE download_requests
      SET status = 'downloaded', cfdi_count = ?, completed_at = datetime('now')
      WHERE request_id = ?
    `);
    finalUpdate.run(totalProcessed, requestId);

    res.json({
      success: true,
      data: {
        totalProcessed,
        totalErrors,
        packageCount: packageIds.length,
        message: `${totalProcessed} CFDI(s) procesados exitosamente${totalErrors > 0 ? `, ${totalErrors} errores` : ''}`,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/sat/download/history
 * List past download requests and their statuses.
 */
router.get('/history', (_req, res) => {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM download_requests
      ORDER BY created_at DESC
      LIMIT 50
    `);
    const rows = stmt.all();

    res.json({
      success: true,
      data: rows.map(row => ({
        ...row,
        package_ids: JSON.parse(row.package_ids || '[]'),
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
