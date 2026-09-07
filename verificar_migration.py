import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv(override=True)

engine = create_engine(os.getenv("DATABASE_URL"))

with engine.connect() as conn:
    checks = {
        "country": """
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'audit_logs'
                  AND column_name = 'country'
            )
        """,
        "region": """
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'audit_logs'
                  AND column_name = 'region'
            )
        """,
        "username_attempted": """
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'audit_logs'
                  AND column_name = 'username_attempted'
            )
        """,
    }

    for name, query in checks.items():
        result = conn.execute(text(query)).scalar()
        print(f"{name}: {result}")