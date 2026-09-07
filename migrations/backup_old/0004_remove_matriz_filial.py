# migrations/versions/0004_remove_matriz_filial.py
"""remove sistema de unidade única (matriz/filial): colunas, índices e constraint"""

from alembic import op
import sqlalchemy as sa

revision = "0004_remove_matriz_filial"
down_revision = "0003_optimize_indexes_and_retention"
branch_labels = None
depends_on = None


def upgrade():
    # ===== Índices que incluem org_unit/unit (dependem das colunas removidas) =====
    op.execute("DROP INDEX IF EXISTS ix_stock_movements_org_occurred")
    op.execute("DROP INDEX IF EXISTS ix_maintenance_org_status_date")
    op.execute("DROP INDEX IF EXISTS ix_fuel_records_org_date")
    op.execute("DROP INDEX IF EXISTS ix_vehicles_org_status")
    op.execute("DROP INDEX IF EXISTS ix_drivers_org_status")
    op.execute("DROP INDEX IF EXISTS ix_schedule_weeks_unit_status")
    op.execute("DROP INDEX IF EXISTS ix_production_org_kind_date")
    op.execute("DROP INDEX IF EXISTS ix_products_org_qty_min")

    # Índices simples de coluna única (criados via index=True no mapped_column)
    op.execute("DROP INDEX IF EXISTS ix_vehicles_org_unit")
    op.execute("DROP INDEX IF EXISTS ix_drivers_org_unit")
    op.execute("DROP INDEX IF EXISTS ix_maintenance_org_unit")
    op.execute("DROP INDEX IF EXISTS ix_fuel_records_org_unit")
    op.execute("DROP INDEX IF EXISTS ix_products_org_unit")
    op.execute("DROP INDEX IF EXISTS ix_stock_movements_org_unit")
    op.execute("DROP INDEX IF EXISTS ix_schedule_weeks_unit")
    op.execute("DROP INDEX IF EXISTS ix_production_records_org_unit")

    # ===== Constraint única de veículo (org_unit + plate) -> só plate =====
    op.execute("ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS uq_vehicles_org_unit_plate")
    op.execute(
        "ALTER TABLE vehicles ADD CONSTRAINT uq_vehicles_plate UNIQUE (plate)"
    )

    # Recria índices úteis sem a coluna de unidade
    op.create_index("ix_maintenance_status_date", "maintenance", ["status", "date"], unique=False)
    op.create_index("ix_fuel_records_date", "fuel_records", ["date"], unique=False)
    op.create_index("ix_vehicles_status", "vehicles", ["status"], unique=False)
    op.create_index("ix_drivers_status", "drivers", ["status"], unique=False)
    op.create_index("ix_schedule_weeks_status", "schedule_weeks", ["status"], unique=False)
    op.create_index(
        "ix_production_kind_date", "production_records", ["kind", "production_date"], unique=False
    )
    op.create_index(
        "ix_products_qty_min", "products", ["quantity", "minimum_stock"], unique=False
    )

    # ===== Colunas de unidade / permissões por unidade =====
    op.drop_column("users", "permissions_filial")
    op.drop_column("users", "units_access")
    op.drop_column("vehicles", "org_unit")
    op.drop_column("drivers", "org_unit")
    op.drop_column("maintenance", "org_unit")
    op.drop_column("fuel_records", "org_unit")
    op.drop_column("products", "org_unit")
    op.drop_column("stock_movements", "org_unit")
    op.drop_column("schedule_weeks", "unit")
    op.drop_column("production_records", "org_unit")


def downgrade():
    # ===== Recria colunas (default 'matriz') =====
    op.add_column(
        "production_records",
        sa.Column("org_unit", sa.String(20), nullable=False, server_default="matriz"),
    )
    op.add_column(
        "schedule_weeks",
        sa.Column("unit", sa.String(20), nullable=False, server_default="matriz"),
    )
    op.add_column(
        "stock_movements",
        sa.Column("org_unit", sa.String(20), nullable=False, server_default="matriz"),
    )
    op.add_column(
        "products",
        sa.Column("org_unit", sa.String(20), nullable=False, server_default="matriz"),
    )
    op.add_column(
        "fuel_records",
        sa.Column("org_unit", sa.String(20), nullable=False, server_default="matriz"),
    )
    op.add_column(
        "maintenance",
        sa.Column("org_unit", sa.String(20), nullable=False, server_default="matriz"),
    )
    op.add_column(
        "drivers",
        sa.Column("org_unit", sa.String(20), nullable=False, server_default="matriz"),
    )
    op.add_column(
        "vehicles",
        sa.Column("org_unit", sa.String(20), nullable=False, server_default="matriz"),
    )
    op.add_column("users", sa.Column("units_access", sa.String(40), nullable=True))
    op.add_column("users", sa.Column("permissions_filial", sa.Text(), nullable=True))

    # ===== Remove índices sem unidade e restaura os antigos =====
    op.drop_index("ix_products_qty_min", table_name="products")
    op.drop_index("ix_production_kind_date", table_name="production_records")
    op.drop_index("ix_schedule_weeks_status", table_name="schedule_weeks")
    op.drop_index("ix_drivers_status", table_name="drivers")
    op.drop_index("ix_vehicles_status", table_name="vehicles")
    op.drop_index("ix_fuel_records_date", table_name="fuel_records")
    op.drop_index("ix_maintenance_status_date", table_name="maintenance")

    op.execute("ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS uq_vehicles_plate")
    op.execute(
        "ALTER TABLE vehicles ADD CONSTRAINT uq_vehicles_org_unit_plate UNIQUE (org_unit, plate)"
    )

    op.create_index("ix_vehicles_org_unit", "vehicles", ["org_unit"], unique=False)
    op.create_index("ix_drivers_org_unit", "drivers", ["org_unit"], unique=False)
    op.create_index("ix_maintenance_org_unit", "maintenance", ["org_unit"], unique=False)
    op.create_index("ix_fuel_records_org_unit", "fuel_records", ["org_unit"], unique=False)
    op.create_index("ix_products_org_unit", "products", ["org_unit"], unique=False)
    op.create_index("ix_stock_movements_org_unit", "stock_movements", ["org_unit"], unique=False)
    op.create_index("ix_schedule_weeks_unit", "schedule_weeks", ["unit"], unique=False)
    op.create_index(
        "ix_production_records_org_unit", "production_records", ["org_unit"], unique=False
    )

    op.create_index(
        "ix_stock_movements_org_occurred", "stock_movements", ["org_unit", "occurred_at"], unique=False
    )
    op.create_index(
        "ix_maintenance_org_status_date", "maintenance", ["org_unit", "status", "date"], unique=False
    )
    op.create_index("ix_fuel_records_org_date", "fuel_records", ["org_unit", "date"], unique=False)
    op.create_index("ix_vehicles_org_status", "vehicles", ["org_unit", "status"], unique=False)
    op.create_index("ix_drivers_org_status", "drivers", ["org_unit", "status"], unique=False)
    op.create_index(
        "ix_schedule_weeks_unit_status", "schedule_weeks", ["unit", "status"], unique=False
    )
    op.create_index(
        "ix_production_org_kind_date",
        "production_records",
        ["org_unit", "kind", "production_date"],
        unique=False,
    )
    op.create_index(
        "ix_products_org_qty_min", "products", ["org_unit", "quantity", "minimum_stock"], unique=False
    )