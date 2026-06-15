import { useState } from 'react';
import './index.css';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import Dashboard from './pages/Dashboard';
import Invoices from './pages/Invoices';
import Receipts from './pages/Receipts';
import Banks from './pages/Banks';
import Taxes from './pages/Taxes';
import Agents from './pages/Agents';
import Purchases from './pages/Purchases';
import Retail from './pages/Retail';
import Imports from './pages/Imports';
import Retentions from './pages/Retentions';
import Settings from './pages/Settings';
import ChatWidget from './components/ChatWidget';

const pages = {
  dashboard: Dashboard,
  invoices: Invoices,
  receipts: Receipts,
  banks: Banks,
  taxes: Taxes,
  agents: Agents,
  purchases: Purchases,
  retail: Retail,
  imports: Imports,
  retentions: Retentions,
  settings: Settings,
};

function Placeholder({ title }) {
  return (
    <div className="empty-state" style={{ paddingTop: 80 }}>
      <div style={{ fontSize: '3rem', marginBottom: 'var(--sp-4)' }}>🔧</div>
      <h3>{title}</h3>
      <p>Esta sección estará disponible próximamente.</p>
    </div>
  );
}

export default function App() {
  const [activePage, setActivePage] = useState('dashboard');

  const PageComponent = pages[activePage] || (() => <Placeholder title="Página no encontrada" />);

  return (
    <div className="app-shell">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <div className="main-area">
        <Header activePage={activePage} />
        <main className="page-content">
          <PageComponent onNavigate={setActivePage} />
        </main>
      </div>
      <ChatWidget />
    </div>
  );
}
