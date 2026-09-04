import asyncio

from app.core.auth import AuthenticatedUser
from app.domains.swimming import repository


USER = AuthenticatedUser(
    id="user-123",
    email="test@example.com",
    access_token="token-123",
)


def test_upsert_swimming_sessions_uses_authenticated_user(
    monkeypatch,
):
    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return [
                {
                    "id":
                        "health-connect:abc",
                }
            ]

    class FakeClient:
        async def post(
            self,
            url,
            headers,
            params,
            json,
        ):
            captured["url"] = url
            captured["headers"] = headers
            captured["params"] = params
            captured["json"] = json
            return FakeResponse()

    monkeypatch.setattr(
        repository,
        "_supabase_config",
        lambda: (
            "https://supabase.test",
            "publishable-key",
        ),
    )
    monkeypatch.setattr(
        repository,
        "get_supabase_http_client",
        lambda: FakeClient(),
    )

    result = asyncio.run(
        repository.upsert_swimming_sessions(
            USER,
            [
                {
                    "id":
                        "health-connect:abc",
                    "source":
                        "health_connect",
                    "source_file_hash":
                        None,
                    "started_at":
                        "2026-09-02T07:00:00Z",
                    "parser_version":
                        1,
                    "data": {
                        "distance_meters":
                            950,
                    },
                    "updated_at":
                        "2026-09-04T09:00:00+00:00",
                }
            ],
        )
    )

    assert result == [
        {
            "id": "health-connect:abc",
        }
    ]
    assert captured["url"] == (
        "https://supabase.test/rest/v1/"
        "swimming_sessions"
    )
    assert captured["headers"][
        "Authorization"
    ] == "Bearer token-123"
    assert captured["headers"]["apikey"] == (
        "publishable-key"
    )
    assert captured["params"] == {
        "on_conflict": "user_id,id"
    }
    assert captured["json"][0]["user_id"] == (
        "user-123"
    )
    assert captured["json"][0]["source"] == (
        "health_connect"
    )
