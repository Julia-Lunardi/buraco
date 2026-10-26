import uuid
from typing import Literal

from pydantic import BaseModel, Field


class UserOut(BaseModel):
    id: uuid.UUID
    display_name: str
    email: str | None
    is_guest: bool

    model_config = {"from_attributes": True}


class TokenPair(BaseModel):
    """Same field names as Woddie, so the mobile AuthContext ports unchanged."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class RefreshIn(BaseModel):
    refresh_token: str


class GoogleSignIn(BaseModel):
    id_token: str


class AppleSignIn(BaseModel):
    identity_token: str
    # The RAW nonce the app generated; the app gave Apple SHA256(nonce). Required.
    nonce: str
    # Only present on the very first Apple sign-in; never trusted for account linking.
    full_name: str | None = None


class PushTokenIn(BaseModel):
    token: str = Field(pattern=r"^Expo(nent)?PushToken\[.+\]$", max_length=255)
    platform: Literal["ios", "android"]
    locale: str = Field(default="pt-BR", max_length=10)


class PushTokenOut(BaseModel):
    token: str
