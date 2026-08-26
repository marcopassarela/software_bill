'use client';
import { StockMovementForm, printProductLabels } from './QrTools';
import React, { useEffect, useState } from 'react';
import { request } from '@/lib/api';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import {
  BarChart3,
  Box,
  ClipboardList,
  Fuel,
  Settings,
  Truck,
  Users,
  UserRound,
  Wrench,
  LogOut,
  LayoutDashboard,
  PackagePlus,
  PackageMinus,
  Menu,
  X,
  CalendarDays,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

const items = [
  ['dashboard', 'Dashboard', LayoutDashboard],
  ['schedule', 'Agendamento', CalendarDays],
  ['vehicles', 'Veículos', Truck],
  ['drivers', 'Motoristas', UserRound],
  ['maintenance', 'Manutenção', Wrench],
  ['fuel', 'Combustível', Fuel],
  ['stock', 'Estoque', Box],
  ['entry', 'Entradas', PackagePlus],
  ['output', 'Saídas', PackageMinus],
  ['movements', 'Movimentações', ClipboardList],
  ['reports', 'Relatórios', BarChart3],
  ['users', 'Usuários', Users],
  ['settings', 'Configurações', Settings],
] as const;

const resource: any = {
  vehicles: 'vehicles',
  drivers: 'drivers',
  maintenance: 'maintenance',
  fuel: 'fuel',
  stock: 'products',
  settings: 'settings',
};

const moduleAccess: any = {
  ADMINISTRADOR: ['*'],
  GERENTE: ['dashboard', 'schedule', 'vehicles', 'drivers', 'maintenance', 'fuel', 'stock', 'reports'],
  LOGÍSTICA: ['dashboard', 'vehicles', 'drivers', 'fuel'],
  ALMOXARIFADO: ['dashboard', 'stock', 'entry', 'output', 'movements'],
  ESTOQUE: ['dashboard', 'stock', 'entry', 'output', 'movements'], // se ainda existir
  MOTORISTA: [],
  VENDEDOR: ['dashboard', 'schedule'], // vê agenda; edição vem das permissões finas
  CONSULTA: ['dashboard', 'schedule', 'vehicles', 'drivers', 'maintenance', 'fuel', 'stock', 'reports'],
};

function titleFor(k: string) {
  return (
    ({
      dashboard: 'Dashboard',
      schedule: 'Agendamento',
      vehicles: 'Veículos',
      drivers: 'Motoristas',
      maintenance: 'Manutenção',
      fuel: 'Combustível',
      stock: 'Estoque',
      settings: 'Configurações',
      entry: 'Entradas',
      output: 'Saídas',
      movements: 'Movimentações',
      reports: 'Relatórios',
      users: 'Usuários',
    } as any)[k] || k
  );
}

const MODULE_OPTIONS = [
  ...items
    .filter(([k]) => k !== 'users')
    .map(([k, label]) => ({ value: k as string, label: label as string })),
  // Permissões finas do Agendamento
  { value: 'schedule_edit', label: 'Agendamento → Editar / Adicionar' },
  { value: 'schedule_delete', label: 'Agendamento → Excluir' },
  { value: 'schedule_export', label: 'Agendamento → Exportar TXT/PDF' },
  { value: 'schedule_archive', label: 'Agendamento → Arquivar semana (backup)' },
];

function expandPermissions(keys: string[]): string[] {
  const s = new Set(keys);
  if (s.has('stock')) {
    s.add('entry');
    s.add('output');
    s.add('movements');
  }
  if (s.has('entry') || s.has('output') || s.has('movements')) {
    s.add('stock');
  }
  return Array.from(s);
}

function resourceIdOf(page: string, row: any) {
  return page === 'settings' ? row.key : row.id;
}

type FieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'datetime'
  | 'select'
  | 'textarea'
  | 'vehicle'
  | 'driver'
  | 'product'
  | 'modules';
type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  step?: string;
};

const FIELDS: Record<string, FieldDef[]> = {
  vehicles: [
    { key: 'plate', label: 'Placa', type: 'text', required: true },
    { key: 'brand', label: 'Marca', type: 'text', required: true },
    { key: 'model', label: 'Modelo', type: 'text', required: true },
    { key: 'year', label: 'Ano', type: 'number' },
    { key: 'type', label: 'Tipo', type: 'text' },
    { key: 'capacity', label: 'Capacidade (kg)', type: 'number', step: '0.01' },
    { key: 'average_consumption', label: 'Consumo médio (km/l)', type: 'number', step: '0.01' },
    { key: 'current_km', label: 'KM atual', type: 'number', step: '0.01' },
    {
      key: 'fuel_type',
      label: 'Combustível',
      type: 'select',
      options: ['Diesel', 'Gasolina', 'Etanol', 'Flex', 'Elétrico'],
    },
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      options: ['Disponível', 'Em rota', 'Manutenção', 'Inativo'],
    },
    { key: 'notes', label: 'Observações', type: 'textarea' },
  ],
  drivers: [
    { key: 'name', label: 'Nome', type: 'text', required: true },
    { key: 'cpf', label: 'CPF', type: 'text', required: true },
    { key: 'phone', label: 'Telefone', type: 'text' },
    { key: 'cnh', label: 'CNH', type: 'text', required: true },
    {
      key: 'category',
      label: 'Categoria CNH',
      type: 'select',
      options: ['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'],
    },
    { key: 'cnh_expiry', label: 'Validade CNH', type: 'date' },
    { key: 'vehicle_id', label: 'Veículo', type: 'vehicle' },
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      options: ['Ativo', 'Inativo', 'Férias', 'Afastado'],
    },
    { key: 'notes', label: 'Observações', type: 'textarea' },
  ],
  maintenance: [
    { key: 'vehicle_id', label: 'Veículo', type: 'vehicle', required: true },
    {
      key: 'type',
      label: 'Tipo',
      type: 'select',
      options: ['Preventiva', 'Corretiva'],
      required: true,
    },
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      options: ['Agendado', 'Em andamento', 'Concluído', 'Atrasado'],
      required: true,
    },
    { key: 'description', label: 'Descrição', type: 'textarea', required: true },
    { key: 'date', label: 'Data e hora agendada', type: 'datetime', required: true },
    { key: 'km', label: 'KM no serviço', type: 'number', step: '0.01' },
    { key: 'next_km', label: 'Próxima KM', type: 'number', step: '0.01' },
    { key: 'next_date', label: 'Próxima data', type: 'date' },
    { key: 'value', label: 'Valor', type: 'number', step: '0.01' },
    { key: 'workshop', label: 'Oficina', type: 'text' },
    { key: 'responsible', label: 'Responsável', type: 'text' },
    { key: 'notes', label: 'Observações', type: 'textarea' },
  ],
  fuel: [
    { key: 'vehicle_id', label: 'Veículo', type: 'vehicle', required: true },
    { key: 'driver_id', label: 'Motorista', type: 'driver' },
    { key: 'date', label: 'Data', type: 'date', required: true },
    { key: 'km', label: 'KM', type: 'number', step: '0.01', required: true },
    { key: 'liters', label: 'Litros', type: 'number', step: '0.001', required: true },
    {
      key: 'price_per_liter',
      label: 'Preço por litro',
      type: 'number',
      step: '0.001',
      required: true,
    },
    {
      key: 'total_value',
      label: 'Valor total',
      type: 'number',
      step: '0.01',
      required: true,
    },
    { key: 'station', label: 'Posto', type: 'text' },
    {
      key: 'fuel_type',
      label: 'Combustível',
      type: 'select',
      options: ['Diesel', 'Gasolina', 'Etanol', 'Flex'],
    },
  ],
  stock: [
    { key: 'code', label: 'Código', type: 'text', required: true },
    { key: 'name', label: 'Nome', type: 'text', required: true },
    { key: 'model', label: 'Modelo', type: 'text' },
    { key: 'category', label: 'Categoria', type: 'text' },
    { key: 'unit', label: 'Unidade', type: 'text' },
    { key: 'minimum_stock', label: 'Estoque mínimo', type: 'number', step: '0.01' },
    { key: 'location', label: 'Localização', type: 'text' },
    { key: 'supplier', label: 'Fornecedor', type: 'text' },
    { key: 'unit_value', label: 'Valor unitário', type: 'number', step: '0.01' },
    { key: 'notes', label: 'Observações', type: 'textarea' },
  ],
  settings: [
    { key: 'key', label: 'Chave', type: 'text', required: true },
    { key: 'value', label: 'Valor', type: 'text' },
  ],
  entry: [
    { key: 'product_id', label: 'Produto', type: 'product', required: true },
    { key: 'quantity', label: 'Quantidade', type: 'number', step: '0.01', required: true },
    { key: 'responsible', label: 'Responsável', type: 'text' },
    { key: 'sector', label: 'Setor', type: 'text' },
    { key: 'invoice', label: 'Nota fiscal', type: 'text' },
    { key: 'unit_value', label: 'Valor unitário', type: 'number', step: '0.01' },
    { key: 'observation', label: 'Observação', type: 'textarea' },
  ],
  output: [
    { key: 'product_id', label: 'Produto', type: 'product', required: true },
    { key: 'quantity', label: 'Quantidade', type: 'number', step: '0.01', required: true },
    { key: 'responsible', label: 'Responsável (quem entregou)', type: 'text' },
    { key: 'sector', label: 'Setor', type: 'text' },
    { key: 'vehicle_id', label: 'Veículo (se aplicável)', type: 'vehicle' },
    {
      key: 'recipient',
      label: 'Retirado por (nome de quem está pegando o material)',
      type: 'text',
      required: true,
    },
    { key: 'observation', label: 'Observação', type: 'textarea' },
  ],
  users: [
    { key: 'name', label: 'Nome', type: 'text', required: true },
    { key: 'username', label: 'Usuário', type: 'text', required: true },
    { key: 'password', label: 'Senha temporária', type: 'text', required: true },
    {
      key: 'role',
      label: 'Perfil',
      type: 'select',
      options: ['ADMINISTRADOR', 'GERENTE', 'LOGÍSTICA', 'ALMOXARIFADO', 'MOTORISTA', 'VENDEDOR'],
      required: true,
    },
    { key: 'permissions', label: 'Permissões específicas', type: 'modules' },
  ],
};

const USER_EDIT_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Nome completo', type: 'text', required: true },
  { key: 'username', label: 'Nome de usuário (login)', type: 'text', required: true },
  {
    key: 'role',
    label: 'Perfil',
    type: 'select',
    options: ['ADMINISTRADOR', 'GERENTE', 'LOGÍSTICA', 'ALMOXARIFADO', 'MOTORISTA', 'VENDEDOR'],
    required: true,
  },
  { key: 'permissions', label: 'Permissões específicas', type: 'modules' },
  { key: 'active', label: 'Ativo', type: 'select', options: ['Sim', 'Não'], required: true },
  {
    key: 'password',
    label: 'Nova senha (deixe em branco para manter a atual)',
    type: 'text',
  },
];

const LABELS: Record<string, string> = {
  id: 'ID',
  name: 'Nome',
  username: 'Usuário',
  role: 'Perfil',
  active: 'Ativo',
  must_change_password: 'Trocar senha',
  permissions: 'Permissões',
  is_main_admin: 'Admin. Principal',
  status: 'Status',
  plate: 'Placa',
  brand: 'Marca',
  model: 'Modelo',
  year: 'Ano',
  type: 'Tipo',
  capacity: 'Capacidade',
  average_consumption: 'Consumo médio',
  current_km: 'KM atual',
  fuel_type: 'Combustível',
  notes: 'Observações',
  cpf: 'CPF',
  phone: 'Telefone',
  cnh: 'CNH',
  category: 'Categoria',
  cnh_expiry: 'Validade CNH',
  vehicle_id: 'Veículo',
  description: 'Descrição',
  date: 'Data',
  km: 'KM',
  next_km: 'Próxima KM',
  next_date: 'Próxima data',
  value: 'Valor',
  workshop: 'Oficina',
  responsible: 'Responsável',
  liters: 'Litros',
  price_per_liter: 'Preço/litro',
  total_value: 'Valor total',
  station: 'Posto',
  recipient: 'Retirado por',
  code: 'Código',
  minimum_stock: 'Estoque mínimo',
  location: 'Localização',
  supplier: 'Fornecedor',
  unit_value: 'Valor unitário',
  unit: 'Unidade',
  quantity: 'Quantidade',
  key: 'Chave',
  created_at: 'Criado em',
  occurred_at: 'Data',
  product_id: 'Produto',
  user_id: 'Registrado por',
  invoice: 'Nota fiscal',
  observation: 'Observação',
  sector: 'Setor',
};

function labelFor(k: string) {
  return LABELS[k] || k.replace(/_/g, ' ');
}

const HIDDEN_TABLE_COLUMNS: Record<string, string[]> = {
  users: ['permissions'],
};

const TABLE_COLUMNS: Record<string, string[]> = {
  output: [
    'occurred_at',
    'product_id',
    'quantity',
    'responsible',
    'recipient',
    'sector',
    'observation',
  ],
  entry: [
    'occurred_at',
    'product_id',
    'quantity',
    'responsible',
    'sector',
    'invoice',
    'observation',
  ],
  movements: [
    'occurred_at',
    'type',
    'product_id',
    'quantity',
    'responsible',
    'recipient',
    'sector',
  ],
};

function isIsoDateTime(x: any) {
  return typeof x === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(x);
}

function readable(x: any): string {
  if (x === null || x === undefined) return '—';
  if (typeof x === 'boolean') return x ? 'Sim' : 'Não';
  if (isIsoDateTime(x)) {
    const d = new Date(x);
    return isNaN(d.getTime())
      ? x
      : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }
  if (typeof x === 'object') return JSON.stringify(x);
  return String(x);
}

function onlyDigits(v: string) {
  return String(v || '').replace(/\D/g, '');
}

/** Mostra CPF mascarado na listagem: ***.***.***-XX */
function maskCpf(v: any): string {
  const d = onlyDigits(String(v || ''));
  if (d.length < 2) return '—';
  const end = d.slice(-2);
  if (d.length >= 11) return `***.***.***-${end}`;
  return `***-${end}`;
}

function resolveCell(key: string, value: any, lookups: any): string {
  if (value === null || value === undefined) return '—';
  if (key === 'cpf') return maskCpf(value);
  if (key === 'vehicle_id') {
    const v = (lookups.vehicles || []).find((x: any) => x.id === value);
    return v ? `${v.plate} — ${v.brand} ${v.model}` : readable(value);
  }
  if (key === 'driver_id') {
    const d = (lookups.drivers || []).find((x: any) => x.id === value);
    return d ? d.name : readable(value);
  }
  if (key === 'product_id') {
    const p = (lookups.products || []).find((x: any) => x.id === value);
    return p ? `${p.id} — ${p.name}` : readable(value);
  }
  return readable(value);
}

function statusClasses(v: string): string {
  const s = (v || '').toLowerCase();
  if (['concluído', 'concluido', 'disponível', 'disponivel', 'ativo'].includes(s))
    return 'bg-green-100 text-green-700';
  if (['em andamento', 'em rota'].includes(s)) return 'bg-blue-100 text-blue-700';
  if (['atrasado', 'inativo', 'manutenção', 'manutencao'].includes(s))
    return 'bg-red-100 text-red-700';
  return 'bg-slate-100 text-slate-700';
}

export default function AppShell({
  user,
  onLogout,
  onUserUpdate,
}: {
  user: any;
  onLogout: () => void;
  onUserUpdate: (u: any) => void;
}) {
  const isMainAdmin = !!user.is_main_admin;

  const allowed = (key: string) =>
    isMainAdmin ||
    (user.permissions
      ? user.permissions.split(',').includes(key)
      : (moduleAccess[user.role] || []).includes('*') ||
        (moduleAccess[user.role] || []).includes(key));

  // Se o usuário não tem acesso ao Dashboard (ex: só tem "schedule" liberado),
  // já entra direto na primeira aba que ele efetivamente pode ver.
  const [page, setPage] = useState<string>(() => {
    if (allowed('dashboard')) return 'dashboard';
    const first = items.find(([k]) => allowed(k));
    return first ? first[0] : 'dashboard';
  });
  const [rows, setRows] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lookups, setLookups] = useState<{
    vehicles: any[];
    drivers: any[];
    products: any[];
  }>({ vehicles: [], drivers: [], products: [] });
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editingResource, setEditingResource] = useState<any>(null);
  const [editingMovement, setEditingMovement] = useState<any>(null);
  const [showAccount, setShowAccount] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [deletePasswordModal, setDeletePasswordModal] = useState<{
  open: boolean;
  title: string;
  message: string;
  onConfirm: (password: string) => Promise<void>;
  } | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  async function load(p = page) {
    setError('');
    setLoading(true);
    try {
      if (p === 'dashboard') setMetrics(await request('/dashboard'));
      else if (p === 'movements') setRows(await request('/stock/movements'));
      else if (p === 'entry')
        setRows(
          ((await request('/stock/movements')) as any[]).filter((m) => m.type === 'ENTRADA')
        );
      else if (p === 'output')
        setRows(
          ((await request('/stock/movements')) as any[]).filter((m) => m.type === 'SAÍDA')
        );
      else if (p === 'users') setRows(await request('/users'));
      else if (resource[p]) setRows(await request('/' + resource[p]));
      else setRows([]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    setEditingUser(null);
    setEditingResource(null);
    setEditingMovement(null);
  }, [page]);

  useEffect(() => {
    Promise.all([
      request('/vehicles').catch(() => []),
      request('/drivers').catch(() => []),
      request('/products').catch(() => []),
    ]).then(([vehicles, drivers, products]) =>
      setLookups({ vehicles, drivers, products })
    );
  }, []);

  async function create(data: any) {
    setError('');
    try {
      if (page === 'entry' || page === 'output')
        await request('/stock/' + page, { method: 'POST', body: JSON.stringify(data) });
      else
        await request('/' + (page === 'users' ? 'users' : resource[page]), {
          method: 'POST',
          body: JSON.stringify(page === 'users' ? data : { data }),
        });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function updateUser(id: number, data: any) {
    setError('');
    try {
      await request('/users/' + id, { method: 'PATCH', body: JSON.stringify({ data }) });
      setEditingUser(null);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function deleteUser(id: number) {
    if (!confirm('Tem certeza que deseja excluir este usuário?')) return;
    setError('');
    try {
      await request('/users/' + id, { method: 'DELETE' });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function updateResource(id: string | number, data: any) {
    setError('');
    try {
      await request('/' + resource[page] + '/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ data }),
      });
      setEditingResource(null);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function deleteResource(id: string | number) {
    if (!confirm('Tem certeza que deseja excluir este registro?')) return;
    setError('');
    try {
      await request('/' + resource[page] + '/' + id, { method: 'DELETE' });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function updateMovement(id: number, data: any) {
    setError('');
    try {
      await request('/stock/movements/' + id, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      setEditingMovement(null);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

    function askPassword(
    title: string,
    message: string,
    onConfirm: (password: string) => Promise<void>
  ) {
    setDeletePassword('');
    setDeletePasswordModal({ open: true, title, message, onConfirm });
  }

  async function confirmDeleteWithPassword() {
    if (!deletePasswordModal || !deletePassword) return;
    setDeleting(true);
    setError('');
    try {
      await deletePasswordModal.onConfirm(deletePassword);
      setDeletePasswordModal(null);
      setDeletePassword('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  }

  async function deleteMovement(id: number) {
    askPassword(
      'Excluir movimentação',
      'Confirme sua senha. O estoque será ajustado de volta.',
      async (password) => {
        await request('/stock/movements/' + id, {
          method: 'DELETE',
          body: JSON.stringify({ password }),
        });
        load();
      }
    );
  }

  async function logout() {
    await request('/auth/logout', { method: 'POST' }).catch(() => {});
    onLogout();
  }

  function goTo(k: string) {
    setPage(k);
    setMobileMenuOpen(false);
  }

  return (
    <div className="min-h-screen md:flex">
      <div className="flex items-center justify-between bg-navy p-4 text-white md:hidden">
        <span className="flex items-center gap-2 font-bold">
          <img
            src="/icon2.png"
            alt="Logísticas Bill"
            className="h-8 w-auto object-contain"/>
          <span>LOGÍSTICAS BILL</span>
        </span>
        <button onClick={() => setMobileMenuOpen(true)} aria-label="Abrir menu">
          <Menu size={24} />
        </button>
      </div>

      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] transform bg-navy text-slate-200 transition-transform duration-200 md:static md:z-auto md:w-64 md:min-h-screen md:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-5 text-lg font-bold text-white">
          <span className="flex items-center gap-2">
            <img
              src="/icon2.png"
              alt="Logísticas Bill"
              className="h-9 w-auto object-contain"/>
            <span className="text-white">LOGÍSTICAS BILL</span>
          </span>
          <button
            className="md:hidden"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Fechar menu"
          >
            <X size={22} />
          </button>
        </div>
        <nav className="px-2 pb-3">
          {items
            .filter(([k]) => allowed(k))
            .map(([k, label, Icon]) => (
              <button
                key={k}
                onClick={() => goTo(k)}
                className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm ${
                  page === k ? 'bg-cyan-700 text-white' : 'hover:bg-slate-700'
                }`}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
        </nav>
        <button
          onClick={logout}
          className="m-4 flex items-center gap-2 text-sm text-slate-300"
        >
          <LogOut size={17} /> Sair
        </button>
      </aside>

      <main className="min-w-0 flex-1 p-4 md:p-8">
        <header className="mb-7 flex items-center justify-between">
          <h1 className="text-2xl font-bold">
            {page === 'dashboard' ? 'Visão geral' : titleFor(page)}
          </h1>
          <div className="relative">
            <button
              onClick={() => setShowAccount((s) => !s)}
              className="rounded-full bg-white px-3 py-2 text-sm shadow-sm"
            >
              {user.name}
            </button>
            {showAccount && (
              <AccountPanel
                user={user}
                onClose={() => setShowAccount(false)}
                onUserUpdate={onUserUpdate}
              />
            )}
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</div>
        )}

        {page === 'dashboard' ? (
          <Dashboard metrics={metrics} onNavigate={goTo} />
        ) : page === 'schedule' ? (
          <ScheduleModule user={user} lookups={lookups} />
        ) : (
          <Module
            page={page}
            rows={rows}
            loading={loading}
            create={create}
            isAdmin={isMainAdmin}
            lookups={lookups}
            editingUser={editingUser}
            setEditingUser={setEditingUser}
            updateUser={updateUser}
            deleteUser={deleteUser}
            editingResource={editingResource}
            setEditingResource={setEditingResource}
            updateResource={updateResource}
            deleteResource={deleteResource}
            editingMovement={editingMovement}
            setEditingMovement={setEditingMovement}
            updateMovement={updateMovement}
            deleteMovement={deleteMovement}
          />
        )}
      </main>
    {deletePasswordModal?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">
              {deletePasswordModal.title}
            </h3>
            <p className="mt-1 text-sm text-slate-500">{deletePasswordModal.message}</p>

            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-slate-600">Senha *</span>
              <input
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="w-full rounded-lg border p-2"
                placeholder="Digite sua senha"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmDeleteWithPassword();
                }}
              />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeletePasswordModal(null);
                  setDeletePassword('');
                }}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleting || !deletePassword}
                onClick={confirmDeleteWithPassword}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {deleting ? 'Excluindo…' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AccountPanel({
  user,
  onClose,
  onUserUpdate,
}: {
  user: any;
  onClose: () => void;
  onUserUpdate: (u: any) => void;
}) {
  const [name, setName] = useState(user.name || '');
  const [nameMsg, setNameMsg] = useState('');
  const [nameErr, setNameErr] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  async function submitName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    setNameErr('');
    setNameMsg('');
    try {
      const updated = await request('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
      onUserUpdate(updated);
      setNameMsg('Nome atualizado.');
    } catch (e: any) {
      setNameErr(e.message);
    } finally {
      setSavingName(false);
    }
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      await request('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: current,
          new_password: next,
        }),
      });
      setMsg('Senha alterada com sucesso.');
      setCurrent('');
      setNext('');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="absolute right-0 top-14 z-10 w-[min(20rem,90vw)] rounded-xl border bg-white p-4 shadow-lg space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Minha conta</h4>
        <button onClick={onClose} className="text-xs text-slate-500 hover:underline">
          Fechar
        </button>
      </div>
      <form onSubmit={submitName} className="space-y-2" autoComplete="off">
        <p className="text-xs font-medium text-slate-500">Nome</p>
        {nameErr && <p className="text-xs text-red-600">{nameErr}</p>}
        {nameMsg && <p className="text-xs text-green-600">{nameMsg}</p>}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full rounded-lg border p-2 text-sm"
        />
        <button
          disabled={savingName}
          className="w-full rounded-lg bg-slate-100 p-2 text-sm font-medium text-slate-700 disabled:opacity-60"
        >
          {savingName ? 'Salvando…' : 'Salvar nome'}
        </button>
      </form>
      <form onSubmit={submitPassword} className="space-y-2 border-t pt-4" autoComplete="off">
        <p className="text-xs font-medium text-slate-500">Senha</p>
        {err && <p className="text-xs text-red-600">{err}</p>}
        {msg && <p className="text-xs text-green-600">{msg}</p>}
        <input
          type="password"
          autoComplete="off"
          placeholder="Senha atual"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          className="w-full rounded-lg border p-2 text-sm"
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder="Nova senha"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
          minLength={3}
          className="w-full rounded-lg border p-2 text-sm"
        />
        <button
          disabled={saving}
          className="w-full rounded-lg bg-brand p-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? 'Salvando…' : 'Salvar nova senha'}
        </button>
      </form>
    </div>
  );
}

function Dashboard({
  metrics,
  onNavigate,
}: {
  metrics: any;
  onNavigate: (page: string) => void;
}) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setDismissed(localStorage.getItem('maint_alert_dismissed') === today);
  }, []);

  function dismiss() {
    localStorage.setItem(
      'maint_alert_dismissed',
      new Date().toISOString().slice(0, 10)
    );
    setDismissed(true);
  }

  const cards = [
    {
      label: 'Veículos disponíveis',
      value: metrics?.available,
      icon: '🚛',
      page: 'vehicles',
      color: 'from-emerald-500 to-emerald-600',
    },
    {
      label: 'Em manutenção',
      value: metrics?.maintenance,
      icon: '🔧',
      page: 'maintenance',
      color: 'from-amber-500 to-amber-600',
    },
    {
      label: 'Manutenções concluídas',
      value: metrics?.maintenance_completed,
      icon: '✅',
      page: 'maintenance',
      color: 'from-blue-500 to-blue-600',
    },
    {
      label: 'Produtos em estoque',
      value: metrics?.products,
      icon: '📦',
      page: 'stock',
      color: 'from-cyan-500 to-cyan-600',
    },
    {
      label: 'Estoque baixo',
      value: metrics?.low_stock,
      icon: '⚠️',
      page: 'stock',
      color: 'from-red-500 to-red-600',
    },
    {
      label: 'Custo combustível',
      value: metrics?.fuel_cost?.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }),
      icon: '⛽',
      page: 'fuel',
      color: 'from-slate-600 to-slate-800',
    },
  ];

  const fleetData = [
    { name: 'Disponíveis', value: Number(metrics?.available ?? 0), color: '#22c55e' },
    { name: 'Em manutenção', value: Number(metrics?.maintenance ?? 0), color: '#f59e0b' },
    {
      name: 'Concluídas',
      value: Number(metrics?.maintenance_completed ?? 0),
      color: '#3b82f6',
    },
  ].filter((d) => d.value > 0);

  const stockData = [
    { name: 'Em estoque', value: Number(metrics?.products ?? 0) },
    { name: 'Estoque baixo', value: Number(metrics?.low_stock ?? 0) },
  ];

  const hasAlerts =
    !dismissed &&
    (metrics?.maintenance_today > 0 ||
      metrics?.maintenance_overdue > 0 ||
      metrics?.maintenance_alerts?.length > 0);

  return (
    <div className="space-y-6">
      {hasAlerts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl">
                ⚠️
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Aviso de manutenção</h2>
                <p className="text-sm text-slate-500">
                  Existem manutenções que precisam da sua atenção.
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {metrics?.maintenance_today > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="font-semibold text-amber-800">📅 Manutenções de hoje</div>
                  <div className="mt-1 text-sm text-amber-700">
                    Existem <strong>{metrics.maintenance_today}</strong> manutenção(ões)
                    agendada(s) para hoje.
                  </div>
                </div>
              )}
              {metrics?.maintenance_overdue > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <div className="font-semibold text-red-800">🚨 Manutenções atrasadas</div>
                  <div className="mt-1 text-sm text-red-700">
                    Existem <strong>{metrics.maintenance_overdue}</strong> manutenção(ões)
                    atrasada(s).
                  </div>
                </div>
              )}
              {metrics?.maintenance_alerts?.length > 0 && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <div className="font-semibold text-blue-800">🔧 Manutenções em andamento</div>
                  <div className="mt-1 text-sm text-blue-700">
                    Existem <strong>{metrics.maintenance_alerts.length}</strong>{' '}
                    manutenção(ões) atualmente em andamento.
                  </div>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={dismiss}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
              >
                Fechar
              </button>
              <button
                onClick={() => {
                  dismiss();
                  onNavigate('maintenance');
                }}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Ver manutenções
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card, idx) => (
          <article
            key={card.label}
            onClick={() => onNavigate(card.page)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onNavigate(card.page);
              }
            }}
            style={{
              animationDelay: `${idx * 80}ms`,
              animationFillMode: 'both',
            }}
            className="group cursor-pointer rounded-2xl bg-white p-5 shadow-sm opacity-0 animate-[dashIn_0.5s_ease-out_forwards] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl active:scale-[0.98]"
          >
            <div className="flex items-start justify-between">
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${card.color} text-xl text-white shadow-md transition-transform duration-300 group-hover:scale-110`}
              >
                {card.icon}
              </div>
            </div>
            <div className="mt-4 text-2xl font-bold text-slate-900 tabular-nums">
              {card.value ?? '—'}
            </div>
            <div className="mt-1 text-sm text-slate-500">{card.label}</div>
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="dash-chart-enter rounded-2xl bg-white p-5 shadow-sm transition-shadow duration-300 hover:shadow-md">
          <h3 className="mb-1 font-semibold text-slate-800">Frota / Manutenção</h3>
          <p className="mb-4 text-xs text-slate-500">
            Visão geral da frota · meta: até 5 manutenções no período
          </p>
          <div className="h-64">
            {fleetData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                Sem dados para exibir
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={fleetData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={50}
                    paddingAngle={3}
                    label={false}
                    isAnimationActive
                    activeIndex={undefined}
                    onClick={undefined}
                    style={{ outline: 'none', cursor: 'default' }}
                  >
                    {fleetData.map((e, i) => (
                      <Cell
                        key={i}
                        fill={e.color}
                        stroke="none"
                        style={{ outline: 'none', cursor: 'default' }}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [value, name]}
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      fontSize: 12,
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value) => (
                      <span className="text-xs text-slate-600">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          {Number(metrics?.maintenance ?? 0) > 5 && (
            <p className="mt-2 text-center text-xs font-medium text-amber-600">
              Atenção: mais de 5 veículos em manutenção
            </p>
          )}
          {Number(metrics?.maintenance_completed ?? 0) > 5 && (
            <p className="mt-1 text-center text-xs text-slate-500">
              Manutenções concluídas no período: {metrics.maintenance_completed} (acima da
              meta de 5)
            </p>
          )}
        </div>

        <div className="dash-chart-enter rounded-2xl bg-white p-5 shadow-sm transition-shadow duration-300 hover:shadow-md">
          <h3 className="mb-1 font-semibold text-slate-800">Estoque</h3>
          <p className="mb-4 text-xs text-slate-500">
            Produtos cadastrados e alertas de mínimo
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: number) => [value, 'Quantidade']}
                  labelFormatter={(label) => String(label)}
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="value"
                  name="Quantidade"
                  fill="#0ea5e9"
                  radius={[8, 8, 0, 0]}
                  maxBarSize={64}
                  isAnimationActive
                  style={{ cursor: 'default' }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    </div>
  );
}

const REPORT_SOURCES = [
  { value: 'vehicles', label: 'Veículos', path: '/vehicles' },
  { value: 'drivers', label: 'Motoristas', path: '/drivers' },
  { value: 'maintenance', label: 'Manutenção', path: '/maintenance' },
  { value: 'fuel', label: 'Combustível', path: '/fuel' },
  { value: 'products', label: 'Estoque', path: '/products' },
  { value: 'movements', label: 'Movimentações de estoque', path: '/stock/movements' },
  { value: 'schedule', label: 'Agendamento', path: '/schedule/weeks?include_archived=true' },
];

function cleanRowForReport(r: any, lookups: any) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(r)) {
    if (k === 'password_hash') continue;
    let val: any = v;
    if (k === 'vehicle_id' || k === 'driver_id' || k === 'product_id') {
      val = resolveCell(k, v, lookups);
    } else if (isIsoDateTime(v)) {
      const d = new Date(v as string);
      val = isNaN(d.getTime()) ? v : d.toLocaleDateString('pt-BR');
    } else if (v === null || v === undefined) {
      val = '';
    } else if (typeof v === 'boolean') {
      val = v ? 'Sim' : 'Não';
    }
    out[labelFor(k)] = val;
  }
  return out;
}

function exportExcelMulti(datasets: { cfg: any; rows: any[] }[]) {
  const book = XLSX.utils.book_new();
  const today = new Date().toLocaleDateString('pt-BR');
  const data: any[][] = [];

  data.push(['LOGÍSTICAS BILL']);
  data.push([`Relatório geral`]);
  data.push([`Gerado em: ${today}`]);
  data.push([]);

  datasets.forEach(({ cfg, rows }) => {
    data.push([cfg.label]);
    if (!rows.length) {
      data.push(['Nenhum registro encontrado.']);
      data.push([]);
      return;
    }
    const headers = Object.keys(rows[0]);
    data.push(headers);
    rows.forEach((row) => {
      data.push(headers.map((header) => row[header] ?? ''));
    });
    data.push([]);
    data.push([]);
  });

  const sheet = XLSX.utils.aoa_to_sheet(data);
  const columnCount = Math.max(...data.map((row) => row.length));
  const widths = Array.from({ length: columnCount }, (_, colIndex) => {
    let maxLength = 10;
    data.forEach((row) => {
      const value = row[colIndex];
      if (value !== undefined && value !== null) {
        const length = String(value).length;
        if (length > maxLength) maxLength = length;
      }
    });
    return { wch: Math.min(Math.max(maxLength + 2, 10), 35) };
  });
  sheet['!cols'] = widths;
  sheet['!rows'] = data.map(() => ({ hpt: 18 }));
  sheet['!freeze'] = { xSplit: 0, ySplit: 4 };

  XLSX.utils.book_append_sheet(book, sheet, 'Relatório');
  XLSX.writeFile(
    book,
    `Bill_Logistica_Relatorio_${today.replace(/\//g, '-')}.xlsx`
  );
}

function exportPdfMulti(
  datasets: { cfg: any; rows: any[] }[],
  fontSizeOption: 'small' | 'medium' | 'large'
) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });
  const today = new Date().toLocaleDateString('pt-BR');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 6;
  const availableWidth = pageWidth - margin * 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('LOGÍSTICAS BILL', margin, 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Relatório geral', margin, 15);
  doc.text(`Gerado em: ${today}`, pageWidth - margin, 15, { align: 'right' });

  let currentY = 20;

  datasets.forEach(({ cfg, rows }) => {
    if (currentY > pageHeight - 25) {
      doc.addPage();
      currentY = 12;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(cfg.label, margin, currentY);
    currentY += 3;

    if (!rows.length) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text('Nenhum registro encontrado.', margin, currentY + 4);
      currentY += 10;
      return;
    }

    const headers = Object.keys(rows[0]);
    const body = rows.map((row) =>
      headers.map((header) => String(row[header] ?? ''))
    );

    const columnLengths = headers.map((header, index) => {
      let max = String(header).length;
      body.forEach((row) => {
        const value = String(row[index] ?? '');
        if (value.length > max) max = value.length;
      });
      return Math.min(max, 40);
    });

    const totalLength = columnLengths.reduce((sum, value) => sum + value, 0) || 1;
    const columnStyles: any = {};
    headers.forEach((_, index) => {
      let width = (columnLengths[index] / totalLength) * availableWidth;
      width = Math.max(width, 10);
      width = Math.min(width, 45);
      columnStyles[index] = { cellWidth: width };
    });

    let totalColumnWidth = 0;
    headers.forEach((_, index) => {
      totalColumnWidth += columnStyles[index].cellWidth;
    });
    if (totalColumnWidth > availableWidth) {
      const scale = availableWidth / totalColumnWidth;
      headers.forEach((_, index) => {
        columnStyles[index].cellWidth *= scale;
      });
    }

    let fontSize = 6;
    if (fontSizeOption === 'small') fontSize = 5;
    if (fontSizeOption === 'medium') fontSize = 6;
    if (fontSizeOption === 'large') fontSize = 7.5;

    if (headers.length >= 12) fontSize = Math.min(fontSize, 5);
    if (headers.length >= 16) fontSize = Math.min(fontSize, 4.5);

    autoTable(doc, {
      head: [headers],
      body,
      startY: currentY + 2,
      margin: { left: margin, right: margin, top: 5, bottom: 8 },
      tableWidth: availableWidth,
      horizontalPageBreak: false,
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize,
        cellPadding: 0.8,
        overflow: 'linebreak',
        valign: 'middle',
        lineWidth: 0.1,
        lineColor: [80, 80, 80],
        minCellHeight: 4,
      },
      headStyles: {
        font: 'helvetica',
        fontStyle: 'bold',
        fontSize,
        fillColor: [15, 40, 70],
        textColor: [255, 255, 255],
        halign: 'center',
        valign: 'middle',
        cellPadding: 0.8,
      },
      bodyStyles: {
        fontSize,
        cellPadding: 0.8,
        valign: 'middle',
      },
      columnStyles,
      pageBreak: 'auto',
      rowPageBreak: 'avoid',
    });

    const finalY = (doc as any).lastAutoTable?.finalY || currentY + 10;
    currentY = finalY + 6;

    if (currentY > pageHeight - 15) {
      doc.addPage();
      currentY = 12;
    }
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.text(
    'LOGÍSTICAS BILL — Relatório gerado automaticamente',
    margin,
    pageHeight - 4
  );

  return doc;
}

const SCHEDULE_REPORT_FIELDS = [
  { key: 'Semana', label: 'Semana' },
  { key: 'Status_Semana', label: 'Status da semana' },
  { key: 'Data', label: 'Data' },
  { key: 'Região', label: 'Região' },
  { key: 'Rota', label: 'Rota' },
  { key: 'Posição', label: 'Posição' },
  { key: 'Cliente', label: 'Cliente' },
  { key: 'Serviço', label: 'Serviço' },
  { key: 'Telefone', label: 'Telefone' },
  { key: 'Localização', label: 'Localização' },
  { key: 'Comanda', label: 'Comanda' },
  { key: 'Pago', label: 'Pago' },
  { key: 'Cooperativa', label: 'Cooperativa' },
  { key: 'Sem Comanda', label: 'Sem Comanda' },
  { key: 'Status', label: 'Status' },
  { key: 'Observação', label: 'Observação' },
  { key: 'Vagas', label: 'Vagas' },
];

function ReportsExport({ lookups }: { lookups: any }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [format, setFormat] = useState<'xlsx' | 'pdf'>('xlsx');
  const [exporting, setExporting] = useState(false);
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState<{ cfg: any; rows: any[] }[] | null>(null);
  const [scheduleFields, setScheduleFields] = useState<string[]>(
  SCHEDULE_REPORT_FIELDS.map((f) => f.key)
);
  function toggleScheduleField(key: string) {
    setScheduleFields((s) =>
      s.includes(key) ? s.filter((x) => x !== key) : [...s, key]
    );
  }
  function selectAllScheduleFields() {
    setScheduleFields(SCHEDULE_REPORT_FIELDS.map((f) => f.key));
  }
  function clearScheduleFields() {
    setScheduleFields([]);
  }
  function toggle(v: string) {
    setSelected((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));
  }
  async function loadPreview() {
    if (!selected.length) {
      setErr('Selecione pelo menos um módulo.');
      return;
    }
    setExporting(true);
    setErr('');
    try {
      const datasets = await Promise.all(
        selected.map(async (v) => {
          const cfg = REPORT_SOURCES.find((s) => s.value === v)!;

          if (v === 'schedule') {
          if (!scheduleFields.length) {
            throw new Error('Selecione pelo menos um campo do Agendamento.');
          }
          const weeks = (await request(cfg.path)) as any[];
          const flat: any[] = [];
          weeks.forEach((week) => {
            (week.route_slots || []).forEach((slot: any) => {
              (slot.entries || []).forEach((e: any) => {
                const full: Record<string, any> = {
                  Semana: week.label || week.start_date,
                  Status_Semana: week.status,
                  Data: slot.date,
                  Região: slot.region_code,
                  Rota: slot.route_label || slot.vehicle?.plate || '',
                  Posição: e.position,
                  Cliente: e.client_name,
                  Serviço: e.service_description,
                  Telefone: e.phone || '',
                  Localização: e.location_link || '',
                  Comanda: e.comanda || '',
                  Pago: e.pago ? 'Sim' : 'Não',
                  Cooperativa: e.cooperativa_nome || '',
                  'Sem Comanda': e.no_comanda ? 'Sim' : 'Não',
                  Status: e.status || '',
                  Observação: e.observation || '',
                  Vagas: e.slots_consumed || 1,
                };
                const row: Record<string, any> = {};
                scheduleFields.forEach((key) => {
                  if (key in full) row[key] = full[key];
                });
                flat.push(row);
              });
            });
          });
          return { cfg, rows: flat };
          }

          const rows = (await request(cfg.path)) as any[];
          return { cfg, rows: rows.map((r) => cleanRowForReport(r, lookups)) };
        })
      );
      setPreview(datasets);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setExporting(false);
    }
  }

  function downloadExcel() {
    if (!preview) return;
    exportExcelMulti(preview);
  }

  function downloadPdf() {
    if (!preview) return;
    const doc = exportPdfMulti(preview, fontSize);
    const today = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
    doc.save(`Bill_Logistica_Relatorio_${today}.pdf`);
  }

  function printPdf() {
    if (!preview) return;
    const doc = exportPdfMulti(preview, fontSize);
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  }

  return (
    <div className="p-5 text-sm text-slate-600">
      <p className="mb-3">
        Selecione um ou mais módulos. Ao clicar em <strong>Gerar relatório</strong> você verá o
        preview completo antes de salvar ou imprimir.
      </p>
      {err && <p className="mb-2 text-red-600">{err}</p>}

      <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-3">
        {REPORT_SOURCES.map((s) => (
          <label key={s.value} className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={selected.includes(s.value)}
              onChange={() => toggle(s.value)}
              className="h-4 w-4"
            />
            {s.label}
          </label>
        ))}
      </div>

      {selected.includes('schedule') && (
      <div className="mb-4 rounded-lg border p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-slate-700">
            Campos do Agendamento
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={selectAllScheduleFields}
              className="text-xs text-brand hover:underline"
            >
              Marcar todos
            </button>
            <button
              type="button"
              onClick={clearScheduleFields}
              className="text-xs text-slate-500 hover:underline"
            >
              Limpar
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {SCHEDULE_REPORT_FIELDS.map((f) => (
            <label
              key={f.key}
              className="flex items-center gap-2 text-xs text-slate-700"
            >
              <input
                type="checkbox"
                checked={scheduleFields.includes(f.key)}
                onChange={() => toggleScheduleField(f.key)}
                className="h-4 w-4"
              />
              {f.label}
            </label>
          ))}
        </div>
      </div>
      )}

      <div className="mb-4">
        <label className="mb-2 block text-xs font-medium text-slate-600">
          Tamanho da fonte do PDF
        </label>
        <div className="flex flex-wrap gap-2">
          {(['small', 'medium', 'large'] as const).map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setFontSize(size)}
              className={`rounded-lg border px-4 py-2 text-xs ${
                fontSize === size
                  ? 'border-brand bg-brand text-white'
                  : 'bg-white text-slate-600'
              }`}
            >
              {size === 'small' ? 'Pequena' : size === 'medium' ? 'Média' : 'Grande'}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={loadPreview}
        disabled={exporting}
        className="rounded-lg bg-brand px-4 py-2 font-medium text-white disabled:opacity-60"
      >
        {exporting ? 'Carregando…' : 'Gerar relatório'}
      </button>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-3">
          <div className="flex h-[96vh] w-[98vw] max-w-none flex-col rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Preview do relatório</h3>
                <p className="text-xs text-slate-500">
                  Confira os dados abaixo. Depois escolha salvar em Excel, PDF ou imprimir.
                </p>
              </div>
              <button
                onClick={() => setPreview(null)}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-200"
              >
                Fechar
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-3">
              {preview.map(({ cfg, rows }) => (
                <div key={cfg.value} className="mb-6">
                  <h4 className="mb-2 font-semibold text-slate-800">
                    {cfg.label}{' '}
                    <span className="text-sm font-normal text-slate-500">
                      ({rows.length} registro{rows.length !== 1 ? 's' : ''})
                    </span>
                  </h4>
                  {!rows.length ? (
                    <p className="text-sm text-slate-400">Nenhum registro encontrado.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="min-w-full text-left text-[12px]">
                        <thead className="bg-slate-100 sticky top-0">
                          <tr>
                            {Object.keys(rows[0]).map((h) => (
                              <th
                                key={h}
                                className="whitespace-nowrap border-b px-2 py-1.5 font-semibold text-slate-700"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, i) => (
                            <tr key={i} className="border-t hover:bg-slate-50">
                              {Object.keys(rows[0]).map((h) => (
                                <td
                                  key={h}
                                  className="max-w-[220px] whitespace-pre-wrap break-words px-2 py-1 text-slate-700"
                                  title={String(row[h] ?? '')}
                                >
                                  {String(row[h] ?? '')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t px-5 py-4">
              <button
                onClick={() => setPreview(null)}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Cancelar
              </button>
              <button
                onClick={downloadExcel}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Salvar Excel
              </button>
              <button
                onClick={downloadPdf}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Salvar PDF
              </button>
              <button
                onClick={printPdf}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Imprimir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Module({
  page,
  rows,
  loading,
  create,
  isAdmin,
  lookups,
  editingUser,
  setEditingUser,
  updateUser,
  deleteUser,
  editingResource,
  setEditingResource,
  updateResource,
  deleteResource,
  editingMovement,
  setEditingMovement,
  updateMovement,
  deleteMovement,
}: {
  page: string;
  rows: any[];
  loading: boolean;
  create: (data: any) => Promise<void>;
  isAdmin: boolean;
  lookups: any;
  editingUser: any;
  setEditingUser: (u: any) => void;
  updateUser: (id: number, data: any) => Promise<void>;
  deleteUser: (id: number) => Promise<void>;
  editingResource: any;
  setEditingResource: (r: any) => void;
  updateResource: (id: string | number, data: any) => Promise<void>;
  deleteResource: (id: string | number) => Promise<void>;
  editingMovement: any;
  setEditingMovement: (m: any) => void;
  updateMovement: (id: number, data: any) => Promise<void>;
  deleteMovement: (id: number) => Promise<void>;
}) {
  const createAllowed =
    !['movements', 'reports'].includes(page) && (page !== 'users' || isAdmin);
  const isUsers = page === 'users';
  const isResourceModule = !!resource[page];
  const isMovementModule = page === 'entry' || page === 'output';
  const showActions =
    (isUsers && isAdmin) || isResourceModule || isMovementModule;
  const hidden = HIDDEN_TABLE_COLUMNS[page] || [];
  const cols =
    TABLE_COLUMNS[page] ||
    Object.keys(rows[0] || { id: 'ID', informação: 'Informação' })
      .filter((k) => !hidden.includes(k))
      .slice(0, 7);

  return (
    <>
      <section className="rounded-xl bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-5">
          <h2 className="font-semibold">
          {page === 'reports' ? 'Relatórios' : titleFor(page)}
          </h2>
        <div className="flex items-center gap-3">
          {page === 'stock' && rows.length > 0 && (
        <button
          type="button"
          onClick={() => printProductLabels(rows)}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
        >
        Imprimir etiquetas QR (todos)
        </button>
        )}
          {page !== 'reports' && (
        <span className="text-sm text-slate-500">{rows.length} registros</span>
        )}
          </div>
        </div>
        {page === 'reports' ? (
          <ReportsExport lookups={lookups} />
        ) : loading ? (
          <div className="p-5">Carregando…</div>
        ) : (
                    <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr>
                  {cols.map((k) => (
                    <th key={k} className="whitespace-nowrap px-3 py-2">
                      {labelFor(k)}
                    </th>
                  ))}
                  {showActions && (
                    <th className="whitespace-nowrap px-3 py-2">Ações</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={resourceIdOf(page, r) || i}>
                    {cols.map((k) => (
                      <td key={k} className="max-w-[200px] px-3 py-2 align-top">
                        {k === 'status' ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClasses(
                              r[k]
                            )}`}
                          >
                            {r[k] || '—'}
                          </span>
                        ) : (
                          <span className="break-words">
                            {resolveCell(k, r[k], lookups)}
                          </span>
                        )}
                      </td>
                    ))}
                    {showActions && (
                      <td className="whitespace-nowrap px-3 py-2">
                        {page === 'stock' && (
                          <button
                            type="button"
                            onClick={() => printProductLabels([r])}
                            className="mr-2 rounded-lg bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                          >
                            Etiqueta QR
                          </button>
                        )}
                        <button
                          onClick={() =>
                            isUsers
                              ? setEditingUser(r)
                              : isMovementModule
                              ? setEditingMovement(r)
                              : setEditingResource(r)
                          }
                          className="mr-2 rounded-lg bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                        >
                          Editar
                        </button>
                        {!(isUsers && r.is_main_admin) && (
                          <button
                            onClick={() =>
                              isUsers
                                ? deleteUser(r.id)
                                : isMovementModule
                                ? deleteMovement(r.id)
                                : deleteResource(resourceIdOf(page, r))
                            }
                            className="rounded-lg bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                          >
                            Excluir
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td
                      colSpan={cols.length + (showActions ? 1 : 0)}
                      className="p-5 text-slate-500"
                    >
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isUsers && isAdmin && editingUser && (
        <section className="mt-6 rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Editar usuário: {editingUser.name}</h3>
            <button
              onClick={() => setEditingUser(null)}
              className="text-sm text-slate-500 hover:underline"
            >
              Cancelar
            </button>
          </div>
          <EditUserForm
            user={editingUser}
            onSubmit={(data) => updateUser(editingUser.id, data)}
          />
        </section>
      )}

      {isResourceModule && editingResource && (
        <section className="mt-6 rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Editar registro</h3>
            <button
              onClick={() => setEditingResource(null)}
              className="text-sm text-slate-500 hover:underline"
            >
              Cancelar
            </button>
          </div>
          <ResourceForm
            page={page}
            lookups={lookups}
            initial={editingResource}
            onSubmit={(data) =>
              updateResource(resourceIdOf(page, editingResource), data)
            }
            submitLabel="Salvar alterações"
          />
        </section>
      )}

      {isMovementModule && editingMovement && (
        <section className="mt-6 rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Editar movimentação</h3>
            <button
              onClick={() => setEditingMovement(null)}
              className="text-sm text-slate-500 hover:underline"
            >
              Cancelar
            </button>
          </div>
          <MovementEditForm
            movement={editingMovement}
            lookups={lookups}
            onSubmit={(data) => updateMovement(editingMovement.id, data)}
          />
        </section>
      )}

      {createAllowed && (
        <section className="mt-6 rounded-xl bg-white p-5 shadow-sm">
        <h3 className="font-semibold">Novo registro</h3>
        {(page === 'entry' || page === 'output')
        ? <StockMovementForm page={page as 'entry' | 'output'} lookups={lookups} onSubmit={create} />
        : <ResourceForm page={page} lookups={lookups} onSubmit={create} />}
        </section>
      )}
    </>
  );
}

function emptyValues(page: string, initial?: any) {
  const out: any = {};
  (FIELDS[page] || []).forEach((f) => {
    if (initial && initial[f.key] !== undefined && initial[f.key] !== null)
      out[f.key] = String(initial[f.key]).slice(0, f.type === 'datetime' ? 16 : undefined);
    else out[f.key] = '';
  });
  return out;
}

function ModuleCheckboxes({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const list = value ? value.split(',').filter(Boolean) : [];
  return (
    <div className="grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-3">
      {MODULE_OPTIONS.map((m) => {
        const checked = list.includes(m.value);
        return (
          <label key={m.value} className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={checked}
              className="h-4 w-4 shrink-0"
              onChange={(e) => {
                const next = e.target.checked
                  ? [...list, m.value]
                  : list.filter((x) => x !== m.value);
                onChange(next.join(','));
              }}
            />
            <span className="leading-none">{m.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function PermissionsField({
  value,
  onChange,
  startOpen,
}: {
  value: string;
  onChange: (v: string) => void;
  startOpen: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  return (
    <div>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs font-medium text-brand hover:underline"
        >
          Personalizar permissões específicas (opcional)
        </button>
      ) : (
        <>
          <ModuleCheckboxes value={value} onChange={onChange} />
          <button
            type="button"
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
            className="mt-2 text-xs text-slate-500 hover:underline"
          >
            Usar módulos padrão do perfil
          </button>
        </>
      )}
    </div>
  );
}

function ResourceForm({
  page,
  lookups,
  onSubmit,
  initial,
  submitLabel,
}: {
  page: string;
  lookups: any;
  onSubmit: (data: any) => Promise<void>;
  initial?: any;
  submitLabel?: string;
}) {
  const fields = FIELDS[page] || [];
  const [values, setValues] = useState<any>(() => emptyValues(page, initial));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValues(emptyValues(page, initial));
  }, [page]);

  function set(key: string, v: string) {
    setValues((s: any) => ({ ...s, [key]: v }));
  }

  function optionsFor(type: string) {
    if (type === 'vehicle')
      return (lookups.vehicles || []).map((v: any) => ({
        value: v.id,
        label: `${v.plate} — ${v.brand} ${v.model}`,
      }));
    if (type === 'driver')
      return (lookups.drivers || []).map((d: any) => ({
        value: d.id,
        label: d.name,
      }));
    if (type === 'product')
      return (lookups.products || []).map((p: any) => ({
        value: p.id,
        label: `${p.id} — ${p.name}`,
      }));
    return [];
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const data: any = {};
    for (const f of fields) {
      let v: any = values[f.key];
      if (f.type === 'modules') {
        data[f.key] = v
          ? expandPermissions(String(v).split(',').filter(Boolean)).join(',')
          : null;
        continue;
      }
      if (v === '') {
        data[f.key] = null;
        continue;
      }
      if (f.type === 'number' || ['vehicle', 'driver', 'product'].includes(f.type))
        v = Number(v);
      data[f.key] = v;
    }
    try {
      await onSubmit(data);
      if (!initial) setValues(emptyValues(page));
    } finally {
      setSaving(false);
    }
  }

  if (!fields.length)
    return (
      <p className="text-sm text-slate-500">
        Este módulo ainda não possui formulário de cadastro.
      </p>
    );

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      {fields.map((f) => {
        const isLookup = ['vehicle', 'driver', 'product'].includes(f.type);
        return (
          <label
            key={f.key}
            className={`text-sm ${
              f.type === 'textarea' || f.type === 'modules' ? 'sm:col-span-2' : ''
            }`}
          >
            <span className="mb-1 block text-slate-600">
              {f.label}
              {f.required ? ' *' : ''}
            </span>
            {f.type === 'modules' ? (
              <PermissionsField
                value={values[f.key]}
                onChange={(v) => set(f.key, v)}
                startOpen={!!(initial && initial[f.key])}
              />
            ) : f.type === 'textarea' ? (
              <textarea
                required={f.required}
                value={values[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                className="h-20 w-full rounded-lg border p-2"
              />
            ) : f.type === 'select' ? (
              <select
                required={f.required}
                value={values[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                className="w-full rounded-lg border p-2"
              >
                <option value="">Selecione</option>
                {(f.options || []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : isLookup ? (
              <select
                required={f.required}
                value={values[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                className="w-full rounded-lg border p-2"
              >
                <option value="">Selecione</option>
                {optionsFor(f.type).map((o: any) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                required={f.required}
                value={values[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                type={
                  f.type === 'number'
                    ? 'number'
                    : f.type === 'date'
                    ? 'date'
                    : f.type === 'datetime'
                    ? 'datetime-local'
                    : 'text'
                }
                step={f.step}
                className="w-full rounded-lg border p-2"
              />
            )}
          </label>
        );
      })}
      <div className="sm:col-span-2">
        <button
          disabled={saving}
          className="mt-1 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? 'Salvando…' : submitLabel || 'Salvar registro'}
        </button>
      </div>
    </form>
  );
}

function EditUserForm({
  user,
  onSubmit,
}: {
  user: any;
  onSubmit: (data: any) => Promise<void>;
}) {
  const [values, setValues] = useState<any>({
    name: user.name || '',
    username: user.username || '',
    role: user.role || '',
    permissions: user.permissions || '',
    active: user.active ? 'Sim' : 'Não',
    password: '',
  });
  const [saving, setSaving] = useState(false);

  function set(key: string, v: string) {
    setValues((s: any) => ({ ...s, [key]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const data: any = {
      name: values.name,
      username: values.username,
      role: values.role,
      permissions: values.permissions
        ? expandPermissions(String(values.permissions).split(',').filter(Boolean)).join(
            ','
          )
        : null,
      active: values.active === 'Sim',
    };
    if (values.password) data.password = values.password;
    try {
      await onSubmit(data);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" autoComplete="off">
      {USER_EDIT_FIELDS.map((f) => (
        <label
          key={f.key}
          className={`text-sm ${f.type === 'modules' ? 'sm:col-span-2' : ''}`}
        >
          <span className="mb-1 block text-slate-600">
            {f.label}
            {f.required ? ' *' : ''}
          </span>
          {f.type === 'modules' ? (
            <PermissionsField
              value={values[f.key]}
              onChange={(v) => set(f.key, v)}
              startOpen={!!user.permissions}
            />
          ) : f.type === 'select' ? (
            <select
              required={f.required}
              value={values[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              className="w-full rounded-lg border p-2"
            >
              {f.key !== 'active' && <option value="">Selecione</option>}
              {(f.options || []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              required={f.required}
              value={values[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              type={f.key === 'password' ? 'password' : 'text'}
              autoComplete="off"
              className="w-full rounded-lg border p-2"
            />
          )}
        </label>
      ))}
      <div className="sm:col-span-2">
        <button
          disabled={saving}
          className="mt-1 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </div>
    </form>
  );
}

function MovementEditForm({
  movement,
  lookups,
  onSubmit,
}: {
  movement: any;
  lookups: any;
  onSubmit: (data: any) => Promise<void>;
}) {
  const [values, setValues] = useState<any>({
    quantity: String(movement.quantity ?? ''),
    responsible: movement.responsible || '',
    recipient: movement.recipient || '',
    sector: movement.sector || '',
    vehicle_id: movement.vehicle_id ? String(movement.vehicle_id) : '',
    observation: movement.observation || '',
    invoice: movement.invoice || '',
    unit_value: movement.unit_value != null ? String(movement.unit_value) : '',
    password: '',
  });
  const [saving, setSaving] = useState(false);

  function set(key: string, v: string) {
    setValues((s: any) => ({ ...s, [key]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const data: any = { password: values.password };
    if (values.quantity !== '') data.quantity = Number(values.quantity);
    if (values.responsible !== '') data.responsible = values.responsible;
    if (values.recipient !== '') data.recipient = values.recipient;
    if (values.sector !== '') data.sector = values.sector;
    if (values.vehicle_id !== '') data.vehicle_id = Number(values.vehicle_id);
    if (values.observation !== '') data.observation = values.observation;
    if (values.invoice !== '') data.invoice = values.invoice;
    if (values.unit_value !== '') data.unit_value = Number(values.unit_value);
    try {
      await onSubmit(data);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" autoComplete="off">
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Quantidade</span>
        <input
          type="number"
          step="0.01"
          value={values.quantity}
          onChange={(e) => set('quantity', e.target.value)}
          className="w-full rounded-lg border p-2"
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Responsável (quem entregou)</span>
        <input
          value={values.responsible}
          onChange={(e) => set('responsible', e.target.value)}
          className="w-full rounded-lg border p-2"
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Retirado por</span>
        <input
          value={values.recipient}
          onChange={(e) => set('recipient', e.target.value)}
          className="w-full rounded-lg border p-2"
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Setor</span>
        <input
          value={values.sector}
          onChange={(e) => set('sector', e.target.value)}
          className="w-full rounded-lg border p-2"
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Veículo</span>
        <select
          value={values.vehicle_id}
          onChange={(e) => set('vehicle_id', e.target.value)}
          className="w-full rounded-lg border p-2"
        >
          <option value="">Selecione</option>
          {(lookups.vehicles || []).map((v: any) => (
            <option key={v.id} value={v.id}>
              {v.plate} — {v.brand} {v.model}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Nota fiscal</span>
        <input
          value={values.invoice}
          onChange={(e) => set('invoice', e.target.value)}
          className="w-full rounded-lg border p-2"
        />
      </label>
      <label className="text-sm sm:col-span-2">
        <span className="mb-1 block text-slate-600">Observação</span>
        <textarea
          value={values.observation}
          onChange={(e) => set('observation', e.target.value)}
          className="h-16 w-full rounded-lg border p-2"
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Valor unitário</span>
        <input
          type="number"
          step="0.01"
          value={values.unit_value}
          onChange={(e) => set('unit_value', e.target.value)}
          className="w-full rounded-lg border p-2"
        />
      </label>
      <label className="text-sm sm:col-span-2">
        <span className="mb-1 block text-slate-600">Confirme sua senha para salvar *</span>
        <input
          type="password"
          required
          autoComplete="off"
          value={values.password}
          onChange={(e) => set('password', e.target.value)}
          className="w-full rounded-lg border p-2"
        />
      </label>
      <div className="sm:col-span-2">
        <button
          disabled={saving}
          className="mt-1 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </div>
    </form>
  );
}

// ============================================================
// MÓDULO DE AGENDAMENTO – VERSÃO COMPLETA E MELHORADA
// ============================================================

const COOPERATIVAS = [
  'COOPERA', 'COOPERALIANÇA', 'CERPALO', 'CERMOFUL',
  'CERTREL', 'CELESC', 'CERBRANORTE', 'CEGERO',
  'CERGAL', 'CERGRAL', 'COOPERCOCAL', 'EFLUL',
  'COOPERZEM', 'CEGERO',
];

function calcularVagas(service: string): number {
  const match = (service || '').trim().match(/^(\d+)/);
  return match ? Math.max(1, parseInt(match[1], 10)) : 1;
}

function ScheduleModule({ user, lookups }: { user: any; lookups: any }) {
  const [weeks, setWeeks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [showDeleteWeek, setShowDeleteWeek] = useState(false);
  const [deleteWeekId, setDeleteWeekId] = useState<number | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletingWeek, setDeletingWeek] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selectedWeekId, setSelectedWeekId] = useState<number | null>(null);
  const [showNewWeek, setShowNewWeek] = useState(false);
  const [showNewSlot, setShowNewSlot] = useState(false);
  const [editingSlot, setEditingSlot] = useState<any>(null);
  const [addingEntryTo, setAddingEntryTo] = useState<number | null>(null);
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [addingExtraTo, setAddingExtraTo] = useState<number | null>(null);
  const [transferEntry, setTransferEntry] = useState<any>(null);
  const [transferSlot, setTransferSlot] = useState<any>(null);
  const [transferTargetSlotId, setTransferTargetSlotId] = useState('');
  const [transferNewDate, setTransferNewDate] = useState('');
  const [transferWeekId, setTransferWeekId] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [showPrintDay, setShowPrintDay] = useState(false);
  const [printDate, setPrintDate] = useState('');
  const [printSlotId, setPrintSlotId] = useState('all'); // 'all' ou id da rota
  const [printFields, setPrintFields] = useState({
    position: true,
    client: true,
    service: true,
    phone: true,
    location: false,
    comanda: true,
    cooperativa: true,
    pago: true,
    status: false,
    observation: true,
    extras: true,
  });

  const perms = (user.permissions || '').split(',').filter(Boolean);
  const isMainAdmin = !!user.is_main_admin;

  // Apenas o Administrador Principal (id 1) tem acesso total automático ao
  // Agendamento. Todo o resto — incluindo os perfis ADMINISTRADOR e GERENTE —
  // depende exclusivamente das permissões específicas marcadas no cadastro
  // do usuário (schedule / schedule_edit / schedule_delete / schedule_export /
  // schedule_archive).
  const canView = isMainAdmin || perms.includes('schedule');
  const canEdit = isMainAdmin || perms.includes('schedule_edit');
  const canArchive = isMainAdmin || perms.includes('schedule_archive');
  const canDelete = isMainAdmin || perms.includes('schedule_delete');
  const canExport = isMainAdmin || perms.includes('schedule_export');
  const canWrite = canEdit;

      async function load(opts?: { silent?: boolean }) {
    const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;
    const silent = !!(opts?.silent || weeks.length > 0);
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const data = await request(`/schedule/weeks?include_archived=${includeArchived}`);
      setWeeks(
        [...data].sort((a: any, b: any) =>
          String(a.start_date).localeCompare(String(b.start_date))
        )
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
      requestAnimationFrame(() => window.scrollTo(0, scrollY));
    }
  }

  useEffect(() => { load(); }, [includeArchived]);

  const selectedWeek = weeks.find((w) => w.id === selectedWeekId);

  const slotsByDate = selectedWeek
    ? selectedWeek.route_slots.reduce((acc: any, slot: any) => {
        const d = slot.date;
        if (!acc[d]) acc[d] = [];
        acc[d].push(slot);
        return acc;
      }, {})
    : {};

  const dates = Object.keys(slotsByDate).sort();

  async function createWeek(data: { start_date: string; label?: string }) {
    try {
      await request('/schedule/weeks', { method: 'POST', body: JSON.stringify(data) });
      setShowNewWeek(false);
      load();
    } catch (e: any) { setError(e.message); }
  }

  async function archiveWeek(weekId: number) {
    if (!confirm('Arquivar esta semana? Ela ficará apenas para consulta (backup).')) return;
    try {
      await request(`/schedule/weeks/${weekId}/archive`, { method: 'POST' });
      setSelectedWeekId(null);
      load();
    } catch (e: any) { setError(e.message); }
  }

  async function confirmDeleteWeek() {
    if (!deleteWeekId || !deletePassword) return;
    setDeletingWeek(true);
    try {
      await request(`/schedule/weeks/${deleteWeekId}`, {
        method: 'DELETE',
        body: JSON.stringify({ password: deletePassword }),
      });
      setShowDeleteWeek(false);
      setDeleteWeekId(null);
      setDeletePassword('');
      setSelectedWeekId(null);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeletingWeek(false);
    }
  }

  function exportWeekPdf(week: any) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const margin = 8;
    let y = 12;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('LOGÍSTICAS BILL — Agenda de Instalações', margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Semana: ${week.label || week.start_date}  |  Status: ${week.status}`, margin, y);
    y += 8;

    const slots = week.route_slots || [];
    const byDate: Record<string, any[]> = {};
    slots.forEach((s: any) => {
      if (!byDate[s.date]) byDate[s.date] = [];
      byDate[s.date].push(s);
    });

    Object.keys(byDate)
      .sort()
      .forEach((date) => {
        if (y > 180) {
          doc.addPage();
          y = 12;
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(date, margin, y);
        y += 5;

        byDate[date].forEach((slot: any) => {
          const plate = slot.vehicle?.plate || slot.route_label || '';
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.text(
            `${String(slot.total_slots).padStart(2, '0')} - (${slot.region_code}) ${plate}`,
            margin,
            y
          );
          y += 4;

          const rows = (slot.entries || []).map((e: any) => [
            `${String(e.position).padStart(2, '0')}°`,
            e.client_name || '',
            e.service_description || '',
            e.phone || '',
            e.comanda || '',
            e.pago ? 'Sim' : 'Não',
            e.cooperativa_nome || '',
            e.observation || '',
          ]);

          if (rows.length) {
            autoTable(doc, {
              startY: y,
              head: [['Pos', 'Cliente', 'Serviço', 'Telefone', 'Comanda', 'Pago', 'Cooperativa', 'Obs']],
              body: rows,
              margin: { left: margin, right: margin },
              styles: { fontSize: 7, cellPadding: 1 },
              headStyles: { fillColor: [30, 30, 30] },
            });
            y = (doc as any).lastAutoTable.finalY + 6;
          } else {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.text('Sem clientes', margin + 2, y);
            y += 5;
          }
        });
      });

    doc.save(`Agenda_${week.label || week.start_date}.pdf`);
  }

    function togglePrintField(key: keyof typeof printFields) {
    setPrintFields((s) => ({ ...s, [key]: !s[key] }));
  }

  function openPrintDay() {
    const first = dates[0] || '';
    setPrintDate(first);
    setPrintSlotId('all');
    setShowPrintDay(true);
  }

  function printDayRoutes() {
    if (!selectedWeek || !printDate) return;

    const slots = (selectedWeek.route_slots || []).filter((s: any) => {
      if (s.date !== printDate) return false;
      if (printSlotId !== 'all' && String(s.id) !== String(printSlotId)) return false;
      return true;
    });

    if (!slots.length) {
      setError('Nenhuma rota encontrada para essa data / caminhão.');
      return;
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 10;
    let y = 12;
    const pageW = doc.internal.pageSize.getWidth();

    const [yy, mm, dd] = printDate.split('-');
    const dateObj = new Date(Number(yy), Number(mm) - 1, Number(dd));
    const dateLabel = dateObj.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('LOGÍSTICAS BILL — Rota do dia', margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(
      `Data: ${dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}  |  Semana: ${
        selectedWeek.label || selectedWeek.start_date
      }`,
      margin,
      y
    );
    y += 8;

    const head: string[] = [];
    if (printFields.position) head.push('Pos');
    if (printFields.client) head.push('Cliente');
    if (printFields.service) head.push('Serviço');
    if (printFields.phone) head.push('Telefone');
    if (printFields.location) head.push('Localização');
    if (printFields.comanda) head.push('Comanda');
    if (printFields.cooperativa) head.push('Cooperativa');
    if (printFields.pago) head.push('Pago');
    if (printFields.status) head.push('Status');
    if (printFields.observation) head.push('Obs');
    if (printFields.extras) head.push('Extras');

    slots.forEach((slot: any, slotIdx: number) => {
      if (y > 250) {
        doc.addPage();
        y = 12;
      }

      const plate = slot.vehicle?.plate || slot.route_label || '';
      const driver = slot.driver?.name || '—';

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(
        `${String(slot.total_slots).padStart(2, '0')} - (${slot.region_code}) ${plate}`,
        margin,
        y
      );
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Motorista: ${driver}${slot.second_driver?.name ? ' | ' + slot.second_driver.name : ''}`, margin, y);
      y += 6;

      const body = (slot.entries || []).map((e: any) => {
        const row: string[] = [];
        if (printFields.position) row.push(`${String(e.position).padStart(2, '0')}°`);
        if (printFields.client) row.push(e.client_name || '');
        if (printFields.service) row.push(e.service_description || '');
        if (printFields.phone) row.push(e.phone || '');
        if (printFields.location) row.push(e.location_link || '');
        if (printFields.comanda) row.push(e.no_comanda ? 'SEM COMANDA' : e.comanda || '');
        if (printFields.cooperativa) row.push(e.cooperativa_nome || '');
        if (printFields.pago) row.push(e.pago ? 'Sim' : 'Não');
        if (printFields.status) row.push(e.status || '');
        if (printFields.observation) row.push(e.observation || '');
        if (printFields.extras) {
          const extras = (e.extras || []).map((x: any) => x.description).join('; ');
          row.push(extras);
        }
        return row;
      });

      if (body.length && head.length) {
        autoTable(doc, {
          startY: y,
          head: [head],
          body,
          margin: { left: margin, right: margin },
          styles: { fontSize: 7, cellPadding: 1.2, overflow: 'linebreak' },
          headStyles: { fillColor: [15, 40, 70], textColor: 255 },
          columnStyles: printFields.observation
            ? { [head.indexOf('Obs')]: { cellWidth: 35 } }
            : {},
        });
        y = (doc as any).lastAutoTable.finalY + 10;
      } else {
        doc.setFontSize(8);
        doc.text('Sem clientes nesta rota', margin, y);
        y += 8;
      }

      if (slotIdx < slots.length - 1) {
        doc.setDrawColor(200);
        doc.line(margin, y - 4, pageW - margin, y - 4);
      }
    });

    const safeDate = printDate.replace(/-/g, '');
    doc.save(`Rota_${safeDate}.pdf`);
    setShowPrintDay(false);
  }

  const printSlotsForDate = selectedWeek
    ? (selectedWeek.route_slots || []).filter((s: any) => s.date === printDate)
    : [];

  async function createSlot(data: any) {
    try {
      await request('/schedule/route-slots', { method: 'POST', body: JSON.stringify(data) });
      setShowNewSlot(false);
      load();
    } catch (e: any) { setError(e.message); }
  }

  async function updateSlot(slotId: number, data: any) {
    try {
      await request(`/schedule/route-slots/${slotId}`, { method: 'PATCH', body: JSON.stringify(data) });
      setEditingSlot(null);
      load();
    } catch (e: any) { setError(e.message); }
  }

  async function deleteSlot(slotId: number) {
    if (!confirm('Excluir esta rota e todos os clientes dela?')) return;
    try {
      await request(`/schedule/route-slots/${slotId}`, { method: 'DELETE' });
      load();
    } catch (e: any) { setError(e.message); }
  }

  async function createEntry(data: any) {
    try {
      await request('/schedule/entries', { method: 'POST', body: JSON.stringify(data) });
      setAddingEntryTo(null);
      load();
    } catch (e: any) { setError(e.message); }
  }

  async function updateEntry(entryId: number, data: any) {
    try {
      await request(`/schedule/entries/${entryId}`, { method: 'PATCH', body: JSON.stringify(data) });
      setEditingEntry(null);
      load();
    } catch (e: any) { setError(e.message); }
  }

  async function deleteEntry(entryId: number) {
    if (!confirm('Remover este cliente da rota? A vaga será liberada.')) return;
    try {
      await request(`/schedule/entries/${entryId}`, { method: 'DELETE' });
      load();
    } catch (e: any) { setError(e.message); }
  }

  async function moveEntry(entryId: number, direction: 'up' | 'down') {
    try {
      await request(`/schedule/entries/${entryId}/move`, {
        method: 'POST',
        body: JSON.stringify({ direction }),
      });
      load();
    } catch (e: any) { setError(e.message); }
  }

  async function reorderEntries(routeSlotId: number, orderedIds: number[]) {
    try {
      await request('/schedule/entries/reorder', {
        method: 'POST',
        body: JSON.stringify({
          route_slot_id: routeSlotId,
          ordered_ids: orderedIds,
        }),
      });
      load({ silent: true });
    } catch (e: any) {
      setError(e.message);
    }
  }

    async function confirmTransferEntry() {
    if (!transferEntry || !transferTargetSlotId) return;
    setTransferring(true);
    setError('');
    try {
      await request(`/schedule/entries/${transferEntry.id}/transfer`, {
        method: 'POST',
        body: JSON.stringify({
          target_route_slot_id: Number(transferTargetSlotId),
        }),
      });
      setTransferEntry(null);
      setTransferTargetSlotId('');
      load({ silent: true });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setTransferring(false);
    }
  }

  async function confirmTransferSlot() {
    if (!transferSlot || !transferNewDate) return;
    setTransferring(true);
    setError('');
    try {
      const payload: any = { new_date: transferNewDate };
      if (transferWeekId) payload.week_id = Number(transferWeekId);
      await request(`/schedule/route-slots/${transferSlot.id}/transfer`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setTransferSlot(null);
      setTransferNewDate('');
      setTransferWeekId('');
      load({ silent: true });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setTransferring(false);
    }
  }

  function formatSlotDateLabel(d: string) {
    const [y, m, day] = d.split('-');
    const date = new Date(Number(y), Number(m) - 1, Number(day));
    const texto = date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  const slotsByDayForTransfer = selectedWeek
    ? (selectedWeek.route_slots || []).reduce((acc: Record<string, any[]>, s: any) => {
        const key = s.date;
        if (!acc[key]) acc[key] = [];
        acc[key].push({
          id: s.id,
          plate: s.vehicle?.plate || s.route_label || '',
          region: s.region_code,
          vagas: s.total_slots,
        });
        return acc;
      }, {})
    : {};

  const transferDayKeys = Object.keys(slotsByDayForTransfer).sort();

  async function createExtra(data: any) {
    try {
      await request('/schedule/extras', { method: 'POST', body: JSON.stringify(data) });
      setAddingExtraTo(null);
      load();
    } catch (e: any) { setError(e.message); }
  }

  async function deleteExtra(extraId: number) {
    if (!confirm('Remover este item extra?')) return;
    try {
      await request(`/schedule/extras/${extraId}`, { method: 'DELETE' });
      load();
    } catch (e: any) { setError(e.message); }
  }

  async function exportSlot(slotId: number, slot: any) {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || ''}/schedule/route-slots/${slotId}/export`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error('Falha ao exportar');
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rota_${slot.region_code}_${slot.date}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message || 'Erro ao exportar rota');
    }
  }

  function formatDate(d: string) {
    const [y, m, day] = d.split('-');
    const date = new Date(Number(y), Number(m) - 1, Number(day));
    return date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  }

  if (loading && weeks.length === 0) {
    return <div className="rounded-xl bg-white p-8 shadow-sm">Carregando agenda…</div>;
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-lg bg-red-50 p-3 text-red-700">{error}</div>}

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">Agenda de Instalações</h2>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} className="h-4 w-4" />
              Mostrar arquivadas
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {canWrite && (
              <>
                <button onClick={() => setShowNewWeek(true)} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                  + Nova semana
                </button>
                {selectedWeek && selectedWeek.status === 'Ativa' && (
                  <button onClick={() => setShowNewSlot(true)} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                    + Nova rota
                  </button>
                )}
              </>
            )}
            {selectedWeek && dates.length > 0 && canExport && (
              <button
                type="button"
                onClick={openPrintDay}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Imprimir rota do dia
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {[...weeks]
            .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))
            .map((w) => (
            <button
              key={w.id}
              onClick={() => setSelectedWeekId(w.id)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                selectedWeekId === w.id
                  ? 'border-brand bg-brand text-white'
                  : w.status === 'Arquivada'
                  ? 'border-slate-200 bg-slate-50 text-slate-500'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-brand'
              }`}
            >
              {w.label || `Semana ${w.start_date}`}
              {w.status === 'Arquivada' && <span className="ml-2 text-xs opacity-70">(Arquivada)</span>}
            </button>
          ))}
        </div>

        {selectedWeek && (
          <div className="mt-3 flex flex-wrap items-center gap-4">
            {selectedWeek.status === 'Ativa' && canArchive && (
              <button
              onClick={() => archiveWeek(selectedWeek.id)}
                  className="text-sm text-amber-700 hover:underline">
                Arquivar esta semana (backup)
              </button>
            )}
            {selectedWeek.status === 'Arquivada' && (
              <button
                onClick={() => exportWeekPdf(selectedWeek)}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Baixar PDF da semana
              </button>
            )}
            {isMainAdmin && (
              <button
                onClick={() => {
                  setDeleteWeekId(selectedWeek.id);
                  setShowDeleteWeek(true);
                }}
                className="text-sm text-red-600 hover:underline"
              >
                Excluir semana permanentemente
              </button>
            )}
                  {showPrintDay && selectedWeek && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Imprimir rota do dia</h3>
            <p className="mt-1 text-sm text-slate-500">
              Escolha o dia, o caminhão (ou todos) e os campos do PDF.
            </p>

            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-slate-600">Dia *</span>
              <select
                value={printDate}
                onChange={(e) => {
                  setPrintDate(e.target.value);
                  setPrintSlotId('all');
                }}
                className="w-full rounded-lg border p-2"
              >
                {dates.map((d) => {
                  const [y, m, day] = d.split('-');
                  const dt = new Date(Number(y), Number(m) - 1, Number(day));
                  const label = dt.toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    day: '2-digit',
                    month: '2-digit',
                  });
                  return (
                    <option key={d} value={d}>
                      {label.charAt(0).toUpperCase() + label.slice(1)}
                    </option>
                  );
                })}
              </select>
            </label>

            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-slate-600">Caminhão / rota</span>
              <select
                value={printSlotId}
                onChange={(e) => setPrintSlotId(e.target.value)}
                className="w-full rounded-lg border p-2"
              >
                <option value="all">Todos os caminhões do dia</option>
                {printSlotsForDate.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    ({s.region_code}) {s.vehicle?.plate || s.route_label || ''} ·{' '}
                    {s.total_slots} vagas
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-4">
              <span className="mb-2 block text-sm text-slate-600">Campos no PDF</span>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {(
                  [
                    ['position', 'Posição'],
                    ['client', 'Cliente'],
                    ['service', 'Serviço'],
                    ['phone', 'Telefone'],
                    ['location', 'Localização'],
                    ['comanda', 'Comanda'],
                    ['cooperativa', 'Cooperativa'],
                    ['pago', 'Pago'],
                    ['status', 'Status'],
                    ['observation', 'Observação'],
                    ['extras', 'Extras'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={printFields[key]}
                      onChange={() => togglePrintField(key)}
                      className="h-4 w-4"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPrintDay(false)}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={printDayRoutes}
                disabled={!printDate}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                Gerar PDF
              </button>
            </div>
          </div>
        </div>
      )}
          </div>
        )}
        </section>

      {selectedWeek ? (
        <div className="space-y-6">
          {dates.length === 0 ? (
            <div className="rounded-xl bg-white p-8 text-center text-slate-500 shadow-sm">
              Nenhuma rota cadastrada nesta semana.
              {canWrite && (
                <div className="mt-3">
                  <button onClick={() => setShowNewSlot(true)} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">
                    Criar primeira rota
                  </button>
                </div>
              )}
            </div>
          ) : (
            dates.map((date) => (
              <section key={date} className="overflow-hidden rounded-xl bg-white shadow-sm">
                <div className="border-b bg-slate-50 px-5 py-3">
                  <h3 className="font-semibold capitalize text-slate-800">{formatDate(date)}</h3>
                </div>
                <div className="divide-y">
                  {slotsByDate[date].map((slot: any) => (
                                        <RouteSlotCard
                      key={slot.id}
                      slot={slot}
                      canWrite={canWrite}
                      canEdit={canEdit}
                      canDelete={canDelete}
                      canExport={canExport}
                      onEdit={() => setEditingSlot(slot)}
                      onDelete={() => deleteSlot(slot.id)}
                      onAddEntry={() => setAddingEntryTo(slot.id)}
                      onEditEntry={(entry: any) => setEditingEntry(entry)}
                      onAddExtra={(entryId: number) => setAddingExtraTo(entryId)}
                      onDeleteEntry={deleteEntry}
                      onDeleteExtra={deleteExtra}
                      onMoveEntry={moveEntry}
                      onReorderEntries={(orderedIds: number[]) =>
                        reorderEntries(slot.id, orderedIds)
                      }
                      onTransferEntry={(entry: any) => {
                        setTransferEntry(entry);
                        setTransferTargetSlotId('');
                      }}
                      onTransferSlot={() => {
                        setTransferSlot(slot);
                        setTransferNewDate(slot.date || '');
                        setTransferWeekId(String(selectedWeek?.id || ''));
                      }}
                      onExport={() => exportSlot(slot.id, slot)}
                      onToggleClosed={() =>
                        updateSlot(slot.id, { closed: !slot.closed })
                      }
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-white p-8 text-center text-slate-500 shadow-sm">
          Selecione ou crie uma semana para começar.
        </div>
      )}

      {showNewWeek && <NewWeekModal onClose={() => setShowNewWeek(false)} onSubmit={createWeek} />}
      {showNewSlot && selectedWeek && (
        <NewSlotModal weekId={selectedWeek.id} lookups={lookups} onClose={() => setShowNewSlot(false)} onSubmit={createSlot} />
      )}
      {editingSlot && (
        <EditSlotModal slot={editingSlot} lookups={lookups} onClose={() => setEditingSlot(null)} onSubmit={(data: any) => updateSlot(editingSlot.id, data)} />
      )}
      {addingEntryTo && (
        <EntryFormModal routeSlotId={addingEntryTo} onClose={() => setAddingEntryTo(null)} onSubmit={createEntry} title="Adicionar cliente" />
      )}
      {editingEntry && (
        <EntryFormModal routeSlotId={editingEntry.route_slot_id} initial={editingEntry} onClose={() => setEditingEntry(null)} onSubmit={(data: any) => updateEntry(editingEntry.id, data)} title="Editar cliente" />
      )}
      {addingExtraTo && (
        <NewExtraModal
          entryId={addingExtraTo}
          onClose={() => setAddingExtraTo(null)}
          onSubmit={createExtra}
        />
      )}
            {transferEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Transferir cliente</h3>
            <p className="mt-1 text-sm text-slate-500">
              {transferEntry.client_name} — escolha a rota/data de destino
            </p>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-slate-600">Rota de destino *</span>
              <select
                value={transferTargetSlotId}
                onChange={(e) => setTransferTargetSlotId(e.target.value)}
                className="w-full rounded-lg border p-2"
              >
                <option value="">Selecione</option>
                  {transferDayKeys.map((day) => (
                  <optgroup key={day} label={formatSlotDateLabel(day)}>
                    {slotsByDayForTransfer[day]
                      .filter((s: any) => s.id !== transferEntry.route_slot_id)
                      .map((s: any) => (
                        <option key={s.id} value={s.id}>
                          ({s.region}) {s.plate} · {s.vagas} vagas
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTransferEntry(null)}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={transferring || !transferTargetSlotId}
                onClick={confirmTransferEntry}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {transferring ? 'Transferindo…' : 'Transferir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {transferSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Transferir rota completa</h3>
            <p className="mt-1 text-sm text-slate-500">
              ({transferSlot.region_code}){' '}
              {transferSlot.vehicle?.plate || transferSlot.route_label || ''} — todos os
              clientes vão junto
            </p>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-slate-600">Nova data *</span>
              <input
                type="date"
                value={transferNewDate}
                onChange={(e) => setTransferNewDate(e.target.value)}
                className="w-full rounded-lg border p-2"
              />
            </label>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-slate-600">Semana</span>
              <select
                value={transferWeekId}
                onChange={(e) => setTransferWeekId(e.target.value)}
                className="w-full rounded-lg border p-2"
              >
                {weeks
                  .filter((w) => w.status === 'Ativa')
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label || w.start_date}
                    </option>
                  ))}
              </select>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTransferSlot(null)}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={transferring || !transferNewDate}
                onClick={confirmTransferSlot}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {transferring ? 'Transferindo…' : 'Transferir rota'}
              </button>
            </div>
          </div>
        </div>
      )}
            {transferSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Transferir rota completa</h3>
            <p className="mt-1 text-sm text-slate-500">
              ({transferSlot.region_code}){' '}
              {transferSlot.vehicle?.plate || transferSlot.route_label || ''} — todos os
              clientes vão junto
            </p>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-slate-600">Nova data *</span>
              <input
                type="date"
                value={transferNewDate}
                onChange={(e) => setTransferNewDate(e.target.value)}
                className="w-full rounded-lg border p-2"
              />
            </label>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-slate-600">Semana</span>
              <select
                value={transferWeekId}
                onChange={(e) => setTransferWeekId(e.target.value)}
                className="w-full rounded-lg border p-2"
              >
                {weeks
                  .filter((w) => w.status === 'Ativa')
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label || w.start_date}
                    </option>
                  ))}
              </select>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTransferSlot(null)}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={transferring || !transferNewDate}
                onClick={confirmTransferSlot}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {transferring ? 'Transferindo…' : 'Transferir rota'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteWeek && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-red-700">
              Excluir semana permanentemente
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Esta ação apaga a semana e todas as rotas/clientes. Não tem volta.
            </p>

            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-slate-600">
                Senha do Administrador Principal *
              </span>
              <input
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="w-full rounded-lg border p-2"
                placeholder="Digite sua senha"
                autoFocus
              />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteWeek(false);
                  setDeletePassword('');
                }}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deletingWeek || !deleteWeekId || !deletePassword}
                onClick={confirmDeleteWeek}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {deletingWeek ? 'Excluindo…' : 'Excluir definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RouteSlotCard({
  slot,
  canWrite,
  canEdit,
  canDelete,
  canExport,
  onEdit,
  onDelete,
  onAddEntry,
  onEditEntry,
  onAddExtra,
  onDeleteEntry,
  onDeleteExtra,
  onMoveEntry,
  onReorderEntries,
  onTransferEntry,
  onTransferSlot,
  onExport,
  onToggleClosed,
}: any) {
  const [dragId, setDragId] = useState<number | null>(null);
  const entries = slot.entries || [];
  const used = entries.reduce(
    (sum: number, e: any) =>
      sum + (e.slots_consumed || calcularVagas(e.service_description || '')),
    0
  );
  const total = slot.total_slots || 0;
  const available = Math.max(total - used, 0);
  const isFull = total > 0 && used >= total;
  const isClosed = slot.closed;
  const driverName = slot.driver?.name || '—';
  const secondName = slot.second_driver?.name;
  const vehiclePlate = slot.vehicle?.plate || slot.route_label || '';

  function handleDragStart(e: React.DragEvent, entryId: number) {
    if (!canWrite || !canEdit) return;
    setDragId(entryId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(entryId));
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(e: React.DragEvent, targetId: number) {
    e.preventDefault();
    const fromId = Number(e.dataTransfer.getData('text/plain') || dragId);
    setDragId(null);
    if (!fromId || fromId === targetId || !onReorderEntries) return;
    const ids = entries.map((x: any) => x.id);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, fromId);
    onReorderEntries(next);
  }

  return (
    <div className={`p-4 ${isClosed ? 'bg-slate-50' : ''}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold text-slate-900">
              {String(total).padStart(2, '0')} - ({slot.region_code})
              {vehiclePlate ? ` - ${vehiclePlate}` : ''}
            </span>
            {isClosed && (
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                Fechada
              </span>
            )}
            {isFull && !isClosed && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                Lotada
              </span>
            )}
          </div>
          <div className="mt-1 text-sm text-slate-600">
            {driverName}
            {secondName ? ` | ${secondName}` : ''}
          </div>
          <div className="mt-2 inline-flex items-center gap-2 rounded-lg border-2 border-slate-200 bg-white px-3 py-1.5 shadow-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Vagas
            </span>
            <span
              className={`text-xl font-bold ${
                available === 0
                  ? 'text-red-600'
                  : available <= 2
                  ? 'text-amber-600'
                  : 'text-green-600'
              }`}
            >
              {used}/{total || '∞'}
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                available === 0
                  ? 'bg-red-100 text-red-700'
                  : available <= 2
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-green-100 text-green-700'
              }`}
            >
              {available} livres
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onExport}
            disabled={!canExport}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Exportar Rota
          </button>
          {canWrite && (
            <>
              <button
                type="button"
                onClick={onToggleClosed}
                disabled={!canEdit}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isClosed ? 'Reabrir' : 'Fechar rota'}
              </button>
              <button
                type="button"
                onClick={onEdit}
                disabled={!canEdit}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={onTransferSlot}
                disabled={!canEdit}
                className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Transferir rota
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={!canDelete}
                className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Excluir
              </button>
              {!isClosed && !isFull && (
                <button
                  type="button"
                  onClick={onAddEntry}
                  disabled={!canEdit}
                  className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  + Cliente
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border -mx-1">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="w-14 px-3 py-2">Pos</th>
              <th className="min-w-[200px] px-3 py-2">Cliente / Serviço</th>
              <th className="min-w-[110px] whitespace-nowrap px-3 py-2">Telefone</th>
              <th className="px-3 py-2">Localização</th>
              <th className="px-3 py-2">Flags</th>
              <th className="min-w-[180px] px-3 py-2">Observação</th>
              {canWrite && <th className="w-52 px-3 py-2">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry: any, idx: number) => {
              const isReagendamento = entry.status === 'Reagendamento';
              const hasComanda = !!entry.comanda;
              const slots =
                entry.slots_consumed ||
                calcularVagas(entry.service_description || '');

              return (
                <React.Fragment key={entry.id}>
                  <tr
                    draggable={!!canWrite && !!canEdit}
                    onDragStart={(e) => handleDragStart(e, entry.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, entry.id)}
                    onDragEnd={() => setDragId(null)}
                    className={`border-t ${
                      dragId === entry.id ? 'opacity-50' : ''
                    } ${
                      isReagendamento
                        ? 'bg-amber-50'
                        : entry.pago
                        ? 'bg-green-50/50'
                        : 'hover:bg-slate-50/50'
                    } ${canWrite && canEdit ? 'cursor-grab active:cursor-grabbing' : ''}`}
                  >
                    <td className="px-3 py-2">
                      <div className="flex flex-col items-center gap-1">
                        <span
                          className="text-[10px] text-slate-400"
                          title="Arraste para reordenar"
                        >
                          ⋮⋮
                        </span>
                        <span className="font-bold text-slate-800">
                          {String(entry.position).padStart(2, '0')}°
                        </span>
                        {slots > 1 && (
                          <span className="rounded bg-blue-100 px-1.5 text-[10px] font-semibold text-blue-700">
                            {slots} vagas
                          </span>
                        )}
                        {canWrite && (
                          <div className="flex gap-0.5">
                            <button
                              type="button"
                              onClick={() => onMoveEntry(entry.id, 'up')}
                              disabled={idx === 0}
                              className="rounded bg-slate-100 px-1 text-[10px] disabled:opacity-30"
                              title="Subir"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => onMoveEntry(entry.id, 'down')}
                              disabled={idx === entries.length - 1}
                              className="rounded bg-slate-100 px-1 text-[10px] disabled:opacity-30"
                              title="Descer"
                            >
                              ↓
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">
                        {entry.client_name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {entry.service_description}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 align-top">
                      {entry.phone ? (
                        <a
                          href={`tel:${String(entry.phone).replace(/\D/g, '')}`}
                          className="text-slate-700 hover:text-brand"
                        >
                          {entry.phone}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {entry.location_link ? (
                        <a
                          href={entry.location_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-brand hover:underline"
                        >
                          Maps
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {entry.no_comanda && (
                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                            SEM COMANDA
                          </span>
                        )}
                        {hasComanda && (
                          <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                            {entry.comanda}
                          </span>
                        )}
                        {entry.cooperativa_nome && (
                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                            {entry.cooperativa_nome}
                          </span>
                        )}
                        {entry.pago && (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                            PAGO
                          </span>
                        )}
                        {isReagendamento && (
                          <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                            REAGENDAMENTO
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div
                        className="max-w-[240px] whitespace-pre-wrap break-words text-xs text-slate-600"
                        title={entry.observation || ''}
                      >
                        {entry.observation || '—'}
                      </div>
                    </td>
                    {canWrite && (
                      <td className="px-3 py-2">
                        <div className="flex flex-nowrap items-center gap-1 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onEditEntry(entry)}
                            disabled={!canEdit}
                            className="rounded bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-40"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => onTransferEntry(entry)}
                            disabled={!canEdit}
                            className="rounded bg-indigo-50 px-2 py-1 text-[10px] font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-40"
                          >
                            Transferir
                          </button>
                          <button
                            type="button"
                            onClick={() => onAddExtra(entry.id)}
                            disabled={!canEdit}
                            className="rounded bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-40"
                          >
                            + Extra
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteEntry(entry.id)}
                            disabled={!canDelete}
                            className="rounded bg-red-50 px-2 py-1 text-[10px] font-medium text-red-600 hover:bg-red-100 disabled:opacity-40"
                          >
                            Remover
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                  {(entry.extras || []).map((extra: any) => (
                    <tr key={extra.id} className="bg-slate-50/80 text-xs">
                      <td className="px-3 py-1.5"></td>
                      <td className="px-3 py-1.5 text-slate-600" colSpan={4}>
                        <span className="text-slate-400">↳</span>{' '}
                        <span className="font-medium">+ {extra.description}</span>
                        {extra.observation && (
                          <span className="ml-2 text-slate-400">
                            ({extra.observation})
                          </span>
                        )}
                      </td>
                      {canWrite && (
                        <td className="px-3 py-1.5">
                          <button
                            type="button"
                            onClick={() => onDeleteExtra(extra.id)}
                            className="rounded bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600 hover:bg-red-100"
                          >
                            Remover
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
            {entries.length === 0 && (
              <tr>
                <td
                  colSpan={canWrite ? 7 : 6}
                  className="px-3 py-6 text-center text-slate-400"
                >
                  Nenhum cliente agendado nesta rota
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EntryFormModal({ routeSlotId, initial, onClose, onSubmit, title }: any) {
  const [form, setForm] = useState({
    service_description: initial?.service_description || '',
    client_name: initial?.client_name || '',
    phone: initial?.phone || '',
    location_link: initial?.location_link || '',
    no_comanda: initial?.no_comanda || false,
    comanda: initial?.comanda || '',
    cooperativa_nome: initial?.cooperativa_nome || '',
    pago: initial?.pago || false,
    status: initial?.status || 'Normal',
    observation: initial?.observation || '',
    slots_consumed: initial?.slots_consumed || 1,
  });
  const [saving, setSaving] = useState(false);

  function set(key: string, v: any) {
    setForm((s) => {
      const next = { ...s, [key]: v };
      if (key === 'service_description') next.slots_consumed = calcularVagas(v);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit({
        route_slot_id: routeSlotId,
        service_description: form.service_description,
        client_name: form.client_name,
        phone: form.phone || null,
        location_link: form.location_link || null,
        no_comanda: form.no_comanda,
        comanda: form.comanda || null,
        cooperativa_nome: form.cooperativa_nome || null,
        pago: form.pago,
        status: form.status,
        observation: form.observation || null,
        slots_consumed: form.slots_consumed || calcularVagas(form.service_description),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold">{title}</h3>
        <form onSubmit={handleSubmit} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-slate-600">Nome do cliente *</span>
            <input type="text" required value={form.client_name} onChange={(e) => set('client_name', e.target.value)} className="w-full rounded-lg border p-2" />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-slate-600">Descrição do serviço *</span>
            <input type="text" required value={form.service_description} onChange={(e) => set('service_description', e.target.value)} className="w-full rounded-lg border p-2" placeholder="2 MONO 1CX 8M AE - (GAROPABA)" />
            <span className="mt-1 block text-xs text-slate-500">
              Vagas que este cliente consome: <strong className="text-brand">{form.slots_consumed || calcularVagas(form.service_description)}</strong>
            </span>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Telefone</span>
            <input type="text" value={form.phone} onChange={(e) => set('phone', e.target.value)} className="w-full rounded-lg border p-2" placeholder="48999999999" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Status</span>
            <select value={form.status} onChange={(e) => set('status', e.target.value)} className="w-full rounded-lg border p-2">
              <option value="Normal">Normal</option>
              <option value="Reagendamento">Reagendamento</option>
              <option value="Pendente">Pendente</option>
              <option value="Fechado">Fechado</option>
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-slate-600">Link de localização (Maps)</span>
            <input type="url" value={form.location_link} onChange={(e) => set('location_link', e.target.value)} className="w-full rounded-lg border p-2" placeholder="https://maps.app.goo.gl/..." />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Nº da Comanda</span>
            <input type="text" value={form.comanda} onChange={(e) => set('comanda', e.target.value)} className="w-full rounded-lg border p-2" placeholder="22967" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Cooperativa</span>
            <select value={form.cooperativa_nome} onChange={(e) => set('cooperativa_nome', e.target.value)} className="w-full rounded-lg border p-2">
              <option value="">Nenhuma</option>
              {COOPERATIVAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-4 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.no_comanda} onChange={(e) => set('no_comanda', e.target.checked)} className="h-4 w-4" />
              <span className="font-medium text-red-600">SEM COMANDA</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.pago} onChange={(e) => set('pago', e.target.checked)} className="h-4 w-4" />
              <span className="font-medium text-emerald-600">PAGO</span>
            </label>
          </div>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-slate-600">Observação</span>
            <textarea value={form.observation} onChange={(e) => set('observation', e.target.value)} className="h-24 w-full rounded-lg border p-2" rows={4} />
          </label>
          <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
            <button type="button" onClick={onClose} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">Cancelar</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewSlotModal({ weekId, lookups, onClose, onSubmit }: any) {
  const [form, setForm] = useState({ date: '', region_code: '', vehicle_id: '', total_slots: '6', driver_id: '', second_driver_id: '', notes: '' });
  const [saving, setSaving] = useState(false);
  function set(key: string, v: string) { setForm((s) => ({ ...s, [key]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const vehicle = (lookups.vehicles || []).find((v: any) => String(v.id) === form.vehicle_id);
      await onSubmit({
        week_id: weekId,
        date: form.date,
        region_code: form.region_code.toUpperCase(),
        route_label: vehicle ? vehicle.plate : null,
        total_slots: Number(form.total_slots) || 0,
        driver_id: form.driver_id ? Number(form.driver_id) : null,
        second_driver_id: form.second_driver_id ? Number(form.second_driver_id) : null,
        vehicle_id: form.vehicle_id ? Number(form.vehicle_id) : null,
        notes: form.notes || null,
      });
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold">Nova rota</h3>
        <form onSubmit={handleSubmit} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2"><span className="mb-1 block text-slate-600">Data *</span><input type="date" required value={form.date} onChange={(e) => set('date', e.target.value)} className="w-full rounded-lg border p-2" /></label>
          <label className="text-sm"><span className="mb-1 block text-slate-600">Região (ex: CR) *</span><input type="text" required maxLength={10} value={form.region_code} onChange={(e) => set('region_code', e.target.value)} className="w-full rounded-lg border p-2 uppercase" placeholder="CR" /></label>
          <label className="text-sm"><span className="mb-1 block text-slate-600">Caminhão (placa) *</span>
            <select required value={form.vehicle_id} onChange={(e) => set('vehicle_id', e.target.value)} className="w-full rounded-lg border p-2">
              <option value="">Selecione a placa</option>
              {(lookups.vehicles || []).map((v: any) => <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>)}
            </select>
          </label>
          <label className="text-sm"><span className="mb-1 block text-slate-600">Total de vagas *</span><input type="number" min={0} required value={form.total_slots} onChange={(e) => set('total_slots', e.target.value)} className="w-full rounded-lg border p-2" /></label>
          <label className="text-sm"><span className="mb-1 block text-slate-600">Motorista</span>
            <select value={form.driver_id} onChange={(e) => set('driver_id', e.target.value)} className="w-full rounded-lg border p-2">
              <option value="">Selecione</option>
              {(lookups.drivers || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="text-sm"><span className="mb-1 block text-slate-600">2º Motorista</span>
            <select value={form.second_driver_id} onChange={(e) => set('second_driver_id', e.target.value)} className="w-full rounded-lg border p-2">
              <option value="">Selecione</option>
              {(lookups.drivers || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="text-sm sm:col-span-2"><span className="mb-1 block text-slate-600">Observações</span><textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} className="h-16 w-full rounded-lg border p-2" /></label>
          <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
            <button type="button" onClick={onClose} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">Cancelar</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? 'Salvando…' : 'Criar rota'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditSlotModal({ slot, lookups, onClose, onSubmit }: any) {
  const [form, setForm] = useState({
    region_code: slot.region_code || '',
    vehicle_id: slot.vehicle_id ? String(slot.vehicle_id) : '',
    total_slots: String(slot.total_slots ?? 0),
    driver_id: slot.driver_id ? String(slot.driver_id) : '',
    second_driver_id: slot.second_driver_id ? String(slot.second_driver_id) : '',
    closed: slot.closed,
    notes: slot.notes || '',
  });
  const [saving, setSaving] = useState(false);
  function set(key: string, v: any) { setForm((s) => ({ ...s, [key]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const vehicle = (lookups.vehicles || []).find((v: any) => String(v.id) === form.vehicle_id);
      await onSubmit({
        region_code: form.region_code.toUpperCase(),
        route_label: vehicle ? vehicle.plate : null,
        total_slots: Number(form.total_slots) || 0,
        driver_id: form.driver_id ? Number(form.driver_id) : null,
        second_driver_id: form.second_driver_id ? Number(form.second_driver_id) : null,
        vehicle_id: form.vehicle_id ? Number(form.vehicle_id) : null,
        closed: form.closed,
        notes: form.notes || null,
      });
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold">Editar rota</h3>
        <form onSubmit={handleSubmit} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm"><span className="mb-1 block text-slate-600">Região *</span><input type="text" required value={form.region_code} onChange={(e) => set('region_code', e.target.value)} className="w-full rounded-lg border p-2 uppercase" /></label>
          <label className="text-sm"><span className="mb-1 block text-slate-600">Caminhão (placa)</span>
            <select value={form.vehicle_id} onChange={(e) => set('vehicle_id', e.target.value)} className="w-full rounded-lg border p-2">
              <option value="">Selecione</option>
              {(lookups.vehicles || []).map((v: any) => <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>)}
            </select>
          </label>
          <label className="text-sm"><span className="mb-1 block text-slate-600">Total de vagas</span><input type="number" min={0} value={form.total_slots} onChange={(e) => set('total_slots', e.target.value)} className="w-full rounded-lg border p-2" /></label>
          <label className="flex items-center gap-2 pt-6 text-sm">
            <input type="checkbox" checked={form.closed} onChange={(e) => set('closed', e.target.checked)} className="h-4 w-4" />
            <span className="text-slate-600">Rota fechada</span>
          </label>
          <label className="text-sm"><span className="mb-1 block text-slate-600">Motorista</span>
            <select value={form.driver_id} onChange={(e) => set('driver_id', e.target.value)} className="w-full rounded-lg border p-2">
              <option value="">Selecione</option>
              {(lookups.drivers || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="text-sm"><span className="mb-1 block text-slate-600">2º Motorista</span>
            <select value={form.second_driver_id} onChange={(e) => set('second_driver_id', e.target.value)} className="w-full rounded-lg border p-2">
              <option value="">Selecione</option>
              {(lookups.drivers || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="text-sm sm:col-span-2"><span className="mb-1 block text-slate-600">Observações</span><textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} className="h-16 w-full rounded-lg border p-2" /></label>
          <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
            <button type="button" onClick={onClose} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">Cancelar</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? 'Salvando…' : 'Salvar alterações'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewWeekModal({ onClose, onSubmit }: any) {
  const [startDate, setStartDate] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try { await onSubmit({ start_date: startDate, label: label || undefined }); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold">Nova semana</h3>
        <p className="mt-1 text-sm text-slate-500">Informe a data da segunda-feira da semana.</p>
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block text-sm"><span className="mb-1 block text-slate-600">Data de início (segunda) *</span><input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-lg border p-2" /></label>
          <label className="block text-sm"><span className="mb-1 block text-slate-600">Rótulo (opcional)</span><input type="text" placeholder="Ex: Semana 24/08 a 28/08" value={label} onChange={(e) => setLabel(e.target.value)} className="w-full rounded-lg border p-2" /></label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">Cancelar</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? 'Criando…' : 'Criar semana'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewExtraModal({ entryId, onClose, onSubmit }: any) {
  const [description, setDescription] = useState('');
  const [observation, setObservation] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit({ entry_id: entryId, description, observation: observation || null, status: 'Normal' });
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold">Adicionar extra</h3>
        <p className="mt-1 text-sm text-slate-500">Extras (ex: cavalete de água) <strong>não descontam vaga</strong>.</p>
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block text-sm"><span className="mb-1 block text-slate-600">Descrição *</span><input type="text" required value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-lg border p-2" placeholder="CAVALETE DE AGUA" /></label>
          <label className="block text-sm"><span className="mb-1 block text-slate-600">Observação</span><input type="text" value={observation} onChange={(e) => setObservation(e.target.value)} className="w-full rounded-lg border p-2" /></label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">Cancelar</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? 'Salvando…' : 'Adicionar extra'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}