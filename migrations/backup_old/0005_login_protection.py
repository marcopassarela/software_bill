"""add per-account login protection

Revision ID: 0005_login_protection
Revises: 0004_account_plan
"""
from alembic import op

revision = "0005_login_protection"
down_revision = "0004_account_plan"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS login_failures INTEGER NOT NULL DEFAULT 0"
    )
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS login_locked_until TIMESTAMPTZ"
    )


def downgrade():
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS login_locked_until")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS login_failures")
