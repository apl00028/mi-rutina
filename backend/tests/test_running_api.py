import asyncio
from copy import deepcopy
import json

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.v1.router import router as api_router
from app.core.auth import AuthenticatedUser, require_user
from app.domains.exercises.custom_repository import SupabaseConfigError
from app.domains.running import repository
from app.domains.running.models import RunningHealthConnectSession
from app.domains.running.service import running_to_rpc_payload


def native(**changes):
    return {
        "recordId": "hc-30-08", "sourcePackage": "com.garmin.android.apps.connectmobile",
        "exerciseType": 33, "startTime": "2026-08-30T10:00:00+02:00",
        "endTime": "2026-08-30T10:25:00+02:00", "durationSeconds": 1500,
        "distanceMeters": 5000, "heartRateAverageBpm": None,
        "lapCount": 0, "speedSampleCount": 0, "hasRoute": False,
        **changes,
    }


@pytest.fixture
def api(monkeypatch):
    app = FastAPI()
    app.include_router(api_router)
    active = {"user": "A"}
    calls, rows = [], {}
    failures = {}

    def authenticated():
        return AuthenticatedUser(id=active["user"], access_token="token-" + active["user"])

    app.dependency_overrides[require_user] = authenticated

    def postgrest(request):
        calls.append(request)
        assert request.headers["apikey"] == "publishable-key"
        assert request.headers["authorization"] == f"Bearer token-{active['user']}"
        owner = request.headers["authorization"].removeprefix("Bearer token-")
        if request.method == "POST":
            assert request.url.path == "/rest/v1/rpc/upsert_my_running_session"
            body = json.loads(request.content)
            assert set(body) == {"p_session"}
            payload = body["p_session"]
            assert set(payload) == {"source_package", "source_record_id", "started_at", "ended_at", "data"}
            failure = failures.get(payload["source_record_id"])
            if failure:
                return httpx.Response(failure, json={"detail": "private upstream diagnostic"})
            key = (owner, payload["source_package"], payload["source_record_id"])
            old = rows.get(key, {})
            # Transport stub, not a replacement for the real SQL tests of
            # uniqueness/RLS. Verifies the backend preserves RPC identity/IDs.
            row = {**payload, "id": old.get("id", f"db-{len(rows)}"), "user_id": owner,
                   "source": "health_connect", "data": {**old.get("data", {}), **payload["data"]}}
            rows[key] = row
            return httpx.Response(200, json=[deepcopy(row)])
        assert request.method == "GET"
        assert request.url.path == "/rest/v1/running_sessions"
        assert request.url.params["user_id"] == f"eq.{owner}"
        assert request.url.params["order"] == "started_at.desc,id.desc"
        owned = [r for r in rows.values() if r["user_id"] == owner]
        return httpx.Response(200, json=sorted(owned, key=lambda r: (r["started_at"], r["id"]), reverse=True))

    upstream = httpx.AsyncClient(transport=httpx.MockTransport(postgrest))
    monkeypatch.setattr(repository, "_supabase_config", lambda: ("https://supabase.test", "publishable-key"))
    monkeypatch.setattr(repository, "get_supabase_http_client", lambda: upstream)
    with TestClient(app) as client:
        yield client, calls, active, failures, app
    asyncio.run(upstream.aclose())


def sync(client, *sessions):
    response = client.post("/api/v1/running/sync-health-connect", json={"sessions": list(sessions)})
    assert response.status_code == 200, response.text
    return response.json()


def test_single_sync_returns_validated_persisted_session(api):
    client, calls, *_ = api
    result = sync(client, native())
    assert result["synced"] == 1
    row = result["results"][0]["session"]
    assert row["id"] == "db-0"
    assert row["source"] == "health_connect"
    assert row["started_at"] == "2026-08-30T08:00:00Z"
    assert row["data"]["heart_rate_average_bpm"] is None
    assert row["data"]["lap_count"] == 0
    assert row["data"]["has_route"] is False
    assert "speed_average_meters_per_second" not in row["data"]
    assert "duration_seconds" not in row["data"]
    assert "user_id" not in row
    assert len(calls) == 1


def test_multiple_retries_updates_and_distinct_identities(api):
    client, calls, *_ = api
    result = sync(client, native(), native(distanceMeters=5100),
                  native(recordId="other"), native(sourcePackage="other.writer"))
    assert result["synced"] == 4
    ids = [r["session"]["id"] for r in result["results"]]
    assert ids[0] == ids[1]
    assert len(set(ids)) == 3
    assert result["results"][1]["session"]["data"]["distance_meters"] == 5100
    assert sync(client, native())["results"][0]["session"]["id"] == ids[0]
    assert all(c.method == "POST" for c in calls)


def test_get_ownership_and_order(api):
    client, _, active, *_ = api
    sync(client, native(), native(recordId="second"), native(recordId="older",
         startTime="2026-08-29T08:00:00Z", endTime="2026-08-29T08:25:00Z"))
    active["user"] = "B"
    assert client.get("/api/v1/running/sessions").json() == []
    sync(client, native(distanceMeters=99))
    active["user"] = "A"
    response = client.get("/api/v1/running/sessions")
    assert response.status_code == 200
    assert [r["id"] for r in response.json()] == ["db-1", "db-0", "db-2"]
    assert all(r["data"]["distance_meters"] == 5000 for r in response.json())


@pytest.mark.parametrize("changes", [
    {"user_id": "B"}, {"source": "garmin_api"}, {"id": "chosen"}, {"unknown": 1},
    {"recordId": " \t"}, {"recordId": "x" * 1025}, {"sourcePackage": ""},
    {"sourcePackage": "x" * 257}, {"startTime": "2026-08-30T08:00:00"},
    {"endTime": "2026-08-29T08:00:00Z"}, {"exerciseType": 53}, {"exerciseType": "33"},
    {"distanceMeters": -1}, {"distanceMeters": "NaN"}, {"distanceMeters": True},
    {"lapCount": 1.5}, {"lapCount": True}, {"lapCount": "2"}, {"hasRoute": 1},
    {"durationSeconds": -1}, {"heartRateAverageBpm": -1}, {"paceSecondsPerKmFromSpeed": -1},
])
def test_invalid_session_rejects_entire_batch_before_rpc(api, changes):
    client, calls, *_ = api
    response = client.post("/api/v1/running/sync-health-connect", json={"sessions": [native(), native(**changes)]})
    assert response.status_code == 422, response.text
    assert not calls


@pytest.mark.parametrize("payload", [{"sessions": []}, {"sessions": [native()] * 26},
                                       {"sessions": [native()], "user_id": "B"}])
def test_batch_contract(api, payload):
    client, calls, *_ = api
    assert client.post("/api/v1/running/sync-health-connect", json=payload).status_code == 422
    assert not calls


def test_absent_null_zero_and_failed_subreads():
    absent_payload = native()
    del absent_payload["distanceMeters"]
    absent = RunningHealthConnectSession.model_validate(absent_payload)
    assert "distance_meters" not in running_to_rpc_payload(absent)["data"]
    zero = RunningHealthConnectSession.model_validate(native(distanceMeters=0))
    assert running_to_rpc_payload(zero)["data"]["distance_meters"] == 0

    payload = native(distanceMeters=None, speedAverageMetersPerSecond=0,
                     speedError="read failed", paceSecondsPerKmFromSpeed=123)
    model = RunningHealthConnectSession.model_validate(payload)
    data = running_to_rpc_payload(model)["data"]
    assert data["distance_meters"] is None
    assert data["lap_count"] == 0
    assert "speed_average_meters_per_second" not in data
    assert "speed_sample_count" not in data
    assert "paceSecondsPerKmFromSpeed" not in data
    for number in [float("inf"), float("nan")]:
        with pytest.raises(ValidationError):
            RunningHealthConnectSession.model_validate(native(distanceMeters=number))


def test_individual_failure_does_not_hide_success_or_leak_upstream(api):
    client, _, _, failures, _ = api
    failures["broken"] = 500
    result = sync(client, native(), native(recordId="broken"), native(recordId="last"))
    assert result["synced"] == 2
    assert result["results"][1]["error"] == {"status_code": 502, "detail": "Running service is unavailable"}
    assert [r["index"] for r in result["results"]] == [0, 1, 2]
    assert "private upstream" not in json.dumps(result)


def test_missing_config_errors(api, monkeypatch):
    client, *_ = api
    def missing():
        raise SupabaseConfigError("private config")
    monkeypatch.setattr(repository, "_supabase_config", missing)
    assert sync(client, native())["results"][0]["error"]["status_code"] == 503
    assert client.get("/api/v1/running/sessions").status_code == 503


@pytest.mark.parametrize("response", [
    httpx.Response(500, json={"secret": "upstream"}),
    httpx.Response(200, json={}),
    httpx.Response(200, json=[{"user_id": "B"}]),
    httpx.Response(200, json=[{"user_id": "A", "data": []}]),
])
def test_get_rejects_upstream_errors_malformed_rows_and_wrong_owner(api, monkeypatch, response):
    client, *_ = api
    upstream = httpx.AsyncClient(transport=httpx.MockTransport(lambda _: response))
    monkeypatch.setattr(repository, "get_supabase_http_client", lambda: upstream)
    try:
        result = client.get("/api/v1/running/sessions")
        assert result.status_code == 502
        assert result.json() == {"detail": "Running service is unavailable"}
    finally:
        asyncio.run(upstream.aclose())


def test_both_routes_require_authentication(api):
    client, calls, _, _, app = api
    app.dependency_overrides.clear()
    assert client.get("/api/v1/running/sessions").status_code == 401
    assert client.post("/api/v1/running/sync-health-connect", json={"sessions": [native()]}).status_code == 401
    assert not calls


@pytest.mark.parametrize("bad_rows", [[], [{"user_id": "B"}], [{"user_id": "A", "data": {}}]])
def test_rpc_response_must_be_one_valid_owned_row(api, monkeypatch, bad_rows):
    client, *_ = api
    upstream = httpx.AsyncClient(transport=httpx.MockTransport(
        lambda _: httpx.Response(200, json=bad_rows)
    ))
    monkeypatch.setattr(repository, "get_supabase_http_client", lambda: upstream)
    try:
        result = sync(client, native())
        assert result["synced"] == 0
        assert result["results"][0]["error"]["status_code"] == 502
    finally:
        asyncio.run(upstream.aclose())


def test_transport_timeout_is_individual_failure(api, monkeypatch):
    client, *_ = api
    def timeout(request):
        raise httpx.ReadTimeout("private transport details", request=request)
    upstream = httpx.AsyncClient(transport=httpx.MockTransport(timeout))
    monkeypatch.setattr(repository, "get_supabase_http_client", lambda: upstream)
    try:
        assert sync(client, native())["results"][0]["error"]["status_code"] == 502
        assert client.get("/api/v1/running/sessions").status_code == 502
    finally:
        asyncio.run(upstream.aclose())
