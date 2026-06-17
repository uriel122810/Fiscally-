import { useState, useEffect } from 'react';
import {
  Building2, User, Shield, Key, CreditCard, Bell, Users,
  CheckCircle, AlertCircle, Save, Upload, ExternalLink, Zap, Loader2
} from 'lucide-react';
import { companySettings, formatDate } from '../data/mockData';
import { useAuthStatus } from '../hooks/useSatData';
import { satApi } from '../api/satClient';

function SettingSection({ icon, title, children }) {
  return (
    <div className="card" style={{ marginBottom: 'var(--sp-5)' }}>
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
          {icon}
          <div className="card-title">{title}</div>
        </div>
      </div>
      <div style={{ padding: 'var(--sp-5) var(--sp-6)' }}>
        {children}
      </div>
    </div>
  );
}

function FieldRow({ label, value, mono, editable }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--sp-3) 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
      {editable ? (
        <input
          className="search-input"
          defaultValue={value}
          style={{ maxWidth: 320, paddingLeft: 'var(--sp-3)', textAlign: 'right' }}
        />
      ) : (
        <span className={mono ? 'mono-sm' : ''} style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
          {value}
        </span>
      )}
    </div>
  );
}

export default function Settings() {
  const [activeSection, setActiveSection] = useState('empresa');
  const [netlifyConfig, setNetlifyConfig] = useState({ loading: true, data: null, error: null });
  const [uploadState, setUploadState] = useState({ loading: false, error: null, success: false });
  const [uploadPassword, setUploadPassword] = useState('');

  // Sincronizar configuración directamente desde Supabase
  const fetchSupabaseConfig = async () => {
    setNetlifyConfig(prev => ({ ...prev, loading: true }));
    try {
      const { supabase } = await import('../api/supabaseClient');
      
      if (!supabase) {
        throw new Error("El cliente de Supabase no pudo inicializarse por falta de variables de entorno.");
      }

      // Usando UUID de prueba (en prod: supabase.auth.getUser())
      const userId = '00000000-0000-0000-0000-000000000000'; 

      // 1. Control estricto: abortar si el userId es nulo o indefinido
      if (!userId || userId === 'undefined' || userId === 'null') {
        throw new Error('Usuario no autenticado o ID inválido. No se puede consultar Supabase.');
      }
      
      // 3. Sintaxis limpia usando .maybeSingle() para evitar el error HTTP 406 (Not Acceptable)
      const { data, error } = await supabase
        .from('configuracion_sat')
        .select('rfc, fecha_vencimiento, cer_configurado, key_configurado')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        throw new Error(`Error BD: ${error.message}`);
      }
      
      setNetlifyConfig({ loading: false, data: data || {}, error: null });
    } catch (err) {
      console.error(err);
      setNetlifyConfig({ loading: false, data: null, error: err.message });
    }
  };

  useEffect(() => {
    if (activeSection === 'sat') {
      fetchSupabaseConfig();
    }
  }, [activeSection]);

  const sections = [
    { id: 'empresa', label: 'Empresa', icon: <Building2 size={16} /> },
    { id: 'sat', label: 'Certificado SAT', icon: <Shield size={16} /> },
    { id: 'usuarios', label: 'Usuarios', icon: <Users size={16} /> },
    { id: 'plan', label: 'Suscripción', icon: <CreditCard size={16} /> },
    { id: 'notificaciones', label: 'Notificaciones', icon: <Bell size={16} /> },
  ];

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Configuración</h1>
          <p>Datos de empresa, certificado SAT y preferencias del sistema</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-primary">
            <Save size={15} /> Guardar cambios
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 'var(--sp-6)' }}>
        {/* Sidebar */}
        <div>
          {sections.map(sec => (
            <button
              key={sec.id}
              className={`nav-item${activeSection === sec.id ? ' active' : ''}`}
              onClick={() => setActiveSection(sec.id)}
              style={{ marginBottom: 2 }}
            >
              {sec.icon}
              {sec.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div>
          {activeSection === 'empresa' && (
            <SettingSection icon={<Building2 size={16} style={{ color: 'var(--accent-500)' }} />} title="Datos de la Empresa">
              <FieldRow label="Razón Social" value={companySettings.nombre} editable />
              <FieldRow label="RFC" value={companySettings.rfc} mono />
              <FieldRow label="Régimen Fiscal" value={companySettings.regimen} />
              <FieldRow label="Dirección Fiscal" value={companySettings.direccion} editable />
              <FieldRow label="Correo electrónico" value={companySettings.email} editable />
              <FieldRow label="Teléfono" value={companySettings.telefono} editable />

              <div style={{ marginTop: 'var(--sp-5)', display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
                <div style={{ width: 64, height: 64, borderRadius: 'var(--radius-lg)', background: 'linear-gradient(135deg, var(--accent-400), var(--accent-700))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 'var(--text-xl)' }}>
                  GT
                </div>
                <div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 4 }}>Logo de la empresa</div>
                  <button className="btn btn-secondary btn-sm">
                    <Upload size={13} /> Subir logo
                  </button>
                </div>
              </div>
            </SettingSection>
          )}

          {activeSection === 'sat' && (
            <SettingSection icon={<Shield size={16} style={{ color: '#10B981' }} />} title="Certificado de Sello Digital (CSD) / e.firma">
              {/* Status banner — uses real auth status from Netlify Function */}
              {(() => {
                if (netlifyConfig.loading) {
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 'var(--sp-4)', color: 'var(--text-tertiary)' }}>
                      <Loader2 size={16} className="spin-icon" /> Verificando configuración en Supabase...
                    </div>
                  );
                }

                if (netlifyConfig.error) {
                  return (
                    <div style={{ padding: 'var(--sp-4)', background: 'var(--danger-bg)', color: 'var(--danger-text)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--sp-5)' }}>
                      <AlertCircle size={16} style={{ display: 'inline', marginRight: 8 }} />
                      Hubo un problema consultando la configuración: {netlifyConfig.error}
                    </div>
                  );
                }

                const config = netlifyConfig.data;
                const isVigente = config?.cer_configurado && config?.key_configurado;
                const expiration = config?.fecha_vencimiento;
                
                return (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
                    padding: 'var(--sp-4) var(--sp-5)',
                    background: isVigente ? 'var(--success-bg)' : 'var(--danger-bg)',
                    border: `1px solid ${isVigente ? 'var(--success-border)' : 'var(--danger-border)'}`,
                    borderRadius: 'var(--radius-md)', marginBottom: 'var(--sp-5)',
                  }}>
                    {isVigente
                      ? <CheckCircle size={18} style={{ color: 'var(--success-text)' }} />
                      : <AlertCircle size={18} style={{ color: 'var(--danger-text)' }} />
                    }
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: isVigente ? 'var(--success-text)' : 'var(--danger-text)' }}>
                        {isVigente ? 'Certificado vigente y activo' : 'Certificado no configurado'}
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 2 }}>
                        {isVigente && expiration ? `Vence: ${expiration.split('T')[0]}` : 'Sube tu e.firma para conectar con el SAT'}
                      </div>
                    </div>
                  </div>
                );
              })()}

              <FieldRow label="RFC asociado" value={netlifyConfig.data?.rfc || 'No configurado'} mono />
              <FieldRow label="Fecha de vencimiento" value={netlifyConfig.data?.fecha_vencimiento?.split('T')[0] || '—'} />
              <FieldRow label="Archivos .cer configurado" value={netlifyConfig.data?.cer_configurado ? '✅ Sí' : '❌ No'} />
              <FieldRow label="Archivos .key configurado" value={netlifyConfig.data?.key_configurado ? '✅ Sí' : '❌ No'} />

              <div style={{ marginTop: 'var(--sp-5)', display: 'flex', gap: 'var(--sp-3)' }}>
                <button
                  className="btn btn-primary"
                  onClick={fetchSupabaseConfig}
                  disabled={netlifyConfig.loading}
                >
                  {netlifyConfig.loading ? <Loader2 size={14} className="spin-icon" /> : <Zap size={14} />}
                  {netlifyConfig.loading ? 'Sincronizando...' : 'Sincronizar Estado con Supabase'}
                </button>
              </div>
            </SettingSection>
          )}

          {activeSection === 'usuarios' && (
            <SettingSection icon={<Users size={16} style={{ color: '#8B5CF6' }} />} title="Usuarios del Sistema">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-5)' }}>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                  {companySettings.usuarios_activos} de {companySettings.usuarios_max} usuarios activos
                </div>
                <button className="btn btn-primary btn-sm">
                  <User size={13} /> Invitar usuario
                </button>
              </div>
              {/* User list */}
              {[
                { name: 'Juan Martínez', role: 'Administrador', email: 'juan@grupotecnologico.mx', status: 'activo' },
                { name: 'Ana García López', role: 'Contador', email: 'ana@grupotecnologico.mx', status: 'activo' },
                { name: 'Carlos Ruiz', role: 'Auxiliar Contable', email: 'carlos@grupotecnologico.mx', status: 'activo' },
                { name: 'Sofía Mendoza', role: 'Solo lectura', email: 'sofia@grupotecnologico.mx', status: 'inactivo' },
              ].map((user, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-3) 0', borderBottom: idx < 3 ? '1px solid var(--border)' : 'none' }}>
                  <div className="avatar" style={{ width: 32, height: 32, fontSize: '0.6rem' }}>
                    {user.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{user.name}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{user.email}</div>
                  </div>
                  <span className="rubro-badge" style={{ background: '#8B5CF618', color: '#8B5CF6' }}>{user.role}</span>
                  {user.status === 'activo'
                    ? <span className="badge badge-cobrada" style={{ fontSize: '0.6rem' }}><span className="badge-dot" /> Activo</span>
                    : <span className="badge badge-pendiente" style={{ fontSize: '0.6rem' }}>Inactivo</span>
                  }
                </div>
              ))}
            </SettingSection>
          )}

          {activeSection === 'plan' && (
            <SettingSection icon={<CreditCard size={16} style={{ color: '#F59E0B' }} />} title="Suscripción y Plan">
              <div style={{
                background: 'linear-gradient(135deg, var(--accent-500), #8B5CF6)',
                borderRadius: 'var(--radius-lg)', padding: 'var(--sp-6)',
                color: 'white', marginBottom: 'var(--sp-5)',
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', top: -20, right: -20, width: 120, height: 120, background: 'rgba(255,255,255,0.1)', borderRadius: '50%' }} />
                <div style={{ position: 'absolute', bottom: -30, right: 40, width: 80, height: 80, background: 'rgba(255,255,255,0.06)', borderRadius: '50%' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginBottom: 'var(--sp-2)' }}>
                  <Zap size={18} />
                  <span style={{ fontWeight: 700, fontSize: 'var(--text-lg)', letterSpacing: '-0.02em' }}>Plan Pro</span>
                </div>
                <div style={{ fontSize: 'var(--text-sm)', opacity: 0.85, marginBottom: 'var(--sp-4)' }}>
                  Facturación ilimitada · Agentes IA · Conciliación bancaria · Soporte prioritario
                </div>
                <div style={{ display: 'flex', gap: 'var(--sp-6)', fontSize: 'var(--text-sm)' }}>
                  <div>
                    <div style={{ opacity: 0.7, fontSize: 'var(--text-xs)' }}>Próximo cobro</div>
                    <div style={{ fontWeight: 600 }}>01 Jul 2026</div>
                  </div>
                  <div>
                    <div style={{ opacity: 0.7, fontSize: 'var(--text-xs)' }}>Monto mensual</div>
                    <div style={{ fontWeight: 600 }}>$2,499 MXN</div>
                  </div>
                  <div>
                    <div style={{ opacity: 0.7, fontSize: 'var(--text-xs)' }}>Usuarios</div>
                    <div style={{ fontWeight: 600 }}>{companySettings.usuarios_activos}/{companySettings.usuarios_max}</div>
                  </div>
                </div>
              </div>
              <button className="btn btn-secondary">Cambiar plan</button>
            </SettingSection>
          )}

          {activeSection === 'notificaciones' && (
            <SettingSection icon={<Bell size={16} style={{ color: '#3B82F6' }} />} title="Preferencias de Notificación">
              {[
                { label: 'Facturas canceladas en SAT', desc: 'Recibir alerta cuando un proveedor cancele una factura', enabled: true },
                { label: 'Conciliación automática', desc: 'Notificar sobre sugerencias de conciliación bancaria', enabled: true },
                { label: 'Clasificación baja confianza', desc: 'Alertar cuando el agente clasifique con < 70% confianza', enabled: true },
                { label: 'Sync SAT diario', desc: 'Resumen diario de descarga automática de CFDIs', enabled: false },
                { label: 'Vencimiento de declaraciones', desc: 'Recordatorio 5 días antes de la fecha límite', enabled: true },
                { label: 'Email de respaldo', desc: 'Enviar copia de notificaciones al correo electrónico', enabled: false },
              ].map((pref, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--sp-3) 0', borderBottom: idx < 5 ? '1px solid var(--border)' : 'none' }}>
                  <div>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>{pref.label}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 2 }}>{pref.desc}</div>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" defaultChecked={pref.enabled} />
                    <span className="toggle-slider" />
                  </label>
                </div>
              ))}
            </SettingSection>
          )}
        </div>
      </div>
    </div>
  );
}
