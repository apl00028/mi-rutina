import asyncio
import json
import logging

from starlette.requests import Request
from starlette.responses import Response

from app.core.observability import (
    observe_request,
)
from main import app


def make_request(
    path="/api/v1/me",
    query_string=b"",
):
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": path,
            "query_string":
                query_string,
            "scheme": "https",
            "headers": [
                (
                    b"host",
                    b"example.test",
                ),
            ],
        }
    )



def request_with_route(
    path,
    query_string=b"",
):
    from types import SimpleNamespace

    request = make_request(
        path=path,
        query_string=query_string,
    )

    request.scope["route"] = (
        SimpleNamespace(
            path=path
        )
    )

    return request


def test_observability_adds_request_id(
    caplog,
):
    async def call_next(request):
        return Response(
            status_code=200
        )

    with caplog.at_level(
        logging.INFO,
        logger="uvicorn.error.aptus.requests",
    ):
        response = asyncio.run(
            observe_request(
                request_with_route(
                    "/api/v1/me"
                ),
                call_next,
            )
        )

    request_id = response.headers[
        "X-Request-ID"
    ]

    assert request_id

    records = [
        record
        for record in caplog.records
        if record.name
        == "uvicorn.error.aptus.requests"
    ]

    assert len(records) == 1

    payload = json.loads(
        records[0].getMessage()
    )

    assert payload[
        "event"
    ] == "request_completed"
    assert payload[
        "request_id"
    ] == request_id
    assert payload[
        "method"
    ] == "GET"
    assert payload[
        "path"
    ] == "/api/v1/me"
    assert payload[
        "status"
    ] == 200
    assert payload[
        "duration_ms"
    ] >= 0


def test_observability_does_not_log_query_string(
    caplog,
):
    async def call_next(request):
        return Response(
            status_code=204
        )

    request = request_with_route(
        "/api/v1/search",
        query_string=(
            b"email=private%40example.com"
            b"&token=secret"
        ),
    )

    with caplog.at_level(
        logging.INFO,
        logger="uvicorn.error.aptus.requests",
    ):
        asyncio.run(
            observe_request(
                request,
                call_next,
            )
        )

    logged = "\n".join(
        record.getMessage()
        for record in caplog.records
        if record.name
        == "uvicorn.error.aptus.requests"
    )

    assert "/api/v1/search" in logged
    assert "private" not in logged
    assert "secret" not in logged


def test_observability_logs_exception_type_only(
    caplog,
):
    async def call_next(request):
        raise RuntimeError(
            "sensitive internal detail"
        )

    with caplog.at_level(
        logging.ERROR,
        logger="uvicorn.error.aptus.requests",
    ):
        response = asyncio.run(
            observe_request(
                make_request(),
                call_next,
            )
        )

    assert response.status_code == 500

    request_id = response.headers[
        "X-Request-ID"
    ]

    assert request_id

    body = json.loads(
        response.body.decode("utf-8")
    )

    assert body == {
        "detail":
            "Internal server error"
    }

    records = [
        record
        for record in caplog.records
        if record.name
        == "uvicorn.error.aptus.requests"
    ]

    assert len(records) == 1

    payload = json.loads(
        records[0].getMessage()
    )

    assert payload[
        "event"
    ] == "request_failed"
    assert payload[
        "request_id"
    ] == request_id
    assert payload[
        "exception_type"
    ] == "RuntimeError"

    frames = payload[
        "exception_frames"
    ]

    assert frames
    assert frames[-1][
        "file"
    ] == "test_observability.py"
    assert frames[-1][
        "function"
    ] == "call_next"
    assert isinstance(
        frames[-1][
            "line"
        ],
        int,
    )

    assert (
        "sensitive internal detail"
        not in records[0].getMessage()
    )
    assert records[0].exc_info is None


def test_health_response_has_request_id():
    from fastapi.testclient import (
        TestClient,
    )

    with TestClient(
        app,
        raise_server_exceptions=False,
    ) as client:
        response = client.get(
            "/health"
        )

    assert response.status_code == 200
    assert response.headers[
        "X-Request-ID"
    ]


def test_observability_logs_route_template(
    caplog,
):
    from types import SimpleNamespace

    async def call_next(request):
        return Response(
            status_code=200
        )

    request = make_request(
        path=(
            "/api/v1/workouts/"
            "550e8400-e29b-41d4-a716-446655440000"
        )
    )

    request.scope[
        "route"
    ] = SimpleNamespace(
        path=(
            "/api/v1/workouts/"
            "{workout_id}"
        )
    )

    with caplog.at_level(
        logging.INFO,
        logger="uvicorn.error.aptus.requests",
    ):
        asyncio.run(
            observe_request(
                request,
                call_next,
            )
        )

    record = next(
        record
        for record in caplog.records
        if record.name
        == "uvicorn.error.aptus.requests"
    )

    payload = json.loads(
        record.getMessage()
    )

    assert payload[
        "path"
    ] == (
        "/api/v1/workouts/"
        "{workout_id}"
    )

    assert (
        "550e8400-e29b-41d4-a716-446655440000"
        not in record.getMessage()
    )


def test_observability_hides_unmatched_path(
    caplog,
):
    async def call_next(request):
        return Response(
            status_code=404
        )

    request = make_request(
        path=(
            "/unknown/"
            "private@example.com"
        )
    )

    with caplog.at_level(
        logging.INFO,
        logger="uvicorn.error.aptus.requests",
    ):
        asyncio.run(
            observe_request(
                request,
                call_next,
            )
        )

    record = next(
        record
        for record in caplog.records
        if record.name
        == "uvicorn.error.aptus.requests"
    )

    payload = json.loads(
        record.getMessage()
    )

    assert payload[
        "path"
    ] == "<unmatched>"

    assert (
        "private@example.com"
        not in record.getMessage()
    )
