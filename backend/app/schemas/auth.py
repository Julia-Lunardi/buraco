import uuid

from pydantic import BaseModel


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
