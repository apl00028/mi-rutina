from starlette.requests import Request
from starlette.responses import Response

from app.core.security_headers import (
    apply_security_headers,
)
from main import app


def make_request(
    scheme="http",
    host="testserver",
    path="/api/v1/health",
    headers=None,
):
    raw_headers = [
        (b"host", host.encode("ascii")),
    ]
    for name, value in (headers or {}).items():
        raw_headers.append(
            (
                name.lower().encode("ascii"),
                value.encode("ascii"),
            )
        )

    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": path,
            "scheme": scheme,
            "headers": raw_headers,
        }
    )


def test_security_headers_are_added_to_api_responses():
    response = Response()

    apply_security_headers(
        make_request(),
        response,
    )

    assert (
        response.headers["X-Content-Type-Options"]
        == "nosniff"
    )
    assert (
        response.headers["Referrer-Policy"]
        == "no-referrer"
    )
    assert response.headers["X-Frame-Options"] == "DENY"


def test_security_headers_are_added_to_protected_api_responses():
    response = Response()

    apply_security_headers(
        make_request(path="/api/v1/me"),
        response,
    )

    assert (
        response.headers["X-Content-Type-Options"]
        == "nosniff"
    )
    assert (
        response.headers["Referrer-Policy"]
        == "no-referrer"
    )
    assert response.headers["X-Frame-Options"] == "DENY"


def test_hsts_is_not_added_for_local_http_development():
    response = Response()

    apply_security_headers(
        make_request(
            scheme="http",
            host="localhost:8080",
        ),
        response,
    )

    assert "Strict-Transport-Security" not in response.headers


def test_hsts_is_added_for_forwarded_https_production():
    response = Response()

    apply_security_headers(
        make_request(
            scheme="http",
            host="gymos-api-cdyt.onrender.com",
            headers={"x-forwarded-proto": "https"},
        ),
        response,
    )

    assert (
        response.headers["Strict-Transport-Security"]
        == "max-age=31536000"
    )


def test_openapi_and_docs_routes_remain_available():
    app.openapi_schema = None
    schema = app.openapi()
    paths = {route.path for route in app.routes}

    assert "/openapi.json" in paths
    assert "/docs" in paths
    assert "/api/v1/health" in schema["paths"]
