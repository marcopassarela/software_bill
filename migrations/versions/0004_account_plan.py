"""add subscription plan and user limit metadata

Revision ID: 0004_account_plan
Revises: 0003_remove_commercial
"""
from alembic import op

revision = "0004_account_plan"
down_revision = "0003_remove_commercial"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(20) "
        "NOT NULL DEFAULT 'essencial'"
    )
    # Mantém uma conta existente operando sem bloquear usuários já cadastrados:
    # escolhe o menor plano que comporta a quantidade atual, até o teto de 6.
    op.execute(
        """
        UPDATE users
        SET plan = CASE
            WHEN (SELECT count(*) FROM users) <= 1 THEN 'essencial'
            WHEN (SELECT count(*) FROM users) <= 3 THEN 'profissional'
            ELSE 'empresarial'
        END
        WHERE id = 1
        """
    )


def downgrade():
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS plan")
