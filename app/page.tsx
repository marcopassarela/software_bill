'use client';
import { useEffect, useState } from 'react';
import { request } from '@/lib/api';
import AppShell from '@/components/AppShell';

function formatRemaining(until: Date): string {
  const ms = until.getTime() - Date.now();
  if (ms <= 0) return 'Login liberado';
  // arredonda para cima (90s → 2 min, não 1)
  const totalSec = Math.max(1, Math.ceil(ms / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins || !parts.length) parts.push(`${mins}min`);
  // abaixo de 5 min mostra segundos também
  if (totalSec < 300) parts.push(`${secs}s`);
  return parts.join(' ');
}

function parseUntil(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const s = /Z$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z';
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export default function Home() {
  const [user, setUser] = useState<any>();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [blockedInfo, setBlockedInfo] = useState<{
    block_type?: string;
    blocked_until?: string | null;
    reason?: string | null;
  } | null>(null);
  const [, setTick] = useState(0);

  function obterLocalizacao(): Promise<{
    latitude?: number;
    longitude?: number;
  }> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({});
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        () => resolve({}),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  useEffect(() => {
    function handleSessionExpired() {
      setUser(undefined);
      setUsername('');
      setPassword('');
      setNewPassword('');
      setError('');
      setBusy(false);
    }
    function onBlocked(e: any) {
      setUser(undefined);
      setBlockedInfo(e.detail || { block_type: 'manual' });
      setError('');
    }

    window.addEventListener('session-expired', handleSessionExpired);
    window.addEventListener('user-blocked', onBlocked);

    request('/auth/me')
      .then(setUser)
      .catch((e: any) => {
        const d = e?.detail;
        if (e?.status === 403 && d?.code === 'USER_BLOCKED') {
          setBlockedInfo({
            block_type: d.block_type || 'manual',
            blocked_until: d.blocked_until || null,
            reason: d.reason || null,
          });
        }
        setUser(undefined);
      });

    return () => {
      window.removeEventListener('session-expired', handleSessionExpired);
      window.removeEventListener('user-blocked', onBlocked);
    };
  }, []);

  useEffect(() => {
    if (!blockedInfo?.blocked_until) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [blockedInfo?.blocked_until]);

    useEffect(() => {
    if (!blockedInfo?.blocked_until || blockedInfo.block_type !== 'scheduled') {
      return;
    }
    const until = parseUntil(blockedInfo.blocked_until);
    if (!until) return;

    const goLogin = () => {
      if (until.getTime() <= Date.now()) {
        setBlockedInfo(null);
        setError('Seu acesso foi liberado. Faça login novamente.');
      }
    };

    goLogin();
    const id = setInterval(goLogin, 1000);
    return () => clearInterval(id);
  }, [blockedInfo]);

  useEffect(() => {
    if (!blockedInfo?.blocked_until) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [blockedInfo?.blocked_until]);

  function passwordStrength(pwd: string): {
    score: number;
    label: string;
    color: string;
  } {
    if (!pwd) return { score: 0, label: '', color: 'bg-slate-200' };
    let score = 0;
    if (pwd.length >= 3) score += 1;
    if (pwd.length >= 8) score += 1;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score += 1;
    if (/\d/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;
    if (score <= 2) return { score, label: 'Fraca', color: 'bg-red-500' };
    if (score <= 3) return { score, label: 'Média', color: 'bg-amber-500' };
    return { score, label: 'Forte', color: 'bg-green-500' };
  }

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const localizacao = await obterLocalizacao();
      const result = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username,
          password,
          latitude: localizacao.latitude,
          longitude: localizacao.longitude,
        }),
      });
      setUser(result.user);
      setBlockedInfo(null);
    } catch (err: any) {
      const detail = err?.detail;
      if (
        err?.status === 403 &&
        (detail?.code === 'USER_BLOCKED' || /bloquead/i.test(String(err?.message || '')))
      ) {
        setBlockedInfo({
          block_type: detail?.block_type || 'manual',
          blocked_until: detail?.blocked_until || null,
          reason: detail?.reason || null,
        });
        setError('');
      } else {
        setError(err?.message || 'Erro ao realizar login');
      }
    } finally {
      setBusy(false);
    }
  }

  async function change(e: React.FormEvent) {
    e.preventDefault();
    try {
      await request('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: password,
          new_password: newPassword,
        }),
      });
      setUser({ ...user, must_change_password: false });
      setPassword('');
      setNewPassword('');
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (blockedInfo) {
    const until = parseUntil(blockedInfo.blocked_until);
    if (
      blockedInfo.block_type === 'scheduled' &&
      until &&
      until.getTime() <= Date.now()
    ) {
      setTimeout(() => {
        setBlockedInfo(null);
        setError('Seu acesso foi liberado. Faça login novamente.');
      }, 0);
    }

    const remaining =
      until && !isNaN(until.getTime()) && until.getTime() > Date.now()
        ? formatRemaining(until)
        : null;

    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-2xl">
            🔒
          </div>
          <h1 className="text-center text-xl font-bold text-red-700">Acesso bloqueado</h1>
          <p className="mt-3 text-center text-sm text-slate-600">
            Sua conta foi bloqueada pelo administrador e não pode usar o sistema no momento.
          </p>

          {blockedInfo.block_type === 'permanent' && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm font-medium text-red-800">
              Bloqueio permanente
            </p>
          )}

          {blockedInfo.block_type === 'scheduled' && until && until.getTime() > Date.now() && (
            <div className="mt-4 rounded-lg bg-amber-50 px-3 py-3 text-center text-sm text-amber-900">
              <p className="font-medium">Desbloqueio automático em</p>
              <p className="mt-1 text-lg font-bold tabular-nums">
                {until.toLocaleString('pt-BR')}
              </p>
              {remaining && (
                <p className="mt-1 text-xs text-amber-800">
                  Tempo restante: {remaining}
                </p>
              )}
            </div>
          )}

          {(blockedInfo.block_type === 'manual' || !blockedInfo.block_type) && (
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-center text-sm text-slate-700">
              Bloqueio manual — só o administrador pode liberar.
            </p>
          )}

          {blockedInfo.reason && (
            <p className="mt-3 text-center text-xs text-slate-500">Motivo: {blockedInfo.reason}</p>
          )}

          <button
            type="button"
            onClick={() => setBlockedInfo(null)}
            className="mt-6 w-full rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-medium text-white"
          >
            Voltar ao login
          </button>
        </div>
      </main>
    );
  }

  if (user?.must_change_password) {
    const strength = passwordStrength(newPassword);
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-4">
        <form
          onSubmit={change}
          className="w-full max-w-md rounded-xl bg-white p-7 shadow"
          autoComplete="off"
        >
          <h1 className="text-xl font-bold">Atualize sua senha</h1>
          <p className="my-3 text-sm text-slate-600">
            Sua senha inicial é temporária. Defina uma nova senha de pelo menos 3 caracteres para
            continuar.
          </p>
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          <label className="text-sm">Senha atual</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-lg border p-2"
          />
          <label className="mt-3 block text-sm">Nova senha</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={3}
            className="w-full rounded-lg border p-2"
          />
          {newPassword && (
            <div className="mt-2">
              <div className="h-2 w-full overflow-hidden rounded bg-slate-100">
                <div
                  className={`h-full ${strength.color}`}
                  style={{ width: `${(strength.score / 5) * 100}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">Força: {strength.label}</p>
            </div>
          )}
          <button className="mt-5 w-full rounded-lg bg-brand p-2.5 font-medium text-white">
            Salvar nova senha
          </button>
        </form>
      </main>
    );
  }

  if (user) {
    return (
      <AppShell
        user={user}
        onLogout={() => {
          setUser(undefined);
          setUsername('');
          setPassword('');
          setNewPassword('');
          setError('');
          setBlockedInfo(null);
        }}
        onUserUpdate={(u: any) => setUser(u)}
      />
    );
  }

  return (
    <main className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col items-center justify-center bg-navy p-10 text-white md:flex">
        <img src="/icon2.png" alt="Logo Logísticas Bill" className="h-24 w-24 object-contain" />
        <h1 className="mt-6 text-3xl font-bold tracking-wide">LOGÍSTICAS BILL</h1>
        <p className="mt-3 max-w-sm text-center text-slate-300">
          Sistema interno de gestão logística!
        </p>
      </div>
      <div className="flex items-center justify-center bg-slate-100 p-4 md:bg-white">
        <form
          onSubmit={login}
          className="w-full max-w-sm rounded-xl bg-white p-8 shadow-lg md:shadow-none"
          autoComplete="off"
        >
          <div className="mb-6 md:hidden">
            <p className="flex items-center gap-2 text-sm font-semibold text-cyan-700">
              <img src="/icon2.png" alt="Logísticas Bill" className="h-7 w-7 object-contain" />
              LOGÍSTICAS BILL
            </p>
          </div>
          <h1 className="mb-6 text-2xl font-bold">Acesso ao sistema</h1>
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          <input
            type="text"
            tabIndex={-1}
            aria-hidden="true"
            className="absolute -left-[9999px] h-px w-px opacity-0"
          />
          <input
            type="password"
            tabIndex={-1}
            aria-hidden="true"
            className="absolute -left-[9999px] h-px w-px opacity-0"
          />
          <label className="text-sm">Usuário</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="off"
            className="w-full rounded-lg border p-2"
          />
          <label className="mt-4 block text-sm">Senha</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="off"
            className="w-full rounded-lg border p-2"
          />
          <button
            disabled={busy}
            className="mt-5 w-full rounded-lg bg-brand p-2.5 font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </main>
  );
}