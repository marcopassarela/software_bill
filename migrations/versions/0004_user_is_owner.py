"""add is_owner flag to users (proteção do dono da empresa)"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision = "0004_user_is_owner"
down_revision = "0003_multi_tenant"
branch_labels = None
depends_on = None


def column_exists(conn, table_name: str, column_name: str) -> bool:
    result = conn.execute(
        text(
            """
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = :table_name
                  AND column_name = :column_name
            )
            """
        ),
        {"table_name": table_name, "column_name": column_name},
    )
    return bool(result.scalar())


def upgrade():
    conn = op.get_bind()

    if not column_exists(conn, "users", "is_owner"):
        op.add_column(
            "users",
            sa.Column(
                "is_owner",
                sa.Boolean(),
                nullable=False,
                server_default="false",
            ),
        )

    # Backfill: marca como owner o usuário ADMIN mais antigo de cada
    # empresa que ainda não tem nenhum owner definido.
    #
    # OBS: o enum nativo "role" no Postgres guarda o *nome* do membro
    # Python (ADMIN), não o valor em português (ADMINISTRADOR) — por
    # isso a comparação abaixo usa 'ADMIN'.
    conn.execute(
        text(
            """
            UPDATE users u
            SET is_owner = TRUE
            FROM (
                SELECT DISTINCT ON (company_id) id, company_id
                FROM users
                WHERE role = 'ADMIN'
                ORDER BY company_id, created_at ASC, id ASC
            ) first_admin
            WHERE u.id = first_admin.id
              AND NOT EXISTS (
                  SELECT 1 FROM users u2
                  WHERE u2.company_id = first_admin.company_id
                    AND u2.is_owner = TRUE
              )
            """
        )
    )


def downgrade():
    op.drop_column("users", "is_owner")