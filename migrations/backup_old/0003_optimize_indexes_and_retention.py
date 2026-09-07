# migrations/versions/0003_optimize_indexes_and_retention.py
"""optimize indexes and add audit retention support"""

from alembic import op
import sqlalchemy as sa

revision = "0003_optimize_indexes_and_retention"
down_revision = "0002_audit_details"   # ajuste se o último for outro
branch_labels = None
depends_on = None


def upgrade():
    # ===== Índices críticos =====
    # Audit (a tabela que mais cresce)
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"], unique=False)
    op.create_index("ix_audit_logs_module_action", "audit_logs", ["module", "action"], unique=False)
    op.create_index("ix_audit_logs_user_id_created", "audit_logs", ["user_id", "created_at"], unique=False)
    op.create_index("ix_audit_logs_ip_created", "audit_logs", ["ip", "created_at"], unique=False)

    # Stock
    op.create_index("ix_stock_movements_org_occurred", "stock_movements", ["org_unit", "occurred_at"], unique=False)
    op.create_index("ix_stock_movements_product_occurred", "stock_movements", ["product_id", "occurred_at"], unique=False)

    # Maintenance (dashboard usa muito)
    op.create_index("ix_maintenance_org_status_date", "maintenance", ["org_unit", "status", "date"], unique=False)
    op.create_index("ix_maintenance_vehicle_status", "maintenance", ["vehicle_id", "status"], unique=False)

    # Fuel
    op.create_index("ix_fuel_records_org_date", "fuel_records", ["org_unit", "date"], unique=False)

    # Vehicles / Drivers
    op.create_index("ix_vehicles_org_status", "vehicles", ["org_unit", "status"], unique=False)
    op.create_index("ix_drivers_org_status", "drivers", ["org_unit", "status"], unique=False)

    # Schedule
    op.create_index("ix_route_slots_week_date", "route_slots", ["week_id", "date"], unique=False)
    op.create_index("ix_schedule_weeks_unit_status", "schedule_weeks", ["unit", "status"], unique=False)

    # Production / Orders
    op.create_index("ix_production_org_kind_date", "production_records", ["org_unit", "kind", "production_date"], unique=False)
    op.create_index("ix_orders_status_date", "orders", ["status", "order_date"], unique=False)

    # Products
    op.create_index("ix_products_org_qty_min", "products", ["org_unit", "quantity", "minimum_stock"], unique=False)


def downgrade():
    op.drop_index("ix_products_org_qty_min", table_name="products")
    op.drop_index("ix_orders_status_date", table_name="orders")
    op.drop_index("ix_production_org_kind_date", table_name="production_records")
    op.drop_index("ix_schedule_weeks_unit_status", table_name="schedule_weeks")
    op.drop_index("ix_route_slots_week_date", table_name="route_slots")
    op.drop_index("ix_drivers_org_status", table_name="drivers")
    op.drop_index("ix_vehicles_org_status", table_name="vehicles")
    op.drop_index("ix_fuel_records_org_date", table_name="fuel_records")
    op.drop_index("ix_maintenance_vehicle_status", table_name="maintenance")
    op.drop_index("ix_maintenance_org_status_date", table_name="maintenance")
    op.drop_index("ix_stock_movements_product_occurred", table_name="stock_movements")
    op.drop_index("ix_stock_movements_org_occurred", table_name="stock_movements")
    op.drop_index("ix_audit_logs_ip_created", table_name="audit_logs")
    op.drop_index("ix_audit_logs_user_id_created", table_name="audit_logs")
    op.drop_index("ix_audit_logs_module_action", table_name="audit_logs")
    op.drop_index("ix_audit_logs_created_at", table_name="audit_logs")