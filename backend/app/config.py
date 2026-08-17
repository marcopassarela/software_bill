from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/gestao_logistica"
    auth_secret: str = "development-only-change-me"
    cookie_secure: bool = False
    access_token_minutes: int = 480
    cors_origins: str = "http://localhost:3000"

@lru_cache
def get_settings(): return Settings()

