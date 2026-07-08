import {
  LayoutDashboard, FileText, FileArchive, Receipt, Building2,
  Calculator, Sparkles, ShoppingCart, ShoppingBag,
  Globe, Shield, Settings, ChevronRight
} from 'lucide-react';

const navItems = [
  { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard },
  { id: 'invoices', label: 'Facturas', icon: FileText },
  { id: 'bulkImport', label: 'Carga Masiva', icon: FileArchive },
  { id: 'receipts', label: 'Recibos de Pago', icon: Receipt },
  { id: 'banks', label: 'Bancos', icon: Building2 },
  { id: 'taxes', label: 'Impuestos', icon: Calculator },
];

const commerceItems = [
  { id: 'purchases', label: 'Compras', icon: ShoppingCart },
  { id: 'retail', label: 'Retail / POS', icon: ShoppingBag },
  { id: 'imports', label: 'Importaciones', icon: Globe },
  { id: 'retentions', label: 'Retenciones', icon: Shield },
];

const systemItems = [
  { id: 'agents', label: 'Agentes IA', icon: Sparkles, badge: 5 },
  { id: 'settings', label: 'Configuración', icon: Settings },
];

export default function Sidebar({ activePage, onNavigate, userEmail, userRole, companyLogo }) {
  const emailStr = userEmail || "usuario@gmail.com";
  const shortName = emailStr.split('@')[0];
  const initial = shortName.charAt(0).toUpperCase();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        {companyLogo ? (
          <img src={companyLogo} alt="Logo" className="logo-mark" style={{ width: 32, height: 32, padding: 0, objectFit: 'contain', background: 'transparent' }} />
        ) : (
          <div className="logo-mark">Fi</div>
        )}
        <div>
          <span className="logo-text">Fiscally</span>
          <span className="logo-badge">Pro</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Principal</div>
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              className={`nav-item${isActive ? ' active' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              <Icon className="nav-icon" size={17} />
              {item.label}
              {item.badge && (
                <span className="nav-badge info">{item.badge}</span>
              )}
            </button>
          );
        })}

        <div className="nav-section-label" style={{ marginTop: 'var(--sp-4)' }}>Comercial</div>
        {commerceItems.map(item => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              className={`nav-item${isActive ? ' active' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              <Icon className="nav-icon" size={17} />
              {item.label}
            </button>
          );
        })}

        <div className="nav-section-label" style={{ marginTop: 'var(--sp-4)' }}>Sistema</div>
        {systemItems.map(item => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              className={`nav-item${isActive ? ' active' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              <Icon className="nav-icon" size={17} />
              {item.label}
              {item.badge && (
                <span className="nav-badge">{item.badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div 
          className="user-card"
          onClick={() => onNavigate('settings')}
          style={{ cursor: 'pointer' }}
        >
          <div className="avatar" style={{ fontWeight: 600 }}>{initial}</div>
          <div className="user-info">
            <div className="user-name">{shortName}</div>
            <div className="user-role" style={{ textTransform: 'capitalize' }}>{userRole || 'Usuario'}</div>
          </div>
          <ChevronRight size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
        </div>
      </div>
    </aside>
  );
}
