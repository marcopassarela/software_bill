import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv(override=True)

engine = create_engine(os.getenv("DATABASE_URL"))

tables = [
    "users",
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
    "audit_logs",
    "settings",
]

with engine.connect() as conn:
    print("=== COMPANY_ID ===")

    for table in tables:
        result = conn.execute(
            text("""
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = :table
                      AND column_name = 'company_id'
                )
            """),
            {"table": table},
        ).scalar()

        print(f"{table}: company_id = {result}")

    print("\n=== DADOS DA EMPRESA 3 ===")

    for table in tables:
        has_company_id = conn.execute(
            text("""
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = :table
                      AND column_name = 'company_id'
                )
            """),
            {"table": table},
        ).scalar()

        if has_company_id:
            count = conn.execute(
                text(f'''
                    SELECT COUNT(*)
                    FROM "{table}"
                    WHERE company_id = 3
                ''')
            ).scalar()

            print(f"{table}: {count} registros")

    print("\n=== CAMPOS ANTIGOS ===")

    legacy = {
        "drivers": ["org_unit"],
        "fuel_records": ["org_unit"],
        "maintenance": ["org_unit"],
        "production_records": ["org_unit"],
        "stock_movements": ["org_unit"],
        "vehicles": ["org_unit"],
        "schedule_weeks": ["unit"],
        "users": [
            "permissions_filial",
            "units_access",
            "plan",
        ],
    }

    for table, columns in legacy.items():
        for column in columns:
            exists = conn.execute(
                text("""
                    SELECT EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = :table
                          AND column_name = :column
                    )
                """),
                {
                    "table": table,
                    "column": column,
                },
            ).scalar()

            print(f"{table}.{column}: {'AINDA EXISTE' if exists else 'REMOVIDO'}")