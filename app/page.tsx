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
    if (busy) return;

    setError('');

    if (!companyName.trim() || !adminName.trim() || !adminUsername.trim() || !adminEmail.trim()) {
      setError('Preencha todos os campos obrigatórios.');
      return;
    }

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
          company_name: companyName.trim(),
          company_document: companyDoc.trim(),
          company_phone: companyPhone.trim(),
          admin_name: adminName.trim(),
          admin_username: adminUsername.trim(),
          admin_email: adminEmail.trim(),
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