'use client';

import { useCallback, useEffect, useState } from 'react';
import { request } from '@/lib/api';

function money(n: number) {
  return (Number(n) || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function nextProductCode(products: any[]): string {
  let max = 0;
  for (const p of products) {
    const n = parseInt(String(p.code || '').replace(/\D/g, ''), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return String(max + 1).padStart(2, '0');
}

function sortByCode(list: any[]) {
  return [...list].sort((a, b) => {
    const na = parseInt(String(a.code || '').replace(/\D/g, ''), 10);
    const nb = parseInt(String(b.code || '').replace(/\D/g, ''), 10);
    const aNum = Number.isNaN(na) ? 999999 : na;
    const bNum = Number.isNaN(nb) ? 999999 : nb;
    if (aNum !== bNum) return aNum - bNum;
    return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
  });
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

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [productForm, setProductForm] = useState({
    name: '',
    price: '',
    code: '01',
    unit: 'UN',
    notes: '',
    active: true,
  });
  const [savingProduct, setSavingProduct] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = sortByCode(await request('/commercial/products'));
      setProducts(list);
      setEditingProduct((current: any | null) => {
        if (!current) {
          setProductForm({
            name: '',
            price: '',
            code: nextProductCode(list),
            unit: 'UN',
            notes: '',
            active: true,
          });
        }
        return current;
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  function openNewProduct(list = products) {
    setEditingProduct(null);
    setProductForm({
      name: '',
      price: '',
      code: nextProductCode(list),
      unit: 'UN',
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
      code: productForm.code.trim() || nextProductCode(products),
      unit: productForm.unit || 'UN',
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
      setEditingProduct(null);
      await loadProducts();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Comercial — Produtos / Serviços</h2>
        <p className="mt-1 text-sm text-slate-500">
          Cadastre os produtos da fábrica. O código sobe sozinho (01, 02, 03…). Use no nome o
          padrão que aparece no Agendamento para o relatório cruzar certo.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        <section className="rounded-xl bg-white p-5 shadow-sm lg:col-span-2">
          <h3 className="font-semibold text-slate-800">
            {editingProduct ? 'Editar produto' : 'Novo produto / serviço'}
          </h3>
          <form onSubmit={saveProduct} className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Código</span>
              <input
                value={productForm.code}
                onChange={(e) => setProductForm((s) => ({ ...s, code: e.target.value }))}
                className="w-full rounded-lg border p-2"
                placeholder="01"
              />
              <span className="mt-1 block text-xs text-slate-500">
                Automático (01, 02, 03…). Pode alterar se precisar.
              </span>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Nome *</span>
              <input
                required
                value={productForm.name}
                onChange={(e) => setProductForm((s) => ({ ...s, name: e.target.value }))}
                className="w-full rounded-lg border p-2"
                placeholder="Ex: Monofásico 1 Caixa 7 Metros aéreo"
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
                onChange={(e) => setProductForm((s) => ({ ...s, price: e.target.value }))}
                className="w-full rounded-lg border p-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Unidade</span>
              <input
                value={productForm.unit}
                onChange={(e) => setProductForm((s) => ({ ...s, unit: e.target.value }))}
                className="w-full rounded-lg border p-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Observação</span>
              <textarea
                value={productForm.notes}
                onChange={(e) => setProductForm((s) => ({ ...s, notes: e.target.value }))}
                className="h-20 w-full rounded-lg border p-2"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={productForm.active}
                onChange={(e) => setProductForm((s) => ({ ...s, active: e.target.checked }))}
                className="h-4 w-4"
              />
              Ativo
            </label>
            <div className="flex gap-2 pt-1">
              {editingProduct && (
                <button
                  type="button"
                  onClick={() => openNewProduct()}
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
          <h3 className="font-semibold text-slate-800">Lista (por código)</h3>
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
                      <td className="px-3 py-2 font-medium text-slate-700">{p.code || '—'}</td>
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
    </div>
  );
}