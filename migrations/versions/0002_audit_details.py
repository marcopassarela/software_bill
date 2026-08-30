from alembic import op
import sqlalchemy as sa

revision = "0002_audit_details"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "audit_logs",
        sa.Column("country", sa.String(length=80), nullable=True),
    )
    op.add_column(
        "audit_logs",
        sa.Column("region", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "audit_logs",
        sa.Column("city", sa.String(length=160), nullable=True),
    )
    op.add_column(
        "audit_logs",
        sa.Column("latitude", sa.String(length=40), nullable=True),
    )
    op.add_column(
        "audit_logs",
        sa.Column("longitude", sa.String(length=40), nullable=True),
    )
    op.add_column(
        "audit_logs",
        sa.Column("username_attempted", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "audit_logs",
        sa.Column("details", sa.Text(), nullable=True),
    )


def downgrade():
    op.drop_column("audit_logs", "details")
    op.drop_column("audit_logs", "username_attempted")
    op.drop_column("audit_logs", "longitude")
    op.drop_column("audit_logs", "latitude")
    op.drop_column("audit_logs", "city")
    op.drop_column("audit_logs", "region")
    op.drop_column("audit_logs", "country")
