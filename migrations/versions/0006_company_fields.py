"""add company and account login fields required by the current application

Revision ID: 0006_company_fields
Revises: 0005_login_protection
"""
from alembic import op

revision = "0006_company_fields"
down_revision = "0005_login_protection"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public.companies (
            id BIGSERIAL PRIMARY KEY,
            name VARCHAR(160) NOT NULL DEFAULT 'Minha empresa',
            legal_name VARCHAR(180),
            document VARCHAR(24),
            email VARCHAR(160),
            phone VARCHAR(30),
            address VARCHAR(255),
            city VARCHAR(80),
            state VARCHAR(2),
            zip_code VARCHAR(12),
            logo TEXT,
            plan VARCHAR(20) NOT NULL DEFAULT 'essencial',
            active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute("ALTER TABLE public.users ADD COLUMN IF NOT EXISTS company_id BIGINT")
    op.execute(
        """
        INSERT INTO public.companies (name, plan)
        SELECT 'Logísticas Bill',
               CASE WHEN COUNT(*) <= 1 THEN 'essencial'
                    WHEN COUNT(*) <= 3 THEN 'profissional'
                    ELSE 'empresarial' END
        FROM public.users
        WHERE NOT EXISTS (SELECT 1 FROM public.companies)
        """
    )
    op.execute(
        """
        UPDATE public.users
        SET company_id = (SELECT id FROM public.companies ORDER BY id LIMIT 1)
        WHERE company_id IS NULL
        """
    )
    op.execute(
        "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS login_failures INTEGER NOT NULL DEFAULT 0"
    )
    op.execute(
        "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS login_locked_until TIMESTAMPTZ"
    )


def downgrade():
    op.execute("ALTER TABLE public.users DROP COLUMN IF EXISTS login_locked_until")
    op.execute("ALTER TABLE public.users DROP COLUMN IF EXISTS login_failures")
    op.execute("ALTER TABLE public.users DROP COLUMN IF EXISTS company_id")
    # A empresa existente não é removida automaticamente no downgrade.
