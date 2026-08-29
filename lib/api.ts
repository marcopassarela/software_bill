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
function notifySessionExpired(path: string, status: number) {
  if (status !== 401 || typeof window === 'undefined') return;

  // O erro de credenciais no próprio login deve continuar sendo exibido no formulário.
  if (path !== '/auth/login') {
    window.dispatchEvent(new Event('session-expired'));
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
    notifySessionExpired(path, r.status);
    throw new Error(extractErrorMessage(body.detail));
  }

  return r.status === 204 ? null : r.json();
}
