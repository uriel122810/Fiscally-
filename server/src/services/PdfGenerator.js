// ─── PDF Generator ──────────────────────────────────────────────────────
// Generates a professional PDF "formato impreso" from parsed CFDI data.
// Uses PDFKit for rendering and QRCode for SAT verification codes.
// ─────────────────────────────────────────────────────────────────────────

import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { getImpuestoName, getTipoComprobanteName } from './XmlParser.js';

/**
 * Format a number as Mexican currency.
 */
function formatMXN(value, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(value || 0);
}

/**
 * Format a date string for display.
 */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

/**
 * Generate the SAT verification QR code URL.
 * @param {object} cfdi - Parsed CFDI data
 * @returns {string} QR verification URL
 */
function buildQrUrl(cfdi) {
  const uuid = cfdi.uuid || cfdi.timbreFiscal?.uuid || '';
  const rfcEmisor = cfdi.emisor?.rfc || '';
  const rfcReceptor = cfdi.receptor?.rfc || '';
  const total = (cfdi.total || 0).toFixed(6);
  const sello = (cfdi.sello || cfdi.timbreFiscal?.selloCFD || '').slice(-8);

  return `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${uuid}&re=${rfcEmisor}&rr=${rfcReceptor}&tt=${total}&fe=${sello}`;
}

/**
 * Generate a PDF document from CFDI data.
 * @param {object} cfdi - Parsed CFDI data from XmlParser
 * @param {object} [options] - PDF options
 * @returns {Promise<Buffer>} PDF buffer
 */
export async function generateCfdiPdf(cfdi, options = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        info: {
          Title: `CFDI ${cfdi.serie || ''}${cfdi.folio || ''} - ${cfdi.emisor?.nombre || ''}`,
          Author: cfdi.emisor?.nombre || 'Fiscally',
          Subject: 'Comprobante Fiscal Digital por Internet (CFDI)',
        },
      });

      const buffers = [];
      doc.on('data', chunk => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - 80; // 40px margins on each side
      const accentColor = '#6366F1';
      const textGray = '#4B5563';
      const lightGray = '#F3F4F6';
      const borderColor = '#E5E7EB';

      // ── Header ────────────────────────────────────────────────────
      // Company logo placeholder (gradient box)
      doc.save()
        .rect(40, 40, 48, 48)
        .fill(accentColor);

      doc.fontSize(18).fillColor('white')
        .text(cfdi.emisor?.nombre?.substring(0, 2) || 'Fi', 40, 52, {
          width: 48,
          align: 'center',
        });

      doc.restore();

      // Company name and info
      doc.fontSize(14).fillColor('#111827').font('Helvetica-Bold')
        .text(cfdi.emisor?.nombre || '', 96, 42, { width: 320 });

      doc.fontSize(8).fillColor(textGray).font('Helvetica')
        .text(`RFC: ${cfdi.emisor?.rfc || ''}`, 96, 60)
        .text(`Régimen Fiscal: ${cfdi.emisor?.regimenFiscal || ''}`, 96, 70)
        .text(`Lugar de Expedición: ${cfdi.lugarExpedicion || ''}`, 96, 80);

      // CFDI title on the right
      doc.fontSize(20).fillColor(accentColor).font('Helvetica-Bold')
        .text(cfdi.serie ? `${cfdi.serie}-${cfdi.folio}` : `Folio: ${cfdi.folio || 'S/F'}`, 400, 42, {
          width: 172,
          align: 'right',
        });

      doc.fontSize(9).fillColor(textGray).font('Helvetica')
        .text(`${getTipoComprobanteName(cfdi.tipoDeComprobante)}`, 400, 66, { width: 172, align: 'right' })
        .text(`CFDI ${cfdi.version || '4.0'}`, 400, 78, { width: 172, align: 'right' });

      // Horizontal line
      doc.moveTo(40, 100).lineTo(572, 100).strokeColor(borderColor).lineWidth(1).stroke();

      // ── UUID and Date Bar ─────────────────────────────────────────
      doc.rect(40, 108, pageWidth, 28).fill(lightGray);

      doc.fontSize(7).fillColor(textGray).font('Helvetica-Bold')
        .text('FOLIO FISCAL (UUID)', 48, 112);
      doc.fontSize(8).fillColor('#111827').font('Helvetica')
        .text(cfdi.uuid || cfdi.timbreFiscal?.uuid || '', 48, 122);

      doc.fontSize(7).fillColor(textGray).font('Helvetica-Bold')
        .text('FECHA DE EMISIÓN', 380, 112);
      doc.fontSize(8).fillColor('#111827').font('Helvetica')
        .text(formatDate(cfdi.fecha), 380, 122);

      doc.fontSize(7).fillColor(textGray).font('Helvetica-Bold')
        .text('FECHA DE TIMBRADO', 480, 112);
      doc.fontSize(8).fillColor('#111827').font('Helvetica')
        .text(formatDate(cfdi.timbreFiscal?.fechaTimbrado), 480, 122);

      // ── Emisor / Receptor ─────────────────────────────────────────
      let y = 150;

      // Emisor box
      doc.rect(40, y, pageWidth / 2 - 8, 60).fill(lightGray);
      doc.fontSize(7).fillColor(accentColor).font('Helvetica-Bold')
        .text('EMISOR', 48, y + 6);
      doc.fontSize(9).fillColor('#111827').font('Helvetica-Bold')
        .text(cfdi.emisor?.nombre || '', 48, y + 18, { width: pageWidth / 2 - 24 });
      doc.fontSize(8).fillColor(textGray).font('Helvetica')
        .text(`RFC: ${cfdi.emisor?.rfc || ''}`, 48, y + 32)
        .text(`Régimen: ${cfdi.emisor?.regimenFiscal || ''}`, 48, y + 44);

      // Receptor box
      const rxStart = 40 + pageWidth / 2 + 8;
      doc.rect(rxStart, y, pageWidth / 2 - 8, 60).fill(lightGray);
      doc.fontSize(7).fillColor(accentColor).font('Helvetica-Bold')
        .text('RECEPTOR', rxStart + 8, y + 6);
      doc.fontSize(9).fillColor('#111827').font('Helvetica-Bold')
        .text(cfdi.receptor?.nombre || '', rxStart + 8, y + 18, { width: pageWidth / 2 - 24 });
      doc.fontSize(8).fillColor(textGray).font('Helvetica')
        .text(`RFC: ${cfdi.receptor?.rfc || ''}`, rxStart + 8, y + 32)
        .text(`Uso CFDI: ${cfdi.receptor?.usoCFDI || ''}`, rxStart + 8, y + 44);

      // ── Payment info row ──────────────────────────────────────────
      y += 72;
      const infoItems = [
        { label: 'FORMA DE PAGO', value: cfdi.formaPago || '—' },
        { label: 'MÉTODO DE PAGO', value: cfdi.metodoPago || '—' },
        { label: 'MONEDA', value: cfdi.moneda || 'MXN' },
        { label: 'TIPO DE CAMBIO', value: cfdi.tipoCambio !== 1 ? cfdi.tipoCambio.toString() : '—' },
      ];

      const infoWidth = pageWidth / infoItems.length;
      infoItems.forEach((item, i) => {
        const x = 40 + i * infoWidth;
        doc.fontSize(7).fillColor(textGray).font('Helvetica-Bold')
          .text(item.label, x, y);
        doc.fontSize(8).fillColor('#111827').font('Helvetica')
          .text(item.value, x, y + 12);
      });

      // ── Conceptos Table ───────────────────────────────────────────
      y += 36;
      doc.moveTo(40, y).lineTo(572, y).strokeColor(borderColor).lineWidth(0.5).stroke();
      y += 4;

      // Table header
      doc.rect(40, y, pageWidth, 18).fill(accentColor);
      doc.fontSize(7).fillColor('white').font('Helvetica-Bold');

      const cols = [
        { label: 'CLAVE', x: 48, width: 60 },
        { label: 'DESCRIPCIÓN', x: 110, width: 200 },
        { label: 'CANT.', x: 318, width: 40 },
        { label: 'UNIDAD', x: 360, width: 48 },
        { label: 'P. UNITARIO', x: 410, width: 76 },
        { label: 'IMPORTE', x: 490, width: 74 },
      ];

      cols.forEach(col => {
        doc.text(col.label, col.x, y + 5, { width: col.width, align: col.x > 400 ? 'right' : 'left' });
      });

      y += 18;

      // Table rows
      const conceptos = cfdi.conceptos || [];
      conceptos.forEach((concepto, i) => {
        if (i % 2 === 0) {
          doc.rect(40, y, pageWidth, 16).fill('#FAFAFA');
        }

        doc.fontSize(7).fillColor('#111827').font('Helvetica');
        doc.text(concepto.claveProdServ || '', cols[0].x, y + 4, { width: cols[0].width });
        doc.text(concepto.descripcion || '', cols[1].x, y + 4, { width: cols[1].width });
        doc.text(concepto.cantidad?.toString() || '1', cols[2].x, y + 4, { width: cols[2].width, align: 'center' });
        doc.text(concepto.claveUnidad || '', cols[3].x, y + 4, { width: cols[3].width });
        doc.text(formatMXN(concepto.valorUnitario, cfdi.moneda), cols[4].x, y + 4, { width: cols[4].width, align: 'right' });
        doc.text(formatMXN(concepto.importe, cfdi.moneda), cols[5].x, y + 4, { width: cols[5].width, align: 'right' });

        y += 16;
      });

      // ── Totals ────────────────────────────────────────────────────
      y += 8;
      doc.moveTo(380, y).lineTo(572, y).strokeColor(borderColor).lineWidth(0.5).stroke();
      y += 8;

      const totals = [
        { label: 'Subtotal', value: formatMXN(cfdi.subtotal, cfdi.moneda) },
      ];

      if (cfdi.descuento > 0) {
        totals.push({ label: 'Descuento', value: `- ${formatMXN(cfdi.descuento, cfdi.moneda)}` });
      }

      // Add tax traslados
      (cfdi.impuestos?.traslados || []).forEach(t => {
        const name = getImpuestoName(t.impuesto);
        const rate = t.tasaOCuota ? ` (${(t.tasaOCuota * 100).toFixed(0)}%)` : '';
        totals.push({
          label: `${name}${rate}`,
          value: formatMXN(t.importe, cfdi.moneda),
        });
      });

      // Add tax retenciones
      (cfdi.impuestos?.retenciones || []).forEach(r => {
        const name = getImpuestoName(r.impuesto);
        totals.push({
          label: `Retención ${name}`,
          value: `- ${formatMXN(r.importe, cfdi.moneda)}`,
        });
      });

      totals.forEach(item => {
        doc.fontSize(8).fillColor(textGray).font('Helvetica')
          .text(item.label, 380, y, { width: 100, align: 'right' });
        doc.fontSize(8).fillColor('#111827').font('Helvetica')
          .text(item.value, 490, y, { width: 74, align: 'right' });
        y += 14;
      });

      // Total line
      y += 2;
      doc.rect(380, y, 192, 22).fill(accentColor);
      doc.fontSize(9).fillColor('white').font('Helvetica-Bold')
        .text('TOTAL', 388, y + 6, { width: 90, align: 'right' });
      doc.fontSize(10).fillColor('white').font('Helvetica-Bold')
        .text(formatMXN(cfdi.total, cfdi.moneda), 490, y + 5, { width: 74, align: 'right' });

      // ── QR Code and Digital Stamps ─────────────────────────────────
      y += 40;

      if (y > 600) {
        doc.addPage();
        y = 40;
      }

      doc.moveTo(40, y).lineTo(572, y).strokeColor(borderColor).lineWidth(0.5).stroke();
      y += 10;

      // Generate QR code
      const qrUrl = buildQrUrl(cfdi);
      try {
        const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 100, margin: 1 });
        const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');
        doc.image(qrBuffer, 40, y, { width: 90, height: 90 });
      } catch {
        // QR generation failed — draw placeholder
        doc.rect(40, y, 90, 90).stroke(borderColor);
        doc.fontSize(7).fillColor(textGray).text('QR Code', 60, y + 40);
      }

      // Stamps info
      const stampX = 140;
      doc.fontSize(7).fillColor(accentColor).font('Helvetica-Bold')
        .text('SELLO DIGITAL DEL EMISOR', stampX, y);
      doc.fontSize(6).fillColor(textGray).font('Helvetica')
        .text((cfdi.sello || cfdi.timbreFiscal?.selloCFD || 'N/A').substring(0, 120) + '...', stampX, y + 10, { width: 420 });

      doc.fontSize(7).fillColor(accentColor).font('Helvetica-Bold')
        .text('SELLO DIGITAL DEL SAT', stampX, y + 30);
      doc.fontSize(6).fillColor(textGray).font('Helvetica')
        .text((cfdi.timbreFiscal?.selloSAT || 'N/A').substring(0, 120) + '...', stampX, y + 40, { width: 420 });

      doc.fontSize(7).fillColor(accentColor).font('Helvetica-Bold')
        .text('CADENA ORIGINAL DEL TIMBRE', stampX, y + 60);
      doc.fontSize(6).fillColor(textGray).font('Helvetica')
        .text(`||${cfdi.timbreFiscal?.uuid || ''}|${cfdi.timbreFiscal?.fechaTimbrado || ''}|...||`, stampX, y + 70, { width: 420 });

      // No. Certificado SAT
      doc.fontSize(7).fillColor(textGray).font('Helvetica')
        .text(`No. Certificado SAT: ${cfdi.timbreFiscal?.noCertificadoSAT || ''}`, stampX, y + 84);

      // Footer
      y += 100;
      doc.fontSize(7).fillColor(textGray).font('Helvetica')
        .text('Este documento es una representación impresa de un CFDI — Generado por Fiscally', 40, y, {
          width: pageWidth,
          align: 'center',
        });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
