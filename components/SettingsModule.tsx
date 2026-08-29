'use client';

import { useCallback, useEffect, useState } from 'react';
import { request } from '@/lib/api';

type Tab =
  | 'backup'
  | 'audit'
  | 'company'
  | 'prefs'
  | 'system'
  | 'license'
  | 'support';

const TABS: { id: Tab; label: string }[] = [
  { id: 'backup', label: 'Backup e dados' },
  { id: 'audit', label: 'Auditoria' },
  { id: 'company', label: 'Dados da empresa' },
  { id: 'prefs', label: 'Preferências' },
  { id: 'system', label: 'Sistema / Atualizações' },
  { id: 'license', label: 'Licença' },
  { id: 'support', label: 'Suporte' },
];

function moneyGB(n: number) {
  return `${n} GB`;
}

export default function SettingsModule({ user }: { user: any }) {
  const isMainAdmin = !!user?.is_main_admin;
  const [tab, setTab] = useState<Tab>('backup');
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  // —— Auditoria ——
  const [auditRows, setAuditRows] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditUser, setAuditUser] = useState('');
  const [auditModule, setAuditModule] = useState('');
  const [auditAction, setAuditAction] = useState('');
  const [auditFrom, setAuditFrom] = useState('');
  const [auditTo, setAuditTo] = useState('');

  // —— Preferências ——
  const [prefs, setPrefs] = useState({
    currency: 'BRL',
    date_format: 'DD/MM/YYYY',
    timezone: 'America/Sao_Paulo',
    language: 'pt-BR',
    page_size: '50',
    auto_refresh_sec: '10',
  });
  const [prefsSaving, setPrefsSaving] = useState(false);

  // —— Sistema ——
  const [health, setHealth] = useState<{ status?: string } | null>(null);

  const loadAudit = useCallback(async () => {
    if (!isMainAdmin) return;
    setAuditLoading(true);
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
      setAuditRows([]);
    } finally {
      setAuditLoading(false);
    }
  }, [isMainAdmin, auditUser, auditModule, auditAction, auditFrom, auditTo]);

  const loadPrefs = useCallback(async () => {
    try {
      const keys = [
        'pref_currency',
        'pref_date_format',
        'pref_timezone',
        'pref_language',
        'pref_page_size',
        'pref_auto_refresh_sec',
      ];
      const all = await request('/settings').catch(() => []);
      const map: Record<string, string> = {};
      (Array.isArray(all) ? all : []).forEach((s: any) => {
        if (s?.key) map[s.key] = s.value ?? '';
      });
      setPrefs({
        currency: map.pref_currency || 'BRL',
        date_format: map.pref_date_format || 'DD/MM/YYYY',
        timezone: map.pref_timezone || 'America/Sao_Paulo',
        language: map.pref_language || 'pt-BR',
        page_size: map.pref_page_size || '50',
        auto_refresh_sec: map.pref_auto_refresh_sec || '10',
      });
    } catch {
      /* mantém defaults */
    }
  }, []);

  useEffect(() => {
    if (tab === 'audit') loadAudit();
    if (tab === 'prefs') loadPrefs();
    if (tab === 'system') {
      request('/health')
        .then(setHealth)
        .catch(() => setHealth({ status: 'erro' }));
    }
  }, [tab, loadAudit, loadPrefs]);

  async function savePref(key: string, value: string) {
    await request(`/settings/${key}`, {
      method: 'PATCH',
      body: JSON.stringify({ data: { value } }),
    });
  }

  async function savePrefs(e: React.FormEvent) {
    e.preventDefault();
    setPrefsSaving(true);
    setError('');
    setOkMsg('');
    try {
      await Promise.all([
        savePref('pref_currency', prefs.currency),
        savePref('pref_date_format', prefs.date_format),
        savePref('pref_timezone', prefs.timezone),
        savePref('pref_language', prefs.language),
        savePref('pref_page_size', prefs.page_size),
        savePref('pref_auto_refresh_sec', prefs.auto_refresh_sec),
      ]);
      setOkMsg('Preferências salvas.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPrefsSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Configurações</h2>
        <p className="mt-1 text-sm text-slate-500">
          Backup, auditoria, dados da empresa, preferências e informações do sistema.
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

      {/* —— 1. Backup —— */}
      {tab === 'backup' && (
        <div className="space-y-4">
          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-800">Status de proteção</h3>
            <ul className="mt-3 space-y-1 text-sm text-slate-600">
              <li>Último backup: — (ainda não configurado no servidor)</li>
              <li>Próximo backup: —</li>
              <li>
                Status:{' '}
                <span className="font-medium text-amber-700">Configuração pendente</span>
              </li>
            </ul>
          </section>
          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-800">Agendamento</h3>
            <p className="mt-1 text-sm text-slate-500">
              Frequência e retenção serão gravadas nas preferências; a execução automática
              depende de job no servidor (fase seguinte).
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-slate-600">Frequência</span>
                <select className="w-full rounded-lg border p-2" defaultValue="weekly">
                  <option value="daily">Diário</option>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensal</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-slate-600">Backups mantidos</span>
                <input type="number" min={1} max={30} defaultValue={7} className="w-full rounded-lg border p-2" />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700"
                onClick={() => setOkMsg('Exportação completa do banco será liberada na próxima fase.')}
              >
                Exportar banco de dados
              </button>
              <button
                type="button"
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700"
                onClick={() => setOkMsg('Importação de backup exige Configurações críticas + senha.')}
              >
                Importar dados
              </button>
            </div>
          </section>
          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-800">Histórico de backups</h3>
            <p className="mt-2 text-sm text-slate-400">Nenhum backup registrado ainda.</p>
          </section>
        </div>
      )}

      {/* —— 2. Auditoria —— */}
      {tab === 'audit' && (
        <section className="rounded-xl bg-white p-5 shadow-sm">
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
                    className="w-full rounded-lg border p-2"
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
              <div className="mt-4 w-full overflow-x-auto">
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
                    {auditLoading ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-slate-400">
                          Carregando…
                        </td>
                      </tr>
                    ) : (
                      auditRows.map((r) => (
                        <tr key={r.id} className="border-t">
                          <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                            {r.created_at
                              ? new Date(r.created_at).toLocaleString('pt-BR')
                              : '—'}
                          </td>
                          <td className="px-3 py-2">{r.username || r.user_id || '—'}</td>
                          <td className="px-3 py-2">{r.action || '—'}</td>
                          <td className="px-3 py-2">{r.module || '—'}</td>
                          <td className="px-3 py-2">{r.record_id ?? '—'}</td>
                        </tr>
                      ))
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

      {/* —— 3. Dados da empresa —— */}
      {tab === 'company' && (
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-800">Importar / exportar dados</h3>
          <p className="mt-1 text-sm text-slate-500">
            Use a aba Relatórios para exportar módulos. Importação em massa (Excel/CSV) será
            ligada na próxima fase.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[
              'Produtos (estoque)',
              'Veículos',
              'Motoristas',
              'Funcionários',
              'Clientes',
              'Fornecedores',
            ].map((label) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
              >
                <span>{label}</span>
                <span className="text-xs text-slate-400">Em breve</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* —— 4. Preferências —— */}
      {tab === 'prefs' && (
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-800">Preferências do sistema</h3>
          <form onSubmit={savePrefs} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Moeda</span>
              <select
                value={prefs.currency}
                onChange={(e) => setPrefs((s) => ({ ...s, currency: e.target.value }))}
                className="w-full rounded-lg border p-2"
              >
                <option value="BRL">BRL (R$)</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Formato da data</span>
              <select
                value={prefs.date_format}
                onChange={(e) => setPrefs((s) => ({ ...s, date_format: e.target.value }))}
                className="w-full rounded-lg border p-2"
              >
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Fuso horário</span>
              <select
                value={prefs.timezone}
                onChange={(e) => setPrefs((s) => ({ ...s, timezone: e.target.value }))}
                className="w-full rounded-lg border p-2"
              >
                <option value="America/Sao_Paulo">America/Sao_Paulo</option>
                <option value="UTC">UTC</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Idioma</span>
              <select
                value={prefs.language}
                onChange={(e) => setPrefs((s) => ({ ...s, language: e.target.value }))}
                className="w-full rounded-lg border p-2"
              >
                <option value="pt-BR">Português (Brasil)</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Paginação (itens por página)</span>
              <input
                type="number"
                min={10}
                max={200}
                value={prefs.page_size}
                onChange={(e) => setPrefs((s) => ({ ...s, page_size: e.target.value }))}
                className="w-full rounded-lg border p-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Atualização automática (segundos)</span>
              <input
                type="number"
                min={0}
                max={120}
                value={prefs.auto_refresh_sec}
                onChange={(e) =>
                  setPrefs((s) => ({ ...s, auto_refresh_sec: e.target.value }))
                }
                className="w-full rounded-lg border p-2"
              />
              <span className="mt-1 block text-xs text-slate-400">0 = desligado</span>
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={prefsSaving}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {prefsSaving ? 'Salvando…' : 'Salvar preferências'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* —— 5. Sistema —— */}
      {tab === 'system' && (
        <div className="space-y-4">
          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-800">Sistema / Atualizações</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>
                Versão do app: <strong>1.0.0</strong>
              </li>
              <li>
                API:{' '}
                <strong className={health?.status === 'ok' ? 'text-emerald-600' : 'text-red-600'}>
                  {health?.status === 'ok' ? 'Online' : health ? 'Instável' : 'Verificando…'}
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
        </div>
      )}

      {/* —— 6. Licença —— */}
      {tab === 'license' && (
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-800">Licença</h3>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Plano atual</dt>
              <dd className="font-medium">Professional</dd>
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
              <dd className="font-medium">—</dd>
            </div>
            <div>
              <dt className="text-slate-500">Armazenamento</dt>
              <dd className="font-medium">{moneyGB(0)} / {moneyGB(50)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-slate-400">
            Renovar / alterar plano e histórico de pagamentos serão integrados quando houver
            billing.
          </p>
        </section>
      )}

      {/* —— 7. Suporte —— */}
      {tab === 'support' && (
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-800">Suporte</h3>
          <ul className="mt-3 space-y-2">
            {[
              'Manual do sistema',
              'Abrir chamado',
              'Relatar problema',
              'Enviar diagnóstico',
              'Central de ajuda',
            ].map((label) => (
              <li key={label}>
                <button
                  type="button"
                  className="w-full rounded-lg border px-4 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => setOkMsg(`${label}: em breve.`)}
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}