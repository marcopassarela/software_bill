from alembic import op
import sqlalchemy as sa

revision = "0002_add_user_language"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users",
        sa.Column(
            "language",
            sa.String(length=10),
            nullable=False,
            server_default="pt-BR",
        ),
    )


def downgrade():
    op.drop_column("users", "language")
