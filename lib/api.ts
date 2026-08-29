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

