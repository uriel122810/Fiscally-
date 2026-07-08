// Traduce una fila cruda de la tabla `facturas` de Supabase a la forma que
// las páginas (Invoices, Receipts, InvoiceDrawer, Dashboard) ya esperan.
// El esquema real es más delgado que el mock original: rubro/status de
// cobro/items/notas no existen como columnas, así que se rellenan con
// defaults honestos en vez de fabricar datos.

const TIPO_LABELS = { I: 'Ingreso', E: 'Egreso', N: 'Nómina', P: 'Pago', T: 'Traslado' };

const DEFAULT_RUBRO = 'Sin clasificar';
const DEFAULT_RUBRO_COLOR = '#64748B';

export function deriveStatus(row) {
  if (row.sat_status === 'cancelada') return 'cancelada';
  if (row.direction === 'recibida') return 'pagada';
  return 'cobrada'; // 'emitida' o direction nula/desconocida
}

function counterparty(row) {
  if (row.direction === 'recibida') {
    return {
      razon_social: row.nombre_emisor || row.rfc_emisor || 'RFC no identificado',
      rfc: row.rfc_emisor || '—',
    };
  }
  // 'emitida' o direction desconocida: mostramos al receptor, con fallback
  // al emisor si faltan los campos de nombre (filas antiguas de BulkImport
  // que aún no escribían nombre_emisor/nombre_receptor).
  return {
    razon_social: row.nombre_receptor || row.rfc_receptor || row.nombre_emisor || row.rfc_emisor || 'RFC no identificado',
    rfc: row.rfc_receptor || row.rfc_emisor || '—',
  };
}

export function mapFacturaRow(row) {
  const { razon_social, rfc } = counterparty(row);
  return {
    id: row.id,
    uuid_cfdi: row.uuid_fiscal,
    direction: row.direction ?? null,
    razon_social,
    rfc,
    rubro: DEFAULT_RUBRO,
    rubroColor: DEFAULT_RUBRO_COLOR,
    folio: row.folio || '',
    serie: row.serie || '',
    fecha: row.fecha_emision,
    fecha_vencimiento: null,
    sat_status: row.sat_status || 'vigente',
    status: deriveStatus(row),
    total: Number(row.total) || 0,
    subtotal: Number(row.subtotal) || 0,
    moneda: row.moneda || 'MXN',
    forma_pago: row.forma_pago || '',
    iva: 0,
    tipo: TIPO_LABELS[row.tipo_cfdi] || row.tipo_cfdi || '—',
    items: [],
    notas: '',
  };
}
