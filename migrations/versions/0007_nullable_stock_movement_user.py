"""allow deleting users while preserving stock movement history"""

from alembic import op
import sqlalchemy as sa


revision = "0007_nullable_stock_movement_user"
down_revision = "0006_schedule_version"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column(
        "stock_movements",
        "user_id",
        existing_type=sa.Integer(),
        nullable=True,
    )


def downgrade():
    op.alter_column(
        "stock_movements",
        "user_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
