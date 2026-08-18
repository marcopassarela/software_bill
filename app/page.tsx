'use client';
import {useEffect,useState} from 'react';
import {request} from '@/lib/api';
import AppShell from '@/components/AppShell';
 
export default function Home(){
 const [user,setUser]=useState<any>(),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[newPassword,setNewPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{request('/auth/me').then(setUser).catch(()=>{})},[]);
 async function login(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError('');
  try{setUser((await request('/auth/login',{method:'POST',body:JSON.stringify({username,password})})).user)}
  catch(e:any){setError(e.message)}finally{setBusy(false)}
 }
 async function change(e:React.FormEvent){
  e.preventDefault();
  try{
   await request('/auth/change-password',{method:'POST',body:JSON.stringify({current_password:password,new_password:newPassword})});
   setUser({...user,must_change_password:false});setPassword('');setNewPassword('');
  }catch(e:any){setError(e.message)}
 }
 if(user?.must_change_password) return <main className="grid min-h-screen place-items-center p-4">
  <form onSubmit={change} className="w-full max-w-md rounded-xl bg-white p-7 shadow" autoComplete="off">
   <h1 className="text-xl font-bold">Atualize sua senha</h1>
   <p className="my-3 text-sm text-slate-600">Sua senha inicial é temporária. Defina uma nova senha de pelo menos 12 caracteres para continuar.</p>
   {error&&<p className="mb-2 text-sm text-red-600">{error}</p>}
   {/* campos invisíveis para desviar o preenchimento automático do navegador */}
   <input type="text" tabIndex={-1} aria-hidden="true" style={{position:'absolute',left:-9999,width:1,height:1,opacity:0}}/>
   <input type="password" tabIndex={-1} aria-hidden="true" style={{position:'absolute',left:-9999,width:1,height:1,opacity:0}}/>
   <input placeholder="Senha temporária" type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="off"/>
   <input className="mt-3" placeholder="Nova senha" type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} required minLength={12} autoComplete="new-password"/>
   <button className="mt-4 w-full rounded-lg bg-brand p-2 text-white">Salvar e continuar</button>
  </form>
 </main>;
 if(user) return <AppShell user={user} onLogout={()=>setUser(undefined)} onUserUpdate={(u:any)=>setUser(u)}/>;
 return <main className="grid min-h-screen place-items-center bg-slate-100 p-4">
  <form onSubmit={login} className="w-full max-w-sm rounded-xl bg-white p-8 shadow-lg" autoComplete="off">
   <div className="mb-6"><p className="text-sm font-semibold text-cyan-700">GESTÃO LOGÍSTICA</p><h1 className="text-2xl font-bold">Acesso ao sistema</h1></div>
   {error&&<p className="mb-3 text-sm text-red-600">{error}</p>}
   {/* campos invisíveis para desviar o preenchimento automático do navegador */}
   <input type="text" tabIndex={-1} aria-hidden="true" style={{position:'absolute',left:-9999,width:1,height:1,opacity:0}}/>
   <input type="password" tabIndex={-1} aria-hidden="true" style={{position:'absolute',left:-9999,width:1,height:1,opacity:0}}/>
   <label className="text-sm">Usuário</label>
   <input value={username} onChange={e=>setUsername(e.target.value)} required autoComplete="off"/>
   <label className="mt-4 block text-sm">Senha</label>
   <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="off"/>
   <button disabled={busy} className="mt-5 w-full rounded-lg bg-brand p-2.5 font-medium text-white">{busy?'Entrando…':'Entrar'}</button>
  </form>
 </main>;
}
 