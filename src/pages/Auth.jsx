import { useState } from 'react';
import { supabase } from '../api/supabaseClient';
import { Building2, Loader2, Mail, Lock } from 'lucide-react';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!supabase) throw new Error("Supabase client not initialized.");

      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // Dependiendo de tu config en Supabase, el signUp podría auto-loguear
        // o requerir confirmación por correo.
      }
    } catch (err) {
      setError(err.message);
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
      <div className="card" style={{ width: '100%', maxWidth: 400, overflow: 'hidden' }}>
        <div style={{ padding: 'var(--sp-6) var(--sp-6) var(--sp-4)', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
          <div style={{
            width: 48, height: 48, borderRadius: 'var(--radius-lg)',
            background: 'linear-gradient(135deg, var(--accent-500), var(--accent-700))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', margin: '0 auto var(--sp-4)'
          }}>
            <Building2 size={24} />
          </div>
          <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--sp-1)' }}>
            Fiscally
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
            {isLogin ? 'Inicia sesión en tu cuenta' : 'Crea una nueva cuenta'}
          </p>
        </div>

        <div style={{ padding: 'var(--sp-6)' }}>
          {error && (
            <div style={{
              background: 'var(--danger-bg)', color: 'var(--danger-text)',
              padding: 'var(--sp-3)', borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-sm)', marginBottom: 'var(--sp-4)',
              border: '1px solid var(--danger-border)'
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Correo electrónico
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: 12, top: 10, color: 'var(--text-tertiary)' }} />
                <input
                  type="email"
                  required
                  className="search-input"
                  style={{ width: '100%', paddingLeft: 36 }}
                  placeholder="ejemplo@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Contraseña
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: 12, top: 10, color: 'var(--text-tertiary)' }} />
                <input
                  type="password"
                  required
                  className="search-input"
                  style={{ width: '100%', paddingLeft: 36 }}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', marginTop: 'var(--sp-2)' }}
              disabled={loading}
            >
              {loading ? <Loader2 size={16} className="spin-icon" /> : null}
              {isLogin ? 'Ingresar' : 'Registrarse'}
            </button>
          </form>

          <div style={{ marginTop: 'var(--sp-5)', textAlign: 'center' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setIsLogin(!isLogin);
                setError(null);
              }}
            >
              {isLogin ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
