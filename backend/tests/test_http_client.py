import asyncio

from app.core import http_client


def test_supabase_http_client_is_reused_and_closed(
    monkeypatch,
):
    created = []

    class FakeClient:
        def __init__(self, timeout):
            self.timeout = timeout
            self.is_closed = False
            created.append(self)

        async def aclose(self):
            self.is_closed = True

    monkeypatch.setattr(
        http_client,
        "_supabase_http_client",
        None,
    )

    monkeypatch.setattr(
        http_client.httpx,
        "AsyncClient",
        FakeClient,
    )

    first = (
        http_client
        .get_supabase_http_client()
    )

    second = (
        http_client
        .get_supabase_http_client()
    )

    assert first is second
    assert len(created) == 1
    assert first.timeout == 10.0

    asyncio.run(
        http_client
        .close_supabase_http_client()
    )

    assert first.is_closed is True

    assert (
        http_client
        ._supabase_http_client
        is None
    )


def test_shared_client_keeps_authorization_per_request(
    monkeypatch,
):
    import app.core.auth as auth

    monkeypatch.setenv(
        "SUPABASE_URL",
        "https://example.supabase.co",
    )
    monkeypatch.setenv(
        "SUPABASE_PUBLISHABLE_KEY",
        "publishable-key",
    )

    captured_headers = []

    class FakeResponse:
        status_code = 200

        def __init__(self, user_id):
            self.user_id = user_id

        def json(self):
            return [
                {
                    "user_id": self.user_id,
                    "email": None,
                    "status": "active",
                    "plan": "trial",
                    "role": "user",
                    "expires_at": None,
                }
            ]

    class SharedFakeClient:
        async def get(
            self,
            url,
            headers,
            params,
        ):
            captured_headers.append(
                dict(headers)
            )

            await asyncio.sleep(0)

            user_id = params[
                "user_id"
            ].removeprefix("eq.")

            return FakeResponse(
                user_id
            )

    shared_client = SharedFakeClient()

    monkeypatch.setattr(
        auth,
        "get_supabase_http_client",
        lambda: shared_client,
    )

    async def run():
        return await asyncio.gather(
            auth.get_gymos_access(
                auth.AuthenticatedUser(
                    id="user-a",
                    access_token="token-a",
                )
            ),
            auth.get_gymos_access(
                auth.AuthenticatedUser(
                    id="user-b",
                    access_token="token-b",
                )
            ),
        )

    results = asyncio.run(
        run()
    )

    assert {
        headers["Authorization"]
        for headers in captured_headers
    } == {
        "Bearer token-a",
        "Bearer token-b",
    }

    assert {
        result.user_id
        for result in results
    } == {
        "user-a",
        "user-b",
    }
