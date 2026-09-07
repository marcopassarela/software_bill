'use client';
import { useEffect, useState } from 'react';
import { request } from '@/lib/api';
import AppShell from '@/components/AppShell';

function formatRemaining(until: Date): string {
  const ms = until.getTime() - Date.now();
  if (ms <= 0) return 'Login liberado';
  // arredonda para cima (90s → 2 min, não 1)
  const totalSec = Math.max(1, Math.ceil(ms / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins || !parts.length) parts.push(`${mins}min`);
  // abaixo de 5 min mostra segundos também
  if (totalSec < 300) parts.push(`${secs}s`);
  return parts.join(' ');
}

function parseUntil(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const s = /Z$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z';
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export default function Home() {
  const [user, setUser] = useState<any>();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [blockedInfo, setBlockedInfo] = useState<{
    block_type?: string;
    blocked_until?: string | null;
    reason?: string | null;
  } | null>(null);
  const [, setTick] = useState(0);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotUser, setForgotUser] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotMsg, setForgotMsg] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [resetPass, setResetPass] = useState('');
  const [resetPass2, setResetPass2] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);
  const [signupStep, setSignupStep] = useState<'form' | 'payment'>('form');
  const [signupBusy, setSignupBusy] = useState(false);
  const [signupError, setSignupError] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<'essencial' | 'profissional' | 'empresarial'>('essencial');
  const [companyName, setCompanyName] = useState('');
  const [companyDoc, setCompanyDoc] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [unit, setUnit] = useState<'matriz' | 'filial'>('matriz');

  const SIGNUP_PLANS = [
  { key: 'essencial' as const, name: 'Essencial', price: 'R$ 39,90', users: 1 },
  { key: 'profissional' as const, name: 'Profissional', price: 'R$ 69,90', users: 3 },
  { key: 'empresarial' as const, name: 'Empresarial', price: 'R$ 119,90', users: 6 },
  ];

  async function submitSignup(e: React.FormEvent) {
  e.preventDefault();
  setSignupError('');
  if (adminPassword.length < 6) {
    setSignupError('A senha deve ter no mínimo 6 caracteres.');
    return;
  }
  setSignupBusy(true);
  try {
    const res = await request('/auth/register-company', {
      method: 'POST',
      body: JSON.stringify({
        plan: selectedPlan,
        company_name: companyName,
        company_document: companyDoc,
        company_phone: companyPhone,
        admin_name: adminName,
        admin_username: adminUsername,
        admin_email: adminEmail,
        admin_password: adminPassword,
      }),
    });
    // Vai para tela de pagamento
    setPaymentUrl(res.payment_url || null);
    setSignupStep('payment');
  } catch (err: any) {
    setSignupError(err?.message || 'Erro ao criar conta');
  } finally {
    setSignupBusy(false);
  }
}

  useEffect(() => {
    function handleSessionExpired() {
      setUser(undefined);
      setPassword('');
      setNewPassword('');
      setError('');
      setBusy(false);
      // NÃO zere setUsername('')
    }
    function onBlocked(e: any) {
      setUser(undefined);
      setBlockedInfo(e.detail || { block_type: 'manual' });
      setError('');
    }

    window.addEventListener('session-expired', handleSessionExpired);
    window.addEventListener('user-blocked', onBlocked);

    request('/auth/me')
      .then(setUser)
      .catch((e: any) => {
        const d = e?.detail;
        if (e?.status === 403 && d?.code === 'USER_BLOCKED') {
          setBlockedInfo({
            block_type: d.block_type || 'manual',
            blocked_until: d.blocked_until || null,
            reason: d.reason || null,
          });
        }
        setUser(undefined);
      });

    return () => {
      window.removeEventListener('session-expired', handleSessionExpired);
      window.removeEventListener('user-blocked', onBlocked);
    };
  }, []);

  // Lê o token de reset da URL (?reset_token=...) — precisa ser um useEffect
  // separado no nível do componente, nunca aninhado dentro de outro useEffect.
  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get('reset_token');
      if (t) setResetToken(t);
    } catch {
      /* ignore */
    }
  }, []);

  // Faz o "tick" a cada segundo enquanto houver um bloqueio com prazo,
  // para recalcular o tempo restante exibido.
  useEffect(() => {
    if (!blockedInfo?.blocked_until) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [blockedInfo?.blocked_until]);

  // Quando o bloqueio é "scheduled" e o prazo expira, libera o login
  // automaticamente sem precisar recarregar a página.
  useEffect(() => {
    if (!blockedInfo?.blocked_until || blockedInfo.block_type !== 'scheduled') {
      return;
    }
    const until = parseUntil(blockedInfo.blocked_until);
    if (!until) return;

    const goLogin = () => {
      if (until.getTime() <= Date.now()) {
        setBlockedInfo(null);
        setError('Seu acesso foi liberado, faça login novamente!');
      }
    };

    goLogin();
    const id = setInterval(goLogin, 1000);
    return () => clearInterval(id);
  }, [blockedInfo]);


  function passwordStrength(pwd: string): {
    score: number;
    label: string;
    color: string;
  } {
    if (!pwd) return { score: 0, label: '', color: 'bg-slate-200' };
    let score = 0;
    if (pwd.length >= 3) score += 1;
    if (pwd.length >= 8) score += 1;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score += 1;
    if (/\d/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;
    if (score <= 2) return { score, label: 'Fraca', color: 'bg-red-500' };
    if (score <= 3) return { score, label: 'Média', color: 'bg-amber-500' };
    return { score, label: 'Forte', color: 'bg-green-500' };
  }

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      // Só usa cache se já existir — NÃO pede permissão no login
      let latitude: number | undefined;
      let longitude: number | undefined;
      try {
        const cached = localStorage.getItem('geo_coords');
        if (cached) {
          const c = JSON.parse(cached);
          latitude = c.latitude;
          longitude = c.longitude;
        }
      } catch {
        /* ignore */
      }

      const result = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username,
          password,
          unit,
          latitude,
          longitude,
        }),
      });
      setUser(result.user);
      setBlockedInfo(null);
    } catch (err: any) {
      const detail = err?.detail;
      if (
        err?.status === 403 &&
        (detail?.code === 'USER_BLOCKED' || /bloquead/i.test(String(err?.message || '')))
      ) {
        setBlockedInfo({
          block_type: detail?.block_type || 'manual',
          blocked_until: detail?.blocked_until || null,
          reason: detail?.reason || null,
        });
        setError('');
      } else {
        setError(err?.message || 'Erro ao realizar login');
      }
    } finally {
      setBusy(false);
    }
  }

  async function change(e: React.FormEvent) {
    e.preventDefault();
    try {
      await request('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: password,
          new_password: newPassword,
        }),
      });
      setUser({ ...user, must_change_password: false });
      setPassword('');
      setNewPassword('');
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (blockedInfo) {
    const until = parseUntil(blockedInfo.blocked_until);
    const remaining =
      until && !isNaN(until.getTime()) && until.getTime() > Date.now()
        ? formatRemaining(until)
        : null;

    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-2xl">
            🔒
          </div>
          <h1 className="text-center text-xl font-bold text-red-700">Acesso bloqueado</h1>
          <p className="mt-3 text-center text-sm text-slate-600">
            Sua conta foi bloqueada pelo administrador e não pode usar o sistema no momento.
          </p>

          {blockedInfo.block_type === 'permanent' && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm font-medium text-red-800">
              Bloqueio permanente
            </p>
          )}

          {blockedInfo.block_type === 'scheduled' && until && until.getTime() > Date.now() && (
            <div className="mt-4 rounded-lg bg-amber-50 px-3 py-3 text-center text-sm text-amber-900">
              <p className="font-medium">Desbloqueio automático em</p>
              <p className="mt-1 text-lg font-bold tabular-nums">
                {until.toLocaleString('pt-BR')}
              </p>
              {remaining && (
                <p className="mt-1 text-xs text-amber-800">
                  Tempo restante: {remaining}
                </p>
              )}
            </div>
          )}

          {(blockedInfo.block_type === 'manual' || !blockedInfo.block_type) && (
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-center text-sm text-slate-700">
              Bloqueio manual — só o administrador pode liberar.
            </p>
          )}

          {blockedInfo.reason && (
            <p className="mt-3 text-center text-xs text-slate-500">Motivo: {blockedInfo.reason}</p>
          )}

          <button
            type="button"
            onClick={() => setBlockedInfo(null)}
            className="mt-6 w-full rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-medium text-white"
          >
            Voltar ao login
          </button>
        </div>
      </main>
    );
  }

  async function submitForgot(e: React.FormEvent) {
    e.preventDefault();
    setForgotBusy(true);
    setForgotMsg('');
    setError('');
    try {
      const res = await request('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({
          username: forgotUser,
          email: forgotEmail,
        }),
      });
      setForgotMsg(
        res.detail ||
          'Se os dados estiverem corretos, você receberá um e-mail com o link.'
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setForgotBusy(false);
    }
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    if (resetPass !== resetPass2) {
      setError('As senhas não coincidem.');
      return;
    }
    if (resetPass.length < 3) {
      setError('Senha mínima de 3 caracteres.');
      return;
    }
    setResetBusy(true);
    setError('');
    try {
      await request('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          token: resetToken,
          new_password: resetPass,
        }),
      });
      setResetToken(null);
      setResetPass('');
      setResetPass2('');
      window.history.replaceState({}, '', '/');
      setForgotMsg('Senha alterada. Faça login com a nova senha.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setResetBusy(false);
    }
  }

  if (resetToken) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-4">
        <form
          onSubmit={submitReset}
          className="w-full max-w-md rounded-xl bg-white p-7 shadow"
          autoComplete="off"
        >
          <h1 className="text-xl font-bold">Nova senha</h1>
          <p className="my-3 text-sm text-slate-600">
            Defina uma nova senha para continuar.
          </p>
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          <label className="text-sm">Nova senha</label>
          <input
            type="password"
            value={resetPass}
            onChange={(e) => setResetPass(e.target.value)}
            required
            minLength={3}
            className="w-full rounded-lg border p-2"
          />
          <label className="mt-3 block text-sm">Confirmar senha</label>
          <input
            type="password"
            value={resetPass2}
            onChange={(e) => setResetPass2(e.target.value)}
            required
            minLength={3}
            className="w-full rounded-lg border p-2"
          />
          <button
            disabled={resetBusy}
            className="mt-5 w-full rounded-lg bg-brand p-2.5 font-medium text-white disabled:opacity-60"
          >
            {resetBusy ? 'Salvando…' : 'Salvar nova senha'}
          </button>
        </form>
      </main>
    );
  }

  if (user?.must_change_password) {
    const strength = passwordStrength(newPassword);
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-4">
        <form
          onSubmit={change}
          className="w-full max-w-md rounded-xl bg-white p-7 shadow"
          autoComplete="off"
        >
          <h1 className="text-xl font-bold">Atualize sua senha</h1>
          <p className="my-3 text-sm text-slate-600">
            Sua senha inicial é temporária. Defina uma nova senha de pelo menos 3 caracteres para
            continuar.
          </p>
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          <label className="text-sm">Senha atual</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-lg border p-2"
          />
          <label className="mt-3 block text-sm">Nova senha</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={3}
            className="w-full rounded-lg border p-2"
          />
          {newPassword && (
            <div className="mt-2">
              <div className="h-2 w-full overflow-hidden rounded bg-slate-100">
                <div
                  className={`h-full ${strength.color}`}
                  style={{ width: `${(strength.score / 5) * 100}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">Força: {strength.label}</p>
            </div>
          )}
          <button className="mt-5 w-full rounded-lg bg-brand p-2.5 font-medium text-white">
            Salvar nova senha
          </button>
        </form>
      </main>
    );
  }

  if (user) {
    return (
      <AppShell
        user={user}
        onLogout={() => {
          setUser(undefined);
          setUsername('');
          setPassword('');
          setNewPassword('');
          setError('');
          setBlockedInfo(null);
        }}
        onUserUpdate={(u: any) => setUser(u)}
      />
    );
  }

  return (
    <main className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col items-center justify-center bg-navy p-10 text-white md:flex">
        <img src="/icon2.png" alt="Logo Logísticas Bill" className="h-24 w-24 object-contain" />
        <h1 className="mt-6 text-3xl font-bold tracking-wide">LOGÍSTICAS BILL</h1>
        <p className="mt-3 max-w-sm text-center text-slate-300">
          Sistema interno de gestão logística!
        </p>
      </div>
      <div className="flex items-center justify-center bg-slate-100 p-4 md:bg-white">
        <form
          onSubmit={login}
          className="w-full max-w-sm rounded-xl bg-white p-8 shadow-lg md:shadow-none"
          autoComplete="off"
        >
          <div className="mb-6 md:hidden">
            <p className="flex items-center gap-2 text-sm font-semibold text-cyan-700">
              <img src="/icon2.png" alt="Logísticas Bill" className="h-7 w-7 object-contain" />
              LOGÍSTICAS BILL
            </p>
          </div>
          <h1 className="mb-6 text-2xl font-bold">Acesso ao sistema</h1>
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          <input
            type="text"
            tabIndex={-1}
            aria-hidden="true"
            className="absolute -left-[9999px] h-px w-px opacity-0"
          />
          <input
            type="password"
            tabIndex={-1}
            aria-hidden="true"
            className="absolute -left-[9999px] h-px w-px opacity-0"
          />
          <label className="text-sm">Usuário</label>
          <input
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            className="..."
          />
          <label className="mt-4 block text-sm">Senha</label>
          <input
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="..."
          />
      
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-slate-700">Unidade</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setUnit('matriz')}
                className={`rounded-lg border px-3 py-2.5 text-sm font-medium ${
                  unit === 'matriz'
                    ? 'border-brand bg-brand text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                1 — Matriz
              </button>
              <button
                type="button"
                onClick={() => setUnit('filial')}
                className={`rounded-lg border px-3 py-2.5 text-sm font-medium ${
                  unit === 'filial'
                    ? 'border-brand bg-brand text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                2 — Filial
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="mt-5 w-full rounded-lg bg-brand p-2.5 font-medium text-white disabled:opacity-60"
          >
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
          <button
            type="button"
            onClick={() => {
              setSignupOpen(true);
              setSignupStep('form');
              setSignupError('');
              setPaymentUrl(null);
            }}
            className="mt-3 w-full rounded-lg border border-brand bg-white p-2.5 text-sm font-semibold text-brand hover:bg-brand/5"
            >
            Criar conta da empresa
          </button>
          <button
             type="button"
             onClick={() => {
               setForgotOpen(true);
               setForgotMsg('');
               setError('');
             }}
             className="mt-3 w-full text-center text-sm text-slate-500 hover:text-brand hover:underline"
              >
              Esqueci minha senha
          </button>
        </form>
        {signupOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto">
    <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl my-8">
      {signupStep === 'form' ? (
        <>
          <h3 className="text-xl font-bold text-slate-900">Criar conta da empresa</h3>
          <p className="mt-1 text-sm text-slate-500">Preencha os dados e escolha o plano.</p>

          <form onSubmit={submitSignup} className="mt-5 space-y-4">
            {/* Planos */}
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Escolha o plano</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {SIGNUP_PLANS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setSelectedPlan(p.key)}
                    className={`rounded-xl border p-3 text-left transition ${
                      selectedPlan === p.key
                        ? 'border-brand bg-brand/5 ring-2 ring-brand/30'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className="font-semibold text-slate-900">{p.name}</p>
                    <p className="mt-1 text-lg font-bold text-brand">{p.price}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Até {p.users} {p.users === 1 ? 'usuário' : 'usuários'}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Empresa */}
            <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-700">Dados da empresa</p>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Nome da empresa *</span>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-200 bg-white p-2"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600">CNPJ / CPF</span>
                  <input
                    value={companyDoc}
                    onChange={(e) => setCompanyDoc(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white p-2"
                    placeholder="Opcional"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600">Telefone</span>
                  <input
                    value={companyPhone}
                    onChange={(e) => setCompanyPhone(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white p-2"
                    placeholder="Opcional"
                  />
                </label>
              </div>
            </div>

            {/* Admin */}
            <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-700">Usuário administrador</p>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Nome completo *</span>
                <input
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-200 bg-white p-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Usuário (login) *</span>
                <input
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-200 bg-white p-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">E-mail *</span>
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-200 bg-white p-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Senha * (mínimo 6 caracteres)</span>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full rounded-lg border border-slate-200 bg-white p-2"
                />
              </label>
            </div>

            {signupError && <p className="text-sm text-red-600">{signupError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSignupOpen(false)}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Voltar
              </button>
              <button
                type="submit"
                disabled={signupBusy}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {signupBusy ? 'Criando…' : 'Criar conta'}
              </button>
            </div>
          </form>
        </>
      ) : (
        /* Tela de pagamento */
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl">
                ✓
              </div>
              <h3 className="text-xl font-bold text-slate-900">Conta criada!</h3>
              <p className="mt-2 text-sm text-slate-600">
                Plano selecionado:{' '}
                <strong>
                  {SIGNUP_PLANS.find((p) => p.key === selectedPlan)?.name} —{' '}
                  {SIGNUP_PLANS.find((p) => p.key === selectedPlan)?.price}/mês
                </strong>
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Finalize o pagamento da mensalidade para ativar o acesso.
              </p>
          
              {paymentUrl ? (
                <a
                  href={paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
                >
                  Ir para o pagamento (Asaas)
                </a>
              ) : (
                <p className="mt-6 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Link de pagamento em configuração. Entre em contato com o suporte.
                </p>
              )}
    
              <button
                type="button"
                onClick={() => {
                  setSignupOpen(false);
                  setSignupStep('form');
                }}
                className="mt-3 w-full text-sm text-slate-500 hover:text-brand hover:underline"
              >
                Voltar ao login
              </button>
            </div>
          )}
        </div>
      </div>
    )}
      </div>
      {forgotOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Esqueci minha senha</h3>
            <p className="mt-1 text-sm text-slate-500">
              Informe o usuário e o e-mail cadastrados na conta.
            </p>
            <form onSubmit={submitForgot} className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Usuário *</span>
                <input
                  value={forgotUser}
                  onChange={(e) => setForgotUser(e.target.value)}
                  required
                  className="w-full rounded-lg border p-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">E-mail cadastrado *</span>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                  className="w-full rounded-lg border p-2"
                />
              </label>
              {forgotMsg && (
                <p className="text-sm text-emerald-700">{forgotMsg}</p>
              )}
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setForgotOpen(false)}
                  className="rounded-lg bg-slate-100 px-4 py-2 text-sm"
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  disabled={forgotBusy}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {forgotBusy ? 'Enviando…' : 'Enviar link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}