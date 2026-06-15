// ─── CFDI XML Parser ────────────────────────────────────────────────────
// Parses CFDI 4.0 XML files into structured JSON objects.
// Handles all standard CFDI namespaces and the Timbre Fiscal Digital.
// ─────────────────────────────────────────────────────────────────────────

import { XMLParser } from 'fast-xml-parser';

// CFDI 4.0 namespace prefixes
const CFDI_NS = 'cfdi:';
const TFD_NS = 'tfd:';
const NOMINA_NS = 'nomina12:';

/**
 * Configure the XML parser to handle CFDI namespaces properly.
 * We keep namespace prefixes and parse attributes.
 */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: false,
  isArray: (name) => {
    // These elements can appear multiple times
    const arrayElements = [
      'cfdi:Concepto',
      'cfdi:Traslado',
      'cfdi:Retencion',
      'cfdi:InformacionAduanera',
      'cfdi:CuentaPredial',
      'cfdi:Parte',
    ];
    return arrayElements.includes(name);
  },
});

/**
 * Remove namespace prefix from a tag name.
 * @param {string} name - e.g. "cfdi:Comprobante"
 * @returns {string} - e.g. "Comprobante"
 */
function stripNs(name) {
  return name?.replace(/^[^:]+:/, '') || name;
}

/**
 * Safely get a nested property using a path array.
 */
function getDeep(obj, ...keys) {
  let current = obj;
  for (const key of keys) {
    if (current == null) return undefined;
    // Try with namespace prefix first, then without
    if (current[key] !== undefined) {
      current = current[key];
    } else {
      // Try common prefixes
      const withCfdi = `cfdi:${key}`;
      const withTfd = `tfd:${key}`;
      const withNomina = `nomina12:${key}`;
      if (current[withCfdi] !== undefined) current = current[withCfdi];
      else if (current[withTfd] !== undefined) current = current[withTfd];
      else if (current[withNomina] !== undefined) current = current[withNomina];
      else return undefined;
    }
  }
  return current;
}

/**
 * Parse a CFDI XML string into a structured object.
 * @param {string} xmlString - Raw CFDI XML content
 * @returns {object} Parsed CFDI data
 */
export function parseCfdiXml(xmlString) {
  const parsed = parser.parse(xmlString);

  // The root element can be cfdi:Comprobante or Comprobante
  const comprobante = parsed['cfdi:Comprobante'] || parsed['Comprobante'];

  if (!comprobante) {
    throw new Error('XML no contiene un elemento cfdi:Comprobante válido');
  }

  // ── Root attributes ─────────────────────────────────────────────────
  const attrs = {
    version: comprobante['@_Version'] || comprobante['@_version'] || '4.0',
    serie: comprobante['@_Serie'] || '',
    folio: comprobante['@_Folio'] || '',
    fecha: comprobante['@_Fecha'] || '',
    formaPago: comprobante['@_FormaPago'] || '',
    metodoPago: comprobante['@_MetodoPago'] || '',
    tipoDeComprobante: comprobante['@_TipoDeComprobante'] || 'I',
    lugarExpedicion: comprobante['@_LugarExpedicion'] || '',
    moneda: comprobante['@_Moneda'] || 'MXN',
    tipoCambio: parseFloat(comprobante['@_TipoCambio'] || '1'),
    subtotal: parseFloat(comprobante['@_SubTotal'] || '0'),
    descuento: parseFloat(comprobante['@_Descuento'] || '0'),
    total: parseFloat(comprobante['@_Total'] || '0'),
    noCertificado: comprobante['@_NoCertificado'] || '',
    sello: comprobante['@_Sello'] || '',
    certificado: comprobante['@_Certificado'] || '',
    condicionesDePago: comprobante['@_CondicionesDePago'] || '',
    exportacion: comprobante['@_Exportacion'] || '',
  };

  // ── Emisor ──────────────────────────────────────────────────────────
  const emisorNode = getDeep(comprobante, 'Emisor');
  const emisor = {
    rfc: emisorNode?.['@_Rfc'] || '',
    nombre: emisorNode?.['@_Nombre'] || '',
    regimenFiscal: emisorNode?.['@_RegimenFiscal'] || '',
  };

  // ── Receptor ────────────────────────────────────────────────────────
  const receptorNode = getDeep(comprobante, 'Receptor');
  const receptor = {
    rfc: receptorNode?.['@_Rfc'] || '',
    nombre: receptorNode?.['@_Nombre'] || '',
    usoCFDI: receptorNode?.['@_UsoCFDI'] || '',
    domicilioFiscalReceptor: receptorNode?.['@_DomicilioFiscalReceptor'] || '',
    regimenFiscalReceptor: receptorNode?.['@_RegimenFiscalReceptor'] || '',
  };

  // ── Conceptos ───────────────────────────────────────────────────────
  const conceptosNode = getDeep(comprobante, 'Conceptos');
  const conceptosList = conceptosNode
    ? (getDeep(conceptosNode, 'Concepto') || [])
    : [];

  // Ensure it's always an array
  const conceptosArray = Array.isArray(conceptosList) ? conceptosList : [conceptosList];

  const conceptos = conceptosArray.map(c => {
    // Parse concept-level taxes
    const impuestosConcepto = getDeep(c, 'Impuestos');
    const trasladosConcepto = impuestosConcepto
      ? ensureArray(getDeep(impuestosConcepto, 'Traslados', 'Traslado') || [])
      : [];
    const retencionesConcepto = impuestosConcepto
      ? ensureArray(getDeep(impuestosConcepto, 'Retenciones', 'Retencion') || [])
      : [];

    return {
      claveProdServ: c['@_ClaveProdServ'] || '',
      claveUnidad: c['@_ClaveUnidad'] || '',
      unidad: c['@_Unidad'] || '',
      noIdentificacion: c['@_NoIdentificacion'] || '',
      descripcion: c['@_Descripcion'] || '',
      cantidad: parseFloat(c['@_Cantidad'] || '1'),
      valorUnitario: parseFloat(c['@_ValorUnitario'] || '0'),
      importe: parseFloat(c['@_Importe'] || '0'),
      descuento: parseFloat(c['@_Descuento'] || '0'),
      objetoImp: c['@_ObjetoImp'] || '',
      traslados: trasladosConcepto.map(t => ({
        impuesto: t['@_Impuesto'] || '',
        tipoFactor: t['@_TipoFactor'] || '',
        tasaOCuota: parseFloat(t['@_TasaOCuota'] || '0'),
        base: parseFloat(t['@_Base'] || '0'),
        importe: parseFloat(t['@_Importe'] || '0'),
      })),
      retenciones: retencionesConcepto.map(r => ({
        impuesto: r['@_Impuesto'] || '',
        tipoFactor: r['@_TipoFactor'] || '',
        tasaOCuota: parseFloat(r['@_TasaOCuota'] || '0'),
        base: parseFloat(r['@_Base'] || '0'),
        importe: parseFloat(r['@_Importe'] || '0'),
      })),
    };
  });

  // ── Impuestos globales ──────────────────────────────────────────────
  const impuestosNode = getDeep(comprobante, 'Impuestos');
  const impuestos = {
    totalImpuestosTrasladados: parseFloat(impuestosNode?.['@_TotalImpuestosTrasladados'] || '0'),
    totalImpuestosRetenidos: parseFloat(impuestosNode?.['@_TotalImpuestosRetenidos'] || '0'),
    traslados: [],
    retenciones: [],
  };

  if (impuestosNode) {
    const trasladosGlobal = getDeep(impuestosNode, 'Traslados', 'Traslado');
    if (trasladosGlobal) {
      impuestos.traslados = ensureArray(trasladosGlobal).map(t => ({
        impuesto: t['@_Impuesto'] || '',
        tipoFactor: t['@_TipoFactor'] || '',
        tasaOCuota: parseFloat(t['@_TasaOCuota'] || '0'),
        base: parseFloat(t['@_Base'] || '0'),
        importe: parseFloat(t['@_Importe'] || '0'),
      }));
    }

    const retencionesGlobal = getDeep(impuestosNode, 'Retenciones', 'Retencion');
    if (retencionesGlobal) {
      impuestos.retenciones = ensureArray(retencionesGlobal).map(r => ({
        impuesto: r['@_Impuesto'] || '',
        importe: parseFloat(r['@_Importe'] || '0'),
      }));
    }
  }

  // ── Complemento: Timbre Fiscal Digital ──────────────────────────────
  const complementoNode = getDeep(comprobante, 'Complemento');
  let timbreFiscal = null;

  if (complementoNode) {
    const tfd = getDeep(complementoNode, 'TimbreFiscalDigital') ||
                complementoNode['tfd:TimbreFiscalDigital'];

    if (tfd) {
      timbreFiscal = {
        uuid: tfd['@_UUID'] || '',
        fechaTimbrado: tfd['@_FechaTimbrado'] || '',
        rfcProvCertif: tfd['@_RfcProvCertif'] || '',
        selloCFD: tfd['@_SelloCFD'] || '',
        noCertificadoSAT: tfd['@_NoCertificadoSAT'] || '',
        selloSAT: tfd['@_SelloSAT'] || '',
      };
    }
  }

  // ── Complemento: Nómina ─────────────────────────────────────────────
  let nomina = null;
  if (complementoNode) {
    const nominaNode = getDeep(complementoNode, 'Nomina') ||
                       complementoNode['nomina12:Nomina'];
    if (nominaNode) {
      nomina = {
        tipoNomina: nominaNode['@_TipoNomina'] || '',
        fechaPago: nominaNode['@_FechaPago'] || '',
        fechaInicialPago: nominaNode['@_FechaInicialPago'] || '',
        fechaFinalPago: nominaNode['@_FechaFinalPago'] || '',
        numDiasPagados: parseFloat(nominaNode['@_NumDiasPagados'] || '0'),
        totalPercepciones: parseFloat(nominaNode['@_TotalPercepciones'] || '0'),
        totalDeducciones: parseFloat(nominaNode['@_TotalDeducciones'] || '0'),
      };
    }
  }

  // ── Compose final object ────────────────────────────────────────────
  return {
    // Identification
    uuid: timbreFiscal?.uuid || '',
    version: attrs.version,

    // Comprobante attributes
    serie: attrs.serie,
    folio: attrs.folio,
    fecha: attrs.fecha,
    formaPago: attrs.formaPago,
    metodoPago: attrs.metodoPago,
    tipoDeComprobante: attrs.tipoDeComprobante,
    lugarExpedicion: attrs.lugarExpedicion,
    condicionesDePago: attrs.condicionesDePago,
    exportacion: attrs.exportacion,

    // Monetary
    moneda: attrs.moneda,
    tipoCambio: attrs.tipoCambio,
    subtotal: attrs.subtotal,
    descuento: attrs.descuento,
    total: attrs.total,

    // Certificate
    noCertificado: attrs.noCertificado,
    sello: attrs.sello,

    // Parties
    emisor,
    receptor,

    // Line items
    conceptos,

    // Tax summary
    impuestos,

    // Digital stamp
    timbreFiscal,

    // Payroll (if applicable)
    nomina,
  };
}

/**
 * Parse CFDI metadata from SAT metadata CSV/text format.
 * The SAT metadata download returns pipe-delimited text.
 * @param {string} metadataLine - Single line of metadata
 * @returns {object} Parsed metadata
 */
export function parseMetadataLine(metadataLine) {
  const fields = metadataLine.split('~');

  // SAT metadata fields order (varies by version):
  // UUID | RFC Emisor | Nombre Emisor | RFC Receptor | Nombre Receptor |
  // RFC PAC | Fecha Emisión | Fecha Certificación | Monto | Efecto | Estatus |
  // Fecha Cancelación
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

/**
 * Determine the CFDI type name in Spanish.
 */
export function getTipoComprobanteName(code) {
  const types = {
    I: 'Ingreso',
    E: 'Egreso',
    P: 'Pago',
    N: 'Nómina',
    T: 'Traslado',
  };
  return types[code] || code;
}

/**
 * Map SAT tax code to human-readable name.
 */
export function getImpuestoName(code) {
  const taxes = {
    '001': 'ISR',
    '002': 'IVA',
    '003': 'IEPS',
  };
  return taxes[code] || code;
}

/**
 * Ensure a value is an array.
 */
function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}
