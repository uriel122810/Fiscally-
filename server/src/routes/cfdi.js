// ─── CFDI Routes ────────────────────────────────────────────────────────
// Query, list, and retrieve cached CFDI data.
// All data comes from the local SQLite cache, populated by download routes.
// ─────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { getDatabase } from '../db/connection.js';
import { transformToFrontendInvoice, computeKpis, computeMonthlyData, computeRubroDistribution, computeTaxData } from '../services/CfdiTransformer.js';

const router = Router();

/**
 * GET /api/sat/cfdi
 * List cached CFDIs with optional filters.
 * Query params: direction, year, month, rfc, tipo, status, limit, offset
 */
router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const {
      direction,
      year,
      month,
      rfc,
      tipo,
      status,
      search,
      limit = 100,
      offset = 0,
    } = req.query;

    let whereClause = '1=1';
    const params = [];

    if (direction && direction !== 'all') {
      whereClause += ' AND direction = ?';
      params.push(direction);
    }

    if (year) {
      whereClause += ' AND substr(fecha, 1, 4) = ?';
      params.push(year.toString());
    }

    if (month) {
      whereClause += ' AND substr(fecha, 6, 2) = ?';
      params.push(month.toString().padStart(2, '0'));
    }

    if (rfc) {
      whereClause += ' AND (rfc_emisor = ? OR rfc_receptor = ?)';
      params.push(rfc, rfc);
    }

    if (tipo) {
      whereClause += ' AND tipo_comprobante = ?';
      params.push(tipo);
    }

    if (status) {
      whereClause += ' AND sat_status = ?';
      params.push(status);
    }

    if (search) {
      whereClause += ' AND (nombre_emisor LIKE ? OR nombre_receptor LIKE ? OR rfc_emisor LIKE ? OR rfc_receptor LIKE ? OR folio LIKE ? OR uuid LIKE ?)';
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam, searchParam, searchParam);
    }

    // Count total results
    const countStmt = db.prepare(`SELECT COUNT(*) as total FROM cfdi WHERE ${whereClause}`);
    const { total } = countStmt.get(...params);

    // Fetch paginated results
    params.push(parseInt(limit), parseInt(offset));
    const stmt = db.prepare(`
      SELECT * FROM cfdi
      WHERE ${whereClause}
      ORDER BY fecha DESC, created_at DESC
      LIMIT ? OFFSET ?
    `);
    const rows = stmt.all(...params);

    // Transform to frontend shape
    const companyRfc = process.env.SAT_RFC || '';
    const invoices = rows.map(row => {
      if (row.parsed_json) {
        try {
          const parsed = JSON.parse(row.parsed_json);
          return transformToFrontendInvoice(parsed, row.direction, row.sat_status);
        } catch {
          // Fall through to basic transformation
        }
      }

      // Basic transformation from database columns
      return {
        id: row.uuid,
        uuid_cfdi: row.uuid,
        razon_social: row.direction === 'recibida' ? row.nombre_emisor : row.nombre_receptor,
        rfc: row.direction === 'recibida' ? row.rfc_emisor : row.rfc_receptor,
        rfc_emisor: row.rfc_emisor,
        rfc_receptor: row.rfc_receptor,
        nombre_emisor: row.nombre_emisor,
        nombre_receptor: row.nombre_receptor,
        rubro: 'General',
        rubroColor: '#6B7280',
        folio: row.folio || 'S/F',
        serie: row.serie || '',
        fecha: row.fecha?.split('T')[0] || '',
        fecha_vencimiento: null,
        status: row.sat_status === 'cancelada' ? 'cancelada' : 'por_cobrar',
        direction: row.direction,
        total: row.total || 0,
        iva: 0,
        subtotal: row.subtotal || 0,
        moneda: row.moneda || 'MXN',
        sat_status: row.sat_status || 'vigente',
        tipo: row.tipo_comprobante || '',
        items: [],
        notas: '',
      };
    });

    res.json({
      success: true,
      data: {
        invoices,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + parseInt(limit) < total,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/sat/cfdi/stats
 * Compute aggregated KPI data from cached CFDIs.
 * Query params: year, month
 */
router.get('/stats', (req, res) => {
  try {
    const db = getDatabase();
    const { year = new Date().getFullYear(), month = new Date().getMonth() + 1 } = req.query;

    // Get all invoices for the year (needed for delta calculation)
    const yearStr = year.toString();
    const stmt = db.prepare(`
      SELECT * FROM cfdi
      WHERE substr(fecha, 1, 4) = ?
      ORDER BY fecha DESC
    `);
    const rows = stmt.all(yearStr);

    const companyRfc = process.env.SAT_RFC || '';
    const invoices = rows.map(row => {
      if (row.parsed_json) {
        try {
          const parsed = JSON.parse(row.parsed_json);
          return transformToFrontendInvoice(parsed, row.direction, row.sat_status);
        } catch { /* fallback below */ }
      }
      return {
        id: row.uuid,
        uuid_cfdi: row.uuid,
        direction: row.direction,
        total: row.total || 0,
        iva: 0,
        subtotal: row.subtotal || 0,
        fecha: row.fecha?.split('T')[0] || '',
        sat_status: row.sat_status,
        status: row.sat_status === 'cancelada' ? 'cancelada' : 'por_cobrar',
        rubro: 'General',
        rubroColor: '#6B7280',
      };
    });

    // Also get previous year data for January delta
    const prevYearStr = (parseInt(year) - 1).toString();
    const prevStmt = db.prepare(`
      SELECT * FROM cfdi
      WHERE substr(fecha, 1, 4) = ? AND substr(fecha, 6, 2) = '12'
      ORDER BY fecha DESC
    `);
    const prevRows = prevStmt.all(prevYearStr);
    const prevInvoices = prevRows.map(row => ({
      id: row.uuid,
      direction: row.direction,
      total: row.total || 0,
      fecha: row.fecha?.split('T')[0] || '',
      sat_status: row.sat_status,
      status: 'pagada',
      rubro: 'General',
      rubroColor: '#6B7280',
    }));

    const allInvoices = [...invoices, ...prevInvoices];

    const kpis = computeKpis(allInvoices, parseInt(year), parseInt(month));
    const monthlyData = computeMonthlyData(allInvoices, parseInt(year));
    const rubroDistribution = computeRubroDistribution(allInvoices);
    const taxData = computeTaxData(allInvoices, parseInt(year));

    res.json({
      success: true,
      data: {
        kpis,
        monthlyData,
        rubroDistribution,
        taxData,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/sat/cfdi/:uuid
 * Get a single CFDI by UUID with full detail.
 */
router.get('/:uuid', (req, res) => {
  try {
    const db = getDatabase();
    const { uuid } = req.params;

    const stmt = db.prepare('SELECT * FROM cfdi WHERE uuid = ?');
    const row = stmt.get(uuid);

    if (!row) {
      return res.status(404).json({
        success: false,
        error: `CFDI con UUID ${uuid} no encontrado`,
      });
    }

    // Get conceptos
    const conceptosStmt = db.prepare('SELECT * FROM cfdi_conceptos WHERE cfdi_uuid = ?');
    const conceptos = conceptosStmt.all(uuid);

    // Get impuestos
    const impuestosStmt = db.prepare('SELECT * FROM cfdi_impuestos WHERE cfdi_uuid = ?');
    const impuestos = impuestosStmt.all(uuid);

    // Get timbre
    const timbreStmt = db.prepare('SELECT * FROM cfdi_timbre WHERE uuid = ?');
    const timbre = timbreStmt.get(uuid);

    // Transform to frontend shape
    let invoice;
    if (row.parsed_json) {
      try {
        const parsed = JSON.parse(row.parsed_json);
        invoice = transformToFrontendInvoice(parsed, row.direction, row.sat_status);
      } catch { /* fallback below */ }
    }

    if (!invoice) {
      invoice = {
        id: row.uuid,
        uuid_cfdi: row.uuid,
        razon_social: row.direction === 'recibida' ? row.nombre_emisor : row.nombre_receptor,
        rfc: row.direction === 'recibida' ? row.rfc_emisor : row.rfc_receptor,
        direction: row.direction,
        total: row.total,
        subtotal: row.subtotal,
        fecha: row.fecha,
        sat_status: row.sat_status,
        items: conceptos.map(c => ({
          descripcion: c.descripcion,
          cantidad: c.cantidad,
          precio: c.valor_unitario,
          importe: c.importe,
        })),
      };
    }

    res.json({
      success: true,
      data: {
        invoice,
        timbre,
        impuestos: {
          traslados: impuestos.filter(i => i.tipo === 'traslado'),
          retenciones: impuestos.filter(i => i.tipo === 'retencion'),
        },
        hasXml: !!row.xml_content,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/sat/cfdi/:uuid/xml
 * Download the raw XML file for a CFDI.
 */
router.get('/:uuid/xml', (req, res) => {
  try {
    const db = getDatabase();
    const { uuid } = req.params;

    const stmt = db.prepare('SELECT xml_content, serie, folio FROM cfdi WHERE uuid = ?');
    const row = stmt.get(uuid);

    if (!row || !row.xml_content) {
      return res.status(404).json({
        success: false,
        error: `XML no disponible para el CFDI ${uuid}`,
      });
    }

    const filename = `${row.serie || ''}${row.folio || uuid}.xml`;
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(row.xml_content);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
