import asyncio

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

import app.core.auth as auth
from app.core.auth import authenticate_user


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

    class FakeClient:
        pass

    fake_client = FakeClient()

    monkeypatch.setattr(
        auth,
        "get_supabase_http_client",
        lambda: fake_client,
    )

    async def fake_verify(
        token,
        supabase_url,
        client,
    ):
        assert token == "token-123"
        assert supabase_url == (
            "https://example.supabase.co"
        )
        assert client is fake_client

        return {
            "sub": "user-123",
            "email": "test@example.com",
        }

    monkeypatch.setattr(
        auth,
        "verify_supabase_access_token",
        fake_verify,
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
    assert (
        user.email
        == "test@example.com"
    )
    assert (
        user.access_token
        == "token-123"
    )


def test_authenticate_user_rejects_invalid_token(
    monkeypatch,
):
    monkeypatch.setenv(
        "SUPABASE_URL",
        "https://example.supabase.co",
    )
    monkeypatch.setenv(
        "SUPABASE_PUBLISHABLE_KEY",
        "publishable-key",
    )

    monkeypatch.setattr(
        auth,
        "get_supabase_http_client",
        lambda: object(),
    )

    async def fake_verify(
        token,
        supabase_url,
        client,
    ):
        raise auth.InvalidSupabaseToken(
            "invalid"
        )

    monkeypatch.setattr(
        auth,
        "verify_supabase_access_token",
        fake_verify,
    )

    with pytest.raises(
        HTTPException
    ) as exc:
        asyncio.run(
            authenticate_user(
                HTTPAuthorizationCredentials(
                    scheme="Bearer",
                    credentials="bad-token",
                )
            )
        )

    assert exc.value.status_code == 401
    assert exc.value.detail == (
        "Invalid or expired access token"
    )


def test_authenticate_user_returns_503_when_jwks_unavailable(
    monkeypatch,
):
    monkeypatch.setenv(
        "SUPABASE_URL",
        "https://example.supabase.co",
    )
    monkeypatch.setenv(
        "SUPABASE_PUBLISHABLE_KEY",
        "publishable-key",
    )

    monkeypatch.setattr(
        auth,
        "get_supabase_http_client",
        lambda: object(),
    )

    async def fake_verify(
        token,
        supabase_url,
        client,
    ):
        raise auth.SupabaseJwksUnavailable(
            "unavailable"
        )

    monkeypatch.setattr(
        auth,
        "verify_supabase_access_token",
        fake_verify,
    )

    with pytest.raises(
        HTTPException
    ) as exc:
        asyncio.run(
            authenticate_user(
                HTTPAuthorizationCredentials(
                    scheme="Bearer",
                    credentials="token-123",
                )
            )
        )

    assert exc.value.status_code == 503
    assert exc.value.detail == (
        "Authentication service is unavailable"
    )
