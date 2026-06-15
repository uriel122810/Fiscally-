import { FileText, Download, CheckCircle, Clock, Shield, Wifi, WifiOff } from 'lucide-react';
import { retenciones as mockRetenciones, formatCurrency, formatDate } from '../data/mockData';
import { useRetenciones } from '../hooks/useSatData';

function RetStatusBadge({ status }) {
  const map = {
    timbrada:  { cls: 'badge-cobrada', label: 'Timbrada', icon: <CheckCircle size={11} /> },
    pendiente: { cls: 'badge-cobrar',  label: 'Pendiente', icon: <Clock size={11} /> },
    cancelada: { cls: 'badge-cancelada', label: 'Cancelada', icon: null },
  };
  const info = map[status] || map.pendiente;
  return (
    <span className={`badge ${info.cls}`} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      {info.icon} {info.label}
    </span>
  );
}

export default function Retentions() {
  const { retenciones, loading, isLive } = useRetenciones();
  const totalRetenido = retenciones.reduce((s, r) => s + r.total_retenido, 0);
  const timbradas = retenciones.filter(r => r.status === 'timbrada').length;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Retenciones</h1>
          <p>Constancias de retención ISR e IVA · CFDI de retenciones</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary">
            <Download size={15} /> Exportar
          </button>
          <button className="btn btn-primary">
            <FileText size={15} /> Nueva Retención
          </button>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 'var(--sp-5)', marginBottom: 'var(--sp-6)' }}>
        {[
          { label: 'Retenciones este mes', value: retenciones.length, icon: '📑', color: '#6366F1' },
          { label: 'Timbradas', value: timbradas, icon: '✅', color: '#10B981' },
          { label: 'Total retenido', value: formatCurrency(totalRetenido), icon: '🔒', color: '#EF4444', isCurrency: true },
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
              <th>Folio</th>
              <th>Receptor</th>
              <th>Tipo Retención</th>
              <th>Fecha</th>
              <th style={{ textAlign: 'right' }}>Base</th>
              <th style={{ textAlign: 'center' }}>Tasa</th>
              <th style={{ textAlign: 'right' }}>ISR Ret.</th>
              <th style={{ textAlign: 'right' }}>IVA Ret.</th>
              <th style={{ textAlign: 'right' }}>Total Ret.</th>
              <th>Estatus</th>
            </tr>
          </thead>
          <tbody>
            {retenciones.map(ret => (
              <tr key={ret.id} className="table-row">
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Shield size={14} style={{ color: 'var(--accent-500)', flexShrink: 0 }} />
                    <span className="mono-sm">{ret.folio}</span>
                  </div>
                </td>
                <td>
                  <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)' }}>{ret.receptor}</div>
                  <div className="td-mono" style={{ marginTop: 2 }}>{ret.rfc}</div>
                </td>
                <td>
                  <span className="rubro-badge" style={{ background: '#6366F118', color: '#6366F1' }}>
                    {ret.tipo_retencion}
                  </span>
                </td>
                <td style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{formatDate(ret.fecha)}</td>
                <td className="amount-cell">{formatCurrency(ret.base)}</td>
                <td style={{ textAlign: 'center' }}>
                  <span className="mono-sm">{ret.tasa}%</span>
                </td>
                <td className="amount-cell">{formatCurrency(ret.monto_retenido)}</td>
                <td className="amount-cell">{formatCurrency(ret.iva_retenido)}</td>
                <td className="amount-cell" style={{ fontWeight: 700 }}>{formatCurrency(ret.total_retenido)}</td>
                <td><RetStatusBadge status={ret.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals Footer */}
      <div className="card" style={{ marginTop: 'var(--sp-5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: 'var(--sp-4) var(--sp-6)', gap: 'var(--sp-8)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Total ISR Retenido</div>
            <div className="mono" style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>
              {formatCurrency(retenciones.reduce((s, r) => s + r.monto_retenido, 0))}
            </div>
          </div>
          <div style={{ width: 1, height: 40, background: 'var(--border)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Total IVA Retenido</div>
            <div className="mono" style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>
              {formatCurrency(retenciones.reduce((s, r) => s + r.iva_retenido, 0))}
            </div>
          </div>
          <div style={{ width: 1, height: 40, background: 'var(--border)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Gran Total Retenido</div>
            <div className="mono" style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--accent-500)' }}>
              {formatCurrency(totalRetenido)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
