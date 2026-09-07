'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { request } from '@/lib/api';

const PLANS = [
  { key: 'essencial' as const, name: 'Essencial', price: 'R$ 39,90', users: 1 },
  { key: 'profissional' as const, name: 'Profissional', price: 'R$ 69,90', users: 3 },
  { key: 'empresarial' as const, name: 'Empresarial', price: 'R$ 119,90', users: 6 },
];

export default function CadastroPage() {
  const router = useRouter();
  const [step, setStep] = useState<'form' | 'payment'>('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<'essencial' | 'profissional' | 'empresarial'>('essencial');
  const [companyName, setCompanyName] = useState('');
  const [companyDoc, setCompanyDoc] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (adminPassword.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    setBusy(true);
    try {
      const res = await request('/auth/register-company', {
        method: 'POST',
        body: JSON.stringify({
          plan,
          company_name: companyName,
          company_document: companyDoc,
          company_phone: companyPhone,
          admin_name: adminName,
          admin_username: adminUsername,
          admin_email: adminEmail,
          admin_password: adminPassword,
        }),
      });
      setPaymentUrl(res.payment_url || null);
      setStep('payment');
    } catch (err: any) {
      setError(err?.message || 'Erro ao criar conta');
    } finally {
      setBusy(false);
    }
  }

  const selected = PLANS.find((p) => p.key === plan)!;

  return (
    <main className="min-h-screen bg-slate-100 py-10 px-4">
      <div className="mx-auto w-full max-w-2xl rounded-2xl bg-white p-6 shadow-lg md:p-8">
        {step === 'form' ? (
          <>
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Criar conta da empresa</h1>
                <p className="mt-1 text-sm text-slate-500">Escolha o plano e preencha os dados.</p>
              </div>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="shrink-0 text-sm text-slate-500 hover:text-brand hover:underline"
              >
                Voltar ao login
              </button>
            </div>

            <form onSubmit={submit} className="space-y-5">
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Escolha o plano</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {PLANS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setPlan(p.key)}
                      className={`rounded-xl border p-4 text-left transition ${
                        plan === p.key
                          ? 'border-brand bg-brand/5 ring-2 ring-brand/30'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <p className="font-semibold text-slate-900">{p.name}</p>
                      <p className="mt-1 text-xl font-bold text-brand">{p.price}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Até {p.users} {p.users === 1 ? 'usuário' : 'usuários'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-700">Dados da empresa</p>
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600">Nome da empresa *</span>
                  <input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-200 bg-white p-2.5"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="mb-1 block text-slate-600">CNPJ / CPF</span>
                    <input
                      value={companyDoc}
                      onChange={(e) => setCompanyDoc(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white p-2.5"
                      placeholder="Opcional"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-slate-600">Telefone</span>
                    <input
                      value={companyPhone}
                      onChange={(e) => setCompanyPhone(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white p-2.5"
                      placeholder="Opcional"
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-700">Usuário administrador</p>
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600">Nome completo *</span>
                  <input
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-200 bg-white p-2.5"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600">Usuário (login) *</span>
                  <input
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-200 bg-white p-2.5"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600">E-mail *</span>
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-200 bg-white p-2.5"
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
                    className="w-full rounded-lg border border-slate-200 bg-white p-2.5"
                  />
                </label>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy ? 'Criando…' : 'Criar conta'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="py-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl">
              ✓
            </div>
            <h2 className="text-xl font-bold text-slate-900">Conta criada!</h2>
            <p className="mt-2 text-sm text-slate-600">
              Plano: <strong>{selected.name} — {selected.price}/mês</strong>
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Finalize o pagamento da mensalidade para ativar o acesso.
            </p>

            {paymentUrl ? (
              <a
                href={paymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white"
              >
                Ir para o pagamento (Asaas)
              </a>
            ) : (
              <p className="mt-6 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Link de pagamento em configuração. Em breve integração com Asaas.
              </p>
            )}

            <button
              type="button"
              onClick={() => router.push('/')}
              className="mt-4 text-sm text-slate-500 hover:text-brand hover:underline"
            >
              Ir para o login
            </button>
          </div>
        )}
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

          <button
            type="submit"
            disabled={busy}
            className="mt-5 w-full rounded-lg bg-brand p-2.5 font-medium text-white disabled:opacity-60"
          >
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
          <button
            type="button"
            onClick={() => (window.location.href = '/cadastro')}
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