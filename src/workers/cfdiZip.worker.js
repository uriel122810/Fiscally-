// Web Worker: descomprime ZIPs masivos de CFDI y extrae los datos fiscales
// sin tocar el hilo principal. DOMParser no existe dentro de un Worker (es API
// del DOM), por eso la extracción se hace con regex sobre los atributos del XML.
import { configure, ZipReader, BlobReader, TextWriter } from '@zip.js/zip.js';

// Ya corremos dentro de un worker: evitar que zip.js genere workers anidados.
configure({ useWebWorkers: false });

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

// Los RFC y nombres pueden contener '&' (serializado como &amp;). Decodificación
// en una sola pasada para no re-decodificar (&amp;lt; debe dar '&lt;', no '<').
function decodeXmlEntities(value) {
  return value.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (match, ent) => {
    if (ENTITIES[ent]) return ENTITIES[ent];
    try {
      const code = ent[1] === 'x' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return String.fromCodePoint(code);
    } catch {
      return match;
    }
  });
}

// El prefijo de namespace (cfdi:, tfd:, nomina12:) es convención de los PAC,
// no lo garantiza el estándar XML — se acepta cualquier prefijo o ninguno.
function tagBlock(xml, tag) {
  const m = xml.match(new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*`));
  return m ? m[0] : null;
}

// El \s inicial es obligatorio: sin él, Total matchea dentro de SubTotal.
// Solo se aceptan valores entre comillas dobles (todos los CFDI timbrados por
// PAC se serializan así).
function attr(block, name) {
  if (!block) return null;
  const m = block.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`));
  return m ? decodeXmlEntities(m[1]) : null;
}

function num(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function parseCfdi(xml) {
  if (xml.charCodeAt(0) === 0xFEFF) xml = xml.slice(1);

  const comprobante = tagBlock(xml, 'Comprobante');
  if (!comprobante) return { skip: true };

  const tipoComprobante = attr(comprobante, 'TipoDeComprobante') || 'I';

  // cfdi:Emisor/Receptor siempre preceden a cfdi:Complemento en el orden del
  // documento, así que el primer match nunca es el Emisor/Receptor de nómina.
  const emisor = tagBlock(xml, 'Emisor');
  const receptor = tagBlock(xml, 'Receptor');
  const timbre = tagBlock(xml, 'TimbreFiscalDigital');

  let nomina = null;
  if (tipoComprobante === 'N') {
    const nominaTag = tagBlock(xml, 'Nomina');
    if (nominaTag) {
      const totalPercepciones = num(attr(nominaTag, 'TotalPercepciones'));
      const totalDeducciones = num(attr(nominaTag, 'TotalDeducciones'));
      const totalOtrosPagos = num(attr(nominaTag, 'TotalOtrosPagos'));
      nomina = {
        totalPercepciones,
        totalDeducciones,
        totalOtrosPagos,
        netoPagado: +(totalPercepciones + totalOtrosPagos - totalDeducciones).toFixed(2),
      };
    }
  }

  return {
    row: {
      uuid: (attr(timbre, 'UUID') || '').toUpperCase() || null,
      total: num(attr(comprobante, 'Total')),
      subtotal: num(attr(comprobante, 'SubTotal')),
      tipoComprobante,
      fecha: attr(comprobante, 'Fecha') || '',
      serie: attr(comprobante, 'Serie') || '',
      folio: attr(comprobante, 'Folio') || '',
      moneda: attr(comprobante, 'Moneda') || 'MXN',
      formaPago: attr(comprobante, 'FormaPago') || '',
      metodoPago: attr(comprobante, 'MetodoPago') || '',
      rfcEmisor: attr(emisor, 'Rfc') || '',
      nombreEmisor: attr(emisor, 'Nombre') || '',
      rfcReceptor: attr(receptor, 'Rfc') || '',
      nombreReceptor: attr(receptor, 'Nombre') || '',
      nomina,
    },
  };
}

self.onmessage = async (e) => {
  if (e.data?.type !== 'start') return;
  const { file, batchSize = 25 } = e.data;
  const started = Date.now();
  let reader;

  try {
    // BlobReader lee el File por chunks directo del disco: el ZIP de 150 MB
    // nunca se carga completo en memoria.
    reader = new ZipReader(new BlobReader(file));
    const entries = await reader.getEntries();
    const xmlEntries = entries.filter(en =>
      !en.directory &&
      /\.xml$/i.test(en.filename) &&
      !/(^|\/)__MACOSX\//.test(en.filename) &&
      !/(^|\/)\._/.test(en.filename)
    );

    self.postMessage({ type: 'meta', totalEntries: entries.length, totalXml: xmlEntries.length });

    const seen = new Set();
    const errors = [];
    let pending = [];
    let processed = 0;
    let parsed = 0;
    let skippedNonCfdi = 0;
    let duplicates = 0;
    let lastTick = Date.now();

    const flush = () => {
      if (!pending.length) return;
      self.postMessage({ type: 'batch', invoices: pending, processed, totalXml: xmlEntries.length });
      pending = [];
      lastTick = Date.now();
    };

    for (const entry of xmlEntries) {
      try {
        const xml = await entry.getData(new TextWriter());
        const { row, skip } = parseCfdi(xml);
        if (skip) {
          skippedNonCfdi++;
        } else if (!row.uuid) {
          errors.push({ file: entry.filename, message: 'Sin UUID (comprobante no timbrado)' });
        } else if (seen.has(row.uuid)) {
          duplicates++;
        } else {
          seen.add(row.uuid);
          row.fileName = entry.filename;
          pending.push(row);
          parsed++;
        }
      } catch (err) {
        errors.push({ file: entry.filename, message: err?.message || 'Error al leer el XML' });
      }

      processed++;
      if (pending.length >= batchSize) {
        flush();
      } else if (Date.now() - lastTick > 300) {
        // Rachas largas de archivos omitidos/erróneos no llenan lotes; este
        // pulso evita que la barra de progreso se quede congelada entre lotes.
        self.postMessage({ type: 'progress', processed, totalXml: xmlEntries.length });
        lastTick = Date.now();
      }
    }

    flush();
    self.postMessage({
      type: 'done',
      summary: {
        totalEntries: entries.length,
        totalXml: xmlEntries.length,
        parsed,
        skippedNonCfdi,
        duplicates,
        errors,
        durationMs: Date.now() - started,
      },
    });
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message || 'ZIP inválido o corrupto' });
  } finally {
    try { await reader?.close(); } catch { /* lector ya cerrado */ }
  }
};
