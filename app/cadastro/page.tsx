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
    <main className="flex h-screen items-center justify-center overflow-hidden bg-slate-100 p-4">
      <div className="flex w-full max-w-3xl flex-col rounded-2xl bg-white p-5 shadow-lg sm:p-6">
        {step === 'form' ? (
          <>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
                  Criar conta da empresa
                </h1>
                <p className="mt-0.5 text-sm text-slate-500">
                  Escolha o plano e preencha os dados
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="shrink-0 text-sm font-medium text-slate-500 hover:text-brand hover:underline"
              >
                Voltar
              </button>
            </div>

            <form onSubmit={submit} className="flex flex-col gap-4">
              {/* Planos legíveis */}
              <div className="grid grid-cols-3 gap-3">
                {PLANS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPlan(p.key)}
                    className={`rounded-xl border-2 px-3 py-3 text-left transition ${
                      plan === p.key
                        ? 'border-brand bg-brand/5 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-800 sm:text-base">
                      {p.name}
                    </p>
                    <p className="mt-1 text-lg font-bold text-brand sm:text-xl">
                      {p.price}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                      Até {p.users} {p.users === 1 ? 'usuário' : 'usuários'}
                    </p>
                  </button>
                ))}
              </div>

              {/* Empresa + Admin */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2.5 rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                  <p className="text-sm font-semibold text-slate-800">Empresa</p>
                  <input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                    placeholder="Nome da empresa *"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand"
                  />
                  <input
                    value={companyDoc}
                    onChange={(e) => setCompanyDoc(e.target.value)}
                    placeholder="CNPJ / CPF"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand"
                  />
                  <input
                    value={companyPhone}
                    onChange={(e) => setCompanyPhone(e.target.value)}
                    placeholder="Telefone"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand"
                  />
                </div>

                <div className="space-y-2.5 rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                  <p className="text-sm font-semibold text-slate-800">Administrador</p>
                  <input
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    required
                    placeholder="Nome completo *"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand"
                  />
                  <input
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    required
                    placeholder="Usuário (login) *"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand"
                  />
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    required
                    placeholder="E-mail *"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand"
                  />
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="Senha * (mín. 6 caracteres)"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand"
                  />
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
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
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl">
              ✓
            </div>
            <h2 className="text-xl font-bold text-slate-900">Conta criada!</h2>
            <p className="mt-2 text-base text-slate-600">
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
              <p className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
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