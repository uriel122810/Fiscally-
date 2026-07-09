import { useState } from 'react';
import { supabase } from '../api/supabaseClient';
import { Building2, Loader2, Mail, Lock, AlertCircle, CheckCircle } from 'lucide-react';

export default function Auth() {
  const [esLogin, setEsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      if (!supabase) throw new Error("El cliente de Supabase no está inicializado.");

      if (esLogin) {
        // FLUJO DE INICIO DE SESIÓN
        const { error } = await supabase.auth.signInWithPassword({ 
          email, 
          password 
        });
        if (error) throw error;
        
        // El onAuthStateChange en App.jsx lo atrapará y redirigirá automáticamente.
      } else {
        // FLUJO DE REGISTRO
        // El rol ('usuario' por defecto) se asigna en public.perfiles vía
        // trigger de base de datos (on_auth_user_created) — no aquí.
        const { data, error } = await supabase.auth.signUp({
          email,
          password
        });

        if (error) throw error;

        // Si el proyecto tiene confirmación de correo activada, signUp()
        // no crea sesión todavía (data.session es null) — el mensaje debe
        // reflejar eso en vez de prometer un inicio de sesión que no ocurrió.
        if (data.session) {
          setSuccessMsg("¡Registro exitoso! Iniciando sesión...");
        } else {
          setSuccessMsg("¡Registro exitoso! Revisa tu correo para confirmar tu cuenta antes de iniciar sesión.");
          setEsLogin(true);
        }
        // Limpiamos los inputs
        setEmail("");
        setPassword("");
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-main)',
      padding: 'var(--sp-4)'
    }}>
      <div className="card" style={{ width: '100%', maxWidth: 400, overflow: 'hidden', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' }}>
        
        {/* Cabecera */}
        <div style={{ padding: 'var(--sp-6) var(--sp-6) var(--sp-4)', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 'var(--radius-lg)',
            background: 'linear-gradient(135deg, var(--accent-500), var(--accent-700))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', margin: '0 auto var(--sp-4)',
            boxShadow: '0 4px 14px 0 rgba(139, 92, 246, 0.39)'
          }}>
            <Building2 size={28} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 'var(--sp-1)', color: 'var(--text-primary)' }}>
            Fiscally
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
            {esLogin ? 'Ingresa a tu panel de control' : 'Crea una cuenta para empezar'}
          </p>
        </div>

        {/* Pestañas (Control de Login vs Registro) */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface-2)' }}>
          <button
            type="button"
            style={{
              flex: 1, padding: 'var(--sp-3)', fontSize: 'var(--text-sm)', fontWeight: 600,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: esLogin ? 'var(--accent-500)' : 'var(--text-secondary)',
              borderBottom: esLogin ? '2px solid var(--accent-500)' : '2px solid transparent',
              transition: 'all 0.2s'
            }}
            onClick={() => { setEsLogin(true); setErrorMsg(""); setSuccessMsg(""); }}
          >
            Iniciar Sesión
          </button>
          <button
            type="button"
            style={{
              flex: 1, padding: 'var(--sp-3)', fontSize: 'var(--text-sm)', fontWeight: 600,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: !esLogin ? 'var(--accent-500)' : 'var(--text-secondary)',
              borderBottom: !esLogin ? '2px solid var(--accent-500)' : '2px solid transparent',
              transition: 'all 0.2s'
            }}
            onClick={() => { setEsLogin(false); setErrorMsg(""); setSuccessMsg(""); }}
          >
            Registrarse
          </button>
        </div>

        <div style={{ padding: 'var(--sp-6)' }}>
          
          {/* Banner de Errores Visibles */}
          {errorMsg && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--danger-bg)', color: 'var(--danger-text)',
              padding: 'var(--sp-3)', borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-sm)', marginBottom: 'var(--sp-4)',
              border: '1px solid var(--danger-border)'
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Banner de Éxito */}
          {successMsg && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--success-bg)', color: 'var(--success-text)',
              padding: 'var(--sp-3)', borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-sm)', marginBottom: 'var(--sp-4)',
              border: '1px solid var(--success-border)'
            }}>
              <CheckCircle size={18} style={{ flexShrink: 0 }} />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Correo electrónico
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: 14, top: 11, color: 'var(--text-tertiary)' }} />
                <input
                  type="email"
                  required
                  className="search-input"
                  style={{ width: '100%', paddingLeft: 40, height: 40 }}
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Contraseña
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: 14, top: 11, color: 'var(--text-tertiary)' }} />
                <input
                  type="password"
                  required
                  className="search-input"
                  style={{ width: '100%', paddingLeft: 40, height: 40 }}
                  placeholder={esLogin ? "••••••••" : "Mínimo 6 caracteres"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={esLogin ? undefined : 6}
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', marginTop: 'var(--sp-3)', height: 42, fontSize: 'var(--text-sm)' }}
              disabled={loading}
            >
              {loading ? <Loader2 size={16} className="spin-icon" /> : null}
              {esLogin ? 'Iniciar Sesión' : 'Crear mi cuenta'}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
