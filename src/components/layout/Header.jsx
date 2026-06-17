import { useState, useRef, useEffect } from 'react';
import { Bell, Search, RefreshCw, X, CheckCircle, AlertCircle, AlertTriangle, Info, LogOut, User } from 'lucide-react';
import { supabase } from '../../api/supabaseClient';
import { notifications } from '../../data/mockData';

const pageTitles = {
  dashboard: { title: 'Inicio', sub: 'Junio 2026' },
  invoices:  { title: 'Facturas', sub: 'Comprobantes fiscales CFDI' },
  receipts:  { title: 'Recibos de Pago', sub: 'Complementos de pago' },
  banks:     { title: 'Bancos', sub: 'Cuentas y conciliación bancaria' },
  taxes:     { title: 'Impuestos', sub: 'Declaraciones y obligaciones fiscales' },
  agents:    { title: 'Agentes IA', sub: 'Automatización y auditoría inteligente' },
  settings:  { title: 'Configuración', sub: 'Empresa y preferencias' },
  purchases: { title: 'Compras', sub: 'Órdenes de compra y aprovisionamiento' },
  retail:    { title: 'Punto de Venta', sub: 'Tickets y facturación retail' },
  imports:   { title: 'Importaciones', sub: 'Pedimentos y comercio exterior' },
  retentions:{ title: 'Retenciones', sub: 'Constancias ISR e IVA' },
};

function NotifIcon({ type }) {
  if (type === 'danger') return <AlertCircle size={14} style={{ color: 'var(--danger-text)' }} />;
  if (type === 'warning') return <AlertTriangle size={14} style={{ color: 'var(--warning-text)' }} />;
  if (type === 'success') return <CheckCircle size={14} style={{ color: 'var(--success-text)' }} />;
  return <Info size={14} style={{ color: 'var(--info-text)' }} />;
}

export default function Header({ activePage, userEmail }) {
  const info = pageTitles[activePage] || pageTitles.dashboard;
  const [syncing, setSyncing] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const notifRef = useRef(null);
  const userMenuRef = useRef(null);
  const searchRef = useRef(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => setSyncing(false), 2500);
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifs(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setShowUserMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Keyboard shortcut for search
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchRef.current?.focus(), 100);
      }
      if (e.key === 'Escape') {
        setShowSearch(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      <header className="header">
        <div style={{ flex: 1 }}>
          <span className="header-title">{info.title}</span>
          <span className="header-subtitle">/ {info.sub}</span>
        </div>

        <div className="header-actions">
          {/* Search Button */}
          <button
            className="icon-btn btn"
            title="Buscar (Ctrl+K)"
            onClick={() => {
              setShowSearch(true);
              setTimeout(() => searchRef.current?.focus(), 100);
            }}
          >
            <Search size={17} />
          </button>

          {/* SAT Sync */}
          <button
            className={`btn btn-secondary btn-sm ${syncing ? 'syncing' : ''}`}
            style={{ gap: 'var(--sp-2)' }}
            title="Sincronizar con SAT"
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw size={14} className={syncing ? 'spin-icon' : ''} />
            {syncing ? 'Sincronizando...' : 'Sync SAT'}
          </button>

          {/* Notifications */}
          <div ref={notifRef} style={{ position: 'relative' }}>
            <button
              className="icon-btn btn"
              title="Notificaciones"
              style={{ position: 'relative' }}
              onClick={() => setShowNotifs(!showNotifs)}
            >
              <Bell size={17} />
              {unreadCount > 0 && <span className="notif-dot" />}
            </button>

            {showNotifs && (
              <div className="notif-dropdown">
                <div className="notif-dropdown-header">
                  <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>Notificaciones</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                    {unreadCount} sin leer
                  </span>
                </div>
                <div className="notif-dropdown-body">
                  {notifications.map(n => (
                    <div key={n.id} className={`notif-item ${n.read ? 'read' : ''}`}>
                      <NotifIcon type={n.type} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 'var(--text-sm)', fontWeight: n.read ? 400 : 600, color: 'var(--text-primary)' }}>{n.title}</div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 1, lineHeight: 1.4 }}>{n.message}</div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)', marginTop: 3 }}>{n.time}</div>
                      </div>
                      {!n.read && <span className="notif-unread-dot" />}
                    </div>
                  ))}
                </div>
                <div className="notif-dropdown-footer">
                  <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center', color: 'var(--accent-500)' }}>
                    Ver todas las notificaciones
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* User Menu */}
          <div ref={userMenuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}
            >
              <div className="avatar" style={{ width: 32, height: 32, fontSize: '0.65rem' }}>
                {userEmail ? userEmail.substring(0, 2).toUpperCase() : 'US'}
              </div>
            </button>

            {showUserMenu && (
              <div 
                className="notif-dropdown" 
                style={{ 
                  right: 0, left: 'auto', width: 220, 
                  marginTop: 'var(--sp-2)', padding: 'var(--sp-2)' 
                }}
              >
                <div style={{ padding: 'var(--sp-3)', borderBottom: '1px solid var(--border)', marginBottom: 'var(--sp-2)' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontWeight: 600 }}>Cuentas</div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                    {userEmail || 'Usuario'}
                  </div>
                </div>
                
                <button 
                  className="btn btn-ghost" 
                  style={{ width: '100%', justifyContent: 'flex-start', color: 'var(--text-secondary)' }}
                >
                  <User size={15} style={{ marginRight: 8 }} />
                  Mi Perfil
                </button>
                
                <button 
                  className="btn btn-ghost" 
                  style={{ width: '100%', justifyContent: 'flex-start', color: 'var(--danger-text)' }}
                  onClick={async () => {
                    setShowUserMenu(false);
                    if (supabase) {
                      await supabase.auth.signOut();
                    }
                  }}
                >
                  <LogOut size={15} style={{ marginRight: 8 }} />
                  Cerrar Sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Global Search Modal */}
      {showSearch && (
        <>
          <div className="search-modal-overlay" onClick={() => { setShowSearch(false); setSearchQuery(''); }} />
          <div className="search-modal">
            <div className="search-modal-header">
              <Search size={18} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
              <input
                ref={searchRef}
                className="search-modal-input"
                placeholder="Buscar facturas, proveedores, folios..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              <kbd className="search-kbd">ESC</kbd>
            </div>
            <div className="search-modal-body">
              {!searchQuery && (
                <div style={{ padding: 'var(--sp-4) var(--sp-5)', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', textAlign: 'center' }}>
                  Escribe para buscar en facturas, clientes, proveedores y más...
                </div>
              )}
              {searchQuery && (
                <div style={{ padding: 'var(--sp-3) var(--sp-5)' }}>
                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--sp-2)' }}>
                    Sugerencias
                  </div>
                  {['Facturas por cobrar', 'Servicios Profesionales', 'Microsoft de México'].filter(s => s.toLowerCase().includes(searchQuery.toLowerCase())).map((item, i) => (
                    <div key={i} className="search-result-item" onClick={() => { setShowSearch(false); setSearchQuery(''); }}>
                      <Search size={13} style={{ color: 'var(--text-tertiary)' }} />
                      <span>{item}</span>
                    </div>
                  ))}
                  {searchQuery.length >= 2 && (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', padding: 'var(--sp-3) 0', textAlign: 'center' }}>
                      Presiona Enter para buscar "{searchQuery}"
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
