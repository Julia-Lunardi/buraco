from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Buraco API"
    environment: str = "production"
    database_url: str = "postgresql+asyncpg://buraco:buraco@localhost:5434/buraco"
    db_use_managed_identity: bool = False
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 90

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
