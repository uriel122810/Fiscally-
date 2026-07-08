import { useState } from 'react';
import { Download, Calendar, AlertCircle, CheckCircle, Clock, XCircle } from 'lucide-react';
import { formatCurrency } from '../data/mockData';
import { useKpiData } from '../hooks/useSatData';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function DeclarationStatusBadge({ status }) {
  const map = {
    pendiente:   { cls: 'badge-cobrar', label: 'Pendiente', icon: <Clock size={11} /> },
    en_proceso:  { cls: 'badge-pagar',  label: 'En proceso', icon: <Clock size={11} /> },
    presentada:  { cls: 'badge-cobrada',label: 'Presentada', icon: <CheckCircle size={11} /> },
    con_errores: { cls: 'badge-cancelada', label: 'Con errores', icon: <XCircle size={11} /> },
    omisa:       { cls: 'badge-cancelada', label: 'Omisa', icon: <AlertCircle size={11} /> },
  };
  const info = map[status] || map.pendiente;
  return (
    <span className={`badge ${info.cls}`} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      {info.icon} {info.label}
    </span>
  );
}

function BarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card card-pad" style={{ padding: '10px 14px' }}>
      <div style={{ fontWeight: 600, fontSize: 'var(--text-xs)', marginBottom: 8 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 'var(--text-xs)', marginBottom: 4 }}>
          <span style={{ color: p.fill, fontWeight: 600 }}>{p.name}</span>
          <span className="mono" style={{ fontWeight: 700 }}>{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Taxes() {
  const [activeYear, setActiveYear] = useState(2026);

  // ── Use real tax data from Supabase ─────────────────────────────────
  const { taxData: taxDeclarations, monthlyData } = useKpiData(activeYear, new Date().getMonth() + 1);

  const barData = (monthlyData || []).map(m => ({
    mes: m.mes,
    ISR: Math.round((m.ingresos - m.gastos) * 0.03),
    IVA: Math.round((m.ingresos - m.gastos) * 0.016),
  }));

  const nextDeadline = taxDeclarations.find(d => d.status === 'pendiente');
  const daysLeft = nextDeadline
    ? Math.ceil((new Date(nextDeadline.limite) - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Impuestos y Declaraciones</h1>
          <p>Historial fiscal mensual y anual · Obligaciones tributarias</p>
        </div>
        <div className="page-header-actions">
          <select className="filter-select" value={activeYear} onChange={e => setActiveYear(Number(e.target.value))}>
            <option value={2026}>2026</option>
            <option value={2025}>2025</option>
            <option value={2024}>2024</option>
          </select>
          <button className="btn btn-secondary">
            <Download size={15} /> Exportar resumen
          </button>
        </div>
      </div>

      {/* Alert banner if there's a pending declaration */}
      {nextDeadline && daysLeft !== null && daysLeft <= 10 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
          padding: 'var(--sp-4) var(--sp-5)',
          background: daysLeft <= 3 ? 'var(--danger-bg)' : 'var(--warning-bg)',
          border: `1px solid ${daysLeft <= 3 ? 'var(--danger-border)' : 'var(--warning-border)'}`,
          borderRadius: 'var(--radius-md)', marginBottom: 'var(--sp-6)',
        }}>
          <AlertCircle size={20} style={{ color: daysLeft <= 3 ? 'var(--danger-text)' : 'var(--warning-text)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: daysLeft <= 3 ? 'var(--danger-text)' : 'var(--warning-text)' }}>
              Declaración de {nextDeadline.mes} {nextDeadline.anio} vence en {daysLeft} día{daysLeft !== 1 ? 's' : ''}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 2 }}>
              Fecha límite: {nextDeadline.limite} · Régimen: Persona Moral
            </div>
          </div>
          <button className="btn btn-primary btn-sm">Preparar declaración</button>
        </div>
      )}

      {/* Chart */}
      <div className="card" style={{ marginBottom: 'var(--sp-6)' }}>
        <div className="card-header">
          <div>
            <div className="card-title">ISR e IVA por Mes</div>
            <div className="card-subtitle">Estimados provisionados {activeYear}</div>
          </div>
        </div>
        <div style={{ padding: 'var(--sp-5)', paddingTop: 'var(--sp-4)' }}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData} barSize={20} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} width={48} />
              <Tooltip content={<BarTooltip />} />
              <Bar dataKey="ISR" fill="#6366F1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="IVA" fill="#10B981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, justifyContent: 'flex-end' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#6366F1', display: 'inline-block' }} /> ISR
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#10B981', display: 'inline-block' }} /> IVA
            </span>
          </div>
        </div>
      </div>

      {/* Declarations List */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Historial de Declaraciones {activeYear}</div>
          <button className="btn btn-secondary btn-sm">
            <Calendar size={13} /> Ver calendario fiscal
          </button>
        </div>
        <div style={{ padding: 'var(--sp-2)' }}>
          {taxDeclarations.length === 0 && (
            <div style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
              Aún no hay declaraciones registradas — este módulo requiere datos que no se están capturando actualmente.
            </div>
          )}
          {taxDeclarations.map((decl, i) => (
            <div
              key={i}
              className={`declaration-row ${decl.status}`}
            >
              <div className="declaration-period">
                {decl.mes} {decl.anio}
              </div>
              <div className="declaration-amounts">
                {decl.isr !== null ? (
                  <>
                    <div className="declaration-amount" style={{ minWidth: 120 }}>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 2 }}>ISR</div>
                      <div style={{ fontWeight: 700 }}>{formatCurrency(decl.isr)}</div>
                    </div>
                    <div className="declaration-amount" style={{ minWidth: 120 }}>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 2 }}>IVA</div>
                      <div style={{ fontWeight: 700 }}>{formatCurrency(decl.iva)}</div>
                    </div>
                    <div className="declaration-amount" style={{ minWidth: 120 }}>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 2 }}>DIOT</div>
                      <div style={{ fontWeight: 600, color: decl.status === 'presentada' ? 'var(--success-text)' : 'var(--text-primary)' }}>
                        {decl.status === 'presentada' ? 'Entregada' : 'Pendiente'}
                      </div>
                    </div>
                    <div className="declaration-amount">
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 2 }}>Total</div>
                      <div className="mono" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{formatCurrency(decl.isr + decl.iva)}</div>
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
                    Declaración aún no preparada · Vence {decl.limite}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', align: 'center', gap: 'var(--sp-3)', alignItems: 'center' }}>
                {decl.fecha_pres && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                    Presentada {decl.fecha_pres}
                  </span>
                )}
                <DeclarationStatusBadge status={decl.status} />
                {decl.status === 'presentada' && (
                  <button className="btn btn-ghost btn-sm">
                    <Download size={12} /> Acuse
                  </button>
                )}
                {decl.status === 'pendiente' && (
                  <button className="btn btn-primary btn-sm">Preparar</button>
                )}
                {decl.status === 'con_errores' && (
                  <button className="btn btn-danger btn-sm">Ver errores</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
