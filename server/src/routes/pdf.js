// ─── PDF Routes ─────────────────────────────────────────────────────────
// Generate PDF "formato impreso" from cached CFDI data.
// ─────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { getDatabase } from '../db/connection.js';
import { parseCfdiXml } from '../services/XmlParser.js';
import { generateCfdiPdf } from '../services/PdfGenerator.js';

const router = Router();

/**
 * GET /api/sat/cfdi/:uuid/pdf
 * Generate and download a PDF for a specific CFDI.
 */
router.get('/:uuid/pdf', async (req, res) => {
  try {
    const db = getDatabase();
    const { uuid } = req.params;

    // Get the CFDI record
    const stmt = db.prepare('SELECT xml_content, parsed_json, serie, folio FROM cfdi WHERE uuid = ?');
    const row = stmt.get(uuid);

    if (!row) {
      return res.status(404).json({
        success: false,
        error: `CFDI con UUID ${uuid} no encontrado`,
      });
    }

    let parsedCfdi;

    // Try to use cached parsed JSON first, fall back to XML parsing
    if (row.parsed_json) {
      try {
        parsedCfdi = JSON.parse(row.parsed_json);
      } catch {
        // Fall through to XML parsing
      }
    }

    if (!parsedCfdi && row.xml_content) {
      parsedCfdi = parseCfdiXml(row.xml_content);
    }

    if (!parsedCfdi) {
      return res.status(400).json({
        success: false,
        error: 'No hay datos suficientes para generar el PDF',
      });
    }

    // Generate PDF
    const pdfBuffer = await generateCfdiPdf(parsedCfdi);

    const filename = `${row.serie || ''}${row.folio || uuid}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
