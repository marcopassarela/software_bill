"""convert database to company-based multi-tenancy"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision = "0003_multi_tenant"
down_revision = "0002_audit_details"
branch_labels = None
depends_on = None


LEGACY_COMPANY_ID = 3


TENANT_TABLES = [
    "customers",
    "drivers",
    "vehicles",
    "routes",
    "route_stops",
    "maintenance",
    "fuel_records",
    "products",
    "stock_movements",
    "schedule_weeks",
    "route_slots",
    "schedule_entries",
    "schedule_extras",
    "production_records",
    "orders",
]


def table_exists(conn, table_name: str) -> bool:
    result = conn.execute(
        text(
            """
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name = :table_name
            )
            """
        ),
        {"table_name": table_name},
    )
    return bool(result.scalar())


def column_exists(conn, table_name: str, column_name: str) -> bool:
    result = conn.execute(
        text(
            """
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = :table_name
                  AND column_name = :column_name
            )
            """
        ),
        {
            "table_name": table_name,
            "column_name": column_name,
        },
    )
    return bool(result.scalar())


def constraint_exists(conn, constraint_name: str) -> bool:
    result = conn.execute(
        text(
            """
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.table_constraints
                WHERE constraint_schema = 'public'
                  AND constraint_name = :constraint_name
            )
            """
        ),
        {"constraint_name": constraint_name},
    )
    return bool(result.scalar())


def index_exists(conn, index_name: str) -> bool:
    result = conn.execute(
        text(
            """
            SELECT EXISTS (
                SELECT 1
                FROM pg_indexes
                WHERE schemaname = 'public'
                  AND indexname = :index_name
            )
            """
        ),
        {"index_name": index_name},
    )
    return bool(result.scalar())


def add_company_id(conn, table_name: str, nullable: bool = False):
    if not column_exists(conn, table_name, "company_id"):
        op.add_column(
            table_name,
            sa.Column(
                "company_id",
                sa.BigInteger(),
                nullable=True,
            ),
        )

    conn.execute(
        text(
            f"""
            UPDATE "{table_name}"
            SET company_id = :company_id
            WHERE company_id IS NULL
            """
        ),
        {"company_id": LEGACY_COMPANY_ID},
    )

    if not nullable:
        op.alter_column(
            table_name,
            "company_id",
            existing_type=sa.BigInteger(),
            nullable=False,
        )


def add_company_fk(conn, table_name: str):
    constraint_name = f"fk_{table_name}_company_id"

    if not constraint_exists(conn, constraint_name):
        op.create_foreign_key(
            constraint_name,
            table_name,
            "companies",
            ["company_id"],
            ["id"],
            ondelete="RESTRICT",
        )


def add_company_index(conn, table_name: str):
    index_name = f"ix_{table_name}_company_id"

    if not index_exists(conn, index_name):
        op.create_index(
            index_name,
            table_name,
            ["company_id"],
            unique=False,
        )


def upgrade():
    conn = op.get_bind()

    # ---------------------------------------------------------
    # 1. Validar empresa existente
    # ---------------------------------------------------------

    if not table_exists(conn, "companies"):
        raise RuntimeError(
            "A tabela 'companies' não existe. "
            "A migration não pode continuar."
        )

    result = conn.execute(
        text(
            """
            SELECT id
            FROM companies
            WHERE id = :company_id
            """
        ),
        {"company_id": LEGACY_COMPANY_ID},
    )

    if result.first() is None:
        raise RuntimeError(
            "A empresa ID 3 (Logísticas Bill) não foi encontrada. "
            "A migration foi interrompida para proteger os dados."
        )

    # ---------------------------------------------------------
    # 1.1. Campos adicionais da Company
    # ---------------------------------------------------------

    company_columns = [
        ("legal_name", sa.String(length=180)),
        ("logo", sa.Text()),
        ("subscription_status", sa.String(length=30)),
        ("subscription_id", sa.String(length=120)),
        ("current_period_start", sa.DateTime(timezone=True)),
        ("current_period_end", sa.DateTime(timezone=True)),
    ]

    for column_name, column_type in company_columns:
        if not column_exists(conn, "companies", column_name):
            op.add_column(
                "companies",
                sa.Column(
                    column_name,
                    column_type,
                    nullable=True,
                ),
            )

    # ---------------------------------------------------------
    # 2. Users
    # ---------------------------------------------------------

    if not column_exists(conn, "users", "company_id"):
        op.add_column(
            "users",
            sa.Column(
                "company_id",
                sa.BigInteger(),
                nullable=True,
            ),
        )

    conn.execute(
        text(
            """
            UPDATE users
            SET company_id = :company_id
            WHERE company_id IS NULL
            """
        ),
        {"company_id": LEGACY_COMPANY_ID},
    )

    if not constraint_exists(conn, "fk_users_company_id"):
        op.create_foreign_key(
            "fk_users_company_id",
            "users",
            "companies",
            ["company_id"],
            ["id"],
            ondelete="RESTRICT",
        )

    if not index_exists(conn, "ix_users_company_id"):
        op.create_index(
            "ix_users_company_id",
            "users",
            ["company_id"],
            unique=False,
        )

    # ---------------------------------------------------------
    # 3. Tabelas pertencentes à empresa
    # ---------------------------------------------------------

    for table_name in TENANT_TABLES:
        if not table_exists(conn, table_name):
            raise RuntimeError(
                f"A tabela '{table_name}' não existe. "
                "A migration foi interrompida para proteger os dados."
            )

        add_company_id(conn, table_name, nullable=False)
        add_company_fk(conn, table_name)
        add_company_index(conn, table_name)

    # ---------------------------------------------------------
    # 4. Audit logs
    # ---------------------------------------------------------

    add_company_id(conn, "audit_logs", nullable=True)
    add_company_fk(conn, "audit_logs")
    add_company_index(conn, "audit_logs")

    # ---------------------------------------------------------
    # 5. Drivers
    # ---------------------------------------------------------

    if not index_exists(conn, "ix_drivers_company_email"):
        op.create_index(
            "ix_drivers_company_email",
            "drivers",
            ["company_id", "email"],
            unique=False,
        )

    # ---------------------------------------------------------
    # 6. Vehicles
    # ---------------------------------------------------------

    if constraint_exists(conn, "vehicles_plate_key"):
        op.drop_constraint(
            "vehicles_plate_key",
            "vehicles",
            type_="unique",
        )

    if index_exists(conn, "ix_vehicles_plate"):
        op.drop_index(
            "ix_vehicles_plate",
            table_name="vehicles",
        )

    if not index_exists(conn, "uq_vehicles_company_plate"):
        op.create_index(
            "uq_vehicles_company_plate",
            "vehicles",
            ["company_id", "plate"],
            unique=True,
        )

    # ---------------------------------------------------------
    # 7. Products
    # ---------------------------------------------------------

    if constraint_exists(conn, "products_code_key"):
        op.drop_constraint(
            "products_code_key",
            "products",
            type_="unique",
        )

    if index_exists(conn, "ix_products_code"):
        op.drop_index(
            "ix_products_code",
            table_name="products",
        )

    if not index_exists(conn, "uq_products_company_code"):
        op.create_index(
            "uq_products_company_code",
            "products",
            ["company_id", "code"],
            unique=True,
        )

    # ---------------------------------------------------------
    # 8. Settings
    # ---------------------------------------------------------

    if table_exists(conn, "settings"):

        result = conn.execute(
            text(
                """
                SELECT constraint_name
                FROM information_schema.table_constraints
                WHERE table_schema = 'public'
                  AND table_name = 'settings'
                  AND constraint_type = 'PRIMARY KEY'
                """
            )
        )

        pk_rows = result.fetchall()

        for row in pk_rows:
            pk_name = row[0]

            op.drop_constraint(
                pk_name,
                "settings",
                type_="primary",
            )

        if not column_exists(conn, "settings", "id"):

            conn.execute(
                text(
                    """
                    CREATE SEQUENCE IF NOT EXISTS settings_id_seq
                    """
                )
            )

            op.add_column(
                "settings",
                sa.Column(
                    "id",
                    sa.Integer(),
                    nullable=True,
                    server_default=sa.text(
                        "nextval('settings_id_seq'::regclass)"
                    ),
                ),
            )

            conn.execute(
                text(
                    """
                    ALTER SEQUENCE settings_id_seq
                    OWNED BY settings.id
                    """
                )
            )

        add_company_id(conn, "settings", nullable=False)
        add_company_fk(conn, "settings")
        add_company_index(conn, "settings")

        conn.execute(
            text(
                """
                UPDATE settings
                SET id = nextval('settings_id_seq'::regclass)
                WHERE id IS NULL
                """
            )
        )

        op.alter_column(
            "settings",
            "id",
            existing_type=sa.Integer(),
            nullable=False,
        )

        result = conn.execute(
            text(
                """
                SELECT constraint_name
                FROM information_schema.table_constraints
                WHERE table_schema = 'public'
                  AND table_name = 'settings'
                  AND constraint_type = 'PRIMARY KEY'
                """
            )
        )

        if result.first() is None:
            op.create_primary_key(
                "settings_pkey",
                "settings",
                ["id"],
            )

        if not index_exists(conn, "uq_settings_company_key"):
            op.create_index(
                "uq_settings_company_key",
                "settings",
                ["company_id", "key"],
                unique=True,
            )

    # ---------------------------------------------------------
    # 9. Remover matriz/filial
    # ---------------------------------------------------------

    legacy_columns = {
        "drivers": ["org_unit"],
        "fuel_records": ["org_unit"],
        "maintenance": ["org_unit"],
        "production_records": ["org_unit"],
        "stock_movements": ["org_unit"],
        "vehicles": ["org_unit"],
        "schedule_weeks": ["unit"],
    }

    for table_name, columns in legacy_columns.items():
        for column_name in columns:
            if column_exists(conn, table_name, column_name):
                op.drop_column(
                    table_name,
                    column_name,
                )

    # ---------------------------------------------------------
    # 10. Remover campos antigos do usuário
    # ---------------------------------------------------------

    for column_name in [
        "permissions_filial",
        "units_access",
        "plan",
    ]:
        if column_exists(conn, "users", column_name):
            op.drop_column(
                "users",
                column_name,
            )

    # ---------------------------------------------------------
    # 11. Índices adicionais
    # ---------------------------------------------------------

    if not index_exists(conn, "ix_audit_logs_company_created_at"):
        op.create_index(
            "ix_audit_logs_company_created_at",
            "audit_logs",
            ["company_id", "created_at"],
            unique=False,
        )

    if not index_exists(conn, "ix_orders_company_created_at"):
        op.create_index(
            "ix_orders_company_created_at",
            "orders",
            ["company_id", "created_at"],
            unique=False,
        )

    if not index_exists(conn, "ix_production_records_company_date"):
        op.create_index(
            "ix_production_records_company_date",
            "production_records",
            ["company_id", "production_date"],
            unique=False,
        )

    if not index_exists(conn, "ix_schedule_weeks_company_start_date"):
        op.create_index(
            "ix_schedule_weeks_company_start_date",
            "schedule_weeks",
            ["company_id", "start_date"],
            unique=False,
        )

    # ---------------------------------------------------------
    # 12. Plano atual da empresa
    # ---------------------------------------------------------

    conn.execute(
        text(
            """
            UPDATE companies
            SET plan = 'empresarial'
            WHERE id = :company_id
            """
        ),
        {"company_id": LEGACY_COMPANY_ID},
    )


def downgrade():
    raise RuntimeError(
        "Downgrade automático desabilitado para esta migration. "
        "A reversão pode causar perda de dados e deve ser feita "
        "manualmente após backup."
    )