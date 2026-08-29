const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function extractErrorMessage(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (typeof d === 'string' ? d : d?.msg || JSON.stringify(d)))
      .join('; ');
  }
  if (detail && typeof detail === 'object') {
    return (detail as any).msg || JSON.stringify(detail);
  }
  return 'Erro de comunicação';
}

/**
 * Redireciona somente quando uma sessão já autenticada foi invalidada.
 * A rota de login fica fora desse tratamento para que credenciais incorretas
 * continuem sendo exibidas normalmente no formulário.
 */
function redirectToLoginAfterSessionExpiry(path: string, status: number) {
  if (status !== 401 || typeof window === 'undefined') return;

  // Erro de senha no próprio formulário de login não deve redirecionar.
  if (path === '/auth/login') return;

  const params = new URLSearchParams(window.location.search);
  const alreadyOnLoginAfterExpiry =
    window.location.pathname === '/' && params.get('reason') === 'session-expired';

  // Evita um loop quando /auth/me também responder 401 após o recarregamento.
  if (!alreadyOnLoginAfterExpiry) {
    window.location.replace('/?reason=session-expired');
  }
}

export async function request(path: string, options: RequestInit = {}) {
  const r = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  if (!r.ok) {
    const body = await r.json().catch(() => ({ detail: 'Erro de comunicação' }));
    redirectToLoginAfterSessionExpiry(path, r.status);
    throw new Error(extractErrorMessage(body.detail));
  }

  return r.status === 204 ? null : r.json();
}
