import { useState, useEffect } from 'react';
import './index.css';
import { supabase } from './api/supabaseClient';
import Auth from './pages/Auth';
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
import BulkImport from './pages/BulkImport';
import Retentions from './pages/Retentions';
import Settings from './pages/Settings';
import ChatWidget from './components/ChatWidget';
import { Loader2 } from 'lucide-react';

const pages = {
  dashboard: Dashboard,
  invoices: Invoices,
  bulkImport: BulkImport,
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
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [activePage, setActivePage] = useState('settings'); // Default a settings para que prueben de inmediato
  const [userRole, setUserRole] = useState('usuario');
  const [companyLogo, setCompanyLogo] = useState(null);

  useEffect(() => {
    // Si el cliente no pudo inicializarse (sin variables de entorno), evitamos petar la UI
    if (!supabase) {
      setLoadingSession(false);
      return;
    }

    const fetchUserAndCompanyData = async (currentSession) => {
      if (!currentSession?.user?.id) return;
      
      try {
        // Fetch role
        const { data: profile } = await supabase
          .from('perfiles')
          .select('rol')
          .eq('id', currentSession.user.id)
          .single();
          
        if (profile?.rol) {
          setUserRole(profile.rol);
        }

        // Fetch company logo (asumiendo que la configuración está atada al user_id)
        const { data: company } = await supabase
          .from('configuracion_empresa')
          .select('logo_url')
          .eq('user_id', currentSession.user.id)
          .maybeSingle();

        if (company?.logo_url) {
          setCompanyLogo(company.logo_url);
        }
      } catch (err) {
        console.error("Error fetching user data", err);
      }
    };

    // 1. Obtener la sesión actual al cargar la app
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchUserAndCompanyData(session).finally(() => setLoadingSession(false));
      } else {
        setLoadingSession(false);
      }
    }).catch(() => {
      setLoadingSession(false);
    });

    // 2. Escuchar dinámicamente si el usuario entra o sale (onAuthStateChange)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      if (currentSession) {
        fetchUserAndCompanyData(currentSession);
      }
    });

    return () => subscription?.unsubscribe();
  }, []);

  // Función para actualizar el logo y propagarlo (se usa en Settings)
  const updateCompanyLogo = (url) => setCompanyLogo(url);

  if (loadingSession) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' }}>
        <Loader2 size={32} className="spin-icon" style={{ color: 'var(--accent-500)' }} />
      </div>
    );
  }

  // Si no detectamos sesión, se renderiza automáticamente la pantalla de Autenticación
  if (!session) {
    return <Auth />;
  }

  // Si sí hay sesión, renderizamos toda la App (App Shell)
  const PageComponent = pages[activePage] || (() => <Placeholder title="Página no encontrada" />);

  return (
    <div className="app-shell">
      <Sidebar 
        activePage={activePage} 
        onNavigate={setActivePage} 
        userEmail={session?.user?.email} 
        userRole={userRole} 
        companyLogo={companyLogo} 
      />
      <div className="main-area">
        <Header activePage={activePage} userEmail={session?.user?.email} />
        <main className="page-content">
          <PageComponent 
            onNavigate={setActivePage} 
            userEmail={session?.user?.email} 
            userRole={userRole} 
            companyLogo={companyLogo} 
            onUpdateLogo={updateCompanyLogo} 
          />
        </main>
      </div>
      <ChatWidget userEmail={session?.user?.email} />
    </div>
  );
}
