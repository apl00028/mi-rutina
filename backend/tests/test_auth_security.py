import asyncio

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

import auth
from auth import authenticate_user


def test_authenticate_user_without_token_keeps_existing_error():
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            authenticate_user(None)
        )

    assert exc.value.status_code == 401
    assert exc.value.detail == "Missing bearer token"


def test_authenticate_user_with_valid_bearer_token(monkeypatch):
    monkeypatch.setenv(
        "SUPABASE_URL",
        "https://example.supabase.co",
    )
    monkeypatch.setenv(
        "SUPABASE_PUBLISHABLE_KEY",
        "publishable-key",
    )

    class FakeResponse:
        status_code = 200

        def json(self):
            return {
                "id": "user-123",
                "email": "test@example.com",
            }

    class FakeClient:
        def __init__(self, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(
            self,
            exc_type,
            exc,
            tb,
        ):
            pass

        async def get(
            self,
            url,
            headers,
        ):
            assert url == (
                "https://example.supabase.co"
                "/auth/v1/user"
            )
            assert headers == {
                "Authorization":
                    "Bearer token-123",
                "apikey":
                    "publishable-key",
            }
            return FakeResponse()

    monkeypatch.setattr(
        auth.httpx,
        "AsyncClient",
        FakeClient,
    )

    user = asyncio.run(
        authenticate_user(
            HTTPAuthorizationCredentials(
                scheme="Bearer",
                credentials="token-123",
            )
        )
    )

    assert user.id == "user-123"
    assert user.email == "test@example.com"
    assert user.access_token == "token-123"
