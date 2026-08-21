'use client';
import {useEffect,useState} from 'react';
import {request} from '@/lib/api';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import {BarChart3,Box,ClipboardList,Fuel,Settings,Truck,Users,UserRound, Wrench, LogOut, LayoutDashboard, PackagePlus, PackageMinus, AlertTriangle, Menu, X} from 'lucide-react';

const items=[['dashboard','Dashboard',LayoutDashboard],['vehicles','Veículos',Truck],['drivers','Motoristas',UserRound],['maintenance','Manutenção',Wrench],['fuel','Combustível',Fuel],['stock','Estoque',Box],['entry','Entradas',PackagePlus],['output','Saídas',PackageMinus],['movements','Movimentações',ClipboardList],['reports','Relatórios',BarChart3],['users','Usuários',Users],['settings','Configurações',Settings]] as const;
const resource:any={vehicles:'vehicles',drivers:'drivers',maintenance:'maintenance',fuel:'fuel',stock:'products',settings:'settings'};
const moduleAccess:any={ADMINISTRADOR:['*'],GERENTE:['dashboard','vehicles','drivers','maintenance','fuel','stock','reports'],LOGÍSTICA:['dashboard','vehicles','drivers','fuel'],ESTOQUE:['dashboard','stock','entry','output','movements'],MOTORISTA:[],CONSULTA:['dashboard','vehicles','drivers','maintenance','fuel','stock','reports']};
function titleFor(k:string){return ({dashboard:'Dashboard',vehicles:'Veículos',drivers:'Motoristas',maintenance:'Manutenção',fuel:'Combustível',stock:'Estoque',settings:'Configurações',entry:'Entradas',output:'Saídas',movements:'Movimentações',reports:'Relatórios',users:'Usuários'} as any)[k]||k}

const MODULE_OPTIONS=items.filter(([k])=>k!=='users').map(([k,label])=>({value:k as string,label:label as string}));
function expandPermissions(keys:string[]):string[]{
 const s=new Set(keys);
 if(s.has('stock')){s.add('entry');s.add('output');s.add('movements')}
 if(s.has('entry')||s.has('output')||s.has('movements')){s.add('stock')}
 return Array.from(s);
}
function resourceIdOf(page:string,row:any){ return page==='settings' ? row.key : row.id; }

type FieldType='text'|'number'|'date'|'datetime'|'select'|'textarea'|'vehicle'|'driver'|'product'|'modules';
type FieldDef={key:string,label:string,type:FieldType,required?:boolean,options?:string[],step?:string};

const FIELDS:Record<string,FieldDef[]>={
  vehicles:[
    {key:'plate',label:'Placa',type:'text',required:true},
    {key:'brand',label:'Marca',type:'text',required:true},
    {key:'model',label:'Modelo',type:'text',required:true},
    {key:'year',label:'Ano',type:'number'},
    {key:'type',label:'Tipo',type:'text'},
    {key:'capacity',label:'Capacidade (kg)',type:'number',step:'0.01'},
    {key:'average_consumption',label:'Consumo médio (km/l)',type:'number',step:'0.01'},
    {key:'current_km',label:'KM atual',type:'number',step:'0.01'},
    {key:'fuel_type',label:'Combustível',type:'select',options:['Diesel','Gasolina','Etanol','Flex','Elétrico']},
    {key:'status',label:'Status',type:'select',options:['Disponível','Em rota','Manutenção','Inativo']},
    {key:'notes',label:'Observações',type:'textarea'},
  ],
  drivers:[
    {key:'name',label:'Nome',type:'text',required:true},
    {key:'cpf',label:'CPF',type:'text',required:true},
    {key:'phone',label:'Telefone',type:'text'},
    {key:'cnh',label:'CNH',type:'text',required:true},
    {key:'category',label:'Categoria CNH',type:'select',options:['A','B','C','D','E','AB','AC','AD','AE']},
    {key:'cnh_expiry',label:'Validade CNH',type:'date'},
    {key:'vehicle_id',label:'Veículo',type:'vehicle'},
    {key:'status',label:'Status',type:'select',options:['Ativo','Inativo','Férias','Afastado']},
    {key:'notes',label:'Observações',type:'textarea'},
  ],
  maintenance:[
    {key:'vehicle_id',label:'Veículo',type:'vehicle',required:true},
    {key:'type',label:'Tipo',type:'select',options:['Preventiva','Corretiva'],required:true},
    {key:'status',label:'Status',type:'select',options:['Agendado','Em andamento','Concluído','Atrasado'],required:true},
    {key:'description',label:'Descrição',type:'textarea',required:true},
    {key:'date',label:'Data e hora agendada',type:'datetime',required:true},
    {key:'km',label:'KM no serviço',type:'number',step:'0.01'},
    {key:'next_km',label:'Próxima KM',type:'number',step:'0.01'},
    {key:'next_date',label:'Próxima data',type:'date'},
    {key:'value',label:'Valor',type:'number',step:'0.01'},
    {key:'workshop',label:'Oficina',type:'text'},
    {key:'responsible',label:'Responsável',type:'text'},
    {key:'notes',label:'Observações',type:'textarea'},
  ],
  fuel:[
    {key:'vehicle_id',label:'Veículo',type:'vehicle',required:true},
    {key:'driver_id',label:'Motorista',type:'driver'},
    {key:'date',label:'Data',type:'date',required:true},
    {key:'km',label:'KM',type:'number',step:'0.01',required:true},
    {key:'liters',label:'Litros',type:'number',step:'0.001',required:true},
    {key:'price_per_liter',label:'Preço por litro',type:'number',step:'0.001',required:true},
    {key:'total_value',label:'Valor total',type:'number',step:'0.01',required:true},
    {key:'station',label:'Posto',type:'text'},
    {key:'fuel_type',label:'Combustível',type:'select',options:['Diesel','Gasolina','Etanol','Flex']},
  ],
  stock:[
    {key:'code',label:'Código',type:'text',required:true},
    {key:'name',label:'Nome',type:'text',required:true},
    {key:'model',label:'Modelo',type:'text'},
    {key:'category',label:'Categoria',type:'text'},
    {key:'unit',label:'Unidade',type:'text'},
    {key:'minimum_stock',label:'Estoque mínimo',type:'number',step:'0.01'},
    {key:'location',label:'Localização',type:'text'},
    {key:'supplier',label:'Fornecedor',type:'text'},
    {key:'unit_value',label:'Valor unitário',type:'number',step:'0.01'},
    {key:'notes',label:'Observações',type:'textarea'},
  ],
  settings:[
    {key:'key',label:'Chave',type:'text',required:true},
    {key:'value',label:'Valor',type:'text'},
  ],
  entry:[
    {key:'product_id',label:'Produto',type:'product',required:true},
    {key:'quantity',label:'Quantidade',type:'number',step:'0.01',required:true},
    {key:'responsible',label:'Responsável',type:'text'},
    {key:'sector',label:'Setor',type:'text'},
    {key:'invoice',label:'Nota fiscal',type:'text'},
    {key:'unit_value',label:'Valor unitário',type:'number',step:'0.01'},
    {key:'observation',label:'Observação',type:'textarea'},
  ],
  output:[
    {key:'product_id',label:'Produto',type:'product',required:true},
    {key:'quantity',label:'Quantidade',type:'number',step:'0.01',required:true},
    {key:'responsible',label:'Responsável (quem entregou)',type:'text'},
    {key:'sector',label:'Setor',type:'text'},
    {key:'vehicle_id',label:'Veículo (se aplicável)',type:'vehicle'},
    {key:'recipient',label:'Retirado por (nome de quem está pegando o material)',type:'text',required:true},
    {key:'observation',label:'Observação',type:'textarea'},
  ],
  users:[
    {key:'name',label:'Nome',type:'text',required:true},
    {key:'username',label:'Usuário',type:'text',required:true},
    {key:'password',label:'Senha temporária',type:'text',required:true},
    {key:'role',label:'Perfil',type:'select',options:['ADMINISTRADOR','GERENTE','LOGÍSTICA','ESTOQUE','MOTORISTA','CONSULTA'],required:true},
    {key:'permissions',label:'Permissões específicas',type:'modules'},
  ],
};

const USER_EDIT_FIELDS:FieldDef[]=[
  {key:'name',label:'Nome completo',type:'text',required:true},
  {key:'username',label:'Nome de usuário (login)',type:'text',required:true},
  {key:'role',label:'Perfil',type:'select',options:['ADMINISTRADOR','GERENTE','LOGÍSTICA','ESTOQUE','MOTORISTA','CONSULTA'],required:true},
  {key:'permissions',label:'Permissões específicas',type:'modules'},
  {key:'active',label:'Ativo',type:'select',options:['Sim','Não'],required:true},
  {key:'password',label:'Nova senha (deixe em branco para manter a atual)',type:'text'},
];

const LABELS:Record<string,string>={
 id:'ID',name:'Nome',username:'Usuário',role:'Perfil',active:'Ativo',must_change_password:'Trocar senha',permissions:'Permissões',is_main_admin:'Admin. Principal',status:'Status',
 plate:'Placa',brand:'Marca',model:'Modelo',year:'Ano',type:'Tipo',capacity:'Capacidade',average_consumption:'Consumo médio',current_km:'KM atual',fuel_type:'Combustível',notes:'Observações',
 cpf:'CPF',phone:'Telefone',cnh:'CNH',category:'Categoria',cnh_expiry:'Validade CNH',vehicle_id:'Veículo',
 description:'Descrição',date:'Data',km:'KM',next_km:'Próxima KM',next_date:'Próxima data',value:'Valor',workshop:'Oficina',responsible:'Responsável',
 liters:'Litros',price_per_liter:'Preço/litro',total_value:'Valor total',station:'Posto',recipient:'Retirado por',
 code:'Código',minimum_stock:'Estoque mínimo',location:'Localização',supplier:'Fornecedor',unit_value:'Valor unitário',unit:'Unidade',quantity:'Quantidade',
 key:'Chave',created_at:'Criado em',occurred_at:'Data',product_id:'Produto',user_id:'Registrado por',invoice:'Nota fiscal',observation:'Observação',sector:'Setor',
};
function labelFor(k:string){return LABELS[k]||k.replace(/_/g,' ')}
const HIDDEN_TABLE_COLUMNS:Record<string,string[]>={users:['permissions']}
// Para módulos de movimentação, define exatamente quais colunas aparecem (a ordem natural do banco
// cortava em 7 colunas e deixava de fora Observação/Retirado por).
const TABLE_COLUMNS:Record<string,string[]>={
 output:['occurred_at','product_id','quantity','responsible','recipient','sector','observation'],
 entry:['occurred_at','product_id','quantity','responsible','sector','invoice','observation'],
 movements:['occurred_at','type','product_id','quantity','responsible','recipient','sector'],
};

function isIsoDateTime(x:any){return typeof x==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(x)}
function readable(x:any):string{
 if(x===null||x===undefined) return '—';
 if(typeof x==='boolean') return x?'Sim':'Não';
 if(isIsoDateTime(x)){
  const d=new Date(x);
  return isNaN(d.getTime())?x:d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
 }
 if(typeof x==='object') return JSON.stringify(x);
 return String(x);
}
// Produto agora é identificado pelo ID (sequencial, sempre começa em 1), não pelo código digitado.
function resolveCell(key:string,value:any,lookups:any):string{
 if(value===null||value===undefined) return '—';
 if(key==='vehicle_id'){ const v=(lookups.vehicles||[]).find((x:any)=>x.id===value); return v?`${v.plate} — ${v.brand} ${v.model}`:readable(value); }
 if(key==='driver_id'){ const d=(lookups.drivers||[]).find((x:any)=>x.id===value); return d?d.name:readable(value); }
 if(key==='product_id'){ const p=(lookups.products||[]).find((x:any)=>x.id===value); return p?`${p.id} — ${p.name}`:readable(value); }
 return readable(value);
}
function statusClasses(v:string):string{
 const s=(v||'').toLowerCase();
 if(['concluído','concluido','disponível','disponivel','ativo'].includes(s)) return 'bg-green-100 text-green-700';
 if(['em andamento','em rota'].includes(s)) return 'bg-blue-100 text-blue-700';
 if(['atrasado','inativo','manutenção','manutencao'].includes(s)) return 'bg-red-100 text-red-700';
 return 'bg-slate-100 text-slate-700';
}

export default function AppShell({user,onLogout,onUserUpdate}:{user:any,onLogout:()=>void,onUserUpdate:(u:any)=>void}){
 const [page,setPage]=useState('dashboard'),[rows,setRows]=useState<any[]>([]),[metrics,setMetrics]=useState<any>(),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const [lookups,setLookups]=useState<{vehicles:any[],drivers:any[],products:any[]}>({vehicles:[],drivers:[],products:[]});
 const [editingUser,setEditingUser]=useState<any>(null);
 const [editingResource,setEditingResource]=useState<any>(null);
 const [editingMovement,setEditingMovement]=useState<any>(null);
 const [showAccount,setShowAccount]=useState(false);
 const [mobileMenuOpen,setMobileMenuOpen]=useState(false);
 const isMainAdmin=!!user.is_main_admin;
 const allowed=(key:string)=>isMainAdmin||(user.permissions?user.permissions.split(',').includes(key):(moduleAccess[user.role]||[]).includes('*')||(moduleAccess[user.role]||[]).includes(key));
 async function load(p=page){
  setError('');setLoading(true);
  try{
   if(p==='dashboard') setMetrics(await request('/dashboard'));
   else if(p==='movements') setRows(await request('/stock/movements'));
   else if(p==='entry') setRows((await request('/stock/movements') as any[]).filter(m=>m.type==='ENTRADA'));
   else if(p==='output') setRows((await request('/stock/movements') as any[]).filter(m=>m.type==='SAÍDA'));
   else if(p==='users') setRows(await request('/users'));
   else if(resource[p]) setRows(await request('/'+resource[p]));
   else setRows([]);
  }catch(e:any){setError(e.message)}finally{setLoading(false)}
 }
 useEffect(()=>{load();setEditingUser(null);setEditingResource(null);setEditingMovement(null)},[page]);
 useEffect(()=>{
  Promise.all([
   request('/vehicles').catch(()=>[]),
   request('/drivers').catch(()=>[]),
   request('/products').catch(()=>[]),
  ]).then(([vehicles,drivers,products])=>setLookups({vehicles,drivers,products}));
 },[]);
 async function create(data:any){
  setError('');
  try{
   if(page==='entry'||page==='output') await request('/stock/'+page,{method:'POST',body:JSON.stringify(data)});
   else await request('/'+(page==='users'?'users':resource[page]),{method:'POST',body:JSON.stringify(page==='users'?data:{data})});
   load();
  }catch(e:any){setError(e.message)}
 }
 async function updateUser(id:number,data:any){
  setError('');
  try{await request('/users/'+id,{method:'PATCH',body:JSON.stringify({data})});setEditingUser(null);load()}catch(e:any){setError(e.message)}
 }
 async function deleteUser(id:number){
  if(!confirm('Tem certeza que deseja excluir este usuário?')) return;
  setError('');
  try{await request('/users/'+id,{method:'DELETE'});load()}catch(e:any){setError(e.message)}
 }
 async function updateResource(id:string|number,data:any){
  setError('');
  try{await request('/'+resource[page]+'/'+id,{method:'PATCH',body:JSON.stringify({data})});setEditingResource(null);load()}catch(e:any){setError(e.message)}
 }
 async function deleteResource(id:string|number){
  if(!confirm('Tem certeza que deseja excluir este registro?')) return;
  setError('');
  try{await request('/'+resource[page]+'/'+id,{method:'DELETE'});load()}catch(e:any){setError(e.message)}
 }
 async function updateMovement(id:number,data:any){
  setError('');
  try{await request('/stock/movements/'+id,{method:'PATCH',body:JSON.stringify(data)});setEditingMovement(null);load()}catch(e:any){setError(e.message)}
 }
 async function deleteMovement(id:number){
  const password=window.prompt('Confirme sua senha para excluir este registro:');
  if(password===null) return;
  if(!confirm('Tem certeza que deseja excluir esta movimentação? O estoque será ajustado de volta.')) return;
  setError('');
  try{await request('/stock/movements/'+id,{method:'DELETE',body:JSON.stringify({password})});load()}catch(e:any){setError(e.message)}
 }
 async function logout(){await request('/auth/logout',{method:'POST'}).catch(()=>{});onLogout()}
 function goTo(k:string){setPage(k);setMobileMenuOpen(false)}
 return <div className="min-h-screen md:flex">
  {/* Barra superior — só em telas pequenas */}
  <div className="flex items-center justify-between bg-navy p-4 text-white md:hidden">
   <span className="flex items-center gap-2 font-bold"><span className="text-cyan-400">◆</span>BILL LOGÍSTICA</span>
   <button onClick={()=>setMobileMenuOpen(true)} aria-label="Abrir menu"><Menu size={24}/></button>
  </div>
  {/* Fundo escurecido ao abrir o menu no mobile */}
  {mobileMenuOpen&&<div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={()=>setMobileMenuOpen(false)}/>}
  {/* Menu lateral — vira gaveta deslizante no mobile, fixo em telas maiores */}
  <aside className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] transform bg-navy text-slate-200 transition-transform duration-200 md:static md:z-auto md:w-64 md:min-h-screen md:translate-x-0 ${mobileMenuOpen?'translate-x-0':'-translate-x-full'}`}>
   <div className="flex items-center justify-between p-5 text-lg font-bold text-white">
    <span><span className="mr-2 text-cyan-400">◆</span>BILL LOGÍSTICA</span>
    <button className="md:hidden" onClick={()=>setMobileMenuOpen(false)} aria-label="Fechar menu"><X size={22}/></button>
   </div>
   <nav className="px-2 pb-3">
    {items.filter(([k])=>allowed(k)).map(([k,label,Icon])=><button key={k} onClick={()=>goTo(k)} className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm ${page===k?'bg-cyan-700 text-white':'hover:bg-slate-700'}`}><Icon size={18}/>{label}</button>)}
   </nav>
   <button onClick={logout} className="m-4 flex items-center gap-2 text-sm text-slate-300"><LogOut size={17}/> Sair</button>
  </aside>
  <main className="min-w-0 flex-1 p-4 md:p-8">
   <header className="mb-7 flex items-center justify-between">
    <h1 className="text-2xl font-bold">{page==='dashboard'?'Visão geral':titleFor(page)}</h1>
    <div className="relative"><button onClick={()=>setShowAccount(s=>!s)} className="rounded-full bg-white px-3 py-2 text-sm shadow-sm">{user.name}</button>{showAccount&&<AccountPanel user={user} onClose={()=>setShowAccount(false)} onUserUpdate={onUserUpdate}/>}</div>
   </header>
   {error&&<div className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</div>}
   {page==='dashboard'
  ? <Dashboard
  metrics={metrics}
  onNavigate={goTo}
/>
  : <Module page={page} rows={rows} loading={loading} create={create} isAdmin={isMainAdmin} lookups={lookups} editingUser={editingUser} setEditingUser={setEditingUser} updateUser={updateUser} deleteUser={deleteUser} editingResource={editingResource} setEditingResource={setEditingResource} updateResource={updateResource} deleteResource={deleteResource} editingMovement={editingMovement} setEditingMovement={setEditingMovement} updateMovement={updateMovement} deleteMovement={deleteMovement}/>}
  </main>
 </div>
}

function AccountPanel({user,onClose,onUserUpdate}:{user:any,onClose:()=>void,onUserUpdate:(u:any)=>void}){
 const [name,setName]=useState(user.name||'');
 const [nameMsg,setNameMsg]=useState(''),[nameErr,setNameErr]=useState(''),[savingName,setSavingName]=useState(false);
 const [current,setCurrent]=useState(''),[next,setNext]=useState(''),[msg,setMsg]=useState(''),[err,setErr]=useState(''),[saving,setSaving]=useState(false);
 async function submitName(e:React.FormEvent){
  e.preventDefault();setSavingName(true);setNameErr('');setNameMsg('');
  try{
   const updated=await request('/auth/profile',{method:'PATCH',body:JSON.stringify({name})});
   onUserUpdate(updated);setNameMsg('Nome atualizado.');
  }catch(e:any){setNameErr(e.message)}finally{setSavingName(false)}
 }
 async function submitPassword(e:React.FormEvent){
  e.preventDefault();setSaving(true);setErr('');setMsg('');
  try{
   await request('/auth/change-password',{method:'POST',body:JSON.stringify({current_password:current,new_password:next})});
   setMsg('Senha alterada com sucesso.');setCurrent('');setNext('');
  }catch(e:any){setErr(e.message)}finally{setSaving(false)}
 }
 return <div className="absolute right-0 top-14 z-10 w-[min(20rem,90vw)] rounded-xl border bg-white p-4 shadow-lg space-y-4">
  <div className="flex items-center justify-between"><h4 className="text-sm font-semibold">Minha conta</h4><button onClick={onClose} className="text-xs text-slate-500 hover:underline">Fechar</button></div>
  <form onSubmit={submitName} className="space-y-2" autoComplete="off">
   <p className="text-xs font-medium text-slate-500">Nome</p>
   {nameErr&&<p className="text-xs text-red-600">{nameErr}</p>}
   {nameMsg&&<p className="text-xs text-green-600">{nameMsg}</p>}
   <input type="text" value={name} onChange={e=>setName(e.target.value)} required className="w-full rounded-lg border p-2 text-sm"/>
   <button disabled={savingName} className="w-full rounded-lg bg-slate-100 p-2 text-sm font-medium text-slate-700 disabled:opacity-60">{savingName?'Salvando…':'Salvar nome'}</button>
  </form>
  <form onSubmit={submitPassword} className="space-y-2 border-t pt-4" autoComplete="off">
   <p className="text-xs font-medium text-slate-500">Senha</p>
   {err&&<p className="text-xs text-red-600">{err}</p>}
   {msg&&<p className="text-xs text-green-600">{msg}</p>}
   <input type="password" autoComplete="off" placeholder="Senha atual" value={current} onChange={e=>setCurrent(e.target.value)} required className="w-full rounded-lg border p-2 text-sm"/>
   <input type="password" autoComplete="new-password" placeholder="Nova senha (mín. 12 caracteres)" value={next} onChange={e=>setNext(e.target.value)} required minLength={12} className="w-full rounded-lg border p-2 text-sm"/>
   <button disabled={saving} className="w-full rounded-lg bg-brand p-2 text-sm font-medium text-white disabled:opacity-60">{saving?'Salvando…':'Salvar nova senha'}</button>
  </form>
 </div>
}

function Dashboard({
  metrics,
  onNavigate
}:{
  metrics:any,
  onNavigate:(page:string)=>void
}){

  const [dismissed,setDismissed]=useState(true);

  useEffect(()=>{
    setDismissed(false);
  },[metrics]);

  function dismiss(){
    localStorage.setItem('maint_alert_dismissed',new Date().toISOString().slice(0,10));
    setDismissed(true);
  }

  const cards=[
    {
      label:'Veículos disponíveis',
      value:metrics?.available,
      icon:'🚛',
      page:'vehicles'
    },
    {
      label:'Em rota',
      value:metrics?.on_route,
      icon:'🗺️',
      page:'vehicles'
    },
    {
      label:'Em manutenção',
      value:metrics?.maintenance,
      icon:'🔧',
      page:'maintenance'
    },
    {
      label:'Manutenções concluídas',
      value:metrics?.maintenance_completed,
      icon:'✅',
      page:'maintenance'
    },
    {
      label:'Produtos em estoque',
      value:metrics?.products,
      icon:'📦',
      page:'stock'
    },
    {
      label:'Estoque baixo',
      value:metrics?.low_stock,
      icon:'⚠️',
      page:'stock'
    },
    {
      label:'Custo combustível',
      value:metrics?.fuel_cost?.toLocaleString('pt-BR',{
        style:'currency',
        currency:'BRL'
      }),
      icon:'⛽',
      page:'fuel'
    }
  ];

  const hasAlerts=
    !dismissed &&
    (
      (metrics?.maintenance_today>0) ||
      (metrics?.maintenance_overdue>0)
    );

    {!dismissed &&
  (
    (metrics?.maintenance_today > 0) ||
    (metrics?.maintenance_overdue > 0) ||
    (metrics?.maintenance_alerts?.length > 0)
  ) && (

  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">

    <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">

      <div className="mb-5 flex items-center gap-3">

        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl">
          ⚠️
        </div>

        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Aviso de manutenção
          </h2>

          <p className="text-sm text-slate-500">
            Existem manutenções que precisam da sua atenção.
          </p>
        </div>

      </div>

      <div className="space-y-3">

        {metrics?.maintenance_today > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">

            <div className="font-semibold text-amber-800">
              📅 Manutenções de hoje
            </div>

            <div className="mt-1 text-sm text-amber-700">
              Existem <strong>{metrics.maintenance_today}</strong>{' '}
              manutenção(ões) agendada(s) para hoje.
            </div>

          </div>
        )}

        {metrics?.maintenance_overdue > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">

            <div className="font-semibold text-red-800">
              🚨 Manutenções atrasadas
            </div>

            <div className="mt-1 text-sm text-red-700">
              Existem <strong>{metrics.maintenance_overdue}</strong>{' '}
              manutenção(ões) atrasada(s).
            </div>

          </div>
        )}

        {metrics?.maintenance_alerts?.length > 0 && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">

            <div className="font-semibold text-blue-800">
              🔧 Manutenções em andamento
            </div>

            <div className="mt-1 text-sm text-blue-700">
              Existem{' '}
              <strong>{metrics.maintenance_alerts.length}</strong>{' '}
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
          onClick={()=>{
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

  return <>

    {hasAlerts&&
      <section className="mb-6 space-y-2">

        {metrics?.maintenance_overdue>0&&
          <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
            <span className="flex items-center gap-3">
              <AlertTriangle size={20}/>
              <span>
                <strong>{metrics.maintenance_overdue}</strong>
                {' '}manutenção(ões) atrasada(s) — verifique a aba Manutenção.
              </span>
            </span>

            <button
              onClick={dismiss}
              className="text-xs text-red-700 hover:underline"
            >
              Dispensar
            </button>
          </div>
        }

        {metrics?.maintenance_today>0&&
          <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
            <span className="flex items-center gap-3">
              <AlertTriangle size={20}/>
              <span>
                <strong>{metrics.maintenance_today}</strong>
                {' '}manutenção(ões) agendada(s) para hoje.
              </span>
            </span>

            <button
              onClick={dismiss}
              className="text-xs text-amber-700 hover:underline"
            >
              Dispensar
            </button>
          </div>
        }

      </section>
    }

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

      {cards.map(card=>

        <article
          key={card.label}
          onClick={()=>onNavigate(card.page)}
          role="button"
          tabIndex={0}
          onKeyDown={e=>{
            if(e.key==='Enter'||e.key===' '){
              e.preventDefault();
              onNavigate(card.page);
            }
          }}
          className="cursor-pointer rounded-xl bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg active:scale-[0.98]"
        >

          <div className="text-xl">
            {card.icon}
          </div>

          <div className="mt-3 text-2xl font-bold">
            {card.value??'—'}
          </div>

          <div className="text-sm text-slate-500">
            {card.label}
          </div>

          <div className="mt-2 text-xs font-medium text-cyan-600">
            
          </div>

        </article>

      )}

    </section>

    

  </>;
}

const REPORT_SOURCES=[
 {value:'vehicles',label:'Veículos',path:'/vehicles'},
 {value:'drivers',label:'Motoristas',path:'/drivers'},
 {value:'maintenance',label:'Manutenção',path:'/maintenance'},
 {value:'fuel',label:'Combustível',path:'/fuel'},
 {value:'products',label:'Estoque',path:'/products'},
 {value:'movements',label:'Movimentações de estoque',path:'/stock/movements'},
];

function cleanRowForReport(r:any,lookups:any){
 const out:Record<string,any>={};
 for(const [k,v] of Object.entries(r)){
  if(k==='password_hash') continue;
  let val:any=v;
  if(k==='vehicle_id'||k==='driver_id'||k==='product_id'){ val=resolveCell(k,v,lookups); }
  else if(isIsoDateTime(v)){ const d=new Date(v as string); val=isNaN(d.getTime())?v:d.toLocaleDateString('pt-BR'); }
  else if(v===null||v===undefined){ val=''; }
  else if(typeof v==='boolean'){ val=v?'Sim':'Não'; }
  out[labelFor(k)]=val;
 }
 return out;
}

function exportExcelMulti(datasets:{cfg:any,rows:any[]}[]){
  const book = XLSX.utils.book_new();

  const today = new Date().toLocaleDateString('pt-BR');

  const data:any[][] = [];

  // Cabeçalho geral
  data.push(['BILL LOGÍSTICA']);
  data.push([`Relatório geral`]);
  data.push([`Gerado em: ${today}`]);
  data.push([]);

  datasets.forEach(({cfg,rows}) => {

    // Título do módulo
    data.push([cfg.label]);

    if(!rows.length){
      data.push(['Nenhum registro encontrado.']);
      data.push([]);
      return;
    }

    const headers = Object.keys(rows[0]);

    // Cabeçalho da tabela
    data.push(headers);

    // Dados
    rows.forEach(row => {
      data.push(
        headers.map(header => row[header] ?? '')
      );
    });

    // Espaçamento entre módulos
    data.push([]);
    data.push([]);
  });

  const sheet = XLSX.utils.aoa_to_sheet(data);

  /*
   * Calcula automaticamente a largura das colunas
   * baseada no maior conteúdo encontrado.
   */
  const columnCount = Math.max(
    ...data.map(row => row.length)
  );

  const widths = Array.from(
    {length: columnCount},
    (_, colIndex) => {

      let maxLength = 10;

      data.forEach(row => {
        const value = row[colIndex];

        if(value !== undefined && value !== null){
          const length = String(value).length;

          if(length > maxLength){
            maxLength = length;
          }
        }
      });

      // Evita colunas absurdamente largas
      return {
        wch: Math.min(
          Math.max(maxLength + 2, 10),
          35
        )
      };
    }
  );

  sheet['!cols'] = widths;

  /*
   * Altura padrão das linhas.
   */
  sheet['!rows'] = data.map(() => ({
    hpt: 18
  }));

  /*
   * Congela o cabeçalho inicial.
   */
  sheet['!freeze'] = {
    xSplit: 0,
    ySplit: 4
  };

  XLSX.utils.book_append_sheet(
    book,
    sheet,
    'Relatório'
  );

  XLSX.writeFile(
    book,
    `Bill_Logistica_Relatorio_${today.replace(/\//g,'-')}.xlsx`
  );
}

function exportPdfMulti(
  datasets: { cfg: any; rows: any[] }[],
  fontSizeOption: 'small' | 'medium' | 'large'
) {
  // A4 horizontal
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const today = new Date().toLocaleDateString('pt-BR');

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Margem segura para garantir que nada saia da folha
  const margin = 7;

  // Largura máxima utilizável da folha
  const availableWidth = pageWidth - (margin * 2);

  // =========================
  // CABEÇALHO
  // =========================

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);

  doc.text(
    'BILL LOGÍSTICA',
    margin,
    10
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  doc.text(
    'Relatório geral',
    margin,
    15
  );

  doc.text(
    `Gerado em: ${today}`,
    pageWidth - margin,
    15,
    { align: 'right' }
  );

  let currentY = 20;

  // =========================
  // DATASETS
  // =========================

  datasets.forEach(({ cfg, rows }) => {

    // Título do módulo
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);

    doc.text(
      cfg.label,
      margin,
      currentY
    );

    currentY += 3;

    // =========================
    // SEM REGISTROS
    // =========================

    if (!rows.length) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);

      doc.text(
        'Nenhum registro encontrado.',
        margin,
        currentY + 4
      );

      currentY += 10;

      return;
    }

    // =========================
    // HEADERS E BODY
    // =========================

    const headers = Object.keys(rows[0]);

    const body = rows.map(row =>
      headers.map(header =>
        String(row[header] ?? '')
      )
    );

    // =========================
    // TAMANHO DAS COLUNAS
    // =========================

    const columnLengths = headers.map((header, index) => {

      let max = String(header).length;

      body.forEach(row => {

        const value = String(
          row[index] ?? ''
        );

        if (value.length > max) {
          max = value.length;
        }

      });

      return max;
    });

    const totalLength =
      columnLengths.reduce(
        (sum, value) => sum + value,
        0
      );

    // =========================
    // LARGURA DAS COLUNAS
    // =========================

    const columnStyles: any = {};

    headers.forEach((_, index) => {

      let width =
        (columnLengths[index] / totalLength) *
        availableWidth;

      // Largura mínima
      width = Math.max(width, 12);

      // Largura máxima
      width = Math.min(width, 55);

      columnStyles[index] = {
        cellWidth: width
      };
    });

    // =========================
    // TAMANHO DA FONTE
    // =========================

    let fontSize = 6.5;

    if (fontSizeOption === 'small') {
      fontSize = 5;
    }

    if (fontSizeOption === 'medium') {
      fontSize = 6.5;
    }

    if (fontSizeOption === 'large') {
      fontSize = 8;
    }

    // Nunca menor que 4
    fontSize = Math.max(fontSize, 4);

    // =========================
    // GARANTE QUE A TABELA
    // NÃO ULTRAPASSE A FOLHA
    // =========================

    let totalColumnWidth = 0;

    headers.forEach((_, index) => {
      totalColumnWidth +=
        columnStyles[index].cellWidth;
    });

    // Se ultrapassar a largura disponível,
    // reduz proporcionalmente todas as colunas
    if (totalColumnWidth > availableWidth) {

      const scale =
        availableWidth / totalColumnWidth;

      headers.forEach((_, index) => {

        columnStyles[index].cellWidth =
          columnStyles[index].cellWidth * scale;

      });
    }

    // =========================
    // TABELA
    // =========================

    autoTable(doc, {
      head: [headers],

      body,

      startY: currentY + 2,

      margin: {
        left: margin,
        right: margin,
        top: 5,
        bottom: 8
      },

      // Largura máxima da tabela
      tableWidth: availableWidth,

      // Não deixa criar página horizontal
      horizontalPageBreak: false,

      theme: 'grid',

      styles: {
        font: 'helvetica',
        fontSize,

        cellPadding: 1,

        // Mantém o texto dentro da célula
        overflow: 'ellipsize',

        valign: 'middle',

        lineWidth: 0.1,

        lineColor: [80, 80, 80],

        minCellHeight: 4
      },

      headStyles: {
        font: 'helvetica',

        fontStyle: 'bold',

        fontSize,

        halign: 'center',

        valign: 'middle',

        cellPadding: 1,

        lineWidth: 0.1,

        lineColor: [50, 50, 50]
      },

      bodyStyles: {
        fontSize,

        cellPadding: 1,

        valign: 'middle',

        lineWidth: 0.1,

        lineColor: [100, 100, 100]
      },

      columnStyles,

      // Evita quebra desnecessária
      pageBreak: 'avoid',

      rowPageBreak: 'avoid'
    });

    // =========================
    // POSIÇÃO APÓS A TABELA
    // =========================

    const finalY =
      (doc as any).lastAutoTable?.finalY ||
      currentY + 10;

    currentY = finalY + 5;

    // =========================
    // PROTEÇÃO VERTICAL
    // =========================

    // Se o próximo módulo não couber,
    // cria uma nova página.
    if (currentY > pageHeight - 15) {

      doc.addPage();

      currentY = 12;
    }
  });

  // =========================
  // RODAPÉ
  // =========================

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);

  doc.text(
    'BILL LOGÍSTICA — Relatório gerado automaticamente',
    margin,
    pageHeight - 4
  );

  // =========================
  // EXPORTAÇÃO
  // =========================

  doc.save(
    `Bill_Logistica_Relatorio_${today.replace(/\//g, '-')}.pdf`
  );
}

function ReportsExport({lookups}:{lookups:any}){
 const [selected,setSelected]=useState<string[]>([]);
 const [format,setFormat]=useState<'xlsx'|'pdf'>('xlsx');
 const [exporting,setExporting]=useState(false);
 const [fontSize,setFontSize]=useState<'small'|'medium'|'large'>('medium');
 const [err,setErr]=useState('');
 function toggle(v:string){setSelected(s=>s.includes(v)?s.filter(x=>x!==v):[...s,v])}
 async function run(){
  if(!selected.length){setErr('Selecione pelo menos um módulo.');return}
  setExporting(true);setErr('');
  try{
   const datasets=await Promise.all(selected.map(async v=>{
    const cfg=REPORT_SOURCES.find(s=>s.value===v)!;
    const rows=await request(cfg.path) as any[];
    return {cfg,rows:rows.map(r=>cleanRowForReport(r,lookups))};
   }));
   if(format==='xlsx') {
  exportExcelMulti(datasets);
} else {
  exportPdfMulti(datasets, fontSize);
}
  }catch(e:any){setErr(e.message)}finally{setExporting(false)}
 }
 return <div className="p-5 text-sm text-slate-600">
  <p className="mb-3">Selecione um ou mais módulos e o formato de exportação. O relatório sai com nome da empresa, data de geração e datas sem horário — pronto para apresentação.</p>
  {err&&<p className="mb-2 text-red-600">{err}</p>}
  <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-3">
   {REPORT_SOURCES.map(s=><label key={s.value} className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={selected.includes(s.value)} onChange={()=>toggle(s.value)} className="h-4 w-4"/>{s.label}</label>)}
  </div>
  <div className="mb-4 flex flex-wrap items-center gap-4">

  <label className="flex items-center gap-2 text-xs">
    <input
      type="radio"
      checked={format==='xlsx'}
      onChange={()=>setFormat('xlsx')}
    />
    Excel (.xlsx)
  </label>

  <label className="flex items-center gap-2 text-xs">
    <input
      type="radio"
      checked={format==='pdf'}
      onChange={()=>setFormat('pdf')}
    />
    PDF
  </label>

</div>

<div className="mb-4">
  <label className="mb-2 block text-xs font-medium text-slate-600">
    Tamanho da fonte do PDF
  </label>

  <div className="flex flex-wrap gap-2">

    <button
      type="button"
      onClick={()=>setFontSize('small')}
      className={`rounded-lg border px-4 py-2 text-xs ${
        fontSize==='small'
          ? 'border-brand bg-brand text-white'
          : 'bg-white text-slate-600'
      }`}
    >
      Pequena
    </button>

    <button
      type="button"
      onClick={()=>setFontSize('medium')}
      className={`rounded-lg border px-4 py-2 text-sm ${
        fontSize==='medium'
          ? 'border-brand bg-brand text-white'
          : 'bg-white text-slate-600'
      }`}
    >
      Média
    </button>

    <button
      type="button"
      onClick={()=>setFontSize('large')}
      className={`rounded-lg border px-4 py-2 text-base ${
        fontSize==='large'
          ? 'border-brand bg-brand text-white'
          : 'bg-white text-slate-600'
      }`}
    >
      Grande
    </button>

  </div>
</div>
  <button onClick={run} disabled={exporting} className="rounded-lg bg-brand px-4 py-2 font-medium text-white disabled:opacity-60">{exporting?'Gerando…':'Gerar relatório'}</button>
 </div>;
}

function Module({page,rows,loading,create,isAdmin,lookups,editingUser,setEditingUser,updateUser,deleteUser,editingResource,setEditingResource,updateResource,deleteResource,editingMovement,setEditingMovement,updateMovement,deleteMovement}:{page:string,rows:any[],loading:boolean,create:(data:any)=>Promise<void>,isAdmin:boolean,lookups:any,editingUser:any,setEditingUser:(u:any)=>void,updateUser:(id:number,data:any)=>Promise<void>,deleteUser:(id:number)=>Promise<void>,editingResource:any,setEditingResource:(r:any)=>void,updateResource:(id:string|number,data:any)=>Promise<void>,deleteResource:(id:string|number)=>Promise<void>,editingMovement:any,setEditingMovement:(m:any)=>void,updateMovement:(id:number,data:any)=>Promise<void>,deleteMovement:(id:number)=>Promise<void>}){
 const createAllowed=!['movements','reports'].includes(page)&&(page!=='users'||isAdmin);
 const isUsers=page==='users';
 const isResourceModule=!!resource[page];
 const isMovementModule=page==='entry'||page==='output';
 const showActions=(isUsers&&isAdmin)||isResourceModule||isMovementModule;
 const hidden=HIDDEN_TABLE_COLUMNS[page]||[];
 const cols=TABLE_COLUMNS[page]||Object.keys(rows[0]||{id:'ID',informação:'Informação'}).filter(k=>!hidden.includes(k)).slice(0,7);
 return <><section className="rounded-xl bg-white shadow-sm"><div className="flex items-center justify-between border-b p-5"><h2 className="font-semibold">{page==='reports'?'Relatórios':titleFor(page)}</h2>{page!=='reports'&&<span className="text-sm text-slate-500">{rows.length} registros</span>}</div>{page==='reports'?<ReportsExport lookups={lookups}/>:loading?<div className="p-5">Carregando…</div>:<div className="overflow-auto"><table><thead><tr>{cols.map(k=><th key={k}>{labelFor(k)}</th>)}{showActions&&<th>Ações</th>}</tr></thead><tbody>{rows.map((r,i)=><tr key={resourceIdOf(page,r)||i}>{cols.map(k=><td key={k}>{k==='status'?<span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClasses(r[k])}`}>{r[k]||'—'}</span>:resolveCell(k,r[k],lookups)}</td>)}{showActions&&<td className="whitespace-nowrap"><button onClick={()=>isUsers?setEditingUser(r):isMovementModule?setEditingMovement(r):setEditingResource(r)} className="mr-2 rounded-lg bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200">Editar</button>{!(isUsers&&r.is_main_admin)&&<button onClick={()=>isUsers?deleteUser(r.id):isMovementModule?deleteMovement(r.id):deleteResource(resourceIdOf(page,r))} className="rounded-lg bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100">Excluir</button>}</td>}</tr>)}{!rows.length&&<tr><td className="p-5 text-slate-500">Nenhum registro encontrado.</td></tr>}</tbody></table></div>}</section>
 {isUsers&&isAdmin&&editingUser&&<section className="mt-6 rounded-xl bg-white p-5 shadow-sm"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Editar usuário: {editingUser.name}</h3><button onClick={()=>setEditingUser(null)} className="text-sm text-slate-500 hover:underline">Cancelar</button></div><EditUserForm user={editingUser} onSubmit={(data)=>updateUser(editingUser.id,data)}/></section>}
 {isResourceModule&&editingResource&&<section className="mt-6 rounded-xl bg-white p-5 shadow-sm"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Editar registro</h3><button onClick={()=>setEditingResource(null)} className="text-sm text-slate-500 hover:underline">Cancelar</button></div><ResourceForm page={page} lookups={lookups} initial={editingResource} onSubmit={(data)=>updateResource(resourceIdOf(page,editingResource),data)} submitLabel="Salvar alterações"/></section>}
 {isMovementModule&&editingMovement&&<section className="mt-6 rounded-xl bg-white p-5 shadow-sm"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Editar movimentação</h3><button onClick={()=>setEditingMovement(null)} className="text-sm text-slate-500 hover:underline">Cancelar</button></div><MovementEditForm movement={editingMovement} lookups={lookups} onSubmit={(data)=>updateMovement(editingMovement.id,data)}/></section>}
 {createAllowed&&<section className="mt-6 rounded-xl bg-white p-5 shadow-sm"><h3 className="font-semibold">Novo registro</h3><ResourceForm page={page} lookups={lookups} onSubmit={create}/></section>}
 </>
}

function emptyValues(page:string,initial?:any){
 const out:any={};
 (FIELDS[page]||[]).forEach(f=>{
  if(initial && initial[f.key]!==undefined && initial[f.key]!==null) out[f.key]=String(initial[f.key]).slice(0,f.type==='datetime'?16:undefined);
  else out[f.key]='';
 });
 return out;
}

function ModuleCheckboxes({value,onChange}:{value:string,onChange:(v:string)=>void}){
 const list=value?value.split(',').filter(Boolean):[];
 return <div className="grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-3">
  {MODULE_OPTIONS.map(m=>{
   const checked=list.includes(m.value);
   return <label key={m.value} className="flex items-center gap-2 text-xs text-slate-600">
    <input type="checkbox" checked={checked} className="h-4 w-4 shrink-0" onChange={e=>{
     const next=e.target.checked?[...list,m.value]:list.filter(x=>x!==m.value);
     onChange(next.join(','));
    }}/>
    <span className="leading-none">{m.label}</span>
   </label>;
  })}
 </div>;
}

function PermissionsField({value,onChange,startOpen}:{value:string,onChange:(v:string)=>void,startOpen:boolean}){
 const [open,setOpen]=useState(startOpen);
 return <div>
  {!open ? (
   <button type="button" onClick={()=>setOpen(true)} className="text-xs font-medium text-brand hover:underline">Personalizar permissões específicas (opcional)</button>
  ) : (
   <>
    <ModuleCheckboxes value={value} onChange={onChange}/>
    <button type="button" onClick={()=>{onChange('');setOpen(false)}} className="mt-2 text-xs text-slate-500 hover:underline">Usar módulos padrão do perfil</button>
   </>
  )}
 </div>;
}

function ResourceForm({page,lookups,onSubmit,initial,submitLabel}:{page:string,lookups:any,onSubmit:(data:any)=>Promise<void>,initial?:any,submitLabel?:string}){
 const fields=FIELDS[page]||[];
 const [values,setValues]=useState<any>(()=>emptyValues(page,initial));
 const [saving,setSaving]=useState(false);
 useEffect(()=>{setValues(emptyValues(page,initial))},[page]);
 function set(key:string,v:string){setValues((s:any)=>({...s,[key]:v}))}
 function optionsFor(type:string){
  if(type==='vehicle') return (lookups.vehicles||[]).map((v:any)=>({value:v.id,label:`${v.plate} — ${v.brand} ${v.model}`}));
  if(type==='driver') return (lookups.drivers||[]).map((d:any)=>({value:d.id,label:d.name}));
  if(type==='product') return (lookups.products||[]).map((p:any)=>({value:p.id,label:`${p.id} — ${p.name}`}));
  return [];
 }
 async function submit(e:React.FormEvent){
  e.preventDefault();setSaving(true);
  const data:any={};
  for(const f of fields){
   let v:any=values[f.key];
   if(f.type==='modules'){
    data[f.key]=v?expandPermissions(String(v).split(',').filter(Boolean)).join(','):null;
    continue;
   }
   if(v===''){data[f.key]=null;continue}
   if(f.type==='number'||['vehicle','driver','product'].includes(f.type)) v=Number(v);
   data[f.key]=v;
  }
  try{await onSubmit(data);if(!initial)setValues(emptyValues(page))}finally{setSaving(false)}
 }
 if(!fields.length) return <p className="text-sm text-slate-500">Este módulo ainda não possui formulário de cadastro.</p>;
 return <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
  {fields.map(f=>{
   const isLookup=['vehicle','driver','product'].includes(f.type);
   return <label key={f.key} className={`text-sm ${(f.type==='textarea'||f.type==='modules')?'sm:col-span-2':''}`}>
    <span className="mb-1 block text-slate-600">{f.label}{f.required?' *':''}</span>
    {f.type==='modules' ?
     <PermissionsField value={values[f.key]} onChange={v=>set(f.key,v)} startOpen={!!(initial && initial[f.key])}/> :
    f.type==='textarea' ?
     <textarea required={f.required} value={values[f.key]} onChange={e=>set(f.key,e.target.value)} className="h-20 w-full rounded-lg border p-2"/> :
    f.type==='select' ?
     <select required={f.required} value={values[f.key]} onChange={e=>set(f.key,e.target.value)} className="w-full rounded-lg border p-2">
      <option value="">Selecione</option>
      {(f.options||[]).map(o=><option key={o} value={o}>{o}</option>)}
     </select> :
    isLookup ?
     <select required={f.required} value={values[f.key]} onChange={e=>set(f.key,e.target.value)} className="w-full rounded-lg border p-2">
      <option value="">Selecione</option>
      {optionsFor(f.type).map((o:any)=><option key={o.value} value={o.value}>{o.label}</option>)}
     </select> :
     <input required={f.required} value={values[f.key]} onChange={e=>set(f.key,e.target.value)} type={f.type==='number'?'number':f.type==='date'?'date':f.type==='datetime'?'datetime-local':'text'} step={f.step} className="w-full rounded-lg border p-2"/>}
   </label>
  })}
  <div className="sm:col-span-2">
   <button disabled={saving} className="mt-1 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving?'Salvando…':(submitLabel||'Salvar registro')}</button>
  </div>
 </form>
}

function EditUserForm({user,onSubmit}:{user:any,onSubmit:(data:any)=>Promise<void>}){
 const [values,setValues]=useState<any>({
  name:user.name||'',username:user.username||'',role:user.role||'',
  permissions:user.permissions||'',active:user.active?'Sim':'Não',password:'',
 });
 const [saving,setSaving]=useState(false);
 function set(key:string,v:string){setValues((s:any)=>({...s,[key]:v}))}
 async function submit(e:React.FormEvent){
  e.preventDefault();setSaving(true);
  const data:any={
   name:values.name,username:values.username,role:values.role,
   permissions:values.permissions?expandPermissions(String(values.permissions).split(',').filter(Boolean)).join(','):null,
   active:values.active==='Sim',
  };
  if(values.password) data.password=values.password;
  try{await onSubmit(data)}finally{setSaving(false)}
 }
 return <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" autoComplete="off">
  {USER_EDIT_FIELDS.map(f=>
   <label key={f.key} className={`text-sm ${f.type==='modules'?'sm:col-span-2':''}`}>
    <span className="mb-1 block text-slate-600">{f.label}{f.required?' *':''}</span>
    {f.type==='modules' ?
     <PermissionsField value={values[f.key]} onChange={v=>set(f.key,v)} startOpen={!!user.permissions}/> :
    f.type==='select' ?
     <select required={f.required} value={values[f.key]} onChange={e=>set(f.key,e.target.value)} className="w-full rounded-lg border p-2">
      {f.key!=='active'&&<option value="">Selecione</option>}
      {(f.options||[]).map(o=><option key={o} value={o}>{o}</option>)}
     </select> :
     <input required={f.required} value={values[f.key]} onChange={e=>set(f.key,e.target.value)} type={f.key==='password'?'password':'text'} autoComplete="off" className="w-full rounded-lg border p-2"/>}
   </label>
  )}
  <div className="sm:col-span-2">
   <button disabled={saving} className="mt-1 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving?'Salvando…':'Salvar alterações'}</button>
  </div>
 </form>
}

function MovementEditForm({movement,lookups,onSubmit}:{movement:any,lookups:any,onSubmit:(data:any)=>Promise<void>}){
 const [values,setValues]=useState<any>({
  quantity:String(movement.quantity??''),
  responsible:movement.responsible||'',
  recipient:movement.recipient||'',
  sector:movement.sector||'',
  vehicle_id:movement.vehicle_id?String(movement.vehicle_id):'',
  observation:movement.observation||'',
  invoice:movement.invoice||'',
  unit_value:movement.unit_value!=null?String(movement.unit_value):'',
  password:'',
 });
 const [saving,setSaving]=useState(false);
 function set(key:string,v:string){setValues((s:any)=>({...s,[key]:v}))}
 async function submit(e:React.FormEvent){
  e.preventDefault();setSaving(true);
  const data:any={password:values.password};
  if(values.quantity!=='') data.quantity=Number(values.quantity);
  if(values.responsible!=='') data.responsible=values.responsible;
  if(values.recipient!=='') data.recipient=values.recipient;
  if(values.sector!=='') data.sector=values.sector;
  if(values.vehicle_id!=='') data.vehicle_id=Number(values.vehicle_id);
  if(values.observation!=='') data.observation=values.observation;
  if(values.invoice!=='') data.invoice=values.invoice;
  if(values.unit_value!=='') data.unit_value=Number(values.unit_value);
  try{await onSubmit(data)}finally{setSaving(false)}
 }
 return <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" autoComplete="off">
  <label className="text-sm"><span className="mb-1 block text-slate-600">Quantidade</span><input type="number" step="0.01" value={values.quantity} onChange={e=>set('quantity',e.target.value)} className="w-full rounded-lg border p-2"/></label>
  <label className="text-sm"><span className="mb-1 block text-slate-600">Responsável (quem entregou)</span><input value={values.responsible} onChange={e=>set('responsible',e.target.value)} className="w-full rounded-lg border p-2"/></label>
  <label className="text-sm"><span className="mb-1 block text-slate-600">Retirado por</span><input value={values.recipient} onChange={e=>set('recipient',e.target.value)} className="w-full rounded-lg border p-2"/></label>
  <label className="text-sm"><span className="mb-1 block text-slate-600">Setor</span><input value={values.sector} onChange={e=>set('sector',e.target.value)} className="w-full rounded-lg border p-2"/></label>
  <label className="text-sm"><span className="mb-1 block text-slate-600">Veículo</span>
   <select value={values.vehicle_id} onChange={e=>set('vehicle_id',e.target.value)} className="w-full rounded-lg border p-2">
    <option value="">Selecione</option>
    {(lookups.vehicles||[]).map((v:any)=><option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>)}
   </select>
  </label>
  <label className="text-sm"><span className="mb-1 block text-slate-600">Nota fiscal</span><input value={values.invoice} onChange={e=>set('invoice',e.target.value)} className="w-full rounded-lg border p-2"/></label>
  <label className="text-sm sm:col-span-2"><span className="mb-1 block text-slate-600">Observação</span><textarea value={values.observation} onChange={e=>set('observation',e.target.value)} className="h-16 w-full rounded-lg border p-2"/></label>
  <label className="text-sm"><span className="mb-1 block text-slate-600">Valor unitário</span><input type="number" step="0.01" value={values.unit_value} onChange={e=>set('unit_value',e.target.value)} className="w-full rounded-lg border p-2"/></label>
  <label className="text-sm sm:col-span-2"><span className="mb-1 block text-slate-600">Confirme sua senha para salvar *</span><input type="password" required autoComplete="off" value={values.password} onChange={e=>set('password',e.target.value)} className="w-full rounded-lg border p-2"/></label>
  <div className="sm:col-span-2"><button disabled={saving} className="mt-1 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving?'Salvando…':'Salvar alterações'}</button></div>
 </form>;
}