import asyncio
import hashlib
import json
import logging
from unittest.mock import Mock

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.router import router as api_router
from app.core import auth
from app.domains.connections import codes, repository, service
from app.domains.connections.models import InvitationCreate
from app.domains.exercises.custom_repository import SupabaseConfigError

ID = "00000000-0000-4000-8000-000000000001"
OTHER = "00000000-0000-4000-8000-000000000002"
CODE = "APT-ABCD-EFGH-JKLM-NPQR"
CANONICAL = "ABCDEFGHJKLMNPQR"
BASE = "/api/v1"
ROW = {
    "id": ID, "trainer_id": ID, "athlete_id": OTHER, "inviter_id": ID,
    "recipient_id": OTHER, "direction": "trainer_to_athlete", "status": "pending",
    "created_at": "2026-09-07T10:00:00+02:00", "expires_at": "2026-09-14T08:00:00Z",
    "accepted_at": None, "revoked_at": None, "revoked_by": None,
    "other_display_name": "Persona", "other_alias": None,
}


@pytest.fixture
def api(monkeypatch):
    app = FastAPI()
    app.include_router(api_router)
    state = {"role": "trainer", "result": None, "status": 200}
    calls = []
    app.dependency_overrides[auth.require_user] = lambda: auth.AuthenticatedUser(
        id=ID, role=state["role"], access_token="user-bearer",
    )

    def transport(request):
        calls.append(request)
        assert request.method == "POST"
        assert request.headers["apikey"] == "publishable-only"
        assert request.headers["authorization"] == "Bearer user-bearer"
        assert request.url.path.startswith("/rest/v1/rpc/")
        if state.get("exception"):
            raise state["exception"]
        if "raw" in state:
            return httpx.Response(state["status"], content=state["raw"])
        return httpx.Response(state["status"], json=state["result"])

    upstream = httpx.AsyncClient(transport=httpx.MockTransport(transport))
    monkeypatch.setattr(repository, "get_supabase_http_client", lambda: upstream)
    monkeypatch.setattr(repository, "_supabase_config", lambda: ("https://supabase.test", "publishable-only"))
    with TestClient(app) as client:
        yield client, state, calls
    asyncio.run(upstream.aclose())


def test_contact_generation_uses_secrets(monkeypatch):
    choice = Mock(side_effect=list(CANONICAL))
    monkeypatch.setattr(codes.secrets, "choice", choice)
    assert codes.generate_contact_code() == CODE
    assert choice.call_count == 16
    assert all(call.args == (codes.CONTACT_ALPHABET,) for call in choice.call_args_list)
    token = Mock(return_value="random-token")
    monkeypatch.setattr(codes.secrets, "token_urlsafe", token)
    assert codes.generate_invitation_token() == "random-token"
    token.assert_called_once_with(32)


@pytest.mark.parametrize("value", [CODE, CODE.lower(), CANONICAL, " apt abcd efgh jklm npqr ", "abcd-efgh-jklm-npqr"])
def test_normalization(value):
    assert codes.normalize_contact_code(value) == CANONICAL


@pytest.mark.parametrize("value", ["", "abc", CODE + "A", CODE.replace("A", "0"), "ß" * 8])
def test_invalid_code(value):
    with pytest.raises(ValueError):
        codes.normalize_contact_code(value)


def test_hash_and_randomness():
    assert codes.sha256_secret("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    assert codes.generate_invitation_token() != codes.generate_invitation_token()
    for _ in range(10):
        generated = codes.generate_contact_code()
        assert len(generated) == 23
        assert len(codes.normalize_contact_code(generated)) == 16
    # Prefix-like canonical payloads must remain usable.
    assert codes.normalize_contact_code("APT" + "A" * 13) == "APT" + "A" * 13


def test_contact_code_only_returns_raw_on_generation(api, monkeypatch, caplog):
    client, state, calls = api
    monkeypatch.setattr(service, "generate_contact_code", lambda: CODE)
    with caplog.at_level(logging.DEBUG):
        response = client.post(BASE + "/connections/contact-code")
    assert response.status_code == 200
    assert response.json() == {"code": CODE}
    assert response.headers["cache-control"] == "no-store"
    assert calls[0].url.path.endswith("/set_my_connection_contact_code")
    hashed = hashlib.sha256(CANONICAL.encode()).hexdigest()
    assert json.loads(calls[0].content) == {"p_code_hash": hashed}
    assert CODE not in caplog.text and hashed not in caplog.text
    assert client.get(BASE + "/connections/contact-code").status_code == 405
    client.post(BASE + "/connections/contact-code")
    assert len(calls) == 2  # Each regeneration writes through to the replacing RPC.


@pytest.mark.parametrize("role,path,rpc", [
    ("trainer", "trainer", "trainer_create_athlete_invitation"),
    ("user", "athlete", "athlete_create_trainer_invitation"),
])
def test_creation_contract(api, monkeypatch, caplog, role, path, rpc):
    client, state, calls = api
    state.update(role=role, result=ID)
    tokens = iter(["secret-token-one", "secret-token-two"])
    monkeypatch.setattr(service, "generate_invitation_token", lambda: next(tokens))
    with caplog.at_level(logging.DEBUG):
        for _ in range(2):
            response = client.post(f"{BASE}/{path}/invitations", json={"contact_code": CODE.lower()})
            assert response.status_code == 201
            assert response.json() == {"id": ID}
    assert all(call.url.path.endswith("/" + rpc) for call in calls)
    for call, token in zip(calls, ["secret-token-one", "secret-token-two"]):
        body = json.loads(call.content)
        assert body == {"p_contact_code_hash": codes.sha256_secret(CANONICAL), "p_token_hash": codes.sha256_secret(token)}
        for secret in [CODE.lower(), token, *body.values(), "user-bearer"]:
            assert secret not in caplog.text
    assert calls[0].content != calls[1].content


@pytest.mark.parametrize("extra", ["direction", "role", "inviter_id", "token"])
def test_creation_disallows_client_control(api, extra):
    client, _, calls = api
    response = client.post(BASE + "/trainer/invitations", json={"contact_code": CODE, extra: CODE})
    assert response.status_code == 422
    assert CODE not in response.text
    assert calls == []
    assert CODE not in repr(InvitationCreate(contact_code=CODE))


def test_malformed_and_unavailable_indistinguishable(api):
    client, state, calls = api
    malformed = client.post(BASE + "/trainer/invitations", json={"contact_code": "bad"})
    assert calls == []
    state.update(status=400, result={"message": "invitation_target_unavailable", "details": CODE})
    unavailable = client.post(BASE + "/trainer/invitations", json={"contact_code": CODE})
    assert malformed.status_code == unavailable.status_code == 400
    assert malformed.json() == unavailable.json() == {"detail": service.TARGET_UNAVAILABLE}


@pytest.mark.parametrize("box", ["received", "sent"])
def test_list_full_contract(api, box):
    client, state, calls = api
    state.update(role="user", result=[{**ROW, "code_hash": "hidden", "token_hash": "hidden"}])
    response = client.get(BASE + "/connections/invitations", params={"box": box})
    assert response.status_code == 200
    assert response.json() == [ROW]
    assert calls[0].url.path.endswith(f"/list_my_{box}_trainer_athlete_invitations")
    assert json.loads(calls[0].content) == {}
    assert "hash" not in response.text


@pytest.mark.parametrize("action", ["accept", "reject", "revoke"])
@pytest.mark.parametrize("role", ["user", "trainer"])
def test_mutation_contract(api, action, role):
    client, state, calls = api
    state["role"] = role
    response = client.post(f"{BASE}/connections/invitations/{ID}/{action}")
    assert response.status_code == 204 and response.content == b""
    assert calls[0].url.path.endswith(f"/{action}_trainer_athlete_invitation")
    assert json.loads(calls[0].content) == {"p_invitation_id": ID}


@pytest.mark.parametrize("error,expected", [
    ("invitation_target_unavailable", 400), ("invitation_conflict", 409),
    ("relationship_already_active", 409), ("invitation_not_pending", 409),
    ("invitation_expired", 409), ("connection_actor_not_authorized", 403),
    ("invitation_accounts_not_eligible", 403), ("invitation_not_available", 404),
    ("contact_code_conflict", 409), ("invalid_contact_code_hash", 502),
    ("invalid_invitation_token_hash", 502), ("private_constraint_name", 502),
])
def test_sql_error_mapping_no_leaks(api, caplog, error, expected):
    client, state, _ = api
    state.update(status=400, result={"message": error, "code": "42501", "details": "secret-hash-token", "hint": CODE})
    with caplog.at_level(logging.DEBUG):
        response = client.post(f"{BASE}/connections/invitations/{ID}/accept")
    assert response.status_code == expected
    for secret in [error, "42501", "secret-hash-token", CODE]:
        assert secret not in response.text and secret not in caplog.text


@pytest.mark.parametrize("exception,expected", [(httpx.ReadTimeout("secret"), 503), (httpx.ConnectError("secret"), 502)])
def test_transport_failures(api, exception, expected):
    client, state, _ = api
    state["exception"] = exception
    response = client.post(BASE + "/connections/contact-code")
    assert response.status_code == expected
    assert "secret" not in response.text


def test_config_failure(api, monkeypatch):
    client, _, _ = api
    def missing():
        raise SupabaseConfigError("internal config")
    monkeypatch.setattr(repository, "_supabase_config", missing)
    assert client.post(BASE + "/connections/contact-code").status_code == 503


@pytest.mark.parametrize("result", [None, {}, ["bad"], [{**ROW, "created_at": "2026-09-07"}]])
def test_invalid_upstream_list(api, result):
    client, state, _ = api
    state["result"] = result
    assert client.get(BASE + "/connections/invitations?box=received").status_code == 502


@pytest.mark.parametrize("result", [None, [], {}, "not-uuid"])
def test_invalid_upstream_uuid(api, result):
    client, state, _ = api
    state["result"] = result
    assert client.post(BASE + "/trainer/invitations", json={"contact_code": CODE}).status_code == 502


def test_non_json_error_and_void(api):
    client, state, _ = api
    state.update(status=500, raw=b"private html")
    response = client.post(f"{BASE}/connections/invitations/{ID}/accept")
    assert response.status_code == 502 and "private" not in response.text
    state.update(status=204, raw=b"")
    assert client.post(f"{BASE}/connections/invitations/{ID}/accept").status_code == 204


@pytest.mark.parametrize("role,path", [("trainer", "athlete"), ("user", "trainer"), ("admin", "trainer"), ("admin", "athlete")])
def test_wrong_creation_role(api, role, path):
    client, state, calls = api
    state["role"] = role
    assert client.post(f"{BASE}/{path}/invitations", json={"contact_code": CODE}).status_code == 403
    assert not calls


@pytest.mark.parametrize("method,path", [
    ("post", "/connections/contact-code"), ("get", "/connections/invitations?box=sent"),
    *[("post", f"/connections/invitations/{ID}/{action}") for action in ("accept", "reject", "revoke")],
])
def test_admin_excluded_from_common_operations(api, method, path):
    client, state, calls = api
    state["role"] = "admin"
    assert getattr(client, method)(BASE + path).status_code == 403
    assert not calls


def test_invalid_parameters(api):
    client, _, calls = api
    assert client.get(BASE + "/connections/invitations?box=anything").status_code == 422
    for action in ("accept", "reject", "revoke"):
        assert client.post(f"{BASE}/connections/invitations/not-uuid/{action}").status_code == 422
    assert not calls


def test_missing_bearer():
    app = FastAPI()
    app.include_router(api_router)
    with TestClient(app) as client:
        assert client.post(BASE + "/connections/contact-code").status_code == 401


@pytest.mark.parametrize("status,expires", [("inactive", None), ("active", "2000-01-01T00:00:00Z")])
def test_real_account_dependency_rejects_ineligible(monkeypatch, status, expires):
    async def identity(*args):
        return auth.AuthenticatedUser(id=ID, access_token="test")
    async def access(user):
        return auth.AptusAccess(user_id=ID, email=None, status=status, plan=None, role="trainer", expires_at=expires)
    monkeypatch.setattr(auth, "authenticate_user", identity)
    monkeypatch.setattr(auth, "get_gymos_access", access)
    app = FastAPI()
    app.include_router(api_router)
    with TestClient(app) as client:
        assert client.post(BASE + "/connections/contact-code").status_code == 403


def test_openapi_registrations_and_safe_schemas(api):
    client, _, _ = api
    schema = client.get("/openapi.json").json()
    properties = schema["components"]["schemas"]["Invitation"]["properties"]
    assert set(properties) == set(ROW)
    assert "hash" not in json.dumps(properties)
    paths = schema["paths"]
    assert BASE + "/trainer/invitations" in paths
    assert BASE + "/athlete/invitations" in paths
    for domain in ("trainer", "running", "swimming"):
        assert any(path.startswith(f"{BASE}/{domain}/") for path in paths)
