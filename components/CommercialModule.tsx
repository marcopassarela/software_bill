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
    </div>
  );
}