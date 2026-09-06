export interface PlanProduct {
  id: string;
  key: 'essencial' | 'profissional' | 'empresarial';
  name: string;
  description: string;
  priceInCents: number; // em centavos BRL
  priceFormatted: string;
  users: number;
}

/**
 * Catálogo de planos.
 * Preços em centavos BRL (3990 = R$ 39,90).
 * Deve estar sincronizado com backend/app/plans.py
 */
export const PLAN_PRODUCTS: PlanProduct[] = [
  {
    id: 'plan-essencial',
    key: 'essencial',
    name: 'Plano Essencial',
    description: 'Dashboard, Clientes, Estoque, Relatórios, Config e Usuários',
    priceInCents: 3990, // R$ 39,90
    priceFormatted: 'R$ 39,90',
    users: 1,
  },
  {
    id: 'plan-profissional',
    key: 'profissional',
    name: 'Plano Profissional',
    description: 'Essencial + Pedidos, Veículos, Motoristas, Manutenção, Combustível, Rotas',
    priceInCents: 6990, // R$ 69,90
    priceFormatted: 'R$ 69,90',
    users: 3,
  },
  {
    id: 'plan-empresarial',
    key: 'empresarial',
    name: 'Plano Empresarial',
    description: 'Acesso completo: Profissional + Agenda, Produção, Montagem',
    priceInCents: 11990, // R$ 119,90
    priceFormatted: 'R$ 119,90',
    users: 6,
  },
];

export function getPlanByKey(
  key: 'essencial' | 'profissional' | 'empresarial'
): PlanProduct | undefined {
  return PLAN_PRODUCTS.find((p) => p.key === key);
}

export function getPlanById(id: string): PlanProduct | undefined {
  return PLAN_PRODUCTS.find((p) => p.id === id);
}
