"""add schedule_versions table (contador para polling barato do agendamento)"""

from alembic import op
import sqlalchemy as sa


revision = "0006_schedule_version"
down_revision = "0005_company_document_unique"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "schedule_versions",
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["company_id"],
            ["companies.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("company_id"),
    )

    # Popula uma linha inicial para cada empresa que já tem agendamento,
    # para que o primeiro GET /schedule/version não precise criar a linha.
    op.execute(
        """
        INSERT INTO schedule_versions (company_id, version)
        SELECT DISTINCT company_id, 1 FROM schedule_weeks
        ON CONFLICT (company_id) DO NOTHING
        """
    )


def downgrade():
    op.drop_table("schedule_versions")
