"""add unique document to companies"""

from alembic import op
import sqlalchemy as sa


revision = "0005_company_document_unique"
down_revision = "0004_user_is_owner"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column(
        "companies",
        "document",
        existing_type=sa.String(length=24),
        type_=sa.String(length=14),
        existing_nullable=True,
    )

    op.create_unique_constraint(
        "uq_companies_document",
        "companies",
        ["document"],
    )


def downgrade():
    op.drop_constraint(
        "uq_companies_document",
        "companies",
        type_="unique",
    )

    op.alter_column(
        "companies",
        "document",
        existing_type=sa.String(length=14),
        type_=sa.String(length=24),
        existing_nullable=True,
    )