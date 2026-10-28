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

    # Google OAuth client IDs. All three are valid token audiences: Android signs in
    # natively and gets a token addressed to the WEB client; iOS uses the iOS client.
    # Key Vault: google-client-id (WEB), google-ios-client-id, google-android-client-id.
    google_client_id: str = ""
    google_ios_client_id: str = ""
    google_android_client_id: str = ""
    # Audience of every Apple identity token.
    apple_bundle_id: str = "com.buraco.app"

    # Live tables: each turn's clock. When it runs out a bot finishes that turn; a player who has
    # left keeps the bot in their seat until they come back.
    live_turn_seconds: float = 40.0

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
