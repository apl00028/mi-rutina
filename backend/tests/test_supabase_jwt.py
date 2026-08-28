import asyncio
import base64
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

import app.core.supabase_jwt as supabase_jwt
from app.core.supabase_jwt import (
    InvalidSupabaseToken,
    verify_supabase_access_token,
)


SUPABASE_URL = "https://example.supabase.co"
KID = "test-signing-key"


def _base64url_uint(value: int) -> str:
    raw = value.to_bytes(
        (value.bit_length() + 7) // 8,
        byteorder="big",
    )

    return (
        base64.urlsafe_b64encode(raw)
        .rstrip(b"=")
        .decode("ascii")
    )


def _signing_material():
    private_key = ec.generate_private_key(
        ec.SECP256R1()
    )

    numbers = (
        private_key
        .public_key()
        .public_numbers()
    )

    jwk = {
        "kty": "EC",
        "crv": "P-256",
        "kid": KID,
        "alg": "ES256",
        "use": "sig",
        "x": _base64url_uint(
            numbers.x
        ),
        "y": _base64url_uint(
            numbers.y
        ),
    }

    return private_key, jwk


class FakeResponse:
    status_code = 200

    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class FakeClient:
    def __init__(self, jwk):
        self.jwk = jwk
        self.calls = 0

    async def get(self, url):
        self.calls += 1

        assert url == (
            f"{SUPABASE_URL}"
            "/auth/v1/.well-known/"
            "jwks.json"
        )

        return FakeResponse({
            "keys": [self.jwk]
        })


def _reset_cache():
    supabase_jwt._jwks_cache = {}
    supabase_jwt._jwks_cache_url = None
    supabase_jwt._jwks_cache_at = 0.0


def _token(
    private_key,
    *,
    audience="authenticated",
):
    now = int(time.time())

    return jwt.encode(
        {
            "sub": "user-123",
            "email": "test@example.com",
            "aud": audience,
            "iss": (
                f"{SUPABASE_URL}/auth/v1"
            ),
            "iat": now,
            "exp": now + 300,
        },
        private_key,
        algorithm="ES256",
        headers={
            "kid": KID,
        },
    )


def test_verifies_valid_es256_token():
    _reset_cache()

    private_key, jwk = (
        _signing_material()
    )

    client = FakeClient(jwk)

    claims = asyncio.run(
        verify_supabase_access_token(
            _token(private_key),
            SUPABASE_URL,
            client,
        )
    )

    assert claims["sub"] == "user-123"
    assert (
        claims["email"]
        == "test@example.com"
    )
    assert client.calls == 1


def test_reuses_cached_jwks():
    _reset_cache()

    private_key, jwk = (
        _signing_material()
    )

    client = FakeClient(jwk)
    token = _token(private_key)

    asyncio.run(
        verify_supabase_access_token(
            token,
            SUPABASE_URL,
            client,
        )
    )

    asyncio.run(
        verify_supabase_access_token(
            token,
            SUPABASE_URL,
            client,
        )
    )

    assert client.calls == 1


def test_rejects_wrong_audience():
    _reset_cache()

    private_key, jwk = (
        _signing_material()
    )

    client = FakeClient(jwk)

    with pytest.raises(
        InvalidSupabaseToken
    ):
        asyncio.run(
            verify_supabase_access_token(
                _token(
                    private_key,
                    audience="wrong",
                ),
                SUPABASE_URL,
                client,
            )
        )
