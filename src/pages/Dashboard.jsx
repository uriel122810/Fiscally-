import { useState } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, FileText,
  AlertCircle, RefreshCw, ArrowUpRight, ArrowDownRight,
  Loader2, Wifi, WifiOff
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import {
  activityFeed, agentStatus, formatCurrency
} from '../data/mockData';
import { useKpiData, useSatSync } from '../hooks/useSatData';

// ─── KPI Card ──────────────────────────────────────────────────────────────
function KPICard({ label, value, delta, currency, icon: Icon, color, iconBg }) {
  const isPos = delta >= 0;
  return (
    <div className="kpi-card" style={{ '--kpi-color': color, '--kpi-icon-bg': iconBg }}>
      <div className="kpi-label">
        {label}
        <div className="kpi-icon-wrap">
          <Icon size={15} />
        </div>
      </div>
      <div className="kpi-value">{formatCurrency(value, currency)}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
        <span className={`kpi-delta ${isPos ? 'positive' : 'negative'}`}>
          {isPos ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
          {Math.abs(delta)}%
        </span>
        <span className="kpi-meta">vs mes anterior</span>
      </div>
    </div>
  );
}

// ─── Custom Tooltip ─────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card card-pad" style={{ padding: '10px 14px', minWidth: 160 }}>
      <div style={{ fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 8 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 'var(--text-xs)', marginBottom: 4 }}>
          <span style={{ color: p.color, fontWeight: 600 }}>{p.name === 'ingresos' ? 'Ingresos' : 'Gastos'}</span>
          <span className="mono" style={{ fontWeight: 700 }}>{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Donut Tooltip ──────────────────────────────────────────────────────────
function DonutTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card card-pad" style={{ padding: '10px 14px' }}>
      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{payload[0].name}</div>
      <div className="mono" style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>{formatCurrency(payload[0].value)}</div>
    </div>
  );
}

// ─── Activity Feed ──────────────────────────────────────────────────────────
function ActivityFeed() {
  const iconMap = {
    'link': '🔗',
    'alert-triangle': '⚠️',
    'tag': '🏷️',
    'refresh-cw': '🔄',
    'file-text': '📄',
  };
  return (
    <div>
      {activityFeed.map(item => (
        <div key={item.id} className="feed-item">
          <div className="feed-icon" style={{ background: `${item.color}15` }}>
            <span style={{ fontSize: '0.9rem' }}>{iconMap[item.icon]}</span>
          </div>
          <div className="feed-content">
            {item.agent && <div className="feed-agent">{item.agent}</div>}
            <div className="feed-message">{item.message}</div>
            <div className="feed-time">{item.time}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Agent Panel ─────────────────────────────────────────────────────────────
function AgentPanel({ onNavigate }) {
  return (
    <div className="agent-grid">
      {agentStatus.map(agent => (
        <button
          key={agent.id}
          className={`agent-card${agent.requiresAction ? ' has-action' : ''}`}
          onClick={() => onNavigate('agents')}
        >
          <div
            className="agent-icon-wrap"
            style={{ background: `${agent.color}18`, color: agent.color }}
          >
            {agent.id === 'reconciliation' && <span style={{ fontSize: '1.1rem' }}>⚖️</span>}
            {agent.id === 'audit' && <span style={{ fontSize: '1.1rem' }}>🛡️</span>}
            {agent.id === 'classification' && <span style={{ fontSize: '1.1rem' }}>✨</span>}
            {agent.id === 'chatbot' && <span style={{ fontSize: '1.1rem' }}>💬</span>}
          </div>
          <div className="agent-info">
            <div className="agent-name">{agent.name}</div>
            <div className="agent-detail">{agent.detail}</div>
          </div>
          <div className="agent-status" style={{ color: agent.color }}>
            <span className={`agent-dot ${agent.status}`} />
            {agent.statusLabel}
            {agent.actionCount > 0 && (
              <span className="nav-badge" style={{ marginLeft: 6 }}>{agent.actionCount}</span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Sync Banner ─────────────────────────────────────────────────────────────
function SyncBanner({ syncStatus, progress, onStartSync, onCancel }) {
  if (syncStatus === 'idle' || syncStatus === 'completed') return null;

  const statusMessages = {
    requesting: 'Enviando solicitud al SAT...',
    processing: 'SAT procesando solicitud...',
    downloading: 'Descargando paquetes del SAT...',
    error: 'Error en la sincronización',
  };

  const isError = syncStatus === 'error';

  return (
    <div style={{
      background: isError
        ? 'linear-gradient(90deg, #EF4444 0%, #DC2626 100%)'
        : 'linear-gradient(90deg, #6366F1 0%, #8B5CF6 100%)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--sp-4) var(--sp-6)',
      color: 'white',
      marginBottom: 'var(--sp-6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      boxShadow: 'var(--shadow-md)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
        <div style={{ background: 'rgba(255,255,255,0.2)', padding: '8px', borderRadius: '50%' }}>
          {isError
            ? <AlertCircle size={20} style={{ color: 'white' }} />
            : <Loader2 size={20} className="spin-icon" style={{ color: 'white' }} />
          }
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600 }}>
            {statusMessages[syncStatus] || 'Sincronizando...'}
          </h3>
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', opacity: 0.9, marginTop: 4 }}>
            {progress?.cfdiCount > 0 && (
              <strong>{progress.cfdiCount} CFDIs encontrados</strong>
            )}
            {progress?.totalProcessed > 0 && (
              <strong>{progress.totalProcessed} CFDIs procesados</strong>
            )}
          </p>
        </div>
      </div>
      {!isError && (
        <button
          onClick={onCancel}
          style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white',
            padding: '6px 16px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
            fontSize: 'var(--text-sm)', fontWeight: 500,
          }}
        >
          Cancelar
        </button>
      )}
    </div>
  );
}

// ─── Dashboard Page ──────────────────────────────────────────────────────────
export default function Dashboard({ onNavigate }) {
  const now = new Date();
  const [selectedYear] = useState(now.getFullYear());
  const [selectedMonth] = useState(now.getMonth() + 1);

  // ── Use real data hooks ─────────────────────────────────────────────
  const { kpis, monthlyData, rubroDistribution, loading, isLive } = useKpiData(selectedYear, selectedMonth);
  const { syncStatus, progress, error: syncError, startSync, cancelSync } = useSatSync();

  const handleSatSync = () => {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    startSync('emitidos', `${year}-${month}-01`, now.toISOString().split('T')[0]);
  };

  return (
    <div>
      {/* Welcome */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Buenos días, Juan 👋</h1>
          <p style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
            Grupo Tecnológico SAS de CV · Resumen de junio 2026
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
          <button className="btn btn-secondary" onClick={() => onNavigate('invoices')}>
            <FileText size={15} /> Ver facturas
          </button>
          <button className="btn btn-primary" onClick={handleSatSync} disabled={syncStatus !== 'idle' && syncStatus !== 'completed' && syncStatus !== 'error'}>
            <RefreshCw size={15} className={syncStatus === 'processing' ? 'spin-icon' : ''} /> Sync SAT
          </button>
        </div>
      </div>

      {/* SAT Sync Banner (real progress) */}
      <SyncBanner
        syncStatus={syncStatus}
        progress={progress}
        onStartSync={handleSatSync}
        onCancel={cancelSync}
      />

      {/* Static sync banner shown only when idle and no sync running */}
      {syncStatus === 'idle' && !isLive && (
        <div style={{
          background: 'linear-gradient(90deg, #6366F1 0%, #8B5CF6 100%)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--sp-4) var(--sp-6)',
          color: 'white',
          marginBottom: 'var(--sp-6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: 'var(--shadow-md)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', padding: '8px', borderRadius: '50%' }}>
              <RefreshCw size={20} style={{ color: 'white' }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600 }}>Conecta con el SAT para datos reales</h3>
              <p style={{ margin: 0, fontSize: 'var(--text-sm)', opacity: 0.9, marginTop: 4 }}>
                Configura tu e.firma en <strong>Configuración → Certificado SAT</strong> y presiona <strong>Sync SAT</strong> para descargar tus CFDIs
              </p>
            </div>
          </div>
          <button
            onClick={handleSatSync}
            style={{
              background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white',
              padding: '8px 20px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
              fontSize: 'var(--text-sm)', fontWeight: 600,
            }}
          >
            Iniciar Sync
          </button>
        </div>
      )}

      {/* KPI Row */}
      <div className="kpi-grid">
        <KPICard
          label="Ingresos del Mes"
          value={kpis.ingresos}
          delta={kpis.ingresosDelta}
          icon={TrendingUp}
          color="#10B981"
          iconBg="#F0FDF4"
        />
        <KPICard
          label="Gastos del Mes"
          value={kpis.gastos}
          delta={kpis.gastosDelta}
          icon={TrendingDown}
          color="#EF4444"
          iconBg="#FFF1F2"
        />
        <KPICard
          label="Balance Neto"
          value={kpis.balance}
          delta={kpis.balanceDelta}
          icon={DollarSign}
          color="#6366F1"
          iconBg="#EEF2FF"
        />
      </div>

      {/* Charts */}
      <div className="chart-grid">
        {/* Line Chart */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Ingresos vs Gastos</div>
              <div className="card-subtitle">Últimos 6 meses</div>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 'var(--text-xs)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                <span style={{ width: 10, height: 2, background: '#10B981', borderRadius: 2, display: 'inline-block' }} /> Ingresos
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                <span style={{ width: 10, height: 2, background: '#6366F1', borderRadius: 2, display: 'inline-block' }} /> Gastos
              </span>
            </div>
          </div>
          <div style={{ padding: 'var(--sp-5)', paddingTop: 'var(--sp-4)' }}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthlyData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="mes"
                  tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                  width={52}
                />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone" dataKey="ingresos"
                  stroke="#10B981" strokeWidth={2.5}
                  dot={{ r: 4, fill: '#10B981', strokeWidth: 2, stroke: 'white' }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone" dataKey="gastos"
                  stroke="#6366F1" strokeWidth={2.5}
                  dot={{ r: 4, fill: '#6366F1', strokeWidth: 2, stroke: 'white' }}
                  activeDot={{ r: 6 }}
                  strokeDasharray="5 3"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Donut Chart */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Gastos por Rubro</div>
              <div className="card-subtitle">Junio 2026</div>
            </div>
          </div>
          <div style={{ padding: 'var(--sp-5)', paddingTop: 'var(--sp-3)' }}>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={rubroDistribution}
                  cx="50%" cy="50%"
                  innerRadius={50} outerRadius={72}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {rubroDistribution.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<DonutTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ marginTop: 'var(--sp-3)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rubroDistribution.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--text-xs)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: item.color, flexShrink: 0, display: 'inline-block' }} />
                    <span style={{ color: 'var(--text-secondary)' }}>{item.name}</span>
                  </span>
                  <span className="mono" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {formatCurrency(item.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-5)' }}>
        {/* Activity */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Actividad Reciente</div>
              <div className="card-subtitle">Agentes y acciones del sistema</div>
            </div>
          </div>
          <div style={{ padding: 'var(--sp-4) var(--sp-6)' }}>
            <ActivityFeed />
          </div>
        </div>

        {/* Agents */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Agentes IA</div>
              <div className="card-subtitle">Estado en tiempo real</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('agents')}>
              Ver todo
            </button>
          </div>
          <div style={{ padding: 'var(--sp-4)' }}>
            <AgentPanel onNavigate={onNavigate} />
          </div>
        </div>
      </div>
    </div>
  );
}
