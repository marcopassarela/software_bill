'use client';

import { useState } from 'react';
import { request } from '@/lib/api';

type ActionId = 'reset-settings' | 'purge-users' | 'wipe-operational';

const ACTIONS: {
  id: ActionId;
  title: string;
  description: string;
  confirmText: string;
  endpoint: string;
  danger: string;
}[] = [
  {
    id: 'reset-settings',
    title: 'Redefinir configurações',
    description: 'Apaga preferências do sistema (moeda, fuso, paginação, etc.).',
    confirmText: 'REDEFINIR',
    endpoint: '/admin/critical/reset-settings',
    danger: 'amber',
  },
  {
    id: 'purge-users',
    title: 'Remover todos os usuários',
    description: 'Mantém somente o Administrador Principal. Irreversível.',
    confirmText: 'REMOVER USUARIOS',
    endpoint: '/admin/critical/purge-users',
    danger: 'red',
  },
  {
    id: 'wipe-operational',
    title: 'Excluir dados operacionais',
    description:
      'Apaga agenda, movimentações de estoque, manutenções e combustível. Não remove o Admin.',
    confirmText: 'EXCLUIR DADOS',
    endpoint: '/admin/critical/wipe-operational',
    danger: 'red',
  },
];

export default function CriticalSettingsModule({ user }: { user: any }) {
  const isMainAdmin = !!user?.is_main_admin;
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [modal, setModal] = useState<(typeof ACTIONS)[0] | null>(null);
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  if (!isMainAdmin) {
    return (
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-red-700">Configurações críticas</h2>
        <p className="mt-2 text-sm text-slate-600">
          Acesso restrito ao Administrador Principal.
        </p>
      </div>
    );
  }

  async function runAction() {
    if (!modal) return;
    setBusy(true);
    setError('');
    setOkMsg('');
    try {
      await request(modal.endpoint, {
        method: 'POST',
        body: JSON.stringify({ password, confirm_text: confirmText }),
      });
      setOkMsg(`${modal.title}: concluído.`);
      setModal(null);
      setPassword('');
      setConfirmText('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-red-200 bg-red-50 p-5">
        <p className="mt-1 text-sm text-red-700">
          Operações irreversíveis exigem autenticação do Administrador Principal e confirmação explícita. A validação é realizada diretamente no servidor. Após executadas, essas operações não poderão ser desfeitas.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {okMsg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {okMsg}
        </div>
      )}

      <div className="grid gap-3">
        {ACTIONS.map((a) => (
          <div
            key={a.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-sm"
          >
            <div>
              <h3 className="font-semibold text-slate-900">{a.title}</h3>
              <p className="mt-0.5 text-sm text-slate-500">{a.description}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setModal(a);
                setPassword('');
                setConfirmText('');
                setError('');
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
                a.danger === 'red' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              Executar…
            </button>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">
        <p className="font-medium text-slate-700">Em breve nesta tela</p>
        <ul className="mt-2 list-inside list-disc">
          <li>Restaurar backup</li>
          <li>Encerrar todas as sessões</li>
          <li>Excluir empresa</li>
        </ul>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-red-700">{modal.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{modal.description}</p>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-slate-600">Senha do Admin Principal *</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border p-2"
                autoFocus
              />
            </label>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-slate-600">
                Digite <strong className="text-red-600">{modal.confirmText}</strong> para
                confirmar *
              </span>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="w-full rounded-lg border p-2 font-mono"
                placeholder={modal.confirmText}
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy || !password || confirmText !== modal.confirmText}
                onClick={runAction}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy ? 'Executando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}