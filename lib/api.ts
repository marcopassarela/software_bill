const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function extractErrorMessage(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (typeof d === 'string' ? d : (d as any)?.msg || JSON.stringify(d)))
      .join('; ');
  }
  if (detail && typeof detail === 'object') {
    return (detail as any).message || (detail as any).msg || JSON.stringify(detail);
  }
  return 'Erro de comunicação';
}

export class ApiError extends Error {
  status: number;
  detail: any;
  constructor(status: number, detail: any) {
    super(extractErrorMessage(detail));
    this.status = status;
    this.detail = detail;
  }
}

function notifySessionExpired(path: string, status: number) {
  if (status !== 401 || typeof window === 'undefined') return;
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
    const detail = body.detail;

    if (
      typeof window !== 'undefined' &&
      r.status === 403 &&
      detail &&
      typeof detail === 'object' &&
      (detail as any).code === 'USER_BLOCKED'
    ) {
      window.dispatchEvent(new CustomEvent('user-blocked', { detail }));
    } else {
      notifySessionExpired(path, r.status);
    }

    throw new ApiError(r.status, detail);
  }

  return r.status === 204 ? null : r.json();
}
