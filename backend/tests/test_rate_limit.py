import httpx
import pytest
from fastapi import HTTPException

from app.core.rate_limit import (
    PersistentDailyUserRateLimiter,
)


class FakeResponse:
    def __init__(
        self,
        status_code=200,
        payload=None,
    ):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class FakeClient:
    def __init__(
        self,
        response,
    ):
        self.response = response
        self.last_request = None

    def __enter__(self):
        return self

    def __exit__(
        self,
        exc_type,
        exc,
        tb,
    ):
        return False

    def post(
        self,
        url,
        headers=None,
        json=None,
    ):
        self.last_request = {
            "url": url,
            "headers": headers,
            "json": json,
        }

        return self.response


def test_persistent_daily_limit_allows_request(
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

    fake_client = FakeClient(
        FakeResponse(
            payload=[
                {
                    "allowed": True,
                    "request_count": 1,
                    "request_limit": 10,
                }
            ]
        )
    )

    monkeypatch.setattr(
        httpx,
        "Client",
        lambda **kwargs:
            fake_client,
    )

    limiter = (
        PersistentDailyUserRateLimiter(
            requests=10
        )
    )

    limiter.check(
        "access-token"
    )

    assert (
        fake_client.last_request[
            "headers"
        ][
            "Authorization"
        ]
        ==
        "Bearer access-token"
    )

    assert (
        fake_client.last_request[
            "headers"
        ][
            "apikey"
        ]
        ==
        "publishable-key"
    )

    assert (
        fake_client.last_request[
            "json"
        ]
        ==
        {
            "p_limit": 10
        }
    )


def test_persistent_daily_limit_rejects_exhausted_quota(
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

    fake_client = FakeClient(
        FakeResponse(
            payload=[
                {
                    "allowed": False,
                    "request_count": 10,
                    "request_limit": 10,
                }
            ]
        )
    )

    monkeypatch.setattr(
        httpx,
        "Client",
        lambda **kwargs:
            fake_client,
    )

    limiter = (
        PersistentDailyUserRateLimiter(
            requests=10
        )
    )

    with pytest.raises(
        HTTPException
    ) as exc:
        limiter.check(
            "access-token"
        )

    assert (
        exc.value.status_code
        == 429
    )


def test_persistent_daily_limit_rejects_supabase_failure(
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

    fake_client = FakeClient(
        FakeResponse(
            status_code=500,
            payload={
                "error": "boom"
            },
        )
    )

    monkeypatch.setattr(
        httpx,
        "Client",
        lambda **kwargs:
            fake_client,
    )

    limiter = (
        PersistentDailyUserRateLimiter(
            requests=10
        )
    )

    with pytest.raises(
        HTTPException
    ) as exc:
        limiter.check(
            "access-token"
        )

    assert (
        exc.value.status_code
        == 503
    )
