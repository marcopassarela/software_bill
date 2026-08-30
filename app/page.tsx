'use client';
import { useEffect, useState } from 'react';
import { request } from '@/lib/api';
import AppShell from '@/components/AppShell';
import { useI18n } from '@/lib/i18n';

export default function Home() {
  const { setLanguage } = useI18n();
  const [user, setUser] = useState<any>();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function handleSessionExpired() {
      // Limpa o usuário atual e faz o componente renderizar o login novamente.
      // Não usa window.location, portanto não recarrega a página.
      setUser(undefined);
      setUsername('');
      setPassword('');
      setNewPassword('');
      setError('');
      setBusy(false);
    }

    window.addEventListener('session-expired', handleSessionExpired);

    request('/auth/me')
      .then(setUser)
      .catch(() => {
        // Sem sessão válida ao abrir a página: exibe o login normalmente.
        setUser(undefined);
      });

    return () => {
      window.removeEventListener('session-expired', handleSessionExpired);
    };
  }, []);

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
      const result = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setUser(result.user);
      if (result.user.language === 'en' || result.user.language === 'pt-BR') {
        setLanguage(result.user.language);
      }
      } catch (e: any) {
      setError(e?.message || 'Erro ao realizar login');
      } finally {
      setBusy(false);
      }
  }

  async function change(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
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
    } catch (e: any) {
      setError(e?.message || 'Erro ao alterar senha');
    } finally {
      setBusy(false);
    }
  }

  if (user?.must_change_password) {
    const strength = passwordStrength(newPassword);
    const barWidth = newPassword ? Math.min(100, (strength.score / 5) * 100) : 0;

    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-4">
        <form
          onSubmit={change}
          className="w-full max-w-md rounded-xl bg-white p-7 shadow"
          autoComplete="off"
        >
          <h1 className="text-xl font-bold">Atualize sua senha</h1>
          <p className="my-3 text-sm text-slate-600">
            Sua senha inicial é temporária. Defina uma nova senha de pelo menos 3 caracteres para continuar.
          </p>
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          <input
            type="password"
            placeholder="Senha temporária"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="off"
            className="w-full rounded-lg border p-2"
          />
          <input
            className="mt-3 w-full rounded-lg border p-2"
            placeholder="Nova senha"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={3}
            autoComplete="new-password"
          />
          <div className="mt-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
                style={{ width: `${barWidth}%` }}
              />
            </div>
            {newPassword && (
              <p className="mt-1 text-xs font-medium text-slate-600">Senha {strength.label}</p>
            )}
          </div>
          <button
            disabled={busy}
            className="mt-4 w-full rounded-lg bg-brand p-2 text-white disabled:opacity-50"
          >
            {busy ? 'Salvando…' : 'Salvar e continuar'}
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
        <p className="mt-3 max-w-sm text-center text-slate-300">Sistema interno de gestão logística!</p>
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
          <input type="text" tabIndex={-1} aria-hidden="true" className="absolute -left-[9999px] h-px w-px opacity-0" />
          <input type="password" tabIndex={-1} aria-hidden="true" className="absolute -left-[9999px] h-px w-px opacity-0" />
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
