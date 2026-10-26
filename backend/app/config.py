from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Buraco API"
    environment: str = "production"
    database_url: str = "postgresql+asyncpg://buraco:buraco@localhost:5434/buraco"
    db_use_managed_identity: bool = False
    secret_key: str = "change-me-in-production"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
