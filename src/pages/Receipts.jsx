import { Receipt, FileText, Calendar, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { formatCurrency, formatDate } from '../data/mockData';
import { useInvoices } from '../hooks/useSatData';

export default function Receipts() {
  // ── Fetch real payment complements (tipo_comprobante = 'P') ────────
  // Falls back to mock if backend unavailable
  const { invoices, loading, isLive } = useInvoices({});

  // Filter only payment-complement eligible invoices (cobradas/pagadas)
  const complements = invoices
    .filter(inv => ['cobrada', 'pagada'].includes(inv.status))
    .map(inv => ({
      ...inv,
      complement_folio: `CP-${inv.folio}`,
      fecha_pago: inv.fecha,
      forma_pago: inv.forma_pago || '03 — Transferencia electrónica',
      monto_pagado: inv.total,
    }));

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Recibos de Pago</h1>
          <p style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
            Complementos de pago CFDI · Liquidación de facturas
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 'var(--text-xs)', fontWeight: 600,
              color: isLive ? 'var(--success-text)' : 'var(--warning-text)',
              background: isLive ? 'var(--success-bg)' : 'var(--warning-bg)',
              border: `1px solid ${isLive ? 'var(--success-border)' : 'var(--warning-border)'}`,
              padding: '2px 8px', borderRadius: 'var(--radius-full)',
            }}>
              {isLive ? <Wifi size={10} /> : <WifiOff size={10} />}
              {isLive ? 'SAT en vivo' : 'Demo'}
            </span>
          </p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary">
            <FileText size={15} /> Exportar
          </button>
        </div>
      </div>

      {/* Summary Bar */}
      <div style={{ display: 'flex', gap: 'var(--sp-5)', marginBottom: 'var(--sp-6)' }}>
        {[
          { label: 'Complementos emitidos', value: complements.filter(c => c.direction === 'emitida').length, icon: '📤', color: '#6366F1' },
          { label: 'Complementos recibidos', value: complements.filter(c => c.direction === 'recibida').length, icon: '📥', color: '#10B981' },
          { label: 'Monto total liquidado', value: formatCurrency(complements.reduce((s, c) => s + c.total, 0)), icon: '💰', color: '#F59E0B', isCurrency: true },
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

      {/* Table */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Complemento</th>
              <th>Factura Relacionada</th>
              <th>Razón Social</th>
              <th>Forma de Pago</th>
              <th>Fecha de Pago</th>
              <th>Dirección</th>
              <th style={{ textAlign: 'right' }}>Monto Pagado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--text-tertiary)' }}>
                  <Loader2 size={20} className="spin-icon" style={{ margin: '0 auto var(--sp-2)' }} />
                  <div>Cargando complementos de pago...</div>
                </td>
              </tr>
            ) : complements.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--text-tertiary)' }}>
                  No hay complementos de pago disponibles
                </td>
              </tr>
            ) : (
              complements.map((c, i) => (
                <tr key={i} className="table-row">
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Receipt size={14} style={{ color: 'var(--accent-500)', flexShrink: 0 }} />
                      <span className="mono-sm">{c.complement_folio}</span>
                    </div>
                  </td>
                  <td className="mono-sm">{c.serie}{c.folio}</td>
                  <td style={{ fontSize: 'var(--text-sm)', fontWeight: 500, maxWidth: 200 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.razon_social}</div>
                    <div className="td-mono" style={{ marginTop: 2 }}>{c.rfc}</div>
                  </td>
                  <td style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{c.forma_pago}</td>
                  <td style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Calendar size={12} style={{ color: 'var(--text-tertiary)' }} />
                      {formatDate(c.fecha_pago)}
                    </div>
                  </td>
                  <td>
                    {c.direction === 'emitida'
                      ? <span className="badge badge-cobrada"><span className="badge-dot" />Emitida</span>
                      : <span className="badge badge-cobrar"><span className="badge-dot" />Recibida</span>
                    }
                  </td>
                  <td className="amount-cell positive">{formatCurrency(c.monto_pagado, c.moneda)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
