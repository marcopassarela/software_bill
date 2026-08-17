const API=process.env.NEXT_PUBLIC_API_URL||'http://localhost:8000';
export async function request(path:string,options:RequestInit={}) { const r=await fetch(`${API}${path}`,{credentials:'include',headers:{'Content-Type':'application/json',...(options.headers||{})},...options}); if(!r.ok) throw new Error((await r.json().catch(()=>({detail:'Erro de comunicação'}))).detail); return r.status===204?null:r.json(); }

