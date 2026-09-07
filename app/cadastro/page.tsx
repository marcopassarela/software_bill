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
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-3">
      <div className="w-full max-w-3xl rounded-xl bg-white p-4 shadow-lg sm:p-5">
        {step === 'form' ? (
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h1 className="text-lg font-bold text-slate-900">Criar conta da empresa</h1>
                <p className="text-sm text-slate-500">Escolha o plano e preencha os dados.</p>
              </div>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="shrink-0 text-sm text-slate-500 hover:text-brand hover:underline"
              >
                Voltar
              </button>
            </div>

            <form onSubmit={submit} className="space-y-3">
              {/* Planos compactos */}
              <div className="grid grid-cols-3 gap-2">
                {PLANS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPlan(p.key)}
                    className={`rounded-lg border px-2 py-2 text-left transition ${
                      plan === p.key
                        ? 'border-brand bg-brand/5 ring-1 ring-brand/40'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-900">{p.name}</p>
                    <p className="text-sm font-bold text-brand">{p.price}</p>
                    <p className="text-[10px] text-slate-500">
                      Até {p.users} {p.users === 1 ? 'usuário' : 'usuários'}
                    </p>
                  </button>
                ))}
              </div>

              {/* Empresa + Admin em 2 colunas no desktop */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                  <p className="text-sm font-semibold text-slate-700">Empresa</p>
                  <input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                    placeholder="Nome da empresa *"
                    className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
                  />
                  <input
                    value={companyDoc}
                    onChange={(e) => setCompanyDoc(e.target.value)}
                    placeholder="CNPJ / CPF"
                    className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
                  />
                  <input
                    value={companyPhone}
                    onChange={(e) => setCompanyPhone(e.target.value)}
                    placeholder="Telefone"
                    className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
                  />
                </div>

                <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                  <p className="text-sm font-semibold text-slate-700">Administrador</p>
                  <input
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    required
                    placeholder="Nome completo *"
                    className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
                  />
                  <input
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    required
                    placeholder="Usuário (login) *"
                    className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
                  />
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    required
                    placeholder="E-mail *"
                    className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
                  />
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="Senha * (mín. 6)"
                    className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
                  />
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy ? 'Criando…' : 'Criar conta'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="py-4 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-xl">
              ✓
            </div>
            <h2 className="text-lg font-bold text-slate-900">Conta criada!</h2>
            <p className="mt-1 text-sm text-slate-600">
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
                className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white"
              >
                Ir para o pagamento (Asaas)
              </a>
            ) : (
              <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Link de pagamento em configuração. Em breve integração com Asaas.
              </p>
            )}

            <button
              type="button"
              onClick={() => router.push('/')}
              className="mt-3 text-sm text-slate-500 hover:text-brand hover:underline"
            >
              Ir para o login
            </button>
          </div>
        )}
      </div>
    </main>
  );
}