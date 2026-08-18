'use client';
import {useEffect,useState} from 'react';
import {request} from '@/lib/api';
import {BarChart3,Box,ClipboardList,Fuel,Map,Settings,Truck,Users,UserRound, Wrench, LogOut, LayoutDashboard, PackagePlus, PackageMinus} from 'lucide-react';
 
const items=[['dashboard','Dashboard',LayoutDashboard],['routes','Rotas',Map],['vehicles','Veículos',Truck],['drivers','Motoristas',UserRound],['maintenance','Manutenção',Wrench],['fuel','Combustível',Fuel],['stock','Estoque',Box],['entry','Entradas',PackagePlus],['output','Saídas',PackageMinus],['movements','Movimentações',ClipboardList],['customers','Clientes',Users],['reports','Relatórios',BarChart3],['users','Usuários',Users],['settings','Configurações',Settings]] as const;
const resource:any={routes:'routes',vehicles:'vehicles',drivers:'drivers',maintenance:'maintenance',fuel:'fuel',stock:'products',customers:'customers',settings:'settings'};
const moduleAccess:any={ADMINISTRADOR:['*'],GERENTE:['dashboard','routes','vehicles','drivers','maintenance','fuel','stock','customers','reports'],LOGÍSTICA:['dashboard','routes','vehicles','drivers','fuel','customers'],ESTOQUE:['dashboard','stock','entry','output','movements'],MOTORISTA:['routes'],CONSULTA:['dashboard','routes','vehicles','drivers','maintenance','fuel','stock','customers','reports']};
function titleFor(k:string){return ({routes:'Rotas',vehicles:'Veículos',drivers:'Motoristas',maintenance:'Manutenção',fuel:'Combustível',stock:'Estoque',customers:'Clientes',settings:'Configurações'} as any)[k]||k}
 
// ---- Definição dos campos de formulário por módulo ----
type FieldType='text'|'number'|'date'|'datetime'|'select'|'textarea'|'vehicle'|'driver'|'customer'|'product';
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
  routes:[
    {key:'origin',label:'Origem',type:'text',required:true},
    {key:'destination',label:'Destino',type:'text',required:true},
    {key:'customer_id',label:'Cliente',type:'customer'},
    {key:'scheduled_at',label:'Data/hora agendada',type:'datetime',required:true},
    {key:'driver_id',label:'Motorista',type:'driver'},
    {key:'vehicle_id',label:'Veículo',type:'vehicle'},
    {key:'cargo_weight',label:'Peso da carga (kg)',type:'number',step:'0.01'},
    {key:'stop_count',label:'Número de paradas',type:'number'},
    {key:'total_km',label:'KM total',type:'number',step:'0.01'},
    {key:'estimated_time',label:'Tempo estimado',type:'text'},
    {key:'estimated_fuel',label:'Combustível estimado (L)',type:'number',step:'0.01'},
    {key:'estimated_cost',label:'Custo estimado',type:'number',step:'0.01'},
    {key:'status',label:'Status',type:'select',options:['Planejada','Em andamento','Concluída','Cancelada']},
    {key:'notes',label:'Observações',type:'textarea'},
  ],
  maintenance:[
    {key:'vehicle_id',label:'Veículo',type:'vehicle',required:true},
    {key:'type',label:'Tipo',type:'select',options:['Preventiva','Corretiva'],required:true},
    {key:'description',label:'Descrição',type:'textarea',required:true},
    {key:'date',label:'Data',type:'date',required:true},
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
  customers:[
    {key:'name',label:'Nome',type:'text',required:true},
    {key:'document',label:'CPF/CNPJ',type:'text'},
    {key:'phone',label:'Telefone',type:'text'},
    {key:'address',label:'Endereço',type:'text'},
    {key:'city',label:'Cidade',type:'text'},
    {key:'state',label:'UF',type:'text'},
    {key:'zip_code',label:'CEP',type:'text'},
    {key:'maps_url',label:'Link do mapa',type:'text'},
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
    {key:'responsible',label:'Responsável',type:'text'},
    {key:'sector',label:'Setor',type:'text'},
    {key:'vehicle_id',label:'Veículo',type:'vehicle'},
    {key:'observation',label:'Observação',type:'textarea'},
  ],
  users:[
    {key:'name',label:'Nome',type:'text',required:true},
    {key:'username',label:'Usuário',type:'text',required:true},
    {key:'password',label:'Senha temporária',type:'text',required:true},
    {key:'role',label:'Perfil',type:'select',options:['ADMINISTRADOR','GERENTE','LOGÍSTICA','ESTOQUE','MOTORISTA','CONSULTA'],required:true},
  ],
};
 
const LABELS:Record<string,string>={
 id:'ID',name:'Nome',username:'Usuário',role:'Perfil',active:'Ativo',must_change_password:'Trocar senha',permissions:'Permissões',
 plate:'Placa',brand:'Marca',model:'Modelo',year:'Ano',type:'Tipo',capacity:'Capacidade',average_consumption:'Consumo médio',current_km:'KM atual',fuel_type:'Combustível',status:'Status',notes:'Observações',
 cpf:'CPF',phone:'Telefone',cnh:'CNH',category:'Categoria',cnh_expiry:'Validade CNH',vehicle_id:'Veículo',
 origin:'Origem',destination:'Destino',customer_id:'Cliente',scheduled_at:'Agendamento',driver_id:'Motorista',cargo_weight:'Peso da carga',stop_count:'Paradas',total_km:'KM total',estimated_time:'Tempo estimado',estimated_fuel:'Combustível estimado',estimated_cost:'Custo estimado',
 description:'Descrição',date:'Data',km:'KM',next_km:'Próxima KM',next_date:'Próxima data',value:'Valor',workshop:'Oficina',responsible:'Responsável',
 liters:'Litros',price_per_liter:'Preço/litro',total_value:'Valor total',station:'Posto',
 code:'Código',minimum_stock:'Estoque mínimo',location:'Localização',supplier:'Fornecedor',unit_value:'Valor unitário',unit:'Unidade',quantity:'Quantidade',
 document:'Documento',address:'Endereço',city:'Cidade',state:'UF',zip_code:'CEP',maps_url:'Mapa',
 key:'Chave',created_at:'Criado em',occurred_at:'Ocorrido em',
};
function labelFor(k:string){return LABELS[k]||k.replace(/_/g,' ')}

export default function AppShell({user,onLogout}:{user:any,onLogout:()=>void}){
 const [page,setPage]=useState('dashboard'),[rows,setRows]=useState<any[]>([]),[metrics,setMetrics]=useState<any>(),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const [lookups,setLookups]=useState<{vehicles:any[],drivers:any[],customers:any[],products:any[]}>({vehicles:[],drivers:[],customers:[],products:[]});
 const allowed=(key:string)=>user.username==='user'||(user.permissions?user.permissions.split(',').includes(key):(moduleAccess[user.role]||[]).includes('*')||(moduleAccess[user.role]||[]).includes(key));
 async function load(p=page){setError('');setLoading(true);try{if(p==='dashboard')setMetrics(await request('/dashboard'));else if(p==='movements')setRows(await request('/stock/movements'));else if(p==='users')setRows(await request('/users'));else if(resource[p])setRows(await request('/'+resource[p]));else setRows([])}catch(e:any){setError(e.message)}finally{setLoading(false)}}
 useEffect(()=>{load()},[page]);
 useEffect(()=>{
  Promise.all([
   request('/vehicles').catch(()=>[]),
   request('/drivers').catch(()=>[]),
   request('/customers').catch(()=>[]),
   request('/products').catch(()=>[]),
  ]).then(([vehicles,drivers,customers,products])=>setLookups({vehicles,drivers,customers,products}));
 },[]);
 async function create(data:any){
  setError('');
  try{
   if(page==='entry'||page==='output') await request('/stock/'+page,{method:'POST',body:JSON.stringify(data)});
   else await request('/'+(page==='users'?'users':resource[page]),{method:'POST',body:JSON.stringify(page==='users'?data:{data})});
   load();
  }catch(e:any){setError(e.message)}
 }
 async function logout(){await request('/auth/logout',{method:'POST'}).catch(()=>{});onLogout()}
 return <div className="min-h-screen md:flex"><aside className="w-full bg-navy text-slate-200 md:min-h-screen md:w-64"><div className="p-5 text-lg font-bold text-white"><span className="mr-2 text-cyan-400">◆</span>GESTÃO LOGÍSTICA</div><nav className="flex overflow-x-auto px-2 pb-3 md:block">{items.filter(([k])=>allowed(k)).map(([k,label,Icon])=><button key={k} onClick={()=>setPage(k)} className={`flex shrink-0 items-center gap-3 rounded-lg px-4 py-3 text-sm md:w-full ${page===k?'bg-cyan-700 text-white':'hover:bg-slate-700'}`}><Icon size={18}/>{label}</button>)}</nav><button onClick={logout} className="m-4 flex items-center gap-2 text-sm text-slate-300"><LogOut size={17}/> Sair</button></aside><main className="min-w-0 flex-1 p-4 md:p-8"><header className="mb-7 flex items-center justify-between"><div><p className="text-sm text-slate-500">Ambiente interno</p><h1 className="text-2xl font-bold">{page==='dashboard'?'Visão geral':titleFor(page)}</h1></div><div className="rounded-full bg-white px-3 py-2 text-sm shadow-sm">{user.name}</div></header>{error&&<div className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</div>}{page==='dashboard'?<Dashboard metrics={metrics}/>:<Module page={page} rows={rows} loading={loading} create={create} isAdmin={user.username==='user'} lookups={lookups}/>}</main></div>
}
 
function Dashboard({metrics}:{metrics:any}){const cards=[['Veículos disponíveis',metrics?.available,'🚛'],['Em rota',metrics?.on_route,'🗺️'],['Em manutenção',metrics?.maintenance,'🔧'],['Rotas hoje',metrics?.routes_today,'📍'],['Produtos em estoque',metrics?.products,'📦'],['Estoque baixo',metrics?.low_stock,'⚠️'],['Custo combustível',metrics?.fuel_cost?.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),'⛽']];return <><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([l,v,i])=><article key={String(l)} className="rounded-xl bg-white p-5 shadow-sm"><div className="text-xl">{i}</div><div className="mt-3 text-2xl font-bold">{v??'—'}</div><div className="text-sm text-slate-500">{l}</div></article>)}</section><section className="mt-6 rounded-xl bg-white p-6 shadow-sm"><h2 className="font-semibold">Acompanhamento operacional</h2><p className="mt-2 text-sm text-slate-500">Os indicadores são calculados diretamente no banco PostgreSQL. Cadastre veículos, produtos, rotas e abastecimentos para compor a visão gerencial.</p></section></>}
 
function Module({page,rows,loading,create,isAdmin,lookups}:{page:string,rows:any[],loading:boolean,create:(data:any)=>Promise<void>,isAdmin:boolean,lookups:any}){
 const readable=(x:any)=>x===null||x===undefined?'—':typeof x==='boolean'?(x?'Sim':'Não'):typeof x==='object'?JSON.stringify(x):String(x);
 const createAllowed=!['movements','reports'].includes(page)&&(page!=='users'||isAdmin);
 return <><section className="rounded-xl bg-white shadow-sm"><div className="flex items-center justify-between border-b p-5"><h2 className="font-semibold">{page==='reports'?'Relatórios por período':titleFor(page)}</h2><span className="text-sm text-slate-500">{rows.length} registros</span></div>{page==='reports'?<div className="p-5 text-sm text-slate-600">Relatórios de estoque, frota, rotas e funcionários podem ser filtrados na API e exportados pelo provedor de relatórios. Esta tela respeita o perfil do usuário.</div>:loading?<div className="p-5">Carregando…</div>:<div className="overflow-auto"><table><thead><tr>{Object.keys(rows[0]||{id:'ID',informação:'Informação'}).slice(0,7).map(k=><th key={k}>{labelFor(k)}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={r.id||i}>{Object.keys(rows[0]||{}).slice(0,7).map(k=><td key={k}>{readable(r[k])}</td>)}</tr>)}{!rows.length&&<tr><td className="p-5 text-slate-500">Nenhum registro encontrado.</td></tr>}</tbody></table></div>}</section>{createAllowed&&<section className="mt-6 rounded-xl bg-white p-5 shadow-sm"><h3 className="font-semibold">Novo registro</h3><ResourceForm page={page} lookups={lookups} onSubmit={create}/></section>}</>
}
 
function emptyValues(page:string){const out:any={};(FIELDS[page]||[]).forEach(f=>out[f.key]='');return out}
 
function ResourceForm({page,lookups,onSubmit}:{page:string,lookups:any,onSubmit:(data:any)=>Promise<void>}){
 const fields=FIELDS[page]||[];
 const [values,setValues]=useState<any>(()=>emptyValues(page));
 const [saving,setSaving]=useState(false);
 useEffect(()=>{setValues(emptyValues(page))},[page]);
 function set(key:string,v:string){setValues((s:any)=>({...s,[key]:v}))}
 function optionsFor(type:string){
  if(type==='vehicle') return (lookups.vehicles||[]).map((v:any)=>({value:v.id,label:`${v.plate} — ${v.brand} ${v.model}`}));
  if(type==='driver') return (lookups.drivers||[]).map((d:any)=>({value:d.id,label:d.name}));
  if(type==='customer') return (lookups.customers||[]).map((c:any)=>({value:c.id,label:c.name}));
  if(type==='product') return (lookups.products||[]).map((p:any)=>({value:p.id,label:`${p.code} — ${p.name}`}));
  return [];
 }
 async function submit(e:React.FormEvent){
  e.preventDefault();setSaving(true);
  const data:any={};
  for(const f of fields){
   let v:any=values[f.key];
   if(v===''){data[f.key]=null;continue}
   if(f.type==='number'||['vehicle','driver','customer','product'].includes(f.type)) v=Number(v);
   data[f.key]=v;
  }
  try{await onSubmit(data);setValues(emptyValues(page))}finally{setSaving(false)}
 }
 if(!fields.length) return <p className="text-sm text-slate-500">Este módulo ainda não possui formulário de cadastro.</p>;
 return <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
  {fields.map(f=>{
   const isLookup=['vehicle','driver','customer','product'].includes(f.type);
   return <label key={f.key} className={`text-sm ${f.type==='textarea'?'sm:col-span-2':''}`}>
    <span className="mb-1 block text-slate-600">{f.label}{f.required?' *':''}</span>
    {f.type==='textarea' ?
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
   <button disabled={saving} className="mt-1 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving?'Salvando…':'Salvar registro'}</button>
  </div>
 </form>
}
