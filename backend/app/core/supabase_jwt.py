from __future__ import annotations

import asyncio
import base64
import time
from typing import Any

import httpx
import jwt
from cryptography.hazmat.primitives.asymmetric import ec
from jwt import InvalidTokenError


JWKS_CACHE_SECONDS = 3600.0

_jwks_cache: dict[str, dict[str, Any]] = {}
_jwks_cache_url: str | None = None
_jwks_cache_at = 0.0
_jwks_lock = asyncio.Lock()


class InvalidSupabaseToken(Exception):
    pass


class SupabaseJwksUnavailable(Exception):
    pass


def _decode_base64url_uint(value: str) -> int:
    padding = "=" * (-len(value) % 4)

    raw = base64.urlsafe_b64decode(
        value + padding
    )

    return int.from_bytes(
        raw,
        byteorder="big",
    )


def _public_key_from_jwk(
    jwk: dict[str, Any],
):
    if (
        jwk.get("kty") != "EC"
        or jwk.get("crv") != "P-256"
        or not jwk.get("x")
        or not jwk.get("y")
    ):
        raise InvalidSupabaseToken(
            "Unsupported signing key"
        )

    public_numbers = (
        ec.EllipticCurvePublicNumbers(
            _decode_base64url_uint(
                jwk["x"]
            ),
            _decode_base64url_uint(
                jwk["y"]
            ),
            ec.SECP256R1(),
        )
    )

    return public_numbers.public_key()


async def _load_jwks(
    supabase_url: str,
    client: httpx.AsyncClient,
    *,
    force_refresh: bool = False,
) -> dict[str, dict[str, Any]]:
    global _jwks_cache
    global _jwks_cache_url
    global _jwks_cache_at

    now = time.monotonic()

    if (
        not force_refresh
        and _jwks_cache
        and _jwks_cache_url == supabase_url
        and now - _jwks_cache_at
            < JWKS_CACHE_SECONDS
    ):
        return _jwks_cache

    async with _jwks_lock:
        now = time.monotonic()

        if (
            not force_refresh
            and _jwks_cache
            and _jwks_cache_url
                == supabase_url
            and now - _jwks_cache_at
                < JWKS_CACHE_SECONDS
        ):
            return _jwks_cache

        try:
            response = await client.get(
                (
                    f"{supabase_url}"
                    "/auth/v1/.well-known/"
                    "jwks.json"
                )
            )

            response.raise_for_status()

            payload = response.json()

        except (
            httpx.HTTPError,
            ValueError,
        ) as exc:
            raise SupabaseJwksUnavailable(
                "Unable to load Supabase JWKS"
            ) from exc

        keys = payload.get("keys")

        if not isinstance(keys, list):
            raise SupabaseJwksUnavailable(
                "Invalid Supabase JWKS"
            )

        parsed = {
            key["kid"]: key
            for key in keys
            if (
                isinstance(key, dict)
                and isinstance(
                    key.get("kid"),
                    str,
                )
            )
        }

        if not parsed:
            raise SupabaseJwksUnavailable(
                "Supabase JWKS is empty"
            )

        _jwks_cache = parsed
        _jwks_cache_url = supabase_url
        _jwks_cache_at = now

        return parsed


async def verify_supabase_access_token(
    token: str,
    supabase_url: str,
    client: httpx.AsyncClient,
) -> dict[str, Any]:
    try:
        header = jwt.get_unverified_header(
            token
        )
    except InvalidTokenError as exc:
        raise InvalidSupabaseToken(
            "Invalid token header"
        ) from exc

    if header.get("alg") != "ES256":
        raise InvalidSupabaseToken(
            "Unexpected signing algorithm"
        )

    kid = header.get("kid")

    if not isinstance(kid, str) or not kid:
        raise InvalidSupabaseToken(
            "Missing signing key id"
        )

    keys = await _load_jwks(
        supabase_url,
        client,
    )

    jwk = keys.get(kid)

    if jwk is None:
        keys = await _load_jwks(
            supabase_url,
            client,
            force_refresh=True,
        )

        jwk = keys.get(kid)

    if jwk is None:
        raise InvalidSupabaseToken(
            "Unknown signing key"
        )

    public_key = _public_key_from_jwk(
        jwk
    )

    issuer = (
        f"{supabase_url}/auth/v1"
    )

    try:
        claims = jwt.decode(
            token,
            public_key,
            algorithms=["ES256"],
            audience="authenticated",
            issuer=issuer,
            options={
                "require": [
                    "sub",
                    "exp",
                    "aud",
                    "iss",
                ]
            },
        )
    except InvalidTokenError as exc:
        raise InvalidSupabaseToken(
            "Invalid or expired token"
        ) from exc

    subject = claims.get("sub")

    if not isinstance(
        subject,
        str,
    ) or not subject:
        raise InvalidSupabaseToken(
            "Missing token subject"
        )

    return claims
