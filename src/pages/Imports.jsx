import { useState } from 'react';
import { Anchor, Globe, FileText, Download, Package, ChevronDown, Ship } from 'lucide-react';
import { importaciones, formatCurrency, formatDate } from '../data/mockData';

function ImportStatusBadge({ status }) {
  const map = {
    liberado:     { cls: 'badge-cobrada',   label: 'Liberado' },
    en_despacho:  { cls: 'badge-cobrar',    label: 'En despacho' },
    en_transito:  { cls: 'badge-pagar',     label: 'En tránsito' },
    retenido:     { cls: 'badge-cancelada', label: 'Retenido' },
  };
  const info = map[status] || { cls: 'badge-pendiente', label: status };
  return <span className={`badge ${info.cls}`}><span className="badge-dot" /> {info.label}</span>;
}

export default function Imports() {
  const [expandedId, setExpandedId] = useState(null);

  const totalImpuestos = importaciones.reduce((s, i) => s + i.total_impuestos, 0);
  const totalValor = importaciones.reduce((s, i) => s + i.valor_aduana_mxn, 0);

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Importaciones</h1>
          <p>Pedimentos aduanales y comercio exterior</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary">
            <Download size={15} /> Exportar
          </button>
          <button className="btn btn-primary">
            <Globe size={15} /> Nuevo pedimento
          </button>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 'var(--sp-5)', marginBottom: 'var(--sp-6)' }}>
        {[
          { label: 'Pedimentos activos', value: importaciones.length, icon: '📦', color: '#6366F1' },
          { label: 'Valor total aduanal', value: formatCurrency(totalValor), icon: '🌎', color: '#10B981', isCurrency: true },
          { label: 'Impuestos de importación', value: formatCurrency(totalImpuestos), icon: '🏛️', color: '#EF4444', isCurrency: true },
        ].map((stat, i) => (
          <div key={i} className="card card-pad" style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
              <div style={{ width: 40, height: 40, background: `${stat.color}18`, borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>
                {stat.icon}
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</div>
                <div className={stat.isCurrency ? 'mono' : ''} style={{ fontSize: stat.isCurrency ? 'var(--text-lg)' : 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginTop: 2 }}>
                  {stat.value}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pedimento Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
        {importaciones.map(imp => (
          <div
            key={imp.id}
            className="card"
            style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
            onClick={() => setExpandedId(expandedId === imp.id ? null : imp.id)}
          >
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', padding: 'var(--sp-5) var(--sp-6)' }}>
              <div style={{ width: 44, height: 44, background: '#6366F118', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Ship size={20} style={{ color: 'var(--accent-500)' }} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 3 }}>
                  <span className="mono-sm" style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>{imp.pedimento}</span>
                  <ImportStatusBadge status={imp.status} />
                </div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                  {imp.proveedor_ext} · {imp.aduana}
                </div>
              </div>

              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="mono" style={{ fontWeight: 700, fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}>
                  {formatCurrency(imp.valor_aduana_usd, 'USD')}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 2 }}>
                  TC: ${imp.tc} · {formatDate(imp.fecha)}
                </div>
              </div>

              <ChevronDown size={16} style={{
                color: 'var(--text-tertiary)', flexShrink: 0,
                transition: 'transform 0.2s ease',
                transform: expandedId === imp.id ? 'rotate(180deg)' : 'rotate(0)',
              }} />
            </div>

            {/* Expanded Detail */}
            {expandedId === imp.id && (
              <div style={{ padding: '0 var(--sp-6) var(--sp-5)', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-6)', paddingTop: 'var(--sp-4)' }}>
                  <div>
                    <div className="section-label">Descripción</div>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', marginBottom: 'var(--sp-4)' }}>{imp.descripcion}</div>
                    <div className="section-label">Tipo</div>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{imp.tipo}</div>
                  </div>
                  <div>
                    <div className="section-label">Desglose de Impuestos</div>
                    <div style={{ background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-md)', padding: 'var(--sp-4)' }}>
                      {[
                        { label: 'Valor aduanal MXN', value: imp.valor_aduana_mxn },
                        { label: 'IVA importación', value: imp.iva_importacion },
                        { label: 'DTA', value: imp.dta },
                        { label: 'Arancel', value: imp.arancel },
                      ].map((row, idx) => (
                        <div key={idx} className="detail-row">
                          <span className="detail-label">{row.label}</span>
                          <span className="detail-value mono">{formatCurrency(row.value)}</span>
                        </div>
                      ))}
                      <div className="total-row" style={{ marginTop: 'var(--sp-3)' }}>
                        <span className="total-label">Total impuestos</span>
                        <span className="total-amount">{formatCurrency(imp.total_impuestos)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
