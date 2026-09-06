from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/gestao_logistica"
    auth_secret: str = "development-only-change-me"  # NUNCA use isso em produção
    cookie_secure: bool = False
    access_token_minutes: int = 480
    cors_origins: str = "http://localhost:3000"

@lru_cache
def get_settings():
    settings = Settings()
    # Aviso em desenvolvimento se estiver usando o secret padrão
    if settings.auth_secret == "development-only-change-me":
        print("⚠️  AVISO: AUTH_SECRET está com valor padrão. Troque em produção!")
    return settings