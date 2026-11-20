import { ArrowRight, LockKeyhole, Mail, MapPin, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { GovernmentLevel } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';

export function RegisterPage() {
  const { user, signUp, loading, error, clearError } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accountType, setAccountType] = useState<'CITIZEN' | 'PUBLIC_AGENT'>('CITIZEN');
  const [organizationName, setOrganizationName] = useState('');
  const [governmentLevel, setGovernmentLevel] = useState<GovernmentLevel>('MUNICIPAL');
  const [publicPosition, setPublicPosition] = useState('');
  const [confirmation, setConfirmation] = useState(false);
  if (user) return <Navigate to="/map" replace />;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    clearError();
    if (password.length < 8) return;
    try { const result = await signUp(fullName.trim(), email.trim(), password, { role: accountType, organizationName, governmentLevel, publicPosition }); setConfirmation(result.needsEmailConfirmation); } catch { /* exibido pelo contexto */ }
  }

  return <div className="auth-page"><section className="auth-visual register-visual"><div className="auth-brand"><span className="brand-pin">●</span><span>BR <b>ALERTA</b></span></div><div><span className="auth-kicker"><MapPin/> PARTICIPE DA SUA CIDADE</span><h1>Seu olhar pode ajudar a transformar o <em>território.</em></h1><p>Crie sua conta para registrar e acompanhar ocorrências urbanas.</p></div><small>Seus dados são protegidos pelas políticas de acesso do Supabase.</small></section><section className="auth-form-wrap">{confirmation?<div className="auth-form auth-success"><span>✓</span><h2>Verifique seu e-mail</h2><p>Enviamos uma confirmação para <b>{email}</b>. Confirme o endereço e depois entre na plataforma.</p><Link className="primary" to="/login">Ir para o login</Link></div>:<form className="auth-form" onSubmit={submit}><span className="eyebrow">NOVA CONTA</span><h2>Faça parte do BR Alerta</h2><p>Participe como cidadão ou atenda a população pelo seu órgão público.</p><fieldset className="account-type"><legend>Tipo de conta</legend>
  <label><input type="radio" name="accountType" value="CITIZEN" checked={accountType === 'CITIZEN'} onChange={() => setAccountType('CITIZEN')}/><span>Cidadão<small>Registrar e acompanhar</small></span></label>
  <label><input type="radio" name="accountType" value="PUBLIC_AGENT" checked={accountType === 'PUBLIC_AGENT'} onChange={() => setAccountType('PUBLIC_AGENT')}/><span>Órgão público<small>Atender ocorrências</small></span></label>
</fieldset>
{accountType === 'PUBLIC_AGENT' && <div className="public-account-fields">
  <label>Esfera de atuação<select value={governmentLevel} onChange={e => setGovernmentLevel(e.target.value as GovernmentLevel)}><option value="MUNICIPAL">Municipal / Prefeitura</option><option value="STATE">Estadual</option><option value="FEDERAL">Federal</option><option value="OTHER">Outro órgão público</option></select></label>
  <label>Órgão público<input required minLength={2} maxLength={160} value={organizationName} onChange={e => setOrganizationName(e.target.value)} placeholder="Ex.: Prefeitura do Rio de Janeiro"/></label>
  <label>Cargo público<input required minLength={2} maxLength={120} value={publicPosition} onChange={e => setPublicPosition(e.target.value)} placeholder="Ex.: Coordenador de Defesa Civil"/></label>
</div>}
<label>Nome completo<div className="auth-input"><UserRound/><input required minLength={2} maxLength={120} value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Seu nome"/></div></label><label>E-mail<div className="auth-input"><Mail/><input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@email.com"/></div></label><label>Senha<div className="auth-input"><LockKeyhole/><input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Mínimo de 8 caracteres"/></div></label>{password&&password.length<8&&<div className="auth-hint">A senha precisa ter pelo menos 8 caracteres.</div>}{error&&<div className="auth-error" role="alert">{error}</div>}<button className="primary auth-submit" disabled={loading||password.length<8}>{loading?'Criando...':'Criar conta'}<ArrowRight/></button><p className="auth-switch">Já possui conta? <Link to="/login">Entrar</Link></p></form>}</section></div>;
}
