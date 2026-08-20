from collections.abc import Mapping

from starlette.requests import Request
from starlette.responses import Response


BASE_SECURITY_HEADERS: Mapping[str, str] = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
}

HSTS_HEADER = "Strict-Transport-Security"
HSTS_VALUE = "max-age=31536000"


def _hostname_without_port(host: str) -> str:
    return host.rsplit(":", 1)[0].lower()


def _is_local_host(host: str) -> bool:
    normalized_host = host.strip().lower()
    if normalized_host == "::1" or normalized_host.startswith("[::1]"):
        return True

    hostname = _hostname_without_port(host)
    return hostname in {
        "localhost",
        "127.0.0.1",
    }


def _effective_scheme(request: Request) -> str:
    forwarded_proto = (
        request.headers
        .get("x-forwarded-proto", "")
        .split(",", 1)[0]
        .strip()
        .lower()
    )
    return forwarded_proto or request.url.scheme


def should_send_hsts(request: Request) -> bool:
    return (
        _effective_scheme(request) == "https"
        and not _is_local_host(request.headers.get("host", ""))
    )


def apply_security_headers(
    request: Request,
    response: Response,
) -> None:
    for header, value in BASE_SECURITY_HEADERS.items():
        response.headers.setdefault(header, value)

    if should_send_hsts(request):
        response.headers.setdefault(HSTS_HEADER, HSTS_VALUE)
