'use client';

import { useCallback, useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { request } from '@/lib/api';

const STATUSES = [
  { value: 'pendente', label: 'Pendente', className: 'bg-amber-100 text-amber-800' },
  { value: 'atrasado', label: 'Atrasado', className: 'bg-red-100 text-red-800' },
  { value: 'entregue', label: 'Entregue', className: 'bg-emerald-100 text-emerald-800' },
] as const;

function statusClass(s: string) {
  return STATUSES.find((x) => x.value === s)?.className || 'bg-slate-100 text-slate-700';
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

const emptyForm = () => ({
  model: '',
  quality: '',
  cabling: '',
  breaker: '',
  height: '',
  quantity: '1',
  order_date: todayISO(),
  ship_date: '',
  status: 'pendente',
  branch: '',
  notes: '',
});

export default function OrdersModule({
  user,
  askPassword,
}: {
  user: any;
  askPassword?: (
    title: string,
    message: string,
    onConfirm: (password: string) => Promise<void>
  ) => void;
}) {
  const isMainAdmin = !!user?.is_main_admin;
  const perms = (user?.permissions || '').split(',').filter(Boolean);
    const isBoss =
    isMainAdmin ||
    user?.role === 'ADMINISTRADOR' ||
    user?.role === 'GERENTE';

  // Sub-aba Cadastrar
  const canCreate =
    isBoss || perms.includes('orders_create') || perms.includes('orders');

  // Sub-aba Lista
  const canList =
    isBoss || perms.includes('orders_list') || perms.includes('orders');

  type Tab = 'cadastro' | 'lista';
  const [tab, setTab] = useState<Tab>(() => {
    if (canCreate) return 'cadastro';
    if (canList) return 'lista';
    return 'cadastro';
  });

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [form, setForm] = useState(emptyForm());
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (filterStatus) qs.set('status', filterStatus);
      if (filterFrom) qs.set('date_from', filterFrom);
      if (filterTo) qs.set('date_to', filterTo);
      const data = await request(`/orders?${qs.toString()}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterFrom, filterTo]);

  useEffect(() => {
    load();
  }, [load]);

  function setField(k: string, v: string) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  function openEdit(r: any) {
    setEditing(r);
    setForm({
      model: r.model || '',
      quality: r.quality || '',
      cabling: r.cabling || '',
      breaker: r.breaker || '',
      height: r.height || '',
      quantity: String(r.quantity ?? 1),
      order_date: r.order_date || todayISO(),
      ship_date: r.ship_date || '',
      status: r.status || 'pendente',
      branch: r.branch || '',
      notes: r.notes || '',
    });
  }

  function cancelEdit() {
    setEditing(null);
    setForm(emptyForm());
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.model.trim()) {
      setError('Modelo é obrigatório.');
      return;
    }
    setSaving(true);
    setError('');
    setOkMsg('');
    const body = {
      model: form.model.trim(),
      quality: form.quality || null,
      cabling: form.cabling || null,
      breaker: form.breaker || null,
      height: form.height || null,
      quantity: Number(form.quantity) || 1,
      order_date: form.order_date,
      ship_date: form.ship_date || null,
      status: form.status,
      branch: form.branch || null,
      notes: form.notes || null,
    };
    try {
      if (editing) {
        await request(`/orders/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        setOkMsg('Pedido atualizado.');
      } else {
        await request('/orders', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        setOkMsg('Pedido cadastrado.');
      }
      cancelEdit();
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function doDelete(r: any) {
    const run = async (password: string) => {
      await request(`/orders/${r.id}/delete`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      setOkMsg('Pedido excluído.');
      load();
    };
    if (askPassword) {
      askPassword('Excluir pedido', 'Confirme sua senha de administrador.', run);
    } else if (confirm('Excluir este pedido?')) {
      // fallback sem modal
      const pwd = window.prompt('Senha:') || '';
      run(pwd).catch((e) => setError(e.message));
    }
  }

  function backupWeekPdf() {
    if (!rows.length) {
      setError('Nenhum pedido no filtro atual para exportar.');
      return;
    }
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('LOGÍSTICAS BILL — Pedidos (backup)', 12, 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(
      `Filtro: ${filterFrom || '…'} → ${filterTo || '…'} · ${rows.length} pedido(s)`,
      12,
      18
    );
    autoTable(doc, {
      startY: 22,
      head: [
        [
          'Status',
          'Modelo',
          'Qtd',
          'Qualidade',
          'Cabeamento',
          'Disjuntor',
          'Altura',
          'Pedido',
          'Saída',
          'Filial',
        ],
      ],
      body: rows.map((r) => [
        STATUSES.find((s) => s.value === r.status)?.label || r.status,
        r.model,
        r.quantity,
        r.quality || '—',
        r.cabling || '—',
        r.breaker || '—',
        r.height || '—',
        r.order_date,
        r.ship_date || '—',
        r.branch || '—',
      ]),
      styles: { fontSize: 7, cellPadding: 1 },
      headStyles: { fillColor: [15, 40, 70], textColor: 255 },
      margin: { left: 10, right: 10 },
    });
    doc.save(`pedidos_${filterFrom || 'ini'}_${filterTo || 'fim'}.pdf`);
    setOkMsg('PDF gerado.');
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Pedidos</h2>
        <div className="flex flex-wrap gap-2">
        {canCreate && (
          <button
            type="button"
            onClick={() => setTab('cadastro')}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${
              tab === 'cadastro' ? 'border-brand bg-brand text-white' : 'bg-white'
            }`}
          >
            Cadastrar
          </button>
        )}
        {canList && (
          <button
            type="button"
            onClick={() => {
              setTab('lista');
              load();
            }}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${
              tab === 'lista' ? 'border-brand bg-brand text-white' : 'bg-white'
            }`}
          >
            Lista de pedidos
          </button>
        )}
      </div>
        <p className="mt-1 text-sm text-slate-500">
          Pedidos da filial para a matriz — modelo, qualidade, cabeamento, disjuntor, altura e
          datas.
        </p>
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

      {canCreate && tab === 'cadastro' && (
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-800">
            {editing ? `Editar pedido #${editing.id}` : 'Novo pedido'}
          </h3>
          <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Modelo *</span>
              <input
                required
                value={form.model}
                onChange={(e) => setField('model', e.target.value)}
                className="w-full rounded-lg border border-slate-200 p-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Quantidade *</span>
              <input
                type="number"
                min={0.01}
                step="any"
                required
                value={form.quantity}
                onChange={(e) => setField('quantity', e.target.value)}
                className="w-full rounded-lg border border-slate-200 p-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Qualidade</span>
              <input
                value={form.quality}
                onChange={(e) => setField('quality', e.target.value)}
                className="w-full rounded-lg border border-slate-200 p-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Cabeamento</span>
              <input
                value={form.cabling}
                onChange={(e) => setField('cabling', e.target.value)}
                className="w-full rounded-lg border border-slate-200 p-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Disjuntor</span>
              <input
                value={form.breaker}
                onChange={(e) => setField('breaker', e.target.value)}
                className="w-full rounded-lg border border-slate-200 p-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Altura</span>
              <input
                value={form.height}
                onChange={(e) => setField('height', e.target.value)}
                className="w-full rounded-lg border border-slate-200 p-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Data do pedido *</span>
              <input
                type="date"
                required
                value={form.order_date}
                onChange={(e) => setField('order_date', e.target.value)}
                className="box-border w-full max-w-[11.5rem] rounded-lg border border-slate-200 p-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Data de saída</span>
              <input
                type="date"
                value={form.ship_date}
                onChange={(e) => setField('ship_date', e.target.value)}
                className="box-border w-full max-w-[11.5rem] rounded-lg border border-slate-200 p-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Status</span>
              <select
                value={form.status}
                onChange={(e) => setField('status', e.target.value)}
                className="w-full rounded-lg border border-slate-200 p-2"
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Filial</span>
              <input
                value={form.branch}
                onChange={(e) => setField('branch', e.target.value)}
                className="w-full rounded-lg border border-slate-200 p-2"
              />
            </label>
            <label className="text-sm sm:col-span-2 lg:col-span-3">
              <span className="mb-1 block text-slate-600">Observação</span>
              <textarea
                value={form.notes}
                onChange={(e) => setField('notes', e.target.value)}
                className="h-20 w-full rounded-lg border border-slate-200 p-2"
              />
            </label>
            <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Cadastrar pedido'}
              </button>
              {editing && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-lg bg-slate-100 px-4 py-2 text-sm"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </section>
      )}

    {canList && tab === 'lista' && (
      <section className="rounded-xl bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Status</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-slate-200 p-2"
            >
              <option value="">Todos</option>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">De</span>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="box-border max-w-[11.5rem] rounded-lg border border-slate-200 p-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Até</span>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="box-border max-w-[11.5rem] rounded-lg border border-slate-200 p-2"
            />
          </label>
          <button
            type="button"
            onClick={load}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white"
          >
            Filtrar
          </button>
          <button
            type="button"
            onClick={backupWeekPdf}
            className="rounded-lg border px-4 py-2 text-sm font-medium"
          >
            Backup PDF (filtro)
          </button>
        </div>

                <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Modelo</th>
                <th className="px-3 py-2 text-left">Qtd</th>
                <th className="px-3 py-2 text-left">Qualidade</th>
                <th className="px-3 py-2 text-left">Cabeamento</th>
                <th className="px-3 py-2 text-left">Disjuntor</th>
                <th className="px-3 py-2 text-left">Altura</th>
                <th className="px-3 py-2 text-left">Pedido</th>
                <th className="px-3 py-2 text-left">Saída</th>
                <th className="px-3 py-2 text-left">Filial</th>
                {canCreate && <th className="px-3 py-2 text-left">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(
                        r.status
                      )}`}
                    >
                      {STATUSES.find((s) => s.value === r.status)?.label || r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium">{r.model}</td>
                  <td className="px-3 py-2 tabular-nums">{r.quantity}</td>
                  <td className="px-3 py-2">{r.quality || '—'}</td>
                  <td className="px-3 py-2">{r.cabling || '—'}</td>
                  <td className="px-3 py-2">{r.breaker || '—'}</td>
                  <td className="px-3 py-2">{r.height || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.order_date?.split('-').reverse().join('/') || '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.ship_date ? r.ship_date.split('-').reverse().join('/') : '—'}
                  </td>
                  <td className="px-3 py-2">{r.branch || '—'}</td>
                  {canCreate && (
                    <td className="whitespace-nowrap px-3 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          openEdit(r);
                          setTab('cadastro');
                        }}
                        className="mr-2 rounded-lg bg-slate-100 px-3 py-1 text-xs font-medium"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => doDelete(r)}
                        className="rounded-lg bg-red-50 px-3 py-1 text-xs font-medium text-red-700"
                      >
                        Excluir
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {!loading && !rows.length && (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-slate-400">
                    Nenhum pedido no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}
    </div>
  );
}