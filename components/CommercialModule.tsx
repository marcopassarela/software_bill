'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { request } from '@/lib/api';

type Tab = 'produtos' | 'orcamentos' | 'consultas';

function money(n: number) {
  return (Number(n) || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function CommercialModule({ user }: { user: any }) {
  const isMainAdmin = !!user?.is_main_admin;
  const perms = (user?.permissions || '').split(',').filter(Boolean);
  const canWrite =
    isMainAdmin ||
    perms.includes('commercial') ||
    user?.role === 'ADMINISTRADOR' ||
    user?.role === 'GERENTE' ||
    user?.role === 'VENDEDOR';

  const [tab, setTab] = useState<Tab>('produtos');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // produtos
  const [products, setProducts] = useState<any[]>([]);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [productForm, setProductForm] = useState({
    name: '',
    price: '',
    code: '',
    unit: 'UN',
    category: '',
    notes: '',
    active: true,
  });
  const [savingProduct, setSavingProduct] = useState(false);

  // orçamentos
  const [orders, setOrders] = useState<any[]>([]);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [orderForm, setOrderForm] = useState({
    status: 'ORCAMENTO',
    client_name: '',
    client_phone: '',
    order_date: todayISO(),
    notes: '',
  });
  const [orderItems, setOrderItems] = useState<
    { product_id: string; quantity: string; unit_price: string }[]
  >([{ product_id: '', quantity: '1', unit_price: '' }]);
  const [savingOrder, setSavingOrder] = useState(false);

  // consultas
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterProductId, setFilterProductId] = useState('');
  const [consulta, setConsulta] = useState<{ lines: any[]; summary: any } | null>(
    null
  );
  const [loadingConsulta, setLoadingConsulta] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setProducts(await request('/commercial/products'));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setOrders(await request('/commercial/orders'));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'produtos') loadProducts();
    if (tab === 'orcamentos') {
      loadProducts();
      loadOrders();
    }
    if (tab === 'consultas') loadProducts();
  }, [tab, loadProducts, loadOrders]);

  function openNewProduct() {
    setEditingProduct(null);
    setProductForm({
      name: '',
      price: '',
      code: '',
      unit: 'UN',
      category: '',
      notes: '',
      active: true,
    });
  }

  function openEditProduct(p: any) {
    setEditingProduct(p);
    setProductForm({
      name: p.name || '',
      price: String(p.price ?? ''),
      code: p.code || '',
      unit: p.unit || 'UN',
      category: p.category || '',
      notes: p.notes || '',
      active: p.active !== false,
    });
  }

  async function saveProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!productForm.name.trim()) {
      setError('Nome é obrigatório');
      return;
    }
    if (productForm.price === '' || Number.isNaN(Number(productForm.price))) {
      setError('Preço é obrigatório');
      return;
    }
    setSavingProduct(true);
    setError('');
    const body = {
      name: productForm.name.trim(),
      price: Number(productForm.price),
      code: productForm.code.trim() || null,
      unit: productForm.unit || 'UN',
      category: productForm.category.trim() || null,
      notes: productForm.notes.trim() || null,
      active: productForm.active,
    };
    try {
      if (editingProduct) {
        await request(`/commercial/products/${editingProduct.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await request('/commercial/products', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setEditingProduct(null);
      openNewProduct();
      await loadProducts();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingProduct(false);
    }
  }

  async function deleteProduct(id: number) {
    if (!confirm('Excluir este produto/serviço?')) return;
    try {
      await request(`/commercial/products/${id}`, { method: 'DELETE' });
      await loadProducts();
    } catch (e: any) {
      setError(e.message);
    }
  }

  function setItem(i: number, key: string, value: string) {
    setOrderItems((rows) => {
      const next = [...rows];
      next[i] = { ...next[i], [key]: value };
      if (key === 'product_id' && value) {
        const p = products.find((x) => String(x.id) === value);
        if (p) next[i].unit_price = String(p.price ?? '');
      }
      return next;
    });
  }

  const orderTotal = useMemo(() => {
    return orderItems.reduce((sum, it) => {
      const q = Number(it.quantity) || 0;
      const p = Number(it.unit_price) || 0;
      return sum + q * p;
    }, 0);
  }, [orderItems]);

  async function saveOrder(e: React.FormEvent) {
    e.preventDefault();
    const items = orderItems
      .filter((it) => it.product_id && Number(it.quantity) > 0)
      .map((it) => {
        const p = products.find((x) => String(x.id) === it.product_id);
        return {
          product_id: Number(it.product_id),
          product_name: p?.name || 'Produto',
          product_code: p?.code || null,
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price) || 0,
        };
      });
    if (!items.length) {
      setError('Adicione pelo menos um produto');
      return;
    }
    setSavingOrder(true);
    setError('');
    try {
      await request('/commercial/orders', {
        method: 'POST',
        body: JSON.stringify({
          status: orderForm.status,
          client_name: orderForm.client_name || null,
          client_phone: orderForm.client_phone || null,
          order_date: orderForm.order_date,
          notes: orderForm.notes || null,
          items,
        }),
      });
      setShowOrderForm(false);
      setOrderItems([{ product_id: '', quantity: '1', unit_price: '' }]);
      setOrderForm({
        status: 'ORCAMENTO',
        client_name: '',
        client_phone: '',
        order_date: todayISO(),
        notes: '',
      });
      await loadOrders();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingOrder(false);
    }
  }

  async function setOrderStatus(id: number, status: string) {
    try {
      await request(`/commercial/orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ data: { status } }),
      });
      await loadOrders();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function deleteOrder(id: number) {
    if (!confirm('Excluir este orçamento/venda?')) return;
    try {
      await request(`/commercial/orders/${id}`, { method: 'DELETE' });
      await loadOrders();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function runConsulta(e?: React.FormEvent) {
    e?.preventDefault();
    setLoadingConsulta(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (dateFrom) qs.set('date_from', dateFrom);
      if (dateTo) qs.set('date_to', dateTo);
      if (filterProductId) qs.set('product_id', filterProductId);
      const data = await request(`/commercial/consultas?${qs.toString()}`);
      setConsulta(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingConsulta(false);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'produtos', label: 'Produtos / Serviços' },
    { id: 'orcamentos', label: 'Orçamentos' },
    { id: 'consultas', label: 'Consultas' },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Comercial</h2>
        <p className="mt-1 text-sm text-slate-500">
          Catálogo de produtos/serviços, orçamentos, vendas e consultas de faturamento.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                tab === t.id
                  ? 'border-brand bg-brand text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-brand'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ========== PRODUTOS ========== */}
      {tab === 'produtos' && (
        <div className="grid gap-5 lg:grid-cols-5">
          <section className="rounded-xl bg-white p-5 shadow-sm lg:col-span-2">
            <h3 className="font-semibold text-slate-800">
              {editingProduct ? 'Editar produto' : 'Novo produto / serviço'}
            </h3>
            <form onSubmit={saveProduct} className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Nome *</span>
                <input
                  required
                  value={productForm.name}
                  onChange={(e) =>
                    setProductForm((s) => ({ ...s, name: e.target.value }))
                  }
                  className="w-full rounded-lg border p-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Preço *</span>
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0"
                  value={productForm.price}
                  onChange={(e) =>
                    setProductForm((s) => ({ ...s, price: e.target.value }))
                  }
                  className="w-full rounded-lg border p-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Código</span>
                <input
                  value={productForm.code}
                  onChange={(e) =>
                    setProductForm((s) => ({ ...s, code: e.target.value }))
                  }
                  className="w-full rounded-lg border p-2"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600">Unidade</span>
                  <input
                    value={productForm.unit}
                    onChange={(e) =>
                      setProductForm((s) => ({ ...s, unit: e.target.value }))
                    }
                    className="w-full rounded-lg border p-2"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600">Categoria</span>
                  <input
                    value={productForm.category}
                    onChange={(e) =>
                      setProductForm((s) => ({ ...s, category: e.target.value }))
                    }
                    className="w-full rounded-lg border p-2"
                  />
                </label>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Observação</span>
                <textarea
                  value={productForm.notes}
                  onChange={(e) =>
                    setProductForm((s) => ({ ...s, notes: e.target.value }))
                  }
                  className="h-20 w-full rounded-lg border p-2"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={productForm.active}
                  onChange={(e) =>
                    setProductForm((s) => ({ ...s, active: e.target.checked }))
                  }
                  className="h-4 w-4"
                />
                Ativo
              </label>
              <div className="flex gap-2 pt-1">
                {editingProduct && (
                  <button
                    type="button"
                    onClick={openNewProduct}
                    className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!canWrite || savingProduct}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {savingProduct ? 'Salvando…' : editingProduct ? 'Salvar' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm lg:col-span-3">
            <h3 className="font-semibold text-slate-800">Lista</h3>
            {loading ? (
              <p className="mt-4 text-sm text-slate-500">Carregando…</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Código</th>
                      <th className="px-3 py-2">Nome</th>
                      <th className="px-3 py-2">Preço</th>
                      <th className="px-3 py-2">Status</th>
                      {canWrite && <th className="px-3 py-2">Ações</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p.id} className="border-t">
                        <td className="px-3 py-2 text-slate-600">{p.code || '—'}</td>
                        <td className="px-3 py-2 font-medium">{p.name}</td>
                        <td className="px-3 py-2">{money(p.price)}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              p.active !== false
                                ? 'bg-green-100 text-green-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {p.active !== false ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        {canWrite && (
                          <td className="whitespace-nowrap px-3 py-2">
                            <button
                              type="button"
                              onClick={() => openEditProduct(p)}
                              className="mr-2 rounded bg-slate-100 px-2 py-1 text-xs font-medium"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteProduct(p.id)}
                              className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-600"
                            >
                              Excluir
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {!products.length && (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                          Nenhum produto cadastrado
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ========== ORÇAMENTOS ========== */}
      {tab === 'orcamentos' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold text-slate-800">Orçamentos e vendas</h3>
            {canWrite && (
              <button
                type="button"
                onClick={() => setShowOrderForm((s) => !s)}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
              >
                {showOrderForm ? 'Fechar formulário' : '+ Novo orçamento / venda'}
              </button>
            )}
          </div>

          {showOrderForm && (
            <form
              onSubmit={saveOrder}
              className="rounded-xl bg-white p-5 shadow-sm space-y-4"
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">Tipo *</span>
                  <select
                    value={orderForm.status}
                    onChange={(e) =>
                      setOrderForm((s) => ({ ...s, status: e.target.value }))
                    }
                    className="w-full rounded-lg border p-2"
                  >
                    <option value="ORCAMENTO">Orçamento</option>
                    <option value="VENDIDO">Venda (já faturado)</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">Data *</span>
                  <input
                    type="date"
                    required
                    value={orderForm.order_date}
                    onChange={(e) =>
                      setOrderForm((s) => ({ ...s, order_date: e.target.value }))
                    }
                    className="w-full rounded-lg border p-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">Cliente</span>
                  <input
                    value={orderForm.client_name}
                    onChange={(e) =>
                      setOrderForm((s) => ({ ...s, client_name: e.target.value }))
                    }
                    className="w-full rounded-lg border p-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">Telefone</span>
                  <input
                    value={orderForm.client_phone}
                    onChange={(e) =>
                      setOrderForm((s) => ({ ...s, client_phone: e.target.value }))
                    }
                    className="w-full rounded-lg border p-2"
                  />
                </label>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Itens</p>
                {orderItems.map((it, i) => (
                  <div
                    key={i}
                    className="grid gap-2 sm:grid-cols-12 items-end"
                  >
                    <label className="text-sm sm:col-span-5">
                      <span className="mb-1 block text-slate-600">Produto</span>
                      <select
                        value={it.product_id}
                        onChange={(e) => setItem(i, 'product_id', e.target.value)}
                        className="w-full rounded-lg border p-2"
                      >
                        <option value="">Selecione</option>
                        {products
                          .filter((p) => p.active !== false)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.code ? `${p.code} — ` : ''}
                              {p.name} ({money(p.price)})
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="text-sm sm:col-span-2">
                      <span className="mb-1 block text-slate-600">Qtd</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={it.quantity}
                        onChange={(e) => setItem(i, 'quantity', e.target.value)}
                        className="w-full rounded-lg border p-2"
                      />
                    </label>
                    <label className="text-sm sm:col-span-3">
                      <span className="mb-1 block text-slate-600">Preço unit.</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={it.unit_price}
                        onChange={(e) => setItem(i, 'unit_price', e.target.value)}
                        className="w-full rounded-lg border p-2"
                      />
                    </label>
                    <div className="sm:col-span-2 flex gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setOrderItems((rows) =>
                            rows.length > 1 ? rows.filter((_, j) => j !== i) : rows
                          )
                        }
                        className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setOrderItems((rows) => [
                      ...rows,
                      { product_id: '', quantity: '1', unit_price: '' },
                    ])
                  }
                  className="text-sm font-medium text-brand hover:underline"
                >
                  + Linha
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <p className="text-sm text-slate-600">
                  Total:{' '}
                  <strong className="text-lg text-slate-900">{money(orderTotal)}</strong>
                </p>
                <button
                  type="submit"
                  disabled={savingOrder}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {savingOrder ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">Itens</th>
                  {canWrite && <th className="px-3 py-2">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-t align-top">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {o.order_date
                        ? new Date(o.order_date + 'T12:00:00').toLocaleDateString(
                            'pt-BR'
                          )
                        : '—'}
                    </td>
                    <td className="px-3 py-2">{o.client_name || '—'}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          o.status === 'VENDIDO'
                            ? 'bg-green-100 text-green-700'
                            : o.status === 'CANCELADO'
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium">{money(o.total)}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {(o.items || [])
                        .map(
                          (it: any) =>
                            `${it.quantity}× ${it.product_name}`
                        )
                        .join(', ') || '—'}
                    </td>
                    {canWrite && (
                      <td className="whitespace-nowrap px-3 py-2">
                        {o.status === 'ORCAMENTO' && (
                          <button
                            type="button"
                            onClick={() => setOrderStatus(o.id, 'VENDIDO')}
                            className="mr-2 rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700"
                          >
                            Marcar vendido
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteOrder(o.id)}
                          className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-600"
                        >
                          Excluir
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {!orders.length && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                      Nenhum orçamento/venda
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========== CONSULTAS ========== */}
      {tab === 'consultas' && (
        <div className="space-y-5">
          <form
            onSubmit={runConsulta}
            className="rounded-xl bg-white p-5 shadow-sm grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Data inicial</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-lg border p-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Data final</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-lg border p-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Produto (opcional)</span>
              <select
                value={filterProductId}
                onChange={(e) => setFilterProductId(e.target.value)}
                className="w-full rounded-lg border p-2"
              >
                <option value="">Todos</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={loadingConsulta}
                className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {loadingConsulta ? 'Consultando…' : 'Consultar vendas'}
              </button>
            </div>
          </form>

          {consulta && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase text-slate-500">Pedidos</p>
                  <p className="mt-1 text-2xl font-bold">
                    {consulta.summary?.orders_count ?? 0}
                  </p>
                </div>
                <div className="rounded-xl bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase text-slate-500">Qtd. vendida</p>
                  <p className="mt-1 text-2xl font-bold">
                    {Number(consulta.summary?.quantity_total || 0).toLocaleString(
                      'pt-BR'
                    )}
                  </p>
                </div>
                <div className="rounded-xl bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase text-slate-500">Faturamento</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-700">
                    {money(consulta.summary?.revenue_total || 0)}
                  </p>
                </div>
                <div className="rounded-xl bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase text-slate-500">Ticket médio</p>
                  <p className="mt-1 text-2xl font-bold">
                    {money(consulta.summary?.avg_ticket || 0)}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
                <table className="w-full min-w-[700px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Data</th>
                      <th className="px-3 py-2">Cliente</th>
                      <th className="px-3 py-2">Código</th>
                      <th className="px-3 py-2">Produto</th>
                      <th className="px-3 py-2">Qtd</th>
                      <th className="px-3 py-2">Unit.</th>
                      <th className="px-3 py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(consulta.lines || []).map((l: any, i: number) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2 whitespace-nowrap">
                          {l.order_date
                            ? new Date(l.order_date + 'T12:00:00').toLocaleDateString(
                                'pt-BR'
                              )
                            : '—'}
                        </td>
                        <td className="px-3 py-2">{l.client_name || '—'}</td>
                        <td className="px-3 py-2">{l.product_code || '—'}</td>
                        <td className="px-3 py-2 font-medium">{l.product_name}</td>
                        <td className="px-3 py-2">{l.quantity}</td>
                        <td className="px-3 py-2">{money(l.unit_price)}</td>
                        <td className="px-3 py-2 font-medium">
                          {money(l.line_total)}
                        </td>
                      </tr>
                    ))}
                    {!consulta.lines?.length && (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-3 py-6 text-center text-slate-400"
                        >
                          Nenhuma venda no período
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}