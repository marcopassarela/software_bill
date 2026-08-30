'use client';

import { useState } from 'react';
import { request } from '@/lib/api';

const ACTIONS: {
  id: string;
  title: string;
  description: string;
  confirmText: string;
  endpoint: string | null;
  danger: 'red' | 'amber';
  soon?: boolean;
}[] = [
  {
    id: 'wipe-operational',
    title: 'Excluir dados operacionais',
    description:
      'Apaga agenda, movimentações de estoque, manutenções e combustível. Mantém usuários e cadastros principais.',
    confirmText: 'EXCLUIR DADOS',
    endpoint: '/admin/critical/wipe-operational',
    danger: 'red',
  },
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
    id: 'revoke-sessions',
    title: 'Encerrar todas as sessões',
    description: 'Todos os usuários precisarão entrar de novo.',
    confirmText: 'ENCERRAR SESSOES',
    endpoint: '/admin/critical/revoke-sessions',
    danger: 'amber',
  },
  {
    id: 'restore-backup',
    title: 'Restaurar backup',
    description: 'Restaura dados a partir de um arquivo de backup (em breve).',
    confirmText: 'RESTAURAR',
    endpoint: null,
    danger: 'amber',
    soon: true,
  },
  {
    id: 'delete-company',
    title: 'Excluir empresa',
    description: 'Remove dados da empresa de forma definitiva (em breve).',
    confirmText: 'EXCLUIR EMPRESA',
    endpoint: null,
    danger: 'red',
    soon: true,
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
        <h2>Configurações críticas</h2>
        <p className="mt-2 text-sm text-slate-600">
          Acesso restrito ao Administrador Principal.
        </p>
      </div>
    );
  }

  async function runAction() {
    if (!modal?.endpoint) {
      setError('Esta ação ainda não está disponível.');
      return;
    }
    setBusy(true);
    setError('');
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
        <h2 className="text-lg font-semibold text-red-800">
          Configurações críticas
        </h2>
        <p className="mt-1 text-sm text-red-700">
          Operações irreversíveis. Exigem senha do Administrador Principal e texto de
          confirmação. A API valida no servidor.
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
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-slate-900">
              {a.title}
                </h3>
                <p className="mt-0.5 text-sm text-slate-500">
              {a.description}
              </p>
            </div>

            <button
              type="button"
              disabled={!!a.soon}
              onClick={() => {
                if (a.soon) return;
                setModal(a);
                setPassword('');
                setConfirmText('');
                setError('');
              }}
              className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                a.danger === 'red'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {a.soon ? 'Em breve' : 'Executar…'}
            </button>
          </div>
        ))}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-red-700">
            {modal.title}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
            {modal.description}
            </p>
            <label className="mt-4 block text-sm">
            <span className="mb-1 block text-slate-600">
              Senha do Administrador Principal *
            </span>
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