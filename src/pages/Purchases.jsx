import React, { useState } from 'react';
import { ShoppingCart, Plus, FileText, Package, Clock, CheckCircle, AlertCircle, Eye, ChevronDown } from 'lucide-react';
import { purchaseOrders, formatCurrency, formatDate } from '../data/mockData';

function POStatusBadge({ status }) {
  const map = {
    pendiente:  { cls: 'badge-cobrar',    label: 'Pendiente',  icon: <Clock size={11} /> },
    aprobada:   { cls: 'badge-pagar',     label: 'Aprobada',   icon: <CheckCircle size={11} /> },
    entregada:  { cls: 'badge-cobrada',   label: 'Entregada',  icon: <Package size={11} /> },
    facturada:  { cls: 'badge-pagada',    label: 'Facturada',  icon: <FileText size={11} /> },
    cancelada:  { cls: 'badge-cancelada', label: 'Cancelada',  icon: <AlertCircle size={11} /> },
  };
  const info = map[status] || map.pendiente;
  return (
    <span className={`badge ${info.cls}`} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      {info.icon} {info.label}
    </span>
  );
}

export default function Purchases() {
  const [expandedId, setExpandedId] = useState(null);

  const totalPendiente = purchaseOrders
    .filter(o => o.status === 'pendiente' || o.status === 'aprobada')
    .reduce((s, o) => s + o.total, 0);

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Compras</h1>
          <p>Órdenes de compra y aprovisionamiento</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary">
            <FileText size={15} /> Exportar
          </button>
          <button className="btn btn-primary">
            <Plus size={15} /> Nueva Orden
          </button>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 'var(--sp-5)', marginBottom: 'var(--sp-6)' }}>
        {[
          { label: 'Órdenes este mes', value: purchaseOrders.length, icon: '📋', color: '#6366F1' },
          { label: 'Pendientes de entrega', value: purchaseOrders.filter(o => o.status === 'aprobada').length, icon: '📦', color: '#F59E0B' },
          { label: 'Monto comprometido', value: formatCurrency(totalPendiente), icon: '💳', color: '#EF4444', isCurrency: true },
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
              <th>Proveedor</th>
              <th>Fecha</th>
              <th>Entrega</th>
              <th>Estatus</th>
              <th>Factura</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th style={{ width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {purchaseOrders.map(order => (
              <React.Fragment key={order.id}>
                <tr className="table-row" onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ShoppingCart size={14} style={{ color: 'var(--accent-500)', flexShrink: 0 }} />
                      <span className="mono-sm">{order.folio}</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)' }}>{order.proveedor}</div>
                    <div className="td-mono" style={{ marginTop: 2 }}>{order.rfc}</div>
                  </td>
                  <td style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{formatDate(order.fecha)}</td>
                  <td style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{formatDate(order.fecha_entrega)}</td>
                  <td><POStatusBadge status={order.status} /></td>
                  <td>
                    {order.factura_vinculada
                      ? <span className="mono-sm" style={{ color: 'var(--accent-500)' }}>{order.factura_vinculada}</span>
                      : <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>—</span>
                    }
                  </td>
                  <td className="amount-cell">{formatCurrency(order.total)}</td>
                  <td>
                    <ChevronDown size={14} style={{
                      color: 'var(--text-tertiary)',
                      transition: 'transform 0.2s ease',
                      transform: expandedId === order.id ? 'rotate(180deg)' : 'rotate(0)',
                    }} />
                  </td>
                </tr>
                {expandedId === order.id && (
                  <tr key={`${order.id}-detail`}>
                    <td colSpan={8} style={{ padding: 0, background: 'var(--bg-surface-2)' }}>
                      <div style={{ padding: 'var(--sp-4) var(--sp-6)', display: 'flex', gap: 'var(--sp-8)' }}>
                        <div style={{ flex: 1 }}>
                          <div className="section-label">Artículos</div>
                          {order.items.map((item, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: idx < order.items.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 'var(--text-sm)' }}>
                              <span>{item.descripcion} <span style={{ color: 'var(--text-tertiary)' }}>×{item.cantidad}</span></span>
                              <span className="mono" style={{ fontWeight: 600 }}>{formatCurrency(item.precio * item.cantidad)}</span>
                            </div>
                          ))}
                        </div>
                        {order.notas && (
                          <div style={{ minWidth: 200 }}>
                            <div className="section-label">Notas</div>
                            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{order.notas}</div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
