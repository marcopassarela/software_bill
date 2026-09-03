'use client';

import { useCallback, useEffect, useState } from 'react';
import { request } from '@/lib/api';

type Tab =
  | 'backup'
  | 'audit'
  | 'company'
  | 'system'
  | 'license'
  | 'support';


const TABS: { id: Tab; label: string }[] = [
  { id: 'backup', label: 'Backup e dados' },
  { id: 'audit', label: 'Auditoria' },
  { id: 'company', label: 'Dados da empresa' },
  { id: 'system', label: 'Sistema / Atualizações' },
  { id: 'license', label: 'Licença' },
  { id: 'support', label: 'Suporte' },
];

function downloadCsv(filename: string, rows: Record<string, any>[]) {
  if (!rows.length) {
    throw new Error('Nenhum registro para exportar.');
  }
  const keys = Object.keys(rows[0]);
  const esc = (v: any) => {
    const s = v == null ? '' : String(v);
    if (/[;",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [keys.join(';')];
  rows.forEach((r) => lines.push(keys.map((k) => esc(r[k])).join(';')));
  const blob = new Blob(['\ufeff' + lines.join('\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function CompanyDataPanel({
  setError,
  setOkMsg,
}: {
  setError: (s: string) => void;
  setOkMsg: (s: string) => void;
}) {
  const [busy, setBusy] = useState('');

  const modules = [
    { key: 'vehicles', label: 'Veículos', path: '/vehicles' },
    { key: 'drivers', label: 'Motoristas', path: '/drivers' },
    { key: 'products', label: 'Estoque (produtos)', path: '/products' },
    { key: 'commercial', label: 'Comercial (produtos)', path: '/commercial/products' },
    { key: 'maintenance', label: 'Manutenção', path: '/maintenance' },
    { key: 'fuel', label: 'Combustível', path: '/fuel' },
    { key: 'movements', label: 'Movimentações', path: '/stock/movements' },
  ];

  async function exportOne(m: (typeof modules)[0]) {
    setBusy(m.key);
    setError('');
    try {
      const data = await request(m.path);
      const rows = Array.isArray(data) ? data : [];
      const flat = rows.map((r: any) => {
        const o: Record<string, any> = {};
        Object.keys(r).forEach((k) => {
          if (k === 'password_hash') return;
          const v = r[k];
          o[k] = v != null && typeof v === 'object' ? JSON.stringify(v) : v;
        });
        return o;
      });
      const day = new Date().toISOString().slice(0, 10);
      downloadCsv(`bill_${m.key}_${day}.csv`, flat);
      setOkMsg(`Exportado: ${m.label} (${flat.length} linhas).`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-slate-800">Exportar dados (CSV)</h3>
      <p className="mt-1 text-sm text-slate-500">Baixa planilha de cada módulo.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {modules.map((m) => (
          <button
            key={m.key}
            type="button"
            disabled={!!busy}
            onClick={() => exportOne(m)}
            className="flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <span className="font-medium">{m.label}</span>
            <span className="text-xs text-brand">
              {busy === m.key ? 'Gerando…' : 'Exportar CSV'}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Login',
  'LOGIN_INVÁLIDO': 'Tentativa de login inválida',
  LOGOUT: 'Logout',
  CADASTRO: 'Cadastro',
  ALTERAÇÃO: 'Alteração',
  'ALTERAÇÃO_DE_USUÁRIO': 'Alteração de usuário',
  'ALTERAÇÃO_DE_PERFIL': 'Alteração de perfil',
  'ALTERAÇÃO_DE_SENHA': 'Alteração de senha',
  EXCLUSÃO: 'Exclusão',
  'EXCLUSÃO_DE_USUÁRIO': 'Exclusão de usuário',
  CRIAÇÃO_DE_USUÁRIO: 'Criação de usuário',
  CRITICO_REVOKE_SESSIONS: 'Encerramento de todas as sessões',
  ENTRADA: 'Entrada de estoque',
  'SAÍDA': 'Saída de estoque',
  ARQUIVAMENTO_SEMANA: 'Arquivamento de semana',
  EXCLUSÃO_SEMANA: 'Exclusão de semana',
};

const AUDIT_MODULE_LABELS: Record<string, string> = {
  auth: 'Autenticação',
  users: 'Usuários',
  admin: 'Administração',
  settings: 'Configurações',
  dashboard: 'Painel',
  stock: 'Estoque',
  schedule: 'Agendamento',
  routes: 'Rotas',
  vehicles: 'Veículos',
  drivers: 'Motoristas',
  maintenance: 'Manutenção',
  fuel: 'Combustível',
  customers: 'Clientes',
  commercial: 'Comercial',
};

function auditActionLabel(value: string | undefined) {
  return value ? AUDIT_ACTION_LABELS[value] || value : '—';
}

function auditModuleLabel(value: string | undefined) {
  return value ? AUDIT_MODULE_LABELS[value] || value : '—';
}

function decodeLocation(value: unknown) {
  if (!value) return 'Não disponível';

  try {
    return decodeURIComponent(String(value));
  } catch {
    return String(value);
  }
}


export default function SettingsModule({ user }: { user: any }) {
  const isMainAdmin = !!user?.is_main_admin;
  const [tab, setTab] = useState<Tab>('backup');
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  const [auditRows, setAuditRows] = useState<any[]>([]);
  const [selectedAudit, setSelectedAudit] = useState<any | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditUser, setAuditUser] = useState('');
  const [auditModule, setAuditModule] = useState('');
  const [auditAction, setAuditAction] = useState('');
  const [auditFrom, setAuditFrom] = useState('');
  const [auditTo, setAuditTo] = useState('');

  const [health, setHealth] = useState<{ status?: string } | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);

  const loadAudit = useCallback(async () => {
  if (!isMainAdmin) return;
  setError('');

  try {
    const qs = new URLSearchParams();
    if (auditUser.trim()) qs.set('user', auditUser.trim());
    if (auditModule.trim()) qs.set('module', auditModule.trim());
    if (auditAction.trim()) qs.set('action', auditAction.trim());
    if (auditFrom) qs.set('date_from', auditFrom);
    if (auditTo) qs.set('date_to', auditTo);

    const q = qs.toString();
    const rows = await request(`/audit${q ? `?${q}` : ''}`);
    setAuditRows(Array.isArray(rows) ? rows : []);
  } catch (e: any) {
    setError(e.message);
    // Não apaga a tabela quando uma atualização automática falhar.
  }
}, [isMainAdmin, auditUser, auditModule, auditAction, auditFrom, auditTo]);

  useEffect(() => {
  if (tab === 'audit') loadAudit();
  if (tab === 'system') {
    request('/health')
      .then(setHealth)
      .catch(() => setHealth({ status: 'erro' }));
  }
  }, [tab, loadAudit]);


  useEffect(() => {
  if (tab !== 'audit' || !isMainAdmin) return;

  const timer = window.setInterval(() => {
    loadAudit();
  }, 20000);

  return () => window.clearInterval(timer);
  }, [tab, isMainAdmin, loadAudit]);


  async function downloadBackupJson() {
    setBackupBusy(true);
    setError('');
    try {
      const data = await request('/admin/backup/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const day = new Date().toISOString().slice(0, 10);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `bill_backup_${day}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setOkMsg('Backup JSON baixado.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBackupBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Configurações</h2>
        <p className="mt-1 text-sm text-slate-500">
          Backup, auditoria, dados da empresa e informações do sistema.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setError('');
              setOkMsg('');
            }}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
              tab === t.id
                ? 'border-brand bg-brand text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:border-brand'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {okMsg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {okMsg}
        </div>
      )}

      {/* 1. Backup */}
      {tab === 'backup' && (
        <div className="space-y-4">
          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-800">Status de proteção</h3>
            <ul className="mt-3 space-y-1 text-sm text-slate-600">
              <li>Último backup: use o botão abaixo para gerar agora</li>
              <li>Próximo backup: agendamento automático em fase futura</li>
              <li>
                Status:{' '}
                <span className="font-medium text-emerald-700">Backup manual disponível</span>
              </li>
            </ul>
          </section>
          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-800">Backup</h3>
            <p className="mt-1 text-sm text-slate-500">
              Download JSON (Admin Principal). Requer endpoint{' '}
              <code className="text-xs">/admin/backup/export</code> no backend.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={backupBusy || !isMainAdmin}
                onClick={downloadBackupJson}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {backupBusy ? 'Gerando…' : 'Baixar backup (JSON)'}
              </button>
            </div>
            {!isMainAdmin && (
              <p className="mt-2 text-xs text-amber-700">
                Apenas o Administrador Principal pode baixar o backup completo.
              </p>
            )}
          </section>
        </div>
      )}

      {/* 2. Auditoria */}
      {tab === 'audit' && (
        <section className="min-w-0 rounded-xl bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-800">Auditoria de atividades</h3>
          {!isMainAdmin ? (
            <p className="mt-3 text-sm text-slate-500">
              Apenas o Administrador Principal pode consultar o log de auditoria.
            </p>
          ) : (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">Usuário</span>
                  <input
                    value={auditUser}
                    onChange={(e) => setAuditUser(e.target.value)}
                    className="w-full rounded-lg border p-2"
                    placeholder="nome ou login"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">Módulo</span>
                  <input
                    value={auditModule}
                    onChange={(e) => setAuditModule(e.target.value)}
                    className="w-full rounded-lg border p-2"
                    placeholder="schedule, stock…"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">Ação</span>
                  <input
                    value={auditAction}
                    onChange={(e) => setAuditAction(e.target.value)}
                    className="w-full rounded-lg border p-2 placeholder:text-sm"
                    placeholder="LOGIN, CADASTRO…"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">Data inicial</span>
                  <input
                    type="date"
                    value={auditFrom}
                    onChange={(e) => setAuditFrom(e.target.value)}
                    className="w-full rounded-lg border p-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">Data final</span>
                  <input
                    type="date"
                    value={auditTo}
                    onChange={(e) => setAuditTo(e.target.value)}
                    className="w-full rounded-lg border p-2"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={loadAudit}
                className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
              >
                Filtrar
              </button>
              <div className="mt-4 w-full max-w-full overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Data</th>
                        <th className="px-3 py-2">Usuário</th>
                        <th className="px-3 py-2">Ação</th>
                        <th className="px-3 py-2">Módulo</th>
                        <th className="px-3 py-2">Registro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditRows.map((r) => (
                          <tr
                            key={r.id}
                            className="cursor-pointer border-t transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand/40"
                            onClick={() => setSelectedAudit(r)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                setSelectedAudit(r);
                              }
                            }}
                            role="button"
                            tabIndex={0}
                          >
                            <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                              {r.created_at ? new Date(r.created_at).toLocaleString('pt-BR') : '—'}
                            </td>
                            <td className="px-3 py-2">
                              {r.user_name || r.username || (r.user_id ? `Usuário ${r.user_id}` : 'Sistema')}
                            </td>
                            <td className="px-3 py-2">{auditActionLabel(r.action)}</td>
                            <td className="px-3 py-2">{auditModuleLabel(r.module)}</td>
                            <td className="px-3 py-2">{r.record_id ?? '—'}</td>
                          </tr>
                        )
                      )}
                      {!auditLoading && !auditRows.length && (
                        <tr>
                          <td colSpan={5} className="px-3 py-6 text-slate-400">
                            Nenhum registro encontrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

            </>
          )}
        </section>
      )}

      {/* 3. Dados da empresa */}
      {tab === 'company' && (
        <CompanyDataPanel setError={setError} setOkMsg={setOkMsg} />
      )}

    {/* 5. Sistema */}
    {tab === 'system' && (
      <section className="rounded-xl bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-slate-800">
          Sistema / Atualizações
        </h3>

        <ul className="mt-3 space-y-2 text-sm text-slate-600">
          <li>
            Versão do app: <strong>1.0.0</strong>
          </li>
          <li>
            API:{' '}
            <strong
              className={
                health?.status === 'ok'
                  ? 'text-emerald-600'
                  : 'text-red-600'
              }
            >
              {health?.status === 'ok'
                ? 'Online'
                : health
                ? 'Instável'
                : 'Verificando…'}
            </strong>
          </li>
          <li>Última atualização: conforme deploy na Vercel</li>
        </ul>

        <button
          type="button"
          className="mt-4 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium"
          onClick={() =>
            request('/health')
              .then((h) => {
                setHealth(h);
                setOkMsg('Status da API atualizado.');
              })
              .catch(() => setError('Falha ao consultar /health'))
          }
        >
          Verificar status
        </button>
      </section>
    )}

    {/* 6. Licença */}
      {tab === 'license' && (
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-800">Licença</h3>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Plano atual</dt>
              <dd className="font-medium">Profissional</dd>
            </div>
            <div>
              <dt className="text-slate-500">Status</dt>
              <dd className="font-medium text-emerald-600">Ativo</dd>
            </div>
            <div>
              <dt className="text-slate-500">Vencimento</dt>
              <dd className="font-medium">—</dd>
            </div>
            <div>
              <dt className="text-slate-500">Empresa</dt>
              <dd className="font-medium">Logísticas Bill</dd>
            </div>
            <div>
              <dt className="text-slate-500">Usuários</dt>
              <dd className="font-medium">conforme cadastro</dd>
            </div>
            <div>
              <dt className="text-slate-500">Armazenamento</dt>
              <dd className="font-medium">conforme plano</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-slate-400">
            Renovação e pagamento serão integrados quando houver billing.
          </p>
        </section>
      )}

      {/* 7. Suporte */}
      {tab === 'support' && (
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-800">Suporte</h3>
          <ul className="mt-3 space-y-2">
            <li>
              <a
                href="mailto:marcopassarela@hotmail.com?subject=Suporte%20Logísticas%20Bill"
                className="block w-full rounded-lg border px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Abrir chamado (e-mail)
              </a>
            </li>
            <li>
              <button
                type="button"
                className="w-full rounded-lg border px-4 py-3 text-left text-sm font-medium hover:bg-slate-50"
                onClick={() => setOkMsg('Manual do sistema: em breve (PDF ou link).')}
              >
                Manual do sistema
              </button>
            </li>
            <li>
              <button
                type="button"
                className="w-full rounded-lg border px-4 py-3 text-left text-sm font-medium hover:bg-slate-50"
                onClick={() => setOkMsg('Relato registrado localmente — use o e-mail para suporte.')}
              >
                Relatar problema
              </button>
            </li>
          </ul>
        </section>
      )}

      {selectedAudit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={() => setSelectedAudit(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="audit-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="audit-detail-title" className="text-lg font-semibold text-slate-900">
                  Detalhes da atividade
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Registro completo da ação realizada no sistema.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAudit(null)}
                className="rounded-lg bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-200"
              >
                Fechar
              </button>
            </div>

            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase text-slate-500">Usuário</dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {selectedAudit.user_name ||
                    (selectedAudit.action === 'LOGIN_INVÁLIDO'
                      ? 'Usuário desconhecido'
                      : 'Sistema')}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-slate-500">Login informado</dt>
                <dd className="mt-1 text-slate-800">{selectedAudit.username_attempted || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-slate-500">Ação</dt>
                <dd className="mt-1 text-slate-800">{auditActionLabel(selectedAudit.action)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-slate-500">Módulo</dt>
                <dd className="mt-1 text-slate-800">{auditModuleLabel(selectedAudit.module)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-slate-500">Registro afetado</dt>
                <dd className="mt-1 text-slate-800">{selectedAudit.record_id || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-slate-500">Data e hora</dt>
                <dd className="mt-1 text-slate-800">
                  {selectedAudit.created_at
                    ? new Date(selectedAudit.created_at).toLocaleString('pt-BR')
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-slate-500">Endereço IP</dt>
                <dd className="mt-1 font-mono text-sm text-slate-800">{selectedAudit.ip || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-slate-500">Classificação</dt>
                <dd className="mt-1">
                  {selectedAudit.is_brute_force ? (
                    <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
                      Possível força bruta
                    </span>
                  ) : selectedAudit.action === 'LOGIN_INVÁLIDO' ? (
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                      Tentativa inválida
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                      Atividade identificada
                    </span>
                  )}
                </dd>
              </div>
            </dl>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="font-semibold text-slate-800">Localização aproximada</h4>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-slate-500">País</dt>
                  <dd className="font-medium text-slate-800">{decodeLocation(selectedAudit.country)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Região</dt>
                  <dd className="font-medium text-slate-800">{decodeLocation(selectedAudit.region)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Cidade</dt>
                  <dd className="font-medium text-slate-800">{decodeLocation(selectedAudit.city)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Latitude e longitude</dt>
                  <dd className="font-mono text-sm text-slate-800">
                    {selectedAudit.latitude && selectedAudit.longitude
                      ? `${selectedAudit.latitude}, ${selectedAudit.longitude}`
                      : 'Não disponível'}
                  </dd>
                </div>
              </dl>
              {selectedAudit.latitude && selectedAudit.longitude && (
                <a
                  href={`https://www.google.com/maps?q=${encodeURIComponent(`${selectedAudit.latitude},${selectedAudit.longitude}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-sm font-medium text-brand hover:underline"
                >
                  Ver localização aproximada no mapa
                </a>
              )}
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 p-4">
              <h4 className="font-semibold text-slate-800">O que foi feito</h4>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">
                {selectedAudit.details || 'Este registro não possui detalhes adicionais.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}