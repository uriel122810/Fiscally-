// ─── CFDI Transformer ───────────────────────────────────────────────────
// Transforms parsed CFDI data into the exact shape expected by the
// Fiscally frontend components (matching mockData.js structure).
// ─────────────────────────────────────────────────────────────────────────

import { getImpuestoName, getTipoComprobanteName } from './XmlParser.js';

// ── Rubro classification by ClaveProdServ ranges ──────────────────────
const RUBRO_RULES = [
  { range: [80000000, 80999999], rubro: 'Servicios Profesionales', color: '#6366F1' },
  { range: [81000000, 81999999], rubro: 'Servicios Profesionales', color: '#6366F1' },
  { range: [84000000, 84999999], rubro: 'Servicios Financieros',   color: '#3B82F6' },
  { range: [43000000, 43999999], rubro: 'Tecnología e Informática', color: '#06B6D4' },
  { range: [44000000, 44999999], rubro: 'Equipos y Periféricos',   color: '#8B5CF6' },
  { range: [90000000, 90999999], rubro: 'Servicios de Viaje',      color: '#EC4899' },
  { range: [78000000, 78999999], rubro: 'Transporte y Logística',  color: '#F97316' },
  { range: [50000000, 50999999], rubro: 'Alimentación',            color: '#EF4444' },
  { range: [72000000, 72999999], rubro: 'Construcción y Mantenimiento', color: '#A855F7' },
  { range: [85000000, 85999999], rubro: 'Salud y Seguros',         color: '#14B8A6' },
  { range: [86000000, 86999999], rubro: 'Educación y Capacitación', color: '#F59E0B' },
  { range: [80161500, 80161500], rubro: 'Servicios de Consultoría', color: '#6366F1' },
];

/**
 * Classify a CFDI into a "rubro" (category) based on ClaveProdServ.
 * @param {object} parsedCfdi - Parsed CFDI data from XmlParser
 * @returns {{ rubro: string, color: string }}
 */
function classifyRubro(parsedCfdi) {
  // Special case: Nómina
  if (parsedCfdi.tipoDeComprobante === 'N') {
    return { rubro: 'Nómina', color: '#8B5CF6' };
  }

  // Special case: Payment complement
  if (parsedCfdi.tipoDeComprobante === 'P') {
    return { rubro: 'Complemento de Pago', color: '#10B981' };
  }

  // Try to classify by the first concept's ClaveProdServ
  const firstClave = parsedCfdi.conceptos?.[0]?.claveProdServ;
  if (firstClave) {
    const code = parseInt(firstClave, 10);
    for (const rule of RUBRO_RULES) {
      if (code >= rule.range[0] && code <= rule.range[1]) {
        return { rubro: rule.rubro, color: rule.color };
      }
    }
  }

  // Default fallback
  return { rubro: 'General', color: '#6B7280' };
}

/**
 * Calculate the total IVA (Value Added Tax) from impuestos traslados.
 * @param {object} parsedCfdi - Parsed CFDI data
 * @returns {number} Total IVA amount
 */
function calculateIva(parsedCfdi) {
  return (parsedCfdi.impuestos?.traslados || [])
    .filter(t => t.impuesto === '002') // IVA code
    .reduce((sum, t) => sum + (t.importe || 0), 0);
}

/**
 * Calculate ISR retention from impuestos retenciones.
 * @param {object} parsedCfdi - Parsed CFDI data
 * @returns {number} Total ISR retained
 */
function calculateIsrRetenido(parsedCfdi) {
  return (parsedCfdi.impuestos?.retenciones || [])
    .filter(r => r.impuesto === '001') // ISR code
    .reduce((sum, r) => sum + (r.importe || 0), 0);
}

/**
 * Calculate IVA retention from impuestos retenciones.
 * @param {object} parsedCfdi - Parsed CFDI data
 * @returns {number} Total IVA retained
 */
function calculateIvaRetenido(parsedCfdi) {
  return (parsedCfdi.impuestos?.retenciones || [])
    .filter(r => r.impuesto === '002') // IVA code
    .reduce((sum, r) => sum + (r.importe || 0), 0);
}

/**
 * Derive a payment status based on available CFDI information.
 * This is a best-effort heuristic since payment status isn't in the XML.
 * @param {object} parsedCfdi - Parsed CFDI data
 * @param {string} direction - 'emitida' or 'recibida'
 * @returns {string} Status key
 */
function derivePaymentStatus(parsedCfdi, direction) {
  // If cancelled in SAT
  if (parsedCfdi.sat_status === 'cancelada' || parsedCfdi.sat_status === '0') {
    return 'cancelada';
  }

  // Payment complement = already paid
  if (parsedCfdi.tipoDeComprobante === 'P') {
    return 'pagada';
  }

  // Nómina = always paid immediately
  if (parsedCfdi.tipoDeComprobante === 'N') {
    return 'pagada';
  }

  // PUE (Pago en Una Exhibición) = paid in full at emission
  if (parsedCfdi.metodoPago === 'PUE') {
    return direction === 'emitida' ? 'cobrada' : 'pagada';
  }

  // PPD (Pago en Parcialidades o Diferido) = pending
  if (parsedCfdi.metodoPago === 'PPD') {
    return direction === 'emitida' ? 'por_cobrar' : 'por_pagar';
  }

  // Default: pending
  return direction === 'emitida' ? 'por_cobrar' : 'por_pagar';
}

/**
 * Calculate the concept-level IVA for frontend display.
 * @param {object} concepto - A single concepto from parsed CFDI
 * @returns {number} IVA amount for this concept
 */
function calculateConceptIva(concepto) {
  return (concepto.traslados || [])
    .filter(t => t.impuesto === '002')
    .reduce((sum, t) => sum + (t.importe || 0), 0);
}

/**
 * Transform a parsed CFDI into the frontend invoice shape.
 * This produces an object compatible with the existing Invoices.jsx component.
 *
 * @param {object} parsedCfdi - Parsed CFDI data from XmlParser
 * @param {string} direction - 'emitida' or 'recibida'
 * @param {string} [satStatus='vigente'] - SAT validation status
 * @returns {object} Frontend-compatible invoice object
 */
export function transformToFrontendInvoice(parsedCfdi, direction, satStatus = 'vigente') {
  const { rubro, color } = classifyRubro(parsedCfdi);
  const iva = calculateIva(parsedCfdi);

  // Attach sat_status for status derivation
  const cfdiWithStatus = { ...parsedCfdi, sat_status: satStatus };
  const status = derivePaymentStatus(cfdiWithStatus, direction);

  // Compute a due date (30 days after emission) if not available
  const fechaDate = new Date(parsedCfdi.fecha);
  const fechaVencimiento = new Date(fechaDate);
  fechaVencimiento.setDate(fechaVencimiento.getDate() + 30);

  return {
    id: parsedCfdi.uuid || parsedCfdi.timbreFiscal?.uuid || crypto.randomUUID(),
    uuid_cfdi: parsedCfdi.uuid || parsedCfdi.timbreFiscal?.uuid || '',
    razon_social: direction === 'recibida'
      ? (parsedCfdi.emisor?.nombre || parsedCfdi.emisor?.rfc || '')
      : (parsedCfdi.receptor?.nombre || parsedCfdi.receptor?.rfc || ''),
    rfc: direction === 'recibida'
      ? (parsedCfdi.emisor?.rfc || '')
      : (parsedCfdi.receptor?.rfc || ''),
    rfc_emisor: parsedCfdi.emisor?.rfc || '',
    rfc_receptor: parsedCfdi.receptor?.rfc || '',
    nombre_emisor: parsedCfdi.emisor?.nombre || '',
    nombre_receptor: parsedCfdi.receptor?.nombre || '',
    regimen_fiscal_emisor: parsedCfdi.emisor?.regimenFiscal || '',
    uso_cfdi: parsedCfdi.receptor?.usoCFDI || '',
    rubro,
    rubroColor: color,
    folio: parsedCfdi.folio || 'S/F',
    serie: parsedCfdi.serie || '',
    fecha: parsedCfdi.fecha?.split('T')[0] || '',
    fecha_timbrado: parsedCfdi.timbreFiscal?.fechaTimbrado || '',
    fecha_vencimiento: fechaVencimiento.toISOString().split('T')[0],
    status,
    direction,
    total: parsedCfdi.total,
    iva,
    isr_retenido: calculateIsrRetenido(parsedCfdi),
    iva_retenido: calculateIvaRetenido(parsedCfdi),
    subtotal: parsedCfdi.subtotal,
    descuento: parsedCfdi.descuento,
    moneda: parsedCfdi.moneda || 'MXN',
    tipo_cambio: parsedCfdi.tipoCambio || 1,
    sat_status: satStatus,
    tipo: getTipoComprobanteName(parsedCfdi.tipoDeComprobante),
    tipo_comprobante: parsedCfdi.tipoDeComprobante,
    forma_pago: parsedCfdi.formaPago || '',
    metodo_pago: parsedCfdi.metodoPago || '',
    lugar_expedicion: parsedCfdi.lugarExpedicion || '',
    no_certificado: parsedCfdi.noCertificado || '',
    items: (parsedCfdi.conceptos || []).map(c => ({
      descripcion: c.descripcion,
      cantidad: c.cantidad,
      precio: c.valorUnitario,
      importe: c.importe,
      iva: calculateConceptIva(c),
      claveProdServ: c.claveProdServ,
      claveUnidad: c.claveUnidad,
      unidad: c.unidad,
    })),
    // Timbre fiscal info
    timbre: parsedCfdi.timbreFiscal ? {
      uuid: parsedCfdi.timbreFiscal.uuid,
      fechaTimbrado: parsedCfdi.timbreFiscal.fechaTimbrado,
      rfcProvCertif: parsedCfdi.timbreFiscal.rfcProvCertif,
      noCertificadoSAT: parsedCfdi.timbreFiscal.noCertificadoSAT,
      selloCFD: parsedCfdi.timbreFiscal.selloCFD?.substring(0, 50) + '...',
      selloSAT: parsedCfdi.timbreFiscal.selloSAT?.substring(0, 50) + '...',
    } : null,
    // Nómina info (if applicable)
    nomina: parsedCfdi.nomina || null,
    notas: '',
  };
}

/**
 * Transform an array of parsed CFDIs into frontend invoice shapes.
 * @param {Array} parsedCfdis - Array of parsed CFDI objects
 * @param {string} companyRfc - The company's RFC to determine direction
 * @returns {Array} Frontend-compatible invoice array
 */
export function transformBatch(parsedCfdis, companyRfc) {
  return parsedCfdis.map(cfdi => {
    const direction = cfdi.emisor?.rfc === companyRfc ? 'emitida' : 'recibida';
    return transformToFrontendInvoice(cfdi, direction);
  });
}

/**
 * Compute aggregated KPI data from a list of frontend invoices.
 * @param {Array} invoices - Frontend-formatted invoices
 * @param {number} year - Year to compute
 * @param {number} month - Month to compute (1-12)
 * @returns {object} KPI data matching Dashboard expectations
 */
export function computeKpis(invoices, year, month) {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  // Filter invoices for the given month
  const monthInvoices = invoices.filter(inv =>
    inv.fecha?.startsWith(monthStr) && inv.sat_status !== 'cancelada'
  );

  // Separate by direction
  const emitidas = monthInvoices.filter(i => i.direction === 'emitida');
  const recibidas = monthInvoices.filter(i => i.direction === 'recibida');

  const ingresos = emitidas.reduce((sum, i) => sum + (i.total || 0), 0);
  const gastos = recibidas.reduce((sum, i) => sum + (i.total || 0), 0);
  const balance = ingresos - gastos;

  // Previous month for delta calculation
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

  const prevInvoices = invoices.filter(inv =>
    inv.fecha?.startsWith(prevMonthStr) && inv.sat_status !== 'cancelada'
  );
  const prevEmitidas = prevInvoices.filter(i => i.direction === 'emitida');
  const prevRecibidas = prevInvoices.filter(i => i.direction === 'recibida');
  const prevIngresos = prevEmitidas.reduce((sum, i) => sum + (i.total || 0), 0);
  const prevGastos = prevRecibidas.reduce((sum, i) => sum + (i.total || 0), 0);
  const prevBalance = prevIngresos - prevGastos;

  const calcDelta = (current, previous) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return parseFloat((((current - previous) / previous) * 100).toFixed(1));
  };

  return {
    ingresos,
    gastos,
    balance,
    ingresosDelta: calcDelta(ingresos, prevIngresos),
    gastosDelta: calcDelta(gastos, prevGastos),
    balanceDelta: calcDelta(balance, prevBalance),
    facturasPorCobrar: monthInvoices.filter(i => i.status === 'por_cobrar').length,
    facturasPorPagar: monthInvoices.filter(i => i.status === 'por_pagar').length,
    totalFacturas: monthInvoices.length,
    totalEmitidas: emitidas.length,
    totalRecibidas: recibidas.length,
  };
}

/**
 * Compute monthly chart data from invoices.
 * @param {Array} invoices - Frontend-formatted invoices
 * @param {number} year - Year
 * @returns {Array} Monthly data for charts
 */
export function computeMonthlyData(invoices, year) {
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  return months.map((mes, idx) => {
    const monthStr = `${year}-${String(idx + 1).padStart(2, '0')}`;
    const monthInvoices = invoices.filter(inv =>
      inv.fecha?.startsWith(monthStr) && inv.sat_status !== 'cancelada'
    );

    const ingresos = monthInvoices
      .filter(i => i.direction === 'emitida')
      .reduce((sum, i) => sum + (i.total || 0), 0);

    const gastos = monthInvoices
      .filter(i => i.direction === 'recibida')
      .reduce((sum, i) => sum + (i.total || 0), 0);

    return { mes, ingresos, gastos };
  });
}

/**
 * Compute rubro (category) distribution from invoices.
 * @param {Array} invoices - Frontend-formatted invoices (gastos only)
 * @returns {Array} Rubro distribution for pie chart
 */
export function computeRubroDistribution(invoices) {
  const gastos = invoices.filter(i =>
    i.direction === 'recibida' && i.sat_status !== 'cancelada'
  );

  const rubroMap = {};
  for (const inv of gastos) {
    const key = inv.rubro || 'General';
    if (!rubroMap[key]) {
      rubroMap[key] = { name: key, value: 0, color: inv.rubroColor || '#6B7280' };
    }
    rubroMap[key].value += inv.total || 0;
  }

  return Object.values(rubroMap)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8); // Top 8 categories
}

/**
 * Compute tax data for the Taxes page.
 * @param {Array} invoices - All frontend invoices
 * @param {number} year - Year
 * @returns {Array} Monthly tax declarations data
 */
export function computeTaxData(invoices, year) {
  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const now = new Date();

  return months.map((mes, idx) => {
    const monthNum = idx + 1;
    const monthStr = `${year}-${String(monthNum).padStart(2, '0')}`;

    const monthInvoices = invoices.filter(inv =>
      inv.fecha?.startsWith(monthStr) && inv.sat_status !== 'cancelada'
    );

    const ingresos = monthInvoices
      .filter(i => i.direction === 'emitida')
      .reduce((sum, i) => sum + (i.total || 0), 0);

    const gastos = monthInvoices
      .filter(i => i.direction === 'recibida')
      .reduce((sum, i) => sum + (i.total || 0), 0);

    const ivaCobrado = monthInvoices
      .filter(i => i.direction === 'emitida')
      .reduce((sum, i) => sum + (i.iva || 0), 0);

    const ivaPagado = monthInvoices
      .filter(i => i.direction === 'recibida')
      .reduce((sum, i) => sum + (i.iva || 0), 0);

    // Simplified ISR/IVA estimation
    const isr = Math.round((ingresos - gastos) * 0.30 * 0.10); // Provisional rate
    const iva = Math.round(ivaCobrado - ivaPagado);

    // Determine limit date (17th of next month)
    const limitMonth = monthNum === 12 ? 1 : monthNum + 1;
    const limitYear = monthNum === 12 ? year + 1 : year;
    const limite = `${limitYear}-${String(limitMonth).padStart(2, '0')}-17`;

    // Determine status
    const limitDate = new Date(limite);
    const isPast = limitDate < now;
    const hasCfdis = monthInvoices.length > 0;

    let status = 'pendiente';
    if (isPast && hasCfdis) status = 'presentada';
    else if (!hasCfdis && isPast) status = 'pendiente';

    return {
      mes,
      anio: year,
      status,
      limite,
      isr: hasCfdis ? isr : null,
      iva: hasCfdis ? iva : null,
      fecha_pres: status === 'presentada' ? `${year}-${String(limitMonth).padStart(2, '0')}-14` : null,
    };
  });
}
