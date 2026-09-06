"""Definição central dos planos de assinatura.

Cada empresa (Company) possui UM plano. O plano define:
  - quantos usuários a empresa pode ter (users)
  - quais módulos/abas ficam disponíveis (PLAN_MODULES)

Este arquivo é a única fonte de verdade sobre planos e é importado tanto
pelo main.py quanto pelo security.py (por isso fica isolado, para evitar
import circular).
"""

# Todos os módulos/abas que existem no sistema.
ALL_MODULES = {
    "dashboard",
    "schedule",
    "orders",
    "production",
    "assembly",
    "routes",
    "vehicles",
    "drivers",
    "maintenance",
    "fuel",
    "stock",
    "customers",
    "reports",
    "settings",
    "users",
}

# Limites de cada plano (nome, preço e teto de usuários).
PLAN_LIMITS = {
    "essencial": {"name": "Plano Essencial", "price": 39.90, "users": 1},
    "profissional": {"name": "Plano Profissional", "price": 69.90, "users": 3},
    "empresarial": {"name": "Plano Empresarial", "price": 119.90, "users": 6},
}

# Módulos liberados por plano.
# - Essencial: gestão básica + cadastro de usuários e configurações.
# - Profissional: tudo do Essencial + frota, logística e pedidos.
# - Empresarial: acesso completo (agenda, produção e montagem).
_ESSENCIAL_MODULES = {
    "dashboard",
    "customers",
    "stock",
    "reports",
    "settings",
    "users",
}

_PROFISSIONAL_MODULES = _ESSENCIAL_MODULES | {
    "orders",
    "vehicles",
    "drivers",
    "maintenance",
    "fuel",
    "routes",
}

_EMPRESARIAL_MODULES = set(ALL_MODULES)

PLAN_MODULES = {
    "essencial": _ESSENCIAL_MODULES,
    "profissional": _PROFISSIONAL_MODULES,
    "empresarial": _EMPRESARIAL_MODULES,
}


def normalize_plan(plan: str | None) -> str:
    """Devolve uma chave de plano válida (fallback = essencial)."""
    key = (plan or "essencial").strip().lower()
    return key if key in PLAN_LIMITS else "essencial"


def plan_modules(plan: str | None) -> set[str]:
    """Módulos liberados para o plano informado."""
    return set(PLAN_MODULES.get(normalize_plan(plan), _ESSENCIAL_MODULES))


def plan_user_limit(plan: str | None) -> int:
    """Teto de usuários do plano informado."""
    return PLAN_LIMITS[normalize_plan(plan)]["users"]
