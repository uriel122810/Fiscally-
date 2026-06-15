import { useState } from 'react';
import { Upload, Plus, ArrowUpRight, ArrowDownRight, Link, AlertCircle } from 'lucide-react';
import { bankAccounts, bankMovements, invoices, formatCurrency, formatDate } from '../data/mockData';

function MovementItem({ mov, onLink }) {
  const inv = mov.invoice_id ? invoices.find(i => i.id === mov.invoice_id) : null;
  const statusClass = mov.status === 'conciliado'
    ? 'conciliado'
    : mov.status === 'pendiente' && mov.confidence !== null
      ? 'pendiente-suggest'
      : '';

  return (
    <div className={`movement-item ${statusClass}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              background: mov.tipo === 'abono' ? 'var(--success-bg)' : 'var(--danger-bg)',
              color: mov.tipo === 'abono' ? 'var(--success-text)' : 'var(--danger-text)',
              borderRadius: '50%',
              width: 22, height: 22,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              {mov.tipo === 'abono' ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            </span>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {mov.descripcion}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 4, paddingLeft: 30 }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{formatDate(mov.fecha)}</span>
            <span className="mono-sm" style={{ color: 'var(--text-tertiary)' }}>{mov.referencia}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: 12 }}>
          <div className={`mono ${mov.tipo === 'abono' ? 'text-success' : 'text-danger'}`} style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>
            {mov.tipo === 'cargo' ? '-' : '+'}{formatCurrency(mov.monto)}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 2 }}>
            {mov.status === 'conciliado' && mov.confidence && (
              <span className="text-success">✓ {Math.round(mov.confidence * 100)}% match</span>
            )}
            {mov.status === 'pendiente' && mov.confidence && (
              <span className="text-warning">⚠ {Math.round(mov.confidence * 100)}% sugerido</span>
            )}
            {mov.status === 'no_identificado' && (
              <span className="text-tertiary">Sin identificar</span>
            )}
          </div>
        </div>
      </div>
      {inv && (
        <div style={{ marginTop: 8, paddingLeft: 30, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Link size={11} style={{ color: 'var(--success-text)', flexShrink: 0 }} />
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--success-text)', fontWeight: 500 }}>
            {inv.serie}{inv.folio} · {inv.razon_social}
          </span>
        </div>
      )}
      {mov.status === 'pendiente' && mov.confidence && (
        <div style={{ marginTop: 12, padding: 'var(--sp-3)', background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--warning-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--warning-text)', marginBottom: 2 }}>Sugerencia del Agente IA ({(mov.confidence * 100).toFixed(0)}% match)</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>Vincular con Factura F-00421</div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', fontSize: '0.7rem' }}>Rechazar</button>
            <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px', fontSize: '0.7rem', color: 'var(--success-text)', borderColor: 'var(--success-border)' }}>Aprobar</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Banks() {
  const [activeTab, setActiveTab] = useState('cuentas');
  const [selectedAccount, setSelectedAccount] = useState(bankAccounts[0]);

  const accountMovements = bankMovements; // All movements for demo
  const pendientes = bankMovements.filter(m => m.status === 'pendiente').length;
  const conciliados = bankMovements.filter(m => m.status === 'conciliado').length;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Bancos</h1>
          <p>Cuentas bancarias y conciliación automática</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary">
            <Upload size={15} /> Subir estado de cuenta
          </button>
          <button className="btn btn-primary">
            <Plus size={15} /> Agregar cuenta
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {[
          { id: 'cuentas', label: 'Cuentas', count: bankAccounts.length },
          { id: 'movimientos', label: 'Movimientos', count: bankMovements.length },
          { id: 'conciliacion', label: 'Conciliación', count: pendientes },
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

      {/* Cuentas Tab */}
      {activeTab === 'cuentas' && (
        <>
          <div className="bank-grid">
            {bankAccounts.map(acct => (
              <div
                key={acct.id}
                className="bank-card"
                style={{ '--bank-color': acct.color, cursor: 'pointer' }}
                onClick={() => setSelectedAccount(acct)}
              >
                <div className="bank-name">{acct.banco}</div>
                <div className="bank-alias">{acct.alias}</div>
                <div className="bank-saldo">{formatCurrency(acct.saldo, acct.moneda)}</div>
                <div className="bank-currency">{acct.moneda}</div>
                <div className="bank-clabe">CLABE: {acct.clabe}</div>
                <div className="bank-stats">
                  <div className="bank-stat">
                    <span>{acct.conciliados}/{acct.movimientos}</span> conciliados
                  </div>
                  {acct.movimientos - acct.conciliados > 0 && (
                    <div className="bank-stat" style={{ color: 'var(--warning-text)' }}>
                      {acct.movimientos - acct.conciliados} pendientes
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Summary stat */}
          <div className="card card-pad" style={{ display: 'flex', gap: 'var(--sp-8)', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Saldo Total MXN</div>
              <div className="mono" style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, letterSpacing: '-0.03em' }}>
                {formatCurrency(bankAccounts.filter(a => a.moneda === 'MXN').reduce((s, a) => s + a.saldo, 0))}
              </div>
            </div>
            <div style={{ width: 1, height: 40, background: 'var(--border)' }} />
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Saldo Total USD</div>
              <div className="mono" style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, letterSpacing: '-0.03em' }}>
                {formatCurrency(bankAccounts.filter(a => a.moneda === 'USD').reduce((s, a) => s + a.saldo, 0), 'USD')}
              </div>
            </div>
            <div style={{ width: 1, height: 40, background: 'var(--border)' }} />
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Movimientos sin conciliar</div>
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: pendientes > 0 ? 'var(--warning-text)' : 'var(--success-text)' }}>
                {pendientes}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Movimientos Tab */}
      {activeTab === 'movimientos' && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Descripción</th>
                <th>Referencia</th>
                <th style={{ textAlign: 'right' }}>Cargo</th>
                <th style={{ textAlign: 'right' }}>Abono</th>
                <th style={{ textAlign: 'right' }}>Saldo</th>
                <th>Estatus</th>
              </tr>
            </thead>
            <tbody>
              {accountMovements.map(mov => (
                <tr key={mov.id} className="table-row">
                  <td style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{formatDate(mov.fecha)}</td>
                  <td style={{ fontSize: 'var(--text-sm)', fontWeight: 500, maxWidth: 240 }}>{mov.descripcion}</td>
                  <td className="td-mono">{mov.referencia}</td>
                  <td className="amount-cell negative">{mov.tipo === 'cargo' ? formatCurrency(mov.monto) : '—'}</td>
                  <td className="amount-cell positive">{mov.tipo === 'abono' ? formatCurrency(mov.monto) : '—'}</td>
                  <td className="amount-cell">{formatCurrency(mov.saldo)}</td>
                  <td>
                    {mov.status === 'conciliado' && <span className="badge badge-cobrada"><span className="badge-dot" />Conciliado</span>}
                    {mov.status === 'pendiente' && <span className="badge badge-pagar"><span className="badge-dot" />Pendiente</span>}
                    {mov.status === 'no_identificado' && <span className="badge badge-cancelada"><span className="badge-dot" />No identificado</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Conciliación Tab */}
      {activeTab === 'conciliacion' && (
        <>
          <div style={{ display: 'flex', gap: 'var(--sp-3)', marginBottom: 'var(--sp-5)', padding: 'var(--sp-4) var(--sp-5)', background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', borderRadius: 'var(--radius-md)', alignItems: 'center' }}>
            <AlertCircle size={18} style={{ color: 'var(--warning-text)', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--warning-text)' }}>Agente de Conciliación Activo</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 2 }}>
                {pendientes} movimiento{pendientes !== 1 ? 's' : ''} pendiente{pendientes !== 1 ? 's' : ''} · 1 sugerencia automática con 72% de confianza esperando confirmación
              </div>
            </div>
            <button className="btn btn-secondary btn-sm">Revisar sugerencias</button>
          </div>

          <div className="reconcile-layout">
            <div>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: 'var(--sp-3)', color: 'var(--text-primary)' }}>
                Movimientos bancarios · {accountMovements.length} total
              </div>
              {accountMovements.map(mov => (
                <MovementItem key={mov.id} mov={mov} />
              ))}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: 'var(--sp-3)', color: 'var(--text-primary)' }}>
                Facturas sin conciliar
              </div>
              {invoices.filter(inv => ['por_cobrar', 'por_pagar'].includes(inv.status)).map(inv => (
                <div key={inv.id} className="invoice-item-row">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{inv.razon_social}</div>
                      <div className="mono-sm" style={{ marginTop: 2 }}>{inv.serie}{inv.folio} · {formatDate(inv.fecha)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="mono" style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>{formatCurrency(inv.total, inv.moneda)}</div>
                      <div style={{ marginTop: 3 }}>
                        {inv.status === 'por_cobrar'
                          ? <span className="badge badge-cobrar" style={{ fontSize: '0.6rem' }}><span className="badge-dot" />Por cobrar</span>
                          : <span className="badge badge-pagar" style={{ fontSize: '0.6rem' }}><span className="badge-dot" />Por pagar</span>
                        }
                      </div>
                    </div>
                  </div>
                  <button className="btn btn-secondary btn-sm" style={{ marginTop: 8, width: '100%', justifyContent: 'center' }}>
                    <Link size={12} /> Vincular manualmente
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
