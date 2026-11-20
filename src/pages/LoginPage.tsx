import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, MapPin } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isSupabaseEnabled } from '../lib/runtime';

import { MARCA } from '../design/assets';
export function LoginPage() {
  const { user, signIn, loading, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/map';

  if (user) return <Navigate to={from} replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();
    try {
      await signIn(email.trim(), password);
      navigate(from, { replace: true });
    } catch {
      // O erro é exibido pelo contexto de autenticação.
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-visual">
        <div className="auth-brand">
          <img className="auth-logo" src={MARCA.logoBranco} alt="BR ALERTA" />
        </div>
        <div>
          <span className="auth-kicker"><MapPin /> INTELIGÊNCIA URBANA COLABORATIVA</span>
          <h1>Uma cidade melhor começa com quem <em>participa.</em></h1>
          <p>Registre problemas urbanos, acompanhe o andamento e ajude a construir uma visão mais clara da cidade.</p>
        </div>
        <small>Projeto acadêmico FIAP · Ambiente demonstrativo</small>
      </section>

      <section className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <span className="eyebrow">BEM-VINDO DE VOLTA</span>
          <h2>Entre na sua conta</h2>
          <p>Acesse o mapa colaborativo do BR Alerta.</p>
          {!isSupabaseEnabled && (
            <div className="auth-hint demo-auth-hint" role="note">
              Acesso demonstrativo local: use um e-mail válido e qualquer senha. Nenhuma senha é salva ou enviada.
            </div>
          )}

          <label>
            E-mail
            <div className="auth-input">
              <Mail aria-hidden="true" />
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="voce@email.com"
              />
            </div>
          </label>

          <label>
            Senha
            <div className="auth-input">
              <LockKeyhole aria-hidden="true" />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Sua senha"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </label>

          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="primary auth-submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'} <ArrowRight aria-hidden="true" />
          </button>
          <p className="auth-switch">
            Ainda não possui conta? <Link to="/register">Criar conta</Link>
          </p>
        </form>
      </section>
    </div>
  );
}
