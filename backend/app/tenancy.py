"""Isolamento multi-tenant (uma empresa não enxerga dados da outra).

Estratégia: filtro GLOBAL no SQLAlchemy.

1) TenantMixin adiciona a coluna `company_id` a todos os modelos que pertencem
   a uma empresa. Basta o modelo herdar de TenantMixin.

2) Um listener em `do_orm_execute` injeta automaticamente
   `WHERE company_id = :cid` em TODA consulta (SELECT) feita para qualquer
   modelo tenant — dashboard, estoque, agenda, pedidos, produção e os
   endpoints genéricos. Assim não é preciso alterar cada query manualmente.

3) Um listener em `before_flush` carimba `company_id` automaticamente em todo
   registro novo, de forma que qualquer INSERT já nasce vinculado à empresa
   da sessão.

A empresa "ativa" da requisição fica em `session.info["company_id"]`, definida
no `current_user` (security.py) logo após autenticar. Requisições sem login
(login/cadastro) não têm empresa definida e, portanto, não sofrem filtro —
o que é necessário para localizar o usuário durante o login.
"""

from sqlalchemy import ForeignKey, event
from sqlalchemy.orm import Mapped, Session, mapped_column, with_loader_criteria

# Chave usada em Session.info para guardar a empresa ativa da requisição.
TENANT_KEY = "company_id"
# Marca consultas que devem ignorar o filtro de empresa (uso interno raro).
SKIP_TENANT_OPTION = "skip_tenant"


class TenantMixin:
    """Todo modelo que pertence a uma empresa herda deste mixin."""

    company_id: Mapped[int | None] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )


def _current_company(session: Session):
    try:
        return session.info.get(TENANT_KEY)
    except Exception:
        return None


@event.listens_for(Session, "do_orm_execute")
def _apply_tenant_filter(execute_state):
    """Injeta o filtro por empresa em todas as leituras ORM."""
    if not execute_state.is_select:
        return
    if execute_state.execution_options.get(SKIP_TENANT_OPTION):
        return
    if execute_state.is_column_load or execute_state.is_relationship_load:
        # Recarregamentos de colunas/relacionamentos já herdam o escopo.
        return

    cid = _current_company(execute_state.session)
    if cid is None:
        return

    execute_state.statement = execute_state.statement.options(
        with_loader_criteria(
            TenantMixin,
            lambda cls: cls.company_id == cid,
            include_aliases=True,
        )
    )


@event.listens_for(Session, "before_flush")
def _stamp_tenant(session: Session, flush_context, instances):
    """Carimba company_id em novos registros da empresa ativa."""
    cid = _current_company(session)
    if cid is None:
        return
    for obj in session.new:
        if isinstance(obj, TenantMixin) and getattr(obj, "company_id", None) is None:
            obj.company_id = cid


def set_current_company(db: Session, company_id: int | None) -> None:
    """Define a empresa ativa da sessão/requisição."""
    db.info[TENANT_KEY] = company_id
