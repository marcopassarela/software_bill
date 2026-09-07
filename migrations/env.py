import os

from dotenv import load_dotenv
from alembic import context
from sqlalchemy import create_engine, pool

from backend.app.database import Base
from backend.app import models

load_dotenv(override=True)

config = context.config


def get_database_url():
    url = os.getenv("DATABASE_URL")

    if not url:
        raise RuntimeError(
            "DATABASE_URL não encontrada nas variáveis de ambiente."
        )

    return url


def run_migrations_offline():
    url = get_database_url()

    context.configure(
        url=url,
        target_metadata=Base.metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    url = get_database_url()

    connectable = create_engine(
        url,
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=Base.metadata,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()