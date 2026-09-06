'use client';

import React from 'react';

const PLANS = [
  {
    key: 'essencial',
    name: 'Plano Essencial',
    price: 'R$ 39,90',
    users: 1,
    description: 'Para operações pequenas que estão começando a organizar a logística.',
  },
  {
    key: 'profissional',
    name: 'Plano Profissional',
    price: 'R$ 69,90',
    users: 3,
    description: 'Para equipes que precisam dividir a operação entre mais usuários.',
  },
  {
    key: 'empresarial',
    name: 'Plano Empresarial',
    price: 'R$ 119,90',
    users: 6,
    description: 'Para empresas com uma equipe operacional maior.',
  },
] as const;

export default function PlansModule({ user }: { user: any }) {
  const currentPlan = user?.plan || 'essencial';

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Planos</h2>
        <p className="mt-1 text-sm text-slate-500">
          Consulte seu plano atual e o limite de usuários da sua conta.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {PLANS.map((plan) => {
          const active = currentPlan === plan.key;
          return (
            <article
              key={plan.key}
              className={`relative rounded-2xl border bg-white p-5 shadow-sm ${
                active ? 'border-brand ring-2 ring-brand/20' : 'border-slate-200'
              }`}
            >
              {active && (
                <span className="absolute right-4 top-4 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand">
                  Plano atual
                </span>
              )}
              <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
              <p className="mt-3 text-3xl font-bold text-slate-900">
                {plan.price}
                <span className="text-sm font-normal text-slate-500"> / mês</span>
              </p>
              <p className="mt-3 min-h-12 text-sm text-slate-600">{plan.description}</p>
              <div className="mt-5 rounded-lg bg-slate-50 p-3 text-sm font-medium text-slate-700">
                Até {plan.users} {plan.users === 1 ? 'usuário' : 'usuários'}
              </div>
              <button
                type="button"
                disabled={active}
                className="mt-5 w-full rounded-lg border border-brand px-4 py-2 text-sm font-semibold text-brand disabled:cursor-default disabled:border-slate-200 disabled:text-slate-400"
              >
                {active ? 'Plano selecionado' : 'Em breve'}
              </button>
            </article>
          );
        })}
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
        O limite considera todas as contas de acesso da empresa, incluindo o Administrador Principal.
        A troca de plano e a cobrança serão conectadas nesta área na próxima etapa.
      </div>
    </section>
  );
}
