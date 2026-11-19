import { ArrowRight, LockKeyhole, Mail, MapPin, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

import { MARCA } from '../design/assets';
export function RegisterPage() {
  const { user, signUp, loading, error, clearError } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState(false);
  if (user) return <Navigate to="/map" replace />;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    clearError();
    if (password.length < 8) return;
    try { const result = await signUp(fullName.trim(), email.trim(), password); setConfirmation(result.needsEmailConfirmation); } catch { /* exibido pelo contexto */ }
  }

  return <div className="auth-page"><section className="auth-visual register"><div className="auth-brand"><img className="auth-logo" src={MARCA.logoBranco} alt="BR ALERTA" /></div><div><span className="auth-kicker"><MapPin/> PARTICIPE DA SUA CIDADE</span><h1>Seu olhar pode ajudar a transformar o <em>território.</em></h1><p>Crie sua conta para registrar e acompanhar ocorrências urbanas.</p></div><small>Seus dados são protegidos pelas políticas de acesso do Supabase.</small></section><section className="auth-form-wrap">{confirmation?<div className="auth-form auth-success"><span>✓</span><h2>Verifique seu e-mail</h2><p>Enviamos uma confirmação para <b>{email}</b>. Confirme o endereço e depois entre na plataforma.</p><Link className="primary" to="/login">Ir para o login</Link></div>:<form className="auth-form" onSubmit={submit}><span className="eyebrow">NOVA CONTA</span><h2>Faça parte do BR Alerta</h2><p>Todos os novos perfis começam como cidadão.</p><label>Nome completo<div className="auth-input"><UserRound/><input required minLength={2} value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Seu nome"/></div></label><label>E-mail<div className="auth-input"><Mail/><input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@email.com"/></div></label><label>Senha<div className="auth-input"><LockKeyhole/><input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Mínimo de 8 caracteres"/></div></label>{password&&password.length<8&&<div className="auth-hint">A senha precisa ter pelo menos 8 caracteres.</div>}{error&&<div className="auth-error" role="alert">{error}</div>}<button className="primary auth-submit" disabled={loading||password.length<8}>{loading?'Criando...':'Criar conta'}<ArrowRight/></button><p className="auth-switch">Já possui conta? <Link to="/login">Entrar</Link></p></form>}</section></div>;
}
