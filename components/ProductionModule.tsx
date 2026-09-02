'use client';

import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { request } from '@/lib/api';
import {
  Calendar,
  Printer,
  FileSpreadsheet,
  FileDown,
  Trash2,
  Factory,
  Wrench,
  AlertTriangle,
  Inbox,
} from 'lucide-react';

const PRODUCTION_MODELS = [
  'MONO - 7MTs',
  'TRIF - 7MTs',
  'BI+MONO - 7MTs',
  'MURETA',
  'MONO 2CXs - 7MTs',
  '3CXs - 7MTs',
  'TRIF - 8MTs',
  'BI+MONO - 8MTs',
  '2CXs - 8MTs',
  '3CXs - 8MTs',
  'DUPLO T - 7MTs',
  'DUPLO T - 8MTs',
  'DUPLO T - 8.3MTs',
  'DUPLO T - 9MTs',
  'MURETA ÁGUA',
];

type Tab = 'fabricacao' | 'montagem' | 'dia';
type PrintScope = 'all' | 'fabricacao' | 'montagem';

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDayLabel(iso: string) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (isNaN(date.getTime())) return iso;
  const w = date
    .toLocaleDateString('pt-BR', { weekday: 'long' })
    .replace(/^\w/, (c) => c.toUpperCase());
  return `${w} | ${d}-${m}-${y}`;
}

export default function ProductionModule({ user }: { user: any }) {
  const isMainAdmin = !!user?.is_main_admin;
  const perms = (user?.permissions || '').split(',').filter(Boolean);
  const canFab =
    isMainAdmin ||
    user?.role === 'ADMINISTRADOR' ||
    user?.role === 'GERENTE' ||
    perms.includes('production');

  const canAsm =
    isMainAdmin ||
    user?.role === 'ADMINISTRADOR' ||
    user?.role === 'GERENTE' ||
    perms.includes('assembly');
  // MONTAGEM sem "assembly" nas permissões → não vê montagem

  const [tab, setTab] = useState<Tab>(() => {
    if (canFab) return 'fabricacao';
    if (canAsm) return 'montagem';
    return 'dia';
  });
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [qty, setQty] = useState<Record<string, string>>({});
  const [emerg, setEmerg] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [days, setDays] = useState<any[]>([]);
  const [loadingDays, setLoadingDays] = useState(false);
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgePassword, setPurgePassword] = useState('');
  const [purgeBusy, setPurgeBusy] = useState(false);
  const [purgeDate, setPurgeDate] = useState('');
  const [showPrintDay, setShowPrintDay] = useState(false);
  const [printDate, setPrintDate] = useState('');
  const [printScope, setPrintScope] = useState<PrintScope>('all');

  const loadDays = useCallback(async () => {
    setLoadingDays(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (filterFrom) qs.set('date_from', filterFrom);
      if (filterTo) qs.set('date_to', filterTo);
      const data = await request(`/production/by-day?${qs.toString()}`);
      setDays(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message);
      setDays([]);
    } finally {
      setLoadingDays(false);
    }
  }, [filterFrom, filterTo]);

  useEffect(() => {
    if (tab === 'dia') loadDays();
  }, [tab, loadDays]);

  const linesPreview = useMemo(() => {
    return PRODUCTION_MODELS.map((model) => ({
      model,
      quantity: Number(qty[model] || 0),
      emergency_altered: Number(emerg[model] || 0),
    })).filter((l) => l.quantity > 0 || l.emergency_altered > 0);
  }, [qty, emerg]);

  function openConfirm() {
    setError('');
    setOkMsg('');
    if (!date) {
      setError('Informe a data.');
      return;
    }
    if (!linesPreview.length) {
      setError('Informe a quantidade de pelo menos um modelo.');
      return;
    }
    setConfirmOpen(true);
  }

  async function submitBatch() {
    const kind = tab === 'montagem' ? 'montagem' : 'fabricacao';
    setSaving(true);
    setError('');
    try {
      await request('/production/batch', {
        method: 'POST',
        body: JSON.stringify({
          kind,
          production_date: date,
          notes: notes || null,
          lines: linesPreview,
        }),
      });
      setConfirmOpen(false);
      setQty({});
      setEmerg({});
      setNotes('');
      setOkMsg('Lançamento registrado.');
      setTab('dia');
      loadDays();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function buildDayRows(day: any, scope: PrintScope) {
    const rows: (string | number)[][] = [];
    if (scope === 'all' || scope === 'fabricacao') {
      (day.fabricacao || []).forEach((x: any) => {
        rows.push(['Fabricação', x.model, x.quantity, x.emergency_altered || 0]);
      });
    }
    if (scope === 'all' || scope === 'montagem') {
      (day.montagem || []).forEach((x: any) => {
        rows.push(['Montagem', x.model, x.quantity, x.emergency_altered || 0]);
      });
    }
    return rows;
  }

  function printSelectedDay() {
    setError('');
    if (!printDate) {
      setError('Selecione o dia para imprimir.');
      return;
    }
    const day = days.find((d: any) => d.date === printDate);
    if (!day) {
      setError('Não há lançamento nesse dia no filtro atual. Use Filtrar.');
      return;
    }
    const rows = buildDayRows(day, printScope);
    if (!rows.length) {
      setError('Nada para imprimir nesse dia / tipo.');
      return;
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 12;
    let y = 12;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('LOGÍSTICAS BILL — Produção do dia', margin, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Data: ${formatDayLabel(printDate)}`, margin, y);
    y += 5;
    const tipo =
      printScope === 'all'
        ? 'Fabricação + Montagem'
        : printScope === 'fabricacao'
        ? 'Somente fabricação'
        : 'Somente montagem';
    doc.text(`Tipo: ${tipo}`, margin, y);
    y += 8;

    autoTable(doc, {
      startY: y,
      head: [['Tipo', 'Modelo', 'Quantidade', 'Emergência']],
      body: rows,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 1.2 },
      headStyles: { fillColor: [15, 40, 70], textColor: 255 },
    });

    doc.save(`Producao_${printDate}_${printScope}.pdf`);
    setShowPrintDay(false);
  }

  function backupExcel() {
    setError('');
    if (!days.length) {
      setError('Nada para exportar. Filtre o período antes.');
      return;
    }
    const flat: any[] = [];
    days.forEach((day: any) => {
      (day.fabricacao || []).forEach((x: any) => {
        flat.push({
          Data: day.date,
          Tipo: 'Fabricação',
          Modelo: x.model,
          Quantidade: x.quantity,
          Emergencia: x.emergency_altered || 0,
        });
      });
      (day.montagem || []).forEach((x: any) => {
        flat.push({
          Data: day.date,
          Tipo: 'Montagem',
          Modelo: x.model,
          Quantidade: x.quantity,
          Emergencia: x.emergency_altered || 0,
        });
      });
    });
    if (!flat.length) {
      setError('Período sem linhas de produção.');
      return;
    }
    const ws = XLSX.utils.json_to_sheet(flat);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Producao');
    XLSX.writeFile(
      wb,
      `backup_producao_${filterFrom || 'ini'}_${filterTo || 'fim'}.xlsx`
    );
    setOkMsg(`Backup Excel gerado (${flat.length} linhas).`);
  }

  function backupPdfPeriodo() {
    setError('');
    if (!days.length) {
      setError('Nada para exportar. Filtre o período antes.');
      return;
    }
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const margin = 10;
    let y = 12;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('LOGÍSTICAS BILL — Backup produção (período)', margin, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Filtro: ${filterFrom || '…'} → ${filterTo || '…'}`, margin, y);
    y += 6;

    const body: any[] = [];
    days.forEach((day: any) => {
      buildDayRows(day, 'all').forEach((r) => {
        body.push([formatDayLabel(day.date), r[0], r[1], r[2], r[3]]);
      });
    });

    autoTable(doc, {
      startY: y,
      head: [['Data', 'Tipo', 'Modelo', 'Qtd', 'Emergência']],
      body,
      margin: { left: margin, right: margin },
      styles: { fontSize: 7, cellPadding: 1 },
      headStyles: { fillColor: [15, 40, 70], textColor: 255 },
    });

    doc.save(`backup_producao_${filterFrom || 'ini'}_${filterTo || 'fim'}.pdf`);
    setOkMsg('Backup PDF do período gerado.');
  }

  function openPurgeDay(dayIso: string) {
    setPurgeDate(dayIso);
    setPurgePassword('');
    setPurgeOpen(true);
  }

  async function confirmPurge() {
    if (!purgeDate) return;
    setPurgeBusy(true);
    setError('');
    try {
      const dia = purgeDate;
      const res = await request('/production/purge', {
        method: 'POST',
        body: JSON.stringify({
          password: purgePassword,
          date_from: dia,
          date_to: dia,
          confirm_text: 'APAGAR PRODUCAO',
        }),
      });
      setPurgeOpen(false);
      setPurgeDate('');
      setOkMsg(
        `Apagados ${res.deleted} registros do dia ${dia.split('-').reverse().join('/')}.`
      );
      loadDays();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPurgeBusy(false);
    }
  }

  function renderForm(kind: 'fabricacao' | 'montagem') {
    return (
      <section className="rounded-xl bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-slate-900">
          {kind === 'fabricacao' ? 'Produção do dia (fábrica)' : 'Montagem de padrões'}
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Informe as quantidades. Depois confira no modal e confirme.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Data *</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border p-2"
            />
          </label>
        </div>
        <div className="mt-4 max-h-[420px] overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Modelo</th>
                <th className="px-3 py-2 text-left">Quantidade</th>
                {kind === 'montagem' && (
                  <th className="px-3 py-2 text-left">Postes alterados (emergência)</th>
                )}
              </tr>
            </thead>
            <tbody>
              {PRODUCTION_MODELS.map((model) => (
                <tr key={model} className="border-t">
                  <td className="px-3 py-2 font-medium text-slate-800">{model}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={qty[model] || ''}
                      onChange={(e) =>
                        setQty((s) => ({ ...s, [model]: e.target.value }))
                      }
                      className="w-28 rounded-lg border p-2"
                      placeholder="0"
                    />
                  </td>
                  {kind === 'montagem' && (
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={emerg[model] || ''}
                        onChange={(e) =>
                          setEmerg((s) => ({ ...s, [model]: e.target.value }))
                        }
                        className="w-28 rounded-lg border p-2"
                        placeholder="0"
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <label className="mt-4 block text-sm">
          <span className="mb-1 block text-slate-600">Observação</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-20 w-full rounded-lg border p-2"
            placeholder="Opcional"
          />
        </label>
        <button
          type="button"
          onClick={openConfirm}
          className="mt-4 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white"
        >
          Revisar e enviar
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Produção</h2>
        <p className="mt-1 text-sm text-slate-500">
          Fabricação e montagem de postes — lançamentos diários.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {canFab && (
          <button
            type="button"
            onClick={() => {
              setTab('fabricacao');
              setOkMsg('');
              setError('');
            }}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${
              tab === 'fabricacao' ? 'border-brand bg-brand text-white' : 'bg-white'
            }`}
          >
            Lançar produção
          </button>
        )}
        {canAsm && (
          <button
            type="button"
            onClick={() => {
              setTab('montagem');
              setOkMsg('');
              setError('');
            }}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${
              tab === 'montagem' ? 'border-brand bg-brand text-white' : 'bg-white'
            }`}
          >
            Lançar montagem
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setTab('dia');
            setOkMsg('');
            setError('');
          }}
          className={`rounded-lg border px-3 py-2 text-sm font-medium ${
            tab === 'dia' ? 'border-brand bg-brand text-white' : 'bg-white'
          }`}
        >
          Produção do dia
        </button>
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

      {tab === 'fabricacao' && canFab && renderForm('fabricacao')}
      {tab === 'montagem' && canAsm && renderForm('montagem')}

      {tab === 'dia' && (
        <section className="rounded-xl bg-white p-5 shadow-sm">
          {/* Filtros + ações */}
          <div className="mb-5 flex flex-col gap-4 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="grid grid-cols-2 gap-3 sm:contents">
                <label className="text-sm">
                  <span className="mb-1 flex items-center gap-1 text-slate-600">
                    <Calendar size={14} className="text-slate-400" />
                    De
                  </span>
                  <input
                    type="date"
                    value={filterFrom}
                    onChange={(e) => setFilterFrom(e.target.value)}
                    className="w-36 rounded-lg border p-2 sm:w-auto"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 flex items-center gap-1 text-slate-600">
                    <Calendar size={14} className="text-slate-400" />
                    Até
                  </span>
                  <input
                    type="date"
                    value={filterTo}
                    onChange={(e) => setFilterTo(e.target.value)}
                    className="w-36 rounded-lg border p-2 sm:w-auto"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={loadDays}
                className="w-full rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 sm:w-auto"
              >
                Filtrar
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <button
                type="button"
                onClick={() => {
                  setPrintDate(days[0]?.date || filterFrom || '');
                  setPrintScope('all');
                  setShowPrintDay(true);
                }}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:w-auto sm:justify-start"
              >
                <Printer size={15} />
                Imprimir dia (PDF)
              </button>
              <button
                type="button"
                onClick={backupExcel}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-600 px-3.5 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 sm:w-auto sm:justify-start"
              >
                <FileSpreadsheet size={15} />
                Backup Excel
              </button>
              <button
                type="button"
                onClick={backupPdfPeriodo}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:w-auto sm:justify-start"
              >
                <FileDown size={15} />
                Backup PDF (período)
              </button>
            </div>
          </div>

          {loadingDays ? (
            <p className="text-sm text-slate-500">Carregando…</p>
          ) : (
            <div className="space-y-4">
              {days.map((d) => (
                <div key={d.date} className="overflow-hidden rounded-xl border">
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-3">
                    <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                      <Calendar size={16} className="text-slate-400" />
                      {formatDayLabel(d.date)}
                    </h3>
                    <button
                      type="button"
                      onClick={() => openPurgeDay(d.date)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                    >
                      <Trash2 size={13} />
                      Apagar este dia
                    </button>
                  </div>

                  <div className="grid gap-4 p-4 lg:grid-cols-2">
                    {canFab && (
                      <div className="rounded-lg bg-slate-50/60 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <Factory size={13} />
                            Fabricação
                          </p>
                          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-semibold tabular-nums text-white">
                            {d.fabricacao_total}
                          </span>
                        </div>
                        <ul className="divide-y divide-slate-200/70 text-sm">
                          {(d.fabricacao || []).map((x: any) => (
                            <li key={x.id} className="flex items-center justify-between gap-2 py-1.5">
                              <span className="text-slate-700">{x.model}</span>
                              <span className="rounded-md bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-700 shadow-sm">
                                {x.quantity}
                              </span>
                            </li>
                          ))}
                          {!d.fabricacao?.length && (
                            <li className="py-1.5 text-slate-400">Sem lançamento</li>
                          )}
                        </ul>
                      </div>
                    )}
                    {canAsm && (
                      <div className="rounded-lg bg-slate-50/60 p-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
                          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <Wrench size={13} />
                            Montagem
                          </p>
                          <div className="flex items-center gap-1.5">
                            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-semibold tabular-nums text-white">
                              {d.montagem_total}
                            </span>
                            {d.emergency_total > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                                <AlertTriangle size={11} />
                                {d.emergency_total}
                              </span>
                            )}
                          </div>
                        </div>
                        <ul className="divide-y divide-slate-200/70 text-sm">
                          {(d.montagem || []).map((x: any) => (
                            <li key={x.id} className="flex items-center justify-between gap-2 py-1.5">
                              <span className="text-slate-700">
                                {x.model}
                                {x.emergency_altered > 0 && (
                                  <span className="ml-1.5 text-xs text-amber-700">
                                    (+{x.emergency_altered} alt.)
                                  </span>
                                )}
                              </span>
                              <span className="rounded-md bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-700 shadow-sm">
                                {x.quantity}
                              </span>
                            </li>
                          ))}
                          {!d.montagem?.length && (
                            <li className="py-1.5 text-slate-400">Sem lançamento</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {!days.length && (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-10 text-slate-400">
                  <Inbox size={28} />
                  <p className="text-sm">Nenhum registro no período.</p>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Confirmar lançamento</h3>
            <p className="mt-1 text-sm text-slate-500">
              {tab === 'montagem' ? 'Montagem' : 'Produção'} ·{' '}
              {date.split('-').reverse().join('/')}
            </p>
            <ul className="mt-4 max-h-60 space-y-1 overflow-y-auto text-sm">
              {linesPreview.map((l) => (
                <li key={l.model} className="flex justify-between border-b py-1">
                  <span>{l.model}</span>
                  <span className="tabular-nums">
                    {l.quantity}
                    {l.emergency_altered > 0 ? ` · alt. ${l.emergency_altered}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={submitBatch}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving ? 'Salvando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPrintDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Imprimir produção do dia</h3>
            <p className="mt-1 text-sm text-slate-500">
              Escolha a data e o que incluir no PDF.
            </p>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-slate-600">Dia *</span>
              <select
                value={printDate}
                onChange={(e) => setPrintDate(e.target.value)}
                className="w-full rounded-lg border p-2"
              >
                <option value="">Selecione</option>
                {days.map((d: any) => (
                  <option key={d.date} value={d.date}>
                    {formatDayLabel(d.date)}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-slate-600">Conteúdo</span>
              <select
                value={printScope}
                onChange={(e) => setPrintScope(e.target.value as PrintScope)}
                className="w-full rounded-lg border p-2"
              >
                <option value="all">Fabricação + Montagem</option>
                <option value="fabricacao">Só fabricação</option>
                <option value="montagem">Só montagem</option>
              </select>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPrintDay(false)}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={printSelectedDay}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
              >
                Gerar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {purgeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-red-700">Apagar produção do dia</h3>
            <p className="mt-2 text-sm text-slate-600">
              Será apagado somente o dia{' '}
              <strong>
                {purgeDate ? purgeDate.split('-').reverse().join('/') : '—'}
              </strong>
              . Use Backup Excel antes se ainda precisar dos dados.
            </p>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-slate-600">Sua senha *</span>
              <input
                type="password"
                value={purgePassword}
                onChange={(e) => setPurgePassword(e.target.value)}
                className="w-full rounded-lg border p-2"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPurgeOpen(false)}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={purgeBusy || !purgePassword}
                onClick={confirmPurge}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {purgeBusy ? 'Apagando…' : 'Confirmar exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}