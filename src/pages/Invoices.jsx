import { useState, useMemo } from 'react';
import {
  Search, Filter, Download, Plus, ChevronUp, ChevronDown,
  Eye, FileDown, MoreHorizontal, CheckSquare, X,
  Shield, ShieldOff, FileText, FileX, Loader2, WifiOff, Wifi, AlertTriangle
} from 'lucide-react';
import { formatCurrency, formatDate } from '../data/mockData';
import { useInvoices, useInconsistencias } from '../hooks/useSatData';
import { satApi } from '../api/satClient';
import InvoiceDrawer from './InvoiceDrawer';

function StatusBadge({ status }) {
  const map = {
    por_cobrar: { cls: 'badge-cobrar', label: 'Por cobrar' },
    por_pagar:  { cls: 'badge-pagar',  label: 'Por pagar'  },
    cobrada:    { cls: 'badge-cobrada',label: 'Cobrada'    },
    pagada:     { cls: 'badge-pagada', label: 'Pagada'     },
    cancelada:  { cls: 'badge-cancelada', label: 'Cancelada' },
  };
  const info = map[status] || { cls: 'badge-pendiente', label: status };
  return (
    <span className={`badge ${info.cls}`}>
      <span className="badge-dot" />
      {info.label}
    </span>
  );
}

function RubroBadge({ rubro, color, confidence }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
      <span className="rubro-badge" style={{ background: `${color}18`, color }}>
        {rubro}
      </span>
      {confidence && (
        <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 2, fontWeight: 500 }}>
          <span style={{ color: 'var(--warning-text)' }}>✨</span> {Math.round(confidence * 100)}% IA
        </span>
      )}
    </div>
  );
}

function SortIcon({ field, sortField, sortDir }) {
  if (sortField !== field) return <ChevronUp size={12} style={{ opacity: 0.25 }} />;
  return sortDir === 'asc'
    ? <ChevronUp size={12} style={{ color: 'var(--accent-500)' }} />
    : <ChevronDown size={12} style={{ color: 'var(--accent-500)' }} />;
}

function DataSourceBadge({ isLive }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 'var(--text-xs)', fontWeight: 600,
      color: isLive ? 'var(--success-text)' : 'var(--warning-text)',
      background: isLive ? 'var(--success-bg)' : 'var(--warning-bg)',
      border: `1px solid ${isLive ? 'var(--success-border)' : 'var(--warning-border)'}`,
      padding: '2px 8px', borderRadius: 'var(--radius-full)',
    }}>
      {isLive ? <Wifi size={10} /> : <WifiOff size={10} />}
      {isLive ? 'Datos SAT en vivo' : 'Datos de demostración'}
    </span>
  );
}

export default function Invoices() {
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [sortField, setSortField]     = useState('fecha');
  const [sortDir, setSortDir]         = useState('desc');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [activeTab, setActiveTab]     = useState('all');

  // ── Use real data hook ────────────────────────────────────────────
  const directionFilter = activeTab === 'all' ? undefined : (activeTab === 'recibidas' ? 'recibida' : 'emitida');
  const { invoices, loading, error, total, refetch, isLive } = useInvoices({
    direction: directionFilter,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    search: search.trim() || undefined,
  });
  const { inconsistencias } = useInconsistencias();
  const flaggedIds = useMemo(() => new Set(inconsistencias.map(i => i.factura_id)), [inconsistencias]);
  const flaggedDesc = useMemo(() => new Map(inconsistencias.map(i => [i.factura_id, i.descripcion_analisis])), [inconsistencias]);

  // ── Client-side sorting (since the API returns sorted by date) ────
  const filtered = useMemo(() => {
    let list = [...invoices];
    list.sort((a, b) => {
      let av = a[sortField], bv = b[sortField];
      if (sortField === 'fecha') { av = new Date(av); bv = new Date(bv); }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [invoices, sortField, sortDir]);

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const toggleRow = (id) => {
    setSelectedRows(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    if (selectedRows.size === filtered.length) setSelectedRows(new Set());
    else setSelectedRows(new Set(filtered.map(i => i.id)));
  };

  // ── Download handlers ─────────────────────────────────────────────
  const handleDownloadXml = (inv, e) => {
    e?.stopPropagation();
    satApi.downloadXml(inv.uuid_cfdi || inv.id, `${inv.serie}${inv.folio}.xml`);
  };

  const handleDownloadPdf = (inv, e) => {
    e?.stopPropagation();
    satApi.downloadPdf(inv.uuid_cfdi || inv.id, `${inv.serie}${inv.folio}.pdf`);
  };

  const counts = {
    all: total || invoices.length,
    recibidas: invoices.filter(i => i.direction === 'recibida').length,
    emitidas: invoices.filter(i => i.direction === 'emitida').length,
  };

  // Adjust counts for tabs when showing all
  if (activeTab === 'all') {
    counts.recibidas = invoices.filter(i => i.direction === 'recibida').length;
    counts.emitidas = invoices.filter(i => i.direction === 'emitida').length;
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Facturas</h1>
          <p style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
            Comprobantes fiscales digitales CFDI 4.0
            <DataSourceBadge isLive={isLive} />
          </p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary btn-sm">
            <Download size={14} /> Excel
          </button>
          <button className="btn btn-secondary btn-sm">
            <FileText size={14} /> XML
          </button>
          <button className="btn btn-secondary btn-sm">
            <FileDown size={14} /> PDF
          </button>
          <button className="btn btn-primary">
            <Plus size={15} /> Nueva Factura
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {[
          { id: 'all', label: 'Todas', count: counts.all },
          { id: 'recibidas', label: 'Recibidas', count: counts.recibidas },
          { id: 'emitidas', label: 'Emitidas', count: counts.emitidas },
        ].map(tab => (
          <button
            key={tab.id}
            className={`tab-item${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            <span className="tab-count">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        <div className="search-wrap">
          <Search size={15} className="search-icon" />
          <input
            className="search-input"
            placeholder="Buscar por RFC, razón social, folio..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select
          className="filter-select"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="all">Todos los estatus</option>
          <option value="por_cobrar">Por cobrar</option>
          <option value="por_pagar">Por pagar</option>
          <option value="cobrada">Cobradas</option>
          <option value="pagada">Pagadas</option>
          <option value="cancelada">Canceladas</option>
        </select>

        <select className="filter-select">
          <option>Este mes</option>
          <option>Últimos 3 meses</option>
          <option>Este año</option>
        </select>

        <select className="filter-select">
          <option>Todos los rubros</option>
          <option>Servicios Profesionales</option>
          <option>Nómina</option>
          <option>Renta y Local</option>
          <option>Compras e Insumos</option>
        </select>

        <div className="filter-spacer" />

        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
          {loading ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Loader2 size={12} className="spin-icon" /> Cargando...
            </span>
          ) : (
            `${filtered.length} resultados`
          )}
        </span>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input
                  type="checkbox"
                  checked={selectedRows.size === filtered.length && filtered.length > 0}
                  onChange={toggleAll}
                  style={{ accentColor: 'var(--accent-500)', cursor: 'pointer' }}
                />
              </th>
              <th onClick={() => handleSort('razon_social')} style={{ minWidth: 200 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Razón Social <SortIcon field="razon_social" sortField={sortField} sortDir={sortDir} />
                </span>
              </th>
              <th>Rubro</th>
              <th onClick={() => handleSort('folio')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Folio <SortIcon field="folio" sortField={sortField} sortDir={sortDir} />
                </span>
              </th>
              <th onClick={() => handleSort('fecha')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Fecha <SortIcon field="fecha" sortField={sortField} sortDir={sortDir} />
                </span>
              </th>
              <th onClick={() => handleSort('fecha_vencimiento')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Vencimiento <SortIcon field="fecha_vencimiento" sortField={sortField} sortDir={sortDir} />
                </span>
              </th>
              <th>SAT</th>
              <th>Estatus</th>
              <th onClick={() => handleSort('total')} style={{ textAlign: 'right' }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                  Total <SortIcon field="total" sortField={sortField} sortDir={sortDir} />
                </span>
              </th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--text-tertiary)' }}>
                  <Loader2 size={24} className="spin-icon" style={{ margin: '0 auto var(--sp-3)' }} />
                  <div>Cargando facturas del SAT...</div>
                </td>
              </tr>
            ) : (
              filtered.map(inv => (
                <tr
                  key={inv.id}
                  className={`table-row${selectedRows.has(inv.id) ? ' selected' : ''}`}
                  onClick={() => setSelectedInvoice(inv)}
                >
                  <td onClick={e => { e.stopPropagation(); toggleRow(inv.id); }}>
                    <input
                      type="checkbox"
                      checked={selectedRows.has(inv.id)}
                      onChange={() => {}}
                      style={{ accentColor: 'var(--accent-500)', cursor: 'pointer' }}
                    />
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)', lineHeight: 1.3 }}>
                        {inv.razon_social}
                      </div>
                      {flaggedIds.has(inv.id) && (
                        <AlertTriangle size={13} style={{ color: 'var(--warning-text)', flexShrink: 0 }} title={flaggedDesc.get(inv.id)} />
                      )}
                    </div>
                    <div className="td-mono" style={{ marginTop: 2 }}>{inv.rfc}</div>
                  </td>
                  <td><RubroBadge rubro={inv.rubro} color={inv.rubroColor} confidence={0.92} /></td>
                  <td>
                    <span className="mono-sm">{inv.serie}{inv.folio}</span>
                  </td>
                  <td>
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                      {formatDate(inv.fecha)}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                      {inv.fecha_vencimiento ? formatDate(inv.fecha_vencimiento) : '—'}
                    </span>
                  </td>
                  <td>
                    {inv.sat_status === 'vigente'
                      ? <Shield size={14} style={{ color: 'var(--success-text)' }} />
                      : <ShieldOff size={14} style={{ color: 'var(--danger-text)' }} />
                    }
                  </td>
                  <td><StatusBadge status={inv.status} /></td>
                  <td className={`amount-cell ${inv.direction === 'emitida' ? 'positive' : ''}`}>
                    {formatCurrency(inv.total, inv.moneda)}
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <div className="row-actions">
                      <button
                        className="btn btn-ghost btn-sm btn-icon"
                        title="Ver detalle"
                        onClick={() => setSelectedInvoice(inv)}
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm btn-icon"
                        title="Descargar XML"
                        onClick={(e) => handleDownloadXml(inv, e)}
                      >
                        <FileDown size={14} />
                      </button>
                      <button className="btn btn-ghost btn-sm btn-icon" title="Más opciones">
                        <MoreHorizontal size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Selection toolbar */}
      {selectedRows.size > 0 && (
        <div className="selection-toolbar">
          <CheckSquare size={16} />
          <span>{selectedRows.size} factura{selectedRows.size !== 1 ? 's' : ''} seleccionada{selectedRows.size !== 1 ? 's' : ''}</span>
          <button onClick={() => {}}>Exportar</button>
          <button onClick={() => {}}>Cambiar estatus</button>
          <button onClick={() => setSelectedRows(new Set())}>
            <X size={13} />
          </button>
        </div>
      )}

      {/* Invoice Drawer */}
      {selectedInvoice && (
        <InvoiceDrawer
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
        />
      )}
    </div>
  );
}
