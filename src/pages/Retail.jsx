import { useState } from 'react';
import { ShoppingBag, CreditCard, Receipt, Download, FileText, Clock, CheckCircle } from 'lucide-react';
import { retailSales, retailSummary, formatCurrency, formatDate } from '../data/mockData';

export default function Retail() {
  const [filterDate, setFilterDate] = useState('hoy');

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Punto de Venta</h1>
          <p>Tickets de venta, facturación y resumen diario</p>
        </div>
        <div className="page-header-actions">
          <select className="filter-select" value={filterDate} onChange={e => setFilterDate(e.target.value)}>
            <option value="hoy">Hoy</option>
            <option value="semana">Esta semana</option>
            <option value="mes">Este mes</option>
          </select>
          <button className="btn btn-secondary">
            <Download size={15} /> Corte de caja
          </button>
          <button className="btn btn-primary">
            <ShoppingBag size={15} /> Nueva Venta
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--sp-5)', marginBottom: 'var(--sp-6)' }}>
        {[
          { label: 'Ventas Hoy', value: formatCurrency(retailSummary.ventasHoy), icon: '💰', color: '#10B981', sub: `${retailSummary.ticketsHoy} tickets` },
          { label: 'Ventas del Mes', value: formatCurrency(retailSummary.ventasMes), icon: '📊', color: '#6366F1', sub: `${retailSummary.ticketsMes} tickets` },
          { label: 'Facturados', value: retailSummary.facturados, icon: '✅', color: '#3B82F6', sub: `${Math.round(retailSummary.facturados / retailSummary.ticketsMes * 100)}% del total` },
          { label: 'Sin facturar', value: retailSummary.sinFacturar, icon: '⏳', color: '#F59E0B', sub: 'Pendientes de CFDI' },
        ].map((stat, i) => (
          <div key={i} className="card" style={{ padding: 'var(--sp-5)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: stat.color }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--sp-2)' }}>{stat.label}</div>
                <div className="mono" style={{ fontSize: typeof stat.value === 'string' ? 'var(--text-xl)' : 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 4 }}>{stat.sub}</div>
              </div>
              <div style={{ width: 36, height: 36, background: `${stat.color}15`, borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>
                {stat.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Sales Table */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Fecha</th>
              <th>Hora</th>
              <th>Cliente</th>
              <th style={{ textAlign: 'center' }}>Artículos</th>
              <th>Método</th>
              <th>CFDI</th>
              <th style={{ textAlign: 'right' }}>Subtotal</th>
              <th style={{ textAlign: 'right' }}>IVA</th>
              <th style={{ textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {retailSales.map(sale => (
              <tr key={sale.id} className="table-row">
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Receipt size={14} style={{ color: 'var(--accent-500)', flexShrink: 0 }} />
                    <span className="mono-sm">{sale.ticket}</span>
                  </div>
                </td>
                <td style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{formatDate(sale.fecha)}</td>
                <td className="mono-sm" style={{ color: 'var(--text-secondary)' }}>{sale.hora}</td>
                <td style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{sale.cliente}</td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{ background: 'var(--bg-surface-2)', padding: '2px 10px', borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {sale.items}
                  </span>
                </td>
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--text-secondary)' }}>
                    <CreditCard size={12} />
                    {sale.metodo_pago}
                  </span>
                </td>
                <td>
                  {sale.facturado
                    ? <span className="badge badge-cobrada" style={{ gap: 4 }}><CheckCircle size={11} /> Facturado</span>
                    : <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-500)', fontWeight: 600 }}>
                        <FileText size={12} /> Facturar
                      </button>
                  }
                </td>
                <td className="amount-cell">{formatCurrency(sale.subtotal)}</td>
                <td className="amount-cell" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(sale.iva)}</td>
                <td className="amount-cell positive">{formatCurrency(sale.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
