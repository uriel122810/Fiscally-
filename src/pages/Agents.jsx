import { useState } from 'react';
import { CheckCircle, Eye, RefreshCw, ThumbsUp } from 'lucide-react';
import { agentStatus, agentLogs, formatCurrency } from '../data/mockData';

const agentNames = {
  reconciliation_agent: 'Conciliación Bancaria',
  audit_agent: 'Auditoría SAT',
  classification_agent: 'Clasificación IA',
  financial_chatbot: 'Asistente Financiero',
};

const agentColors = {
  reconciliation_agent: '#6366F1',
  audit_agent: '#10B981',
  classification_agent: '#F59E0B',
  financial_chatbot: '#8B5CF6',
};

const agentIcons = {
  reconciliation_agent: '⚖️',
  audit_agent: '🛡️',
  classification_agent: '✨',
  financial_chatbot: '💬',
};

function AgentStatusCard({ agent }) {
  return (
    <div className="card">
      <div className="card-header" style={{ borderBottom: `3px solid ${agent.color}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
          <div style={{ width: 42, height: 42, borderRadius: 'var(--radius-md)', background: `${agent.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
            {agent.id === 'reconciliation' && '⚖️'}
            {agent.id === 'audit' && '🛡️'}
            {agent.id === 'classification' && '✨'}
            {agent.id === 'chatbot' && '💬'}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}>{agent.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <span className={`agent-dot ${agent.status}`} />
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: agent.color }}>{agent.statusLabel}</span>
              {agent.lastRun && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>· {agent.lastRun}</span>
              )}
            </div>
          </div>
        </div>
        <button className="btn btn-secondary btn-sm">
          <RefreshCw size={12} /> Ejecutar
        </button>
      </div>
      <div style={{ padding: 'var(--sp-4) var(--sp-5)' }}>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--sp-3)' }}>
          {agent.detail}
        </div>
        {agent.requiresAction && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-3) var(--sp-4)', background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', borderRadius: 'var(--radius-sm)' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--warning-text)', fontWeight: 600, flex: 1 }}>
              {agent.actionCount} item{agent.actionCount !== 1 ? 's' : ''} requieren revisión manual
            </span>
            <button className="btn btn-secondary btn-sm">
              <Eye size={12} /> Revisar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function LogItem({ log }) {
  const [reviewed, setReviewed] = useState(log.user_reviewed || false);
  const levelClass = `log-level-${log.level}`;
  const agentName = agentNames[log.agent] || log.agent;

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return 'Hace menos de 1h';
    if (h < 24) return `Hace ${h}h`;
    return `Hace ${Math.floor(h / 24)}d`;
  };

  return (
    <div className="log-item">
      <div className={`log-level-dot ${levelClass}`} />
      <div className="log-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginBottom: 3 }}>
          <span className="log-agent" style={{ color: agentColors[log.agent] }}>
            {agentIcons[log.agent]} {agentName}
          </span>
          {log.requires_action && !reviewed && (
            <span className="log-action-badge">Revisión requerida</span>
          )}
        </div>
        <div className="log-message">{log.message}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginTop: 6 }}>
          <span className="log-time">{timeAgo(log.created_at)}</span>
          {log.details?.score && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
              Score: {Math.round(log.details.score * 100)}%
            </span>
          )}
          {log.details?.confidence && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
              Confianza: {Math.round(log.details.confidence * 100)}%
            </span>
          )}
          {log.requires_action && !reviewed && (
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginLeft: 'auto', gap: 4 }}
              onClick={() => setReviewed(true)}
            >
              <ThumbsUp size={11} /> Marcar revisado
            </button>
          )}
          {reviewed && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--success-text)', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
              <CheckCircle size={11} /> Revisado
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Agents() {
  const [filterAgent, setFilterAgent] = useState('all');

  const filteredLogs = filterAgent === 'all'
    ? agentLogs
    : agentLogs.filter(l => l.agent === filterAgent);

  const totalAlerts = agentLogs.filter(l => l.requires_action).length;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Agentes IA</h1>
          <p>Automatización fiscal inteligente · {totalAlerts} acciones pendientes</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary">
            <RefreshCw size={15} /> Ejecutar todos
          </button>
        </div>
      </div>

      {/* Agent Cards */}
      <div className="agents-layout" style={{ marginBottom: 'var(--sp-8)' }}>
        {agentStatus.map(agent => (
          <AgentStatusCard key={agent.id} agent={agent} />
        ))}
      </div>

      {/* Activity Log */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Registro de Actividad</div>
            <div className="card-subtitle">Historial de acciones de los agentes</div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            <select
              className="filter-select"
              value={filterAgent}
              onChange={e => setFilterAgent(e.target.value)}
            >
              <option value="all">Todos los agentes</option>
              <option value="reconciliation_agent">Conciliación</option>
              <option value="audit_agent">Auditoría SAT</option>
              <option value="classification_agent">Clasificación</option>
              <option value="financial_chatbot">Asistente</option>
            </select>
          </div>
        </div>
        <div>
          {filteredLogs.map(log => (
            <LogItem key={log.id} log={log} />
          ))}
          {filteredLogs.length === 0 && (
            <div className="empty-state">
              <div style={{ fontSize: '2rem', marginBottom: 'var(--sp-3)' }}>🤖</div>
              <h3>Sin registros</h3>
              <p>No hay actividad de este agente aún.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
