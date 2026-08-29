import asyncio

from app.core.auth import AuthenticatedUser
from app.domains.routines import repository


def test_list_routines_filters_authenticated_user(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "publishable-key")

    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return [
                {
                    "id": "routine-1",
                    "user_id": "user-123",
                    "data": {
                        "schemaVersion": "4.2",
                        "routineId": "routine-1",
                        "revision": 1,
                        "sessions": [],
                    },
                }
            ]

    class FakeClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            pass

        async def get(self, url, headers, params):
            captured["url"] = url
            captured["headers"] = headers
            captured["params"] = params
            return FakeResponse()

    monkeypatch.setattr(repository.httpx, "AsyncClient", FakeClient)

    user = AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="access-token",
    )

    rows = asyncio.run(repository.list_routines(user))

    assert rows[0]["id"] == "routine-1"
    assert captured["url"] == "https://example.supabase.co/rest/v1/routines"
    assert captured["headers"] == {
        "Authorization": "Bearer access-token",
        "apikey": "publishable-key",
    }
    assert captured["params"] == {
        "user_id": "eq.user-123",
        "order": "updated_at.desc",
    }


def test_get_routine_filters_id_and_authenticated_user(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "publishable-key")

    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return [
                {
                    "id": "routine-1",
                    "user_id": "user-123",
                    "data": {
                        "schemaVersion": "4.2",
                        "routineId": "routine-1",
                        "revision": 1,
                        "sessions": [],
                    },
                }
            ]

    class FakeClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            pass

        async def get(self, url, headers, params):
            captured["url"] = url
            captured["headers"] = headers
            captured["params"] = params
            return FakeResponse()

    monkeypatch.setattr(repository.httpx, "AsyncClient", FakeClient)

    user = AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="access-token",
    )

    row = asyncio.run(repository.get_routine_by_id(user, "routine-1"))

    assert row["id"] == "routine-1"
    assert captured["params"] == {
        "id": "eq.routine-1",
        "user_id": "eq.user-123",
        "limit": "1",
    }


def test_get_routine_empty_result_returns_none(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "publishable-key")

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return []

    class FakeClient:
        def __init__(self, timeout):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            pass

        async def get(self, url, headers, params):
            return FakeResponse()

    monkeypatch.setattr(repository.httpx, "AsyncClient", FakeClient)

    user = AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="access-token",
    )

    row = asyncio.run(repository.get_routine_by_id(user, "routine-1"))

    assert row is None


def test_create_routine_posts_user_owned_row(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "publishable-key")

    captured = {}
    routine = {
        "schemaVersion": "4.2",
        "routineId": "routine-1",
        "revision": 1,
        "sessions": [{"sessionId": "session-a", "exercises": []}],
    }

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return [{"id": "routine-1", "user_id": "user-123", "data": routine}]

    class FakeClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            pass

        async def post(self, url, headers, json):
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            return FakeResponse()

    monkeypatch.setattr(repository.httpx, "AsyncClient", FakeClient)

    user = AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="access-token",
    )

    row = asyncio.run(repository.create_routine(user, routine))

    assert row["id"] == "routine-1"
    assert captured["url"] == "https://example.supabase.co/rest/v1/routines"
    assert captured["headers"] == {
        "Authorization": "Bearer access-token",
        "apikey": "publishable-key",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    assert captured["json"] == {
        "id": "routine-1",
        "user_id": "user-123",
        "data": routine,
    }


def test_replace_routine_filters_id_and_user_and_replaces_data(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "publishable-key")

    captured = {}
    routine = {
        "schemaVersion": "4.2",
        "routineId": "routine-1",
        "revision": 2,
        "sessions": [{"sessionId": "session-b", "exercises": []}],
    }

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return [{"id": "routine-1", "user_id": "user-123", "data": routine}]

    class FakeClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            pass

        async def patch(self, url, headers, params, json):
            captured["url"] = url
            captured["headers"] = headers
            captured["params"] = params
            captured["json"] = json
            return FakeResponse()

    monkeypatch.setattr(repository.httpx, "AsyncClient", FakeClient)

    user = AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="access-token",
    )

    row = asyncio.run(repository.replace_routine(user, "routine-1", routine))

    assert row["data"] == routine
    assert captured["headers"] == {
        "Authorization": "Bearer access-token",
        "apikey": "publishable-key",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    assert captured["params"] == {
        "id": "eq.routine-1",
        "user_id": "eq.user-123",
    }
    assert captured["json"] == {"data": routine}


def test_replace_routine_empty_result_returns_none(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "publishable-key")

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return []

    class FakeClient:
        def __init__(self, timeout):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            pass

        async def patch(self, url, headers, params, json):
            return FakeResponse()

    monkeypatch.setattr(repository.httpx, "AsyncClient", FakeClient)

    user = AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="access-token",
    )

    row = asyncio.run(
        repository.replace_routine(
            user,
            "routine-1",
            {
                "schemaVersion": "4.2",
                "routineId": "routine-1",
                "revision": 2,
                "sessions": [],
            },
        )
    )

    assert row is None


def test_get_active_routine_filters_by_discipline(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "publishable-key")

    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return [
                {
                    "user_id": "user-123",
                    "routine_id": "swim-1",
                    "discipline": "swimming",
                }
            ]

    class FakeClient:
        def __init__(self, timeout):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            pass

        async def get(self, url, headers, params):
            captured["params"] = params
            return FakeResponse()

    monkeypatch.setattr(repository.httpx, "AsyncClient", FakeClient)

    user = AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="access-token",
    )

    row = asyncio.run(
        repository.get_active_routine(
            user,
            "swimming",
        )
    )

    assert row["routine_id"] == "swim-1"
    assert captured["params"] == {
        "user_id": "eq.user-123",
        "discipline": "eq.swimming",
        "limit": "1",
    }


def test_set_active_routine_upserts_by_user_and_discipline(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "publishable-key")

    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return [
                {
                    "user_id": "user-123",
                    "routine_id": "swim-1",
                    "discipline": "swimming",
                }
            ]

    class FakeClient:
        def __init__(self, timeout):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            pass

        async def post(self, url, headers, params, json):
            captured["params"] = params
            captured["json"] = json
            return FakeResponse()

    monkeypatch.setattr(repository.httpx, "AsyncClient", FakeClient)

    user = AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="access-token",
    )

    asyncio.run(
        repository.set_active_routine(
            user,
            "swim-1",
            "swimming",
        )
    )

    assert captured["params"] == {
        "on_conflict": "user_id,discipline",
    }
    assert captured["json"] == {
        "user_id": "user-123",
        "discipline": "swimming",
        "routine_id": "swim-1",
    }
